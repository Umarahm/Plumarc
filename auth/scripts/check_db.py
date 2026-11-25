"""Check one service's database login. Never prints the connection string.

Run from auth/ or backend/. Uses DATABASE_URL, or the one in ./.env.local.
"""

import os
import sys

import psycopg

# Each query returns true when the setup is correct, for either service role.
CHECKS = {
    "role cannot bypass row-level security": """
        select not (rolsuper or rolbypassrls) from pg_roles where rolname = current_user""",
    "migration has run": "select to_regclass('plumarc.documents') is not null",
    "row-level security is forced on every table": """
        select count(*) = 0 from pg_class
        where relnamespace = to_regnamespace('plumarc') and relkind = 'r'
          and not (relrowsecurity and relforcerowsecurity)""",
    "no rows visible without a signed-in user": """
        select count(*) = 0 from plumarc.organization_members""",
}

url = os.environ.get("DATABASE_URL")
if not url and os.path.exists(".env.local"):
    with open(".env.local", encoding="utf-8") as env_file:
        for line in env_file:
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip()
if not url:
    sys.exit("No DATABASE_URL in the shell or in ./.env.local")


def first_line(error: Exception) -> str:
    return f"{type(error).__name__}: {str(error).splitlines()[0][:200]}"


try:
    conn = psycopg.connect(url, autocommit=True, connect_timeout=8, prepare_threshold=None)
except psycopg.Error as error:
    sys.exit(f"[FAIL] connect: {first_line(error)}")

failed = False
with conn:
    print(f"[ok]   connected as {conn.execute('select current_user').fetchone()[0]}")
    for label, query in CHECKS.items():
        try:
            passed, detail = conn.execute(query).fetchone()[0] is True, ""
        except psycopg.Error as error:
            passed, detail = False, f" ({first_line(error)})"
        failed = failed or not passed
        print(f"{'[ok]  ' if passed else '[FAIL]'} {label}{detail}")
sys.exit(1 if failed else 0)
