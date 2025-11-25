# LedgerMind

> AI-powered personal finance dashboard with automatic categorization and an LLM-powered chat assistant

[![Coverage](docs/badges/coverage.svg)](https://github.com/leok974/ai-finance-agent-oss)

**Live Demo:** [https://app.ledger-mind.org](https://app.ledger-mind.org)

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
git clone https://github.com/leok974/ai-finance-agent-oss.git
cd ai-finance-agent-oss

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

**Full dev setup:** See [`docs/setup/DEV_SETUP.md`](docs/setup/DEV_SETUP.md)

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

**Testing guide:** See [`docs/testing/TESTING_GUIDE.md`](docs/testing/TESTING_GUIDE.md)

---

## Production Deployment

**Live instance:** [https://app.ledger-mind.org](https://app.ledger-mind.org)

### Deployment Overview

1. Build Docker images with commit-hash tags
2. Update `docker-compose.prod.yml` with new image references
3. Deploy to production host
4. Verify health endpoints

**Full guide:** See [`docs/setup/PRODUCTION_SETUP.md`](docs/setup/PRODUCTION_SETUP.md)

### Current Production Images

- **Backend:** `ledgermind-backend:main-511fee34`
- **Frontend:** `ledgermind-web:main-f1848e14`

---

## Documentation

### Setup & Getting Started
- [Development Setup](docs/setup/DEV_SETUP.md)
- [Production Deployment](docs/setup/PRODUCTION_SETUP.md)

### Architecture & Design
- [Architecture Overview](docs/architecture/OVERVIEW.md)
- [Database & Migrations](docs/architecture/DATABASE.md)
- [Security (KMS, CSP, Auth)](docs/architecture/SECURITY.md)

### Testing
- [Testing Guide](docs/testing/TESTING_GUIDE.md)
- [E2E Testing](docs/testing/E2E_TESTS.md)

### Operations
- [Monitoring & Metrics](docs/operations/MONITORING.md)
- [Troubleshooting](docs/operations/TROUBLESHOOTING.md)
- [Runbooks & Playbooks](docs/operations/RUNBOOKS.md)

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

**Full security documentation:** [`docs/architecture/SECURITY.md`](docs/architecture/SECURITY.md)

---

## Contributing

Contributions are welcome! Please see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for:

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

**Full guide:** [`docs/operations/TROUBLESHOOTING.md`](docs/operations/TROUBLESHOOTING.md)

---

**Built with ❤️ for the Open Models Hackathon**
