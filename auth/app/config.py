from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env.local", extra="ignore")

    auth0_domain: str = Field(min_length=1)
    auth0_audience: str = Field(min_length=1)
    database_url: SecretStr
