# Shared by the auth and backend services. Build context is the repository root.
FROM python:3.12-slim

ARG SERVICE
ARG PORT
ENV UV_PYTHON_DOWNLOADS=never PORT=${PORT}
COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /usr/local/bin/uv

COPY shared /srv/shared
WORKDIR /srv/service
COPY ${SERVICE}/pyproject.toml ${SERVICE}/uv.lock ./
RUN uv sync --locked --no-dev
COPY ${SERVICE}/app ./app

RUN useradd --system --no-create-home plumarc
USER plumarc
CMD ["sh", "-c", "exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
