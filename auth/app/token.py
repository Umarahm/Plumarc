import jwt


class InvalidToken(Exception):
    pass


class KeysUnavailable(Exception):
    pass


class TokenVerifier:
    """Checks an Auth0 access token: signature, issuer, audience and expiry."""

    def __init__(self, domain: str, audience: str, keys: jwt.PyJWKClient | None = None) -> None:
        self.issuer = f"https://{domain}/"
        self.audience = audience
        self.keys = keys or jwt.PyJWKClient(f"{self.issuer}.well-known/jwks.json", timeout=3)

    def subject(self, token: str) -> str:
        try:
            key = self.keys.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["RS256"],
                audience=self.audience,
                issuer=self.issuer,
                options={"require": ["exp", "iat", "sub"]},
            )
        except jwt.PyJWKClientConnectionError as error:
            raise KeysUnavailable from error
        except jwt.PyJWTError as error:
            raise InvalidToken from error
        if not claims["sub"]:
            raise InvalidToken
        return claims["sub"]
