"""Who is calling, as decided by the auth service. Every failure denies access."""

import logging
from collections.abc import Callable
from functools import lru_cache

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from plumarc_shared.principal import Principal

from app.config import get_settings

log = logging.getLogger("plumarc.api")
bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_auth_client() -> httpx.Client:
    return httpx.Client(base_url=get_settings().auth_url, timeout=5)


def unauthorized() -> HTTPException:
    return HTTPException(401, "Invalid or missing token", {"WWW-Authenticate": "Bearer"})


def get_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    client: httpx.Client = Depends(get_auth_client),
) -> Principal:
    if credentials is None:
        raise unauthorized()
    try:
        response = client.get(
            "/v1/principal",
            headers={"Authorization": f"Bearer {credentials.credentials}"},
        )
        if response.status_code == 401:
            raise unauthorized()
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError("unexpected status")
        return Principal.model_validate(response.json())
    except (httpx.HTTPError, ValueError) as error:
        log.error("Auth service request failed: %s", type(error).__name__)
        raise HTTPException(503, "Service unavailable") from None


def require(action: str, *, member: bool = True) -> Callable[..., Principal]:
    """Allow only callers granted the action. By default they must belong to an organization."""

    def check(principal: Principal = Depends(get_principal)) -> Principal:
        if (member and principal.membership is None) or action not in principal.actions:
            raise HTTPException(403, "Not allowed")
        return principal

    return check
