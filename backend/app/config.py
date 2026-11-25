from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env.local", extra="ignore")

    auth_url: str = Field(min_length=1)
    database_url: SecretStr


@lru_cache
def get_settings() -> Settings:
    return Settings()
