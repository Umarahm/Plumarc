import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.token import InvalidToken, KeysUnavailable, TokenVerifier


def test_accepts_a_valid_token(verifier, make_token):
    assert verifier.subject(make_token("auth0|abc")) == "auth0|abc"


@pytest.mark.parametrize(
    "changes",
    [
        {"exp": int(time.time()) - 10},
        {"aud": "https://other-api"},
        {"iss": "https://evil.example/"},
        {"sub": ""},
        {"drop": ("exp",)},
        {"drop": ("sub",)},
        {"signed_with": rsa.generate_private_key(public_exponent=65537, key_size=2048)},
    ],
    ids=["expired", "audience", "issuer", "empty-sub", "no-exp", "no-sub", "wrong-key"],
)
def test_rejects_a_bad_token(verifier, make_token, changes):
    with pytest.raises(InvalidToken):
        verifier.subject(make_token(**changes))


@pytest.mark.parametrize("algorithm", ["HS256", "none"])
def test_rejects_other_algorithms(verifier, algorithm):
    forged = jwt.encode(
        {"sub": "x"}, None if algorithm == "none" else "s" * 32, algorithm=algorithm
    )
    with pytest.raises(InvalidToken):
        verifier.subject(forged)


def test_rejects_junk_before_any_key_download():
    with pytest.raises(InvalidToken):
        TokenVerifier("tenant.invalid", "aud").subject("not-a-token")


def test_reports_unreachable_keys_separately(make_token):
    def unreachable(_):
        raise jwt.PyJWKClientConnectionError("offline")

    verifier = TokenVerifier("tenant.invalid", "aud")
    verifier.keys.get_signing_key_from_jwt = unreachable
    with pytest.raises(KeysUnavailable):
        verifier.subject(make_token())
