from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from plumarc_shared.db import Database
from plumarc_shared.principal import Membership, Principal
from plumarc_shared.testing import as_role, temporary_database

from app.auth import get_auth_client
from app.database import get_database
from app.main import app

NORTHWIND = UUID("10000000-0000-0000-0000-000000000001")
GLOBEX = UUID("10000000-0000-0000-0000-000000000002")


def user(number: int) -> UUID:
    return UUID(f"20000000-0000-0000-0000-{number:012}")


def member(number: int, role: str, org_id: UUID = NORTHWIND, actions=("documents:list",)):
    return Principal(
        sub=f"seed|{number}",
        user_id=user(number),
        membership=Membership(org_id=org_id, org_name="Test", role=role),
        actions=list(actions),
    )


@pytest.fixture(scope="session")
def database_url(tmp_path_factory):
    with temporary_database(tmp_path_factory.mktemp("postgres")) as url:
        yield url


@pytest.fixture(scope="session")
def database(database_url):
    db = Database(as_role(database_url, "plumarc_api"))
    yield db
    db.close()


@pytest.fixture
def auth_service():
    """Replace the auth service's answers; everything else in the backend is real."""
    calls: list[httpx.Request] = []

    def install(handler):
        def record(request):
            calls.append(request)
            return handler(request)

        client = httpx.Client(transport=httpx.MockTransport(record), base_url="http://auth")
        app.dependency_overrides[get_auth_client] = lambda: client

    install.calls = calls
    yield install
    app.dependency_overrides = {}


@pytest.fixture
def client(database):
    app.dependency_overrides[get_database] = lambda: database
    yield TestClient(app)
    app.dependency_overrides = {}


@pytest.fixture
def signed_in(auth_service):
    def sign_in(principal: Principal):
        auth_service(lambda _: httpx.Response(200, json=principal.model_dump(mode="json")))
        return {"Authorization": "Bearer test-token"}

    return sign_in
