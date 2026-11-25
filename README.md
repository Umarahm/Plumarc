# Plumarc

A security-first AI knowledge gateway for companies: role-aware answers with citations, guarded tool access, and evaluation gates before every release.

> **Status:** early development. The repository holds the Next.js and shadcn/ui scaffold. The features below are planned and documented, not yet built.

## Planned features

- OAuth sign-in, role-based and document-level access, multi-tenant isolation
- Hybrid RAG with reranking, source citations and abstention
- Prompt injection and jailbreak detection, PII redaction
- Document approval, versioning and poisoning detection
- Free-tier model routing and permission-aware semantic caching
- MCP tools with independent authorization and human approval
- Durable background workflows with Inngest
- Tracing, audit logs, evaluation suites and CI release gates

## Tech stack

| Layer | Technology |
|---|---|
| Web (installed) | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| Backend | Python, FastAPI |
| Data and auth | Self-hosted Supabase, PostgreSQL, pgvector, RLS, Casbin |
| Workflows | Inngest |
| AI | LiteLLM, Groq, OpenRouter, BGE-small, FlashRank |
| Security | DeBERTa injection classifier, Prompt Guard 2, Presidio |
| Tools | MCP Python SDK |
| Quality | Pytest, Promptfoo, Ragas, k6 |
| Operations | OpenTelemetry, Docker Compose, Cloudflare, GitHub Actions |

Details and reasons: [docs/TECH_STACK.md](docs/TECH_STACK.md).

## Getting started

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint |

## Documentation

| Document | Contents |
|---|---|
| [Project info](docs/INFO.md) | Overview, demo scenarios, limits, glossary |
| [PRD](docs/PRD.md) | Problem, users, scope, success metrics |
| [Requirements](docs/REQUIREMENTS.md) | Functional, non-functional, permissions, evaluation set |
| [Specification](docs/SPEC.md) | Architecture, data model, pipelines, APIs |
| [Tech stack](docs/TECH_STACK.md) | Technologies, status, costs, risks |
| [Roadmap](docs/ROADMAP.md) | 20 steps over 12 weeks |

## Security note

Use synthetic data only. Plumarc aims to minimize hallucination and injection risk; it cannot guarantee their absence.
