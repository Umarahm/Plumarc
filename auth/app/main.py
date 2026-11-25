"""Identity and access service. Keep it on the internal network."""

import logging
from functools import lru_cache

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from plumarc_shared.db import Database, UnsafeDatabaseRole
from plumarc_shared.principal import Principal
from psycopg_pool import PoolTimeout

from app.accounts import load_principal
from app.config import Settings
from app.token import InvalidToken, KeysUnavailable, TokenVerifier

log = logging.getLogger("plumarc.auth")
app = FastAPI(title="Plumarc auth", docs_url=None, redoc_url=None, openapi_url=None)
bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_verifier() -> TokenVerifier:
    settings = get_settings()
    return TokenVerifier(settings.auth0_domain, settings.auth0_audience)


@lru_cache
def get_database() -> Database:
    return Database(get_settings().database_url.get_secret_value())


@app.exception_handler(psycopg.Error)
@app.exception_handler(PoolTimeout)
@app.exception_handler(UnsafeDatabaseRole)
def database_unavailable(_: Request, error: Exception) -> JSONResponse:
    log.error("Database request failed: %s", type(error).__name__)
    return JSONResponse({"detail": "Service unavailable"}, status_code=503)


def unauthorized() -> HTTPException:
    return HTTPException(401, "Invalid or missing token", {"WWW-Authenticate": "Bearer"})


def verified_subject(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    verifier: TokenVerifier = Depends(get_verifier),
) -> str:
    if credentials is None:
        raise unauthorized()
    try:
        return verifier.subject(credentials.credentials)
    except InvalidToken:
        raise unauthorized() from None
    except KeysUnavailable:
        log.error("Auth0 signing keys could not be fetched")
        raise HTTPException(503, "Service unavailable") from None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/principal")
def principal(
    sub: str = Depends(verified_subject),
    db: Database = Depends(get_database),
) -> Principal:
    return load_principal(db, sub)
