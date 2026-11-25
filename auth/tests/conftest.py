import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from plumarc_shared.db import Database
from plumarc_shared.testing import as_role, temporary_database

from app.main import app, get_database, get_verifier
from app.token import TokenVerifier

DOMAIN = "tenant.example.auth0.com"
AUDIENCE = "https://api.plumarc"


@pytest.fixture(scope="session")
def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="session")
def verifier(key):
    """The real verifier, with Auth0's key download replaced by the test key."""
    public = SimpleNamespace(key=key.public_key())
    keys = SimpleNamespace(get_signing_key_from_jwt=lambda _: public)
    return TokenVerifier(DOMAIN, AUDIENCE, keys)


@pytest.fixture(scope="session")
def make_token(key):
    def make(sub="seed|northwind-intern", *, signed_with=None, drop=(), **claims):
        now = int(time.time())
        payload = {
            "iss": f"https://{DOMAIN}/",
            "aud": AUDIENCE,
            "sub": sub,
            "iat": now,
            "exp": now + 300,
            **claims,
        }
        for name in drop:
            del payload[name]
        return jwt.encode(payload, signed_with or key, algorithm="RS256")

    return make


@pytest.fixture(scope="session")
def database_url(tmp_path_factory):
    with temporary_database(tmp_path_factory.mktemp("postgres")) as url:
        yield url


@pytest.fixture(scope="session")
def database(database_url):
    db = Database(as_role(database_url, "plumarc_auth"))
    yield db
    db.close()


@pytest.fixture
def client(verifier, database):
    app.dependency_overrides = {
        get_verifier: lambda: verifier,
        get_database: lambda: database,
    }
    yield TestClient(app)
    app.dependency_overrides = {}
