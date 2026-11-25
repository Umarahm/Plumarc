# Plumarc

A security-first AI knowledge gateway for companies: role-aware answers with citations, guarded tool access, and evaluation gates before every release.

> **Status:** early development. Sign-in, roles, document permissions and management screens for organizations, people and document access are built. Question answering and everything under [Planned](#planned) is not.

## Services

| Folder | Service | Port |
|---|---|---|
| `frontend/` | Next.js: Auth0 login, session, CSRF protection, token refresh | 3000 (public) |
| `auth/` | FastAPI: verifies tokens, resolves organization, role and allowed actions | 8001 (internal) |
| `backend/` | FastAPI: business API, reads data under row-level security | 8000 (internal) |
| `shared/` | Python code used by `auth` and `backend` | |
| `supabase/` | SQL migration and synthetic seed data | |
| `infrastructure/` | Docker Compose and Dockerfiles | |

```
browser -> frontend -> backend -> auth -> database
              |                    |
            Auth0 <--- keys -------+
```

## Setup

You need Node.js 20.9 or later, [uv](https://docs.astral.sh/uv/), an Auth0 account and a Supabase database.

### 1. Auth0

1. **Applications > Create application > Regular Web Application.**
   - Allowed Callback URLs: `http://localhost:3000/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000`
   - Under Advanced > Grant Types, keep **Authorization Code** and **Refresh Token**.
   - Enable **Refresh Token Rotation** with an overlap period of about 30 seconds, and set refresh token expiry.
2. **APIs > Create API.**
   - Identifier: `https://api.plumarc`, signing algorithm **RS256**.
   - Enable **Allow Offline Access** (needed for refresh).
   - Set the access token lifetime short, for example 900 seconds.
   - If sign-in says the application may not access the API, allow it in the API's application access settings.
3. **Authentication:** keep the database connection for email sign-in and enable Google. Use your own Google credentials outside testing.

### 2. Database

Use a non-production database. In the Supabase SQL editor, as the database owner:

1. Run each file in [supabase/migrations](supabase/migrations) once, in name order, then optionally [seed.sql](supabase/seed.sql) for demo data.
2. Give the two service roles their own passwords (letters and digits avoid URL escaping):

   ```sql
   alter role plumarc_api  login password 'CHOOSE-A-PASSWORD';
   alter role plumarc_auth login password 'CHOOSE-ANOTHER';
   ```

3. Do not expose the database port to the internet. An SSH tunnel works: `ssh -L 5432:localhost:5432 you@your-server`. Through Supabase's connection pooler, the user name takes the form `plumarc_api.<tenant-id>`.

### 3. Environment files

Copy each example and fill it in:

```bash
cp frontend/.env.example frontend/.env.local
cp auth/.env.example     auth/.env.local
cp backend/.env.example  backend/.env.local
```

### 4. Run

One terminal each:

```bash
cd auth     && uv run uvicorn app.main:app --port 8001 --reload
cd backend  && uv run uvicorn app.main:app --port 8000 --reload
cd frontend && npm install && npm run dev
```

Open http://localhost:3000.

### 5. Make yourself the platform admin

Sign in once. The page shows your Auth0 user ID (if you already belong to an organization, look in `plumarc.users`). Run this in the SQL editor with your ID:

```sql
insert into plumarc.users (auth0_sub, display_name, is_platform_admin)
values ('PASTE-USER-ID', 'Your name', true)
on conflict (auth0_sub) do update set is_platform_admin = true;
```

Reload and open **Manage**. Everything else happens there.

| Who | Can |
|---|---|
| Platform admin | Create and delete organizations; manage people and documents in all of them |
| Organization admin | Manage people and documents in their own organization |
| Everyone else | See the documents shared with their role |

To add someone, they sign in once and send you the user ID shown on their home page. Each person belongs to one organization.

## Tests

| Where | Command |
|---|---|
| `frontend/` | `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` |
| `auth/`, `backend/` | `uv run pytest`, `uv run ruff check . ../shared` |

Database tests start a temporary PostgreSQL by themselves. No Docker or Supabase needed.

## Containers

```bash
docker compose -f infrastructure/docker-compose.yml up --build
```

Only the frontend is published, on `127.0.0.1:3000`. Inside containers, `DATABASE_URL` cannot use `localhost`. In production set `APP_BASE_URL` to the public HTTPS address and add it to the Auth0 URLs.

## Security model

- Tokens stay on the server; the browser holds an encrypted, HTTP-only cookie.
- Requests that change state need a CSRF token and a matching origin. Logout is `POST` only.
- Sessions end after 30 minutes idle or 8 hours. Access tokens refresh automatically.
- Roles come from the database, not from the token.
- Row-level security filters data; services refuse database roles that could bypass it.
- Any failure in an access check denies the request.

Use synthetic data only.

## Planned

Document ingestion with approval (Inngest), hybrid RAG with citations and abstention, injection and PII protection, model routing, semantic caching, MCP tools with human approval, tracing, and evaluation release gates.

## Documentation

| Document | Contents |
|---|---|
| [Project info](docs/INFO.md) | Overview, demo scenarios, limits, glossary |
| [PRD](docs/PRD.md) | Problem, users, scope, success metrics |
| [Requirements](docs/REQUIREMENTS.md) | Functional, non-functional, permissions, evaluation set |
| [Specification](docs/SPEC.md) | Architecture, data model, pipelines, APIs |
| [Tech stack](docs/TECH_STACK.md) | Technologies, status, costs, risks |
| [Roadmap](docs/ROADMAP.md) | 20 steps over 12 weeks |
| [Supabase on the VPS](docs/SUPABASE_SETUP.md) | Server layout, security, database setup, backups |
