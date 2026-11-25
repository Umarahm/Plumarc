from functools import lru_cache

from plumarc_shared.db import Database

from app.config import get_settings


@lru_cache
def get_database() -> Database:
    return Database(get_settings().database_url.get_secret_value())
