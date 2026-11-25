"""A real, throwaway PostgreSQL with the project's migrations and seed data."""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pgserver
import psycopg

SUPABASE = Path(__file__).resolve().parents[2] / "supabase"


def as_role(url: str, role: str) -> str:
    parts = urlsplit(url)
    host = parts.netloc.rpartition("@")[2]
    return urlunsplit(parts._replace(netloc=f"{role}@{host}"))


@contextmanager
def temporary_database(directory: Path) -> Iterator[str]:
    """Yield the administrator URL. Application roles log in without a password here."""
    server = pgserver.get_server(directory, cleanup_mode="stop")
    try:
        url = server.get_uri()
        with psycopg.connect(url, autocommit=True) as conn:
            for script in [*sorted(SUPABASE.glob("migrations/*.sql")), SUPABASE / "seed.sql"]:
                conn.execute(script.read_text(encoding="utf-8"))
            conn.execute("alter role plumarc_api login")
            conn.execute("alter role plumarc_auth login")
        yield url
    finally:
        server.cleanup()
