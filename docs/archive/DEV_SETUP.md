# Development Setup

Complete guide for setting up LedgerMind for local development.

---

## Prerequisites

- **Python 3.11+**
- **Node 20+** (pnpm recommended: `npm i -g pnpm`)
- **Docker Desktop** or Docker Engine
- **Git**
- **Optional:** Local LLM (Ollama or vLLM)

---

## Local Development (No Docker)

### 1. Backend Setup

```bash
cd apps/backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -U pip setuptools wheel
pip install -e .

# Configure environment
cp ../../.env.example ../../.env
# Edit .env with your settings

# Run migrations
alembic upgrade head

# Create admin user (optional)
python -m app.cli users create \
  --email admin@local \
  --password admin123 \
  --roles admin analyst user

# Start backend
uvicorn app.main:app --reload --port 8000
```

**Backend will be available at:** `http://localhost:8000`

### 2. Frontend Setup

```bash
cd apps/web

# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

**Frontend will be available at:** `http://localhost:5173`

---

## Docker Compose Development

### Full Stack (Recommended)

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f backend

# Access shell in backend container
docker exec -it $(docker ps -q -f name=backend) bash

# Run migrations in container
docker exec -it $(docker ps -q -f name=backend) alembic upgrade head
```

**Services:**
- **Backend:** `http://localhost:8000`
- **Frontend:** `http://localhost:8083` (via nginx)
- **PostgreSQL:** `localhost:5432`

### Dev Scripts (Windows)

```powershell
# Start Ollama + Backend + Frontend
.\scripts\dev.ps1

# With custom model
.\scripts\dev.ps1 -Model llama2:13b

# Point to custom Python venv
.\scripts\dev.ps1 -Py .venv\Scripts\python.exe
```

---

## Environment Configuration

### Core Variables

```bash
# Backend
DATABASE_URL=postgresql+psycopg://myuser:changeme@localhost:5432/finance
APP_ENV=dev
DEV_ALLOW_NO_LLM=1  # Allow stub responses when LLM unavailable

# LLM
MODEL=gpt-oss:20b
OPENAI_BASE_URL=http://localhost:11434/v1  # Ollama
OPENAI_API_KEY=ollama  # Dummy key for Ollama

# Encryption (dev can use env-based KEK)
ENCRYPTION_ENABLED=1
ENCRYPTION_MASTER_KEY_BASE64=$(openssl rand -base64 32)

# Frontend
VITE_API_BASE=/  # Relative paths (proxied via Vite)
VITE_SUGGESTIONS_ENABLED=1
VITE_UNKNOWNS_ENABLED=1
```

**See** [`.env.example`](../../.env.example) for complete list.

---

## Running Tests

### Backend

```bash
cd apps/backend

# All tests
pnpm pytest -q

# Specific test file
pnpm pytest tests/test_agent_chat.py -v

# With coverage
pnpm pytest --cov=app --cov-report=html
```

### Frontend Unit Tests

```bash
cd apps/web

# Run all tests
pnpm vitest run

# Watch mode
pnpm vitest

# With coverage
pnpm test:cov
```

### E2E Tests

```bash
cd apps/web

# Install Playwright browsers (one-time)
pnpm exec playwright install --with-deps chromium

# Run E2E tests
pnpm exec playwright test

# Run specific test
pnpm exec playwright test tests/e2e/demo-login-simple.spec.ts

# Interactive mode
pnpm exec playwright test --ui
```

---

## Database Management

### Migrations

```bash
cd apps/backend

# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# View history
alembic history
```

### Reset Database (Dev)

```bash
# Stop backend
docker compose stop backend

# Drop and recreate volume
docker compose down
docker volume rm ai-finance-agent-oss_pgdata

# Restart
docker compose up -d
docker exec -it $(docker ps -q -f name=backend) alembic upgrade head
```

---

## Local LLM Setup

### Ollama

```bash
# Install Ollama
# Windows: Download from ollama.ai
# Linux: curl https://ollama.ai/install.sh | sh

# Pull model
ollama pull gpt-oss:20b

# Start server (usually auto-starts)
ollama serve

# Test
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-oss:20b","messages":[{"role":"user","content":"Hello"}]}'
```

### vLLM

```bash
# Install vLLM
pip install vllm

# Start server
python -m vllm.entrypoints.openai.api_server \
  --model <model-path-or-hf-id> \
  --port 8080

# Configure in .env
OPENAI_BASE_URL=http://localhost:8080/v1
```

---

## IDE Configuration

### VS Code

Recommended extensions:
- Python (ms-python.python)
- Pylance (ms-python.vscode-pylance)
- ESLint (dbaeumer.vscode-eslint)
- Prettier (esbenp.prettier-vscode)
- Playwright Test (ms-playwright.playwright)

**Workspace settings:** See [`.vscode/settings.json`](../../.vscode/settings.json)

---

## Troubleshooting

### Backend won't start

**Symptom:** `FATAL: password authentication failed`

**Fix:**
```bash
# Reset Postgres password in container
docker exec ledgermind-dev-postgres-1 psql -U myuser -d postgres \
  -c "ALTER ROLE myuser WITH PASSWORD 'changeme';"

# Ensure POSTGRES_PASSWORD is exported
$env:POSTGRES_PASSWORD='changeme'  # PowerShell
```

### Frontend can't reach backend

**Symptom:** 404 on `/api/*` endpoints

**Fix:** Ensure backend is running on port 8000 and Vite proxy is configured in `vite.config.ts`:
```ts
proxy: {
  '/api': 'http://localhost:8000',
  '/agent': 'http://localhost:8000',
  '/auth': 'http://localhost:8000',
}
```

### Tests fail with SQLite errors

**Symptom:** `relation "transactions" does not exist`

**Fix:** Run migrations on test database:
```bash
cd apps/backend
DATABASE_URL=sqlite+pysqlite:///test_e2e.db alembic upgrade head
```

---

## Next Steps

- **Production deployment:** See [`PRODUCTION_SETUP.md`](PRODUCTION_SETUP.md)
- **Testing guide:** See [`../testing/TESTING_GUIDE.md`](../testing/TESTING_GUIDE.md)
- **Architecture overview:** See [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md)
