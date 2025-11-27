# Architecture Overview

High-level architecture of LedgerMind.

---

## System Components

### Frontend (Vite + React)

- **Framework:** Vite 5, React 18
- **UI:** shadcn/ui components, Tailwind CSS
- **State:** React hooks, localStorage for persistence
- **Routing:** React Router v6
- **Key Features:**
  - Dashboard with charts and insights
  - ChatDock for LLM interactions (streaming)
  - CSV ingest with drag-drop
  - Unknowns panel with bulk categorization

### Backend (FastAPI)

- **Framework:** FastAPI (Python 3.11+)
- **ORM:** SQLAlchemy 2.0
- **Migrations:** Alembic
- **Key Features:**
  - REST API + streaming endpoints
  - ML-powered categorization
  - KMS-backed encryption
  - Agent/tool system for LLM integration

### Database

- **Production:** PostgreSQL 16
- **Tests:** SQLite (in-memory or file)
- **Schema:** See [`DATABASE.md`](DATABASE.md)

### Infrastructure

- **Orchestration:** Docker Compose
- **Reverse Proxy:** Nginx
- **Ingress:** Cloudflare Tunnel
- **Monitoring:** Prometheus + Grafana (optional)

---

## Request Flow

```
User → Cloudflare → Tunnel → Nginx:80 → Backend:8000 → PostgreSQL
                                      ↓
                                   Ollama:11434 (LLM)
```

---

## Data Flow

1. **CSV Ingest:**
   - User uploads CSV → Backend parses → Transactions table
   - Auto-categorization runs (ML + rules)
   - Unknowns flagged for manual review

2. **Chat/Agent:**
   - User sends message → ChatDock → `/agent/stream`
   - Backend loads context (transactions, insights) → LLM
   - Streaming response → Frontend displays tokens incrementally

3. **Charts:**
   - Frontend requests `/charts/<type>?month=YYYY-MM`
   - Backend queries DB, aggregates → JSON response
   - Frontend renders with Recharts

---

## Security Layers

- **Transport:** TLS via Cloudflare
- **Auth:** Session cookies (httpOnly, sameSite)
- **CSRF:** Token validation on mutations
- **Encryption:** KMS-backed envelope encryption for sensitive fields
- **CSP:** Hash-based Content Security Policy

**See:** [`SECURITY.md`](SECURITY.md)

---

## Deployment Architecture

### Development

```
Vite Dev Server:5173 → Backend:8000 → SQLite
```

### Production

```
Cloudflare Tunnel → Nginx:80 → Backend:8000 → PostgreSQL:5432
                                            → Ollama:11434
```

---

## Key Design Decisions

1. **Local-first LLM:** Ollama for privacy, OpenAI as fallback
2. **Envelope encryption:** DEK per environment, wrapped by KMS
3. **Streaming chat:** NDJSON for real-time LLM responses
4. **Hybrid categorization:** ML + rules + manual override
5. **Undo-safe bulk ops:** localStorage-based undo for manual categorization

---

## Further Reading

- **Database schema:** [`DATABASE.md`](DATABASE.md)
- **Security details:** [`SECURITY.md`](SECURITY.md)
- **Production setup:** [`../setup/PRODUCTION_SETUP.md`](../setup/PRODUCTION_SETUP.md)
