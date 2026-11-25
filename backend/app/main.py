"""Plumarc API. Callers send a bearer token; there are no cookies, so no CSRF surface."""

import logging
from uuid import UUID

import psycopg
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from plumarc_shared.db import Database, UnsafeDatabaseRole
from plumarc_shared.principal import Principal
from psycopg.rows import class_row
from psycopg_pool import PoolTimeout
from pydantic import BaseModel

from app import manage
from app.auth import get_principal, require
from app.database import get_database

log = logging.getLogger("plumarc.api")
app = FastAPI(title="Plumarc API", docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(manage.router)


class Document(BaseModel):
    id: UUID
    title: str
    classification: str


@app.exception_handler(psycopg.errors.InsufficientPrivilege)
def refused_by_database(_: Request, error: Exception) -> JSONResponse:
    log.warning("Database refused a request: %s", type(error).__name__)
    return JSONResponse({"detail": "forbidden"}, status_code=403)


@app.exception_handler(psycopg.Error)
@app.exception_handler(PoolTimeout)
@app.exception_handler(UnsafeDatabaseRole)
def database_unavailable(_: Request, error: Exception) -> JSONResponse:
    log.error("Database request failed: %s", type(error).__name__)
    return JSONResponse({"detail": "Service unavailable"}, status_code=503)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/me")
def me(principal: Principal = Depends(get_principal)) -> Principal:
    return principal


@app.get("/v1/documents")
def documents(
    principal: Principal = Depends(require("documents:list")),
    db: Database = Depends(get_database),
) -> list[Document]:
    # No WHERE clause on purpose: row-level security decides which rows exist.
    with db.scope(user_id=principal.user_id, org_id=principal.membership.org_id) as conn:
        cursor = conn.cursor(row_factory=class_row(Document))
        return cursor.execute(
            "select id, title, classification from plumarc.documents order by title"
        ).fetchall()
