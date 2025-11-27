# LedgerMind

> **LedgerMind** - AI-powered personal finance dashboard with intelligent categorization and natural language assistant

[![Coverage](docs/badges/coverage.svg)](https://github.com/leok974/LedgerMind)

**Live Demo:** [https://app.ledger-mind.org](https://app.ledger-mind.org) · **No signup required** - try Demo Mode

---

## Overview

LedgerMind is a production-ready personal finance application that combines traditional transaction tracking with modern AI capabilities. Upload bank statements, get ML-powered categorization suggestions, and ask natural language questions about your spending patterns.

### Key Features

- **Smart Import** - CSV/Excel upload with multi-format detection
- **AI Categorization** - ML model suggests categories with confidence scores
- **Bulk Operations** - Categorize by merchant/description with undo safety
- **Rich Analytics** - Spending trends, forecasts, top categories, merchant analysis
- **Chat Assistant** - Natural language queries powered by LLM + RAG (pgvector)
- **Demo Mode** - Instant access with pre-loaded sample data

### For Recruiters & Hiring Managers

This project demonstrates:
- **Full-stack development**: React/TypeScript frontend + FastAPI backend
- **Modern infrastructure**: Docker, Nginx, PostgreSQL, Redis, Cloudflare Tunnel
- **AI/ML integration**: LLM agents (streaming chat), RAG with pgvector, ML categorization
- **Production practices**: OAuth authentication, KMS encryption, CSRF/CSP hardening, E2E testing
- **DevOps**: Docker Compose workflows, hermetic testing, monitoring/observability
- **Scale considerations**: Multi-tenancy, caching strategies, background jobs

**Architecture**: See [docs/OVERVIEW.md](docs/OVERVIEW.md)
**Infrastructure**: See [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)

---

## Features

- **CSV Transaction Import** - Upload bank statements from multiple formats
- **Automatic Categorization** - ML-powered suggestions with confidence scoring
- **Manual Categorization** - Bulk categorize with undo safety (just this, same merchant, same description)
- **Unknowns Panel** - Safe bulk categorization with localStorage-based undo
- **Rich Charts** - Top categories, merchants, daily flows, spending trends, forecast
- **ChatDock** - Natural language questions about your spending with streaming responses
- **Demo Mode** - Try sample data without signup at [app.ledger-mind.org](https://app.ledger-mind.org)

---

## Tech Stack

- **Frontend:** Vite + React + shadcn/ui
- **Backend:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL (prod), SQLite (tests)
- **LLM:** Ollama / OpenAI-compatible (local or remote)
- **Infrastructure:** Docker Compose, Nginx, Cloudflare Tunnel
- **Security:** KMS-backed encryption, CSP hardening, CSRF protection

---

## Quick Start (Docker)

```bash
git clone https://github.com/leok974/LedgerMind.git
cd LedgerMind

# Configure environment
cp .env.example .env
# Edit .env with your LLM settings (OPENAI_BASE_URL, MODEL, etc.)

# Start stack
docker compose up -d

# Access the app
open http://localhost:8083
```

**Default ports:**
- **8083** - Nginx (production-like setup)
- **8000** - Backend API (direct access)
- **5173** - Vite dev server (development only)

---

## Development Setup

### Prerequisites

- **Python 3.11+**
- **Node 20+** (pnpm recommended)
- **Docker Desktop** or Docker Engine
- **Local LLM** (optional):
  - Ollama: `ollama run gpt-oss:20b`
  - vLLM: `python -m vllm.entrypoints.openai.api_server --model <model-path>`

### Backend

```bash
cd apps/backend
python -m venv .venv && .venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac

pip install -U pip
pip install -e .

# Run migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd apps/web
pnpm install
pnpm dev  # http://localhost:5173
```

**Full infrastructure guide:** See [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)

---

## Testing

### Backend Tests

```bash
pnpm -C apps/backend pytest -q
```

### Frontend Unit Tests

```bash
pnpm -C apps/web vitest run
```

### Frontend E2E Tests

```bash
pnpm -C apps/web exec playwright test
```

**Testing & debugging:** See [docs/DEBUGGING_GUIDE.md](docs/DEBUGGING_GUIDE.md)

---

## Production Deployment

**Live instance:** [https://app.ledger-mind.org](https://app.ledger-mind.org)

### Deployment Overview

1. Build Docker images with commit-hash tags
2. Update `docker-compose.prod.yml` with new image references
3. Deploy to production host
4. Verify health endpoints

**Full guide:** See [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)

### Current Production Images

See `docker-compose.prod.yml` for current image tags.

---

## Documentation

- **[Architecture & System Design](docs/OVERVIEW.md)** - High-level architecture, core concepts, data flow
- **[Infrastructure & Deployment](docs/INFRASTRUCTURE.md)** - Docker setup, services, environment variables
- **[Debugging & Troubleshooting](docs/DEBUGGING_GUIDE.md)** - Common issues, health checks, runbooks
- **[Release Notes](docs/RELEASE_NOTES.md)** - Major milestones and feature releases

### Additional Resources
- [Agent System](AGENTS.md) - Specialist agent documentation
- [Archived Docs](docs/archive/) - Legacy phase docs and deployment records

---

## Key Endpoints

### Frontend
- `/` - Dashboard with charts and insights
- `/app` - Main application (aliased to `/`)
- `/chat` - Standalone ChatDock interface

### Backend
- `GET /api/ready` - Health check (db, migrations, crypto, llm)
- `GET /api/healthz` - Detailed health status
- `POST /agent/stream` - Streaming chat with LLM
- `POST /ingest` - CSV upload endpoint
- `GET /charts/<chart-type>` - Chart data endpoints

---

## Environment Variables (Core)

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_ENABLED` | Yes (prod) | Enable envelope encryption with KMS |
| `GCP_KMS_KEY` | Yes (KMS) | Full GCP KMS key resource path |
| `MODEL` | Yes | Primary LLM model (e.g., `gpt-oss:20b`) |
| `OPENAI_BASE_URL` | Optional | Ollama/vLLM endpoint |
| `OPENAI_API_KEY` | Optional | Fallback LLM API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |

**See** [`.env.example`](.env.example) for complete list.

---

## Agents & Workflows

This repo uses **specialist agents** for development tasks:

- **api-agent** - Backend API, DB, ML, RAG
- **test-agent** - Vitest, Playwright, Pytest
- **docs-agent** - Documentation & runbooks
- **dev-deploy-agent** - Docker, local stacks
- **security-agent** - Auth, SSRF, secrets

**See** [`AGENTS.md`](AGENTS.md) for agent system overview.

---

## Security

- **Encryption:** KMS-backed envelope encryption for sensitive fields
- **CSP:** Runtime hash-based Content Security Policy
- **CSRF:** Token-based protection on all mutations
- **Auth:** Session cookies with httpOnly + sameSite
- **SSRF:** URL allowlist for LLM/agent endpoints

**Security overview:** See [docs/OVERVIEW.md](docs/OVERVIEW.md#multi-tenancy--security)

---

## Contributing

Contributions are welcome! Please see [docs/OVERVIEW.md](docs/OVERVIEW.md) for architecture and:

- Code style guidelines
- Commit message conventions
- Testing requirements
- PR review process

---

## License

[License information to be added]

---

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for release notes and version history.

---

## Troubleshooting

**Common issues:**

- **`crypto_ready: false`** - Verify GCP service account mounted at `/secrets/gcp-sa.json`
- **502 via edge** - Check Cloudflare Tunnel ingress points to `http://nginx:80`
- **LLM fallback to stub** - Ensure Ollama model is pulled or `OPENAI_API_KEY` is set

**Full guide:** [docs/DEBUGGING_GUIDE.md](docs/DEBUGGING_GUIDE.md)

---

**Built with ❤️ for the Open Models Hackathon**
