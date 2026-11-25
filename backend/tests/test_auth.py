import httpx
import pytest
from conftest import member
from plumarc_shared.principal import Principal

HEADERS = {"Authorization": "Bearer test-token"}


def test_health_needs_no_token(client):
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/v1/me", "/v1/documents"])
def test_no_token_is_401_without_calling_auth(client, auth_service, path):
    auth_service(lambda _: httpx.Response(200))
    assert client.get(path).status_code == 401
    assert auth_service.calls == []


def test_me_forwards_the_token_and_returns_the_principal(client, signed_in, auth_service):
    principal = member(1, "intern")
    response = client.get("/v1/me", headers=signed_in(principal))
    assert Principal.model_validate(response.json()) == principal
    assert auth_service.calls[0].url.path == "/v1/principal"
    assert auth_service.calls[0].headers["authorization"] == "Bearer test-token"


def test_rejected_token_is_401(client, auth_service):
    auth_service(lambda _: httpx.Response(401))
    assert client.get("/v1/me", headers=HEADERS).status_code == 401


def offline(request):
    raise httpx.ConnectError("offline", request=request)


@pytest.mark.parametrize(
    "handler",
    [
        offline,
        lambda _: httpx.Response(503),
        lambda _: httpx.Response(302, headers={"location": "http://evil.example"}),
        lambda _: httpx.Response(200, text="not json"),
        lambda _: httpx.Response(200, json={"unexpected": True}),
        lambda _: httpx.Response(201, json={"sub": "x"}),
    ],
    ids=["offline", "error", "redirect", "not-json", "wrong-shape", "wrong-status"],
)
def test_auth_service_problems_fail_closed(client, auth_service, handler):
    auth_service(handler)
    assert client.get("/v1/documents", headers=HEADERS).status_code == 503


def test_user_without_membership_sees_nothing(client, signed_in):
    headers = signed_in(Principal(sub="auth0|stranger"))
    assert client.get("/v1/me", headers=headers).status_code == 200
    assert client.get("/v1/documents", headers=headers).status_code == 403


def test_action_that_is_not_granted_is_refused(client, signed_in):
    headers = signed_in(member(1, "intern", actions=()))
    assert client.get("/v1/documents", headers=headers).status_code == 403
