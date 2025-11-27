# LedgerMind Documentation Audit

**Date**: 2025-11-26
**Total markdown files found**: 366
**Goal**: Reduce to ~5 core docs for recruiter-friendly presentation

## Executive Summary

The repo currently has **366 markdown files** scattered across:
- Root directory: ~80 files
- `docs/`: ~180 files
- `docs/archive/`: ~70 files (already archived!)
- `apps/web/`: ~40 files
- `apps/backend/`: ~30 files
- Various subdirectories

**Recommendation**: Consolidate to **5 core documents** and move everything else to archive or delete.

## Final Target Structure

```
README.md                    ← Recruiter-focused overview
docs/OVERVIEW.md             ← Architecture & system design
docs/INFRASTRUCTURE.md       ← Deployment & operations
docs/RELEASE_NOTES.md        ← Major milestones only
docs/DEBUGGING_GUIDE.md      ← Troubleshooting & runbooks
docs/archive/                ← Everything else (already exists!)
```

## Category Breakdown

### Category: KEEP (Core Docs - 5 files)

| Path | Description | Action |
|------|-------------|--------|
| `README.md` | Root overview | **REFACTOR** - Make recruiter-friendly |
| `docs/ARCHITECTURE.md` | System architecture | **RENAME** to `docs/OVERVIEW.md` + refactor |
| `docs/INFRASTRUCTURE.md` | Needs creation | **CREATE** from deploy docs |
| `docs/RELEASE_NOTES.md` | Needs creation | **CREATE** from CHANGELOG.md |
| `docs/DEBUGGING_GUIDE.md` | Needs creation | **CREATE** from troubleshooting docs |

### Category: MERGE into Final Docs

#### → Merge into `docs/OVERVIEW.md` (Architecture & Product)

| Path | What to Extract | Last Update |
|------|----------------|-------------|
| `AGENTS.md` | Agent architecture overview | 2025-11-26 |
| `docs/ARCHITECTURE.md` | Core architecture | Existing |
| `docs/architecture/OVERVIEW.md` | System overview | Check |
| `docs/CHATDOCK_V2_FRONTEND.md` | ChatDock UX summary | Recent |
| `apps/web/CHATDOCK_V2_FRONTEND.md` | ChatDock implementation | Recent |
| `docs/CHAT_AGENT_API.md` | Agent API design | Recent |
| `ML_SUMMARY.md` | ML pipeline overview | 2025-11 |
| `ML_TRAINING_ARCHITECTURE.md` | ML architecture | 2025-11 |

#### → Merge into `docs/INFRASTRUCTURE.md` (Deployment & Ops)

| Path | What to Extract | Last Update |
|------|----------------|-------------|
| `DEPLOY_PROD.md` | Production deployment | 2025-11 |
| `DEPLOY_QUICK_REF.md` | Quick deploy reference | 2025-11 |
| `docs/CHAT_BUILD_AND_DEPLOY.md` | Build & deploy steps | Recent |
| `docs/setup/PRODUCTION_SETUP.md` | Production setup | Check |
| `docs/setup/DEV_SETUP.md` | Dev setup | Check |
| `docker-compose.prod.yml` comments | Service architecture | Live |
| `DOCKER_ALIASES.md` | Useful Docker commands | 2025-11 |
| `docs/GPU_SETUP.md` | GPU/Ollama setup | Check |
| `docs/CLOUDFLARE_TUNNEL_CREDENTIALS_MODE.md` | Tunnel setup | Check |

#### → Merge into `docs/RELEASE_NOTES.md` (Milestones)

| Path | What to Extract | Last Update |
|------|----------------|-------------|
| `CHANGELOG.md` | Major releases | Check |
| Key `DEPLOYMENT_*.md` files | Notable deployments | Various |
| `docs/archive/PHASE*.md` | Phase summaries | Archived |

#### → Merge into `docs/DEBUGGING_GUIDE.md` (Troubleshooting)

| Path | What to Extract | Last Update |
|------|----------------|-------------|
| `docs/TROUBLESHOOTING_*.md` | All troubleshooting | Various |
| `docs/operations/TROUBLESHOOTING.md` | Operations troubleshooting | Check |
| `docs/operations/RUNBOOKS.md` | Runbook content | Check |
| `CSP-VALIDATION-RUNBOOK.md` | CSP debugging | Check |
| `INGEST_PRODUCTION_DEBUG.md` | Ingest debugging | Check |
| `E2E_TESTING_AND_MONITORING.md` | E2E test debugging | Check |
| `HELP_SYSTEM_VALIDATION.md` | Help system debugging | Check |

### Category: ARCHIVE (Move to `docs/archive/`)

**Already in archive**: 70+ files in `docs/archive/` - these stay there.

**Should be archived** (deployment records, phase docs, completed work):

- All `DEPLOYMENT_RECORD_*.md` files
- All `DEPLOYMENT_*_COMPLETE.md` files
- All `PHASE*.md` files in root
- All `*_IMPLEMENTATION.md`, `*_SUMMARY.md`, `*_COMPLETE.md` files
- All `*_FIX.md`, `*_FIXES.md` temporary fix notes
- `Context.md` - appears to be scratch notes
- All `apps/web/*_FIX.md` files
- All `apps/web/*_IMPLEMENTATION.md` files

**Count**: ~150 files

### Category: DELETE (Obsolete/Redundant)

**Test-specific docs** (keep in test dirs, don't need in main docs):
- All `apps/web/tests/**/*.md` except maybe one README
- All `apps/backend/tests/**/*.md` except maybe one README

**Duplicate/Redundant**:
- `README_OLD.md` - delete
- `DEPLOY.md` if redundant with `DEPLOY_PROD.md`
- Any `*_QUICKSTART.md` that's redundant

**Scratch/WIP notes**:
- `TODO_*.md` files
- `NEXT_STEPS.md`
- `HACKATHON_*.md` (unless hackathon is current)
- `GPU_QUOTA_STATUS.md` - status file

**Count**: ~100 files

### Category: KEEP IN PLACE (Specialized Docs)

These stay where they are (not moved to root docs/):

| Path | Reason |
|------|--------|
| `.github/copilot-instructions.md` | Copilot config |
| `.github/SECURITY_HARDENING_PHASE6.md` | Security config |
| `agents/*.md` | Agent-specific docs (6 files) |
| `ops/**/*.md` | Operations-specific (alerts, exporters) |
| `warehouse/**/*.md` | Data warehouse docs |
| `assistant_api/README.md` | API-specific |
| `apps/backend/app/ml/README.md` | ML module README |
| `apps/backend/app/routers/agent_tools/README.md` | Module README |

**Count**: ~20 files

## Detailed Audit Table

### Root Directory (80 files)

| File | Category | Action | Target | Notes |
|------|----------|--------|--------|-------|
| `README.md` | overview | KEEP+REFACTOR | - | Make recruiter-friendly |
| `AGENTS.md` | overview | MERGE | `docs/OVERVIEW.md` | Agent architecture |
| `CHANGELOG.md` | release-notes | MERGE | `docs/RELEASE_NOTES.md` | Extract milestones |
| `DEPLOY_PROD.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | Prod deployment |
| `DEPLOY_QUICK_REF.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | Quick ref |
| `ML_SUMMARY.md` | overview | MERGE | `docs/OVERVIEW.md` | ML overview |
| `ML_TRAINING_ARCHITECTURE.md` | overview | MERGE | `docs/OVERVIEW.md` | ML architecture |
| `ARCHITECTURE_DEMO_COMMANDS.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | Demo commands |
| `CSP-VALIDATION-RUNBOOK.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | CSP debugging |
| `DATABASE_SETUP.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | DB setup |
| `DOCKER_ALIASES.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | Useful commands |
| `E2E_TESTING_AND_MONITORING.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | E2E debugging |
| `INGEST_PRODUCTION_DEBUG.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | Ingest debugging |
| `TESTING_GUIDE.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | Testing guide |
| `OPERATIONS.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | Ops overview |
| `SECURITY.md` | overview | MERGE | `docs/OVERVIEW.md` | Security section |
| `README_OLD.md` | obsolete/duplicate | DELETE | - | Old version |
| `Context.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Scratch notes |
| `NEXT_STEPS.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Planning doc |
| `TODO_*.md` | scratch/backlog | ARCHIVE | `docs/archive/` | All TODO files |
| `DEPLOYMENT_*.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Deployment records |
| `PHASE*.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Phase docs |
| `*_COMPLETE.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Completed work |
| `*_FIX.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Fix notes |
| `*_IMPLEMENTATION.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Implementation notes |
| `*_SUMMARY.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Summary docs |
| `HACKATHON_*.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Event-specific |
| `GPU_QUOTA_STATUS.md` | obsolete/duplicate | DELETE | - | Status file |

*(Abbreviated - full table would list all 366 files)*

### `/docs` Directory (180 files)

| File | Category | Action | Target | Notes |
|------|----------|--------|--------|-------|
| `docs/ARCHITECTURE.md` | overview | RENAME+REFACTOR | `docs/OVERVIEW.md` | Core arch doc |
| `docs/CHAT_AGENT_API.md` | overview | MERGE | `docs/OVERVIEW.md` | Agent API |
| `docs/CHATDOCK_V2_FRONTEND.md` | overview | MERGE | `docs/OVERVIEW.md` | ChatDock UX |
| `docs/CHAT_BUILD_AND_DEPLOY.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | Build/deploy |
| `docs/setup/PRODUCTION_SETUP.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | Prod setup |
| `docs/setup/DEV_SETUP.md` | infra/deploy | MERGE | `docs/INFRASTRUCTURE.md` | Dev setup |
| `docs/operations/TROUBLESHOOTING.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | Troubleshooting |
| `docs/operations/RUNBOOKS.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | Runbooks |
| `docs/TROUBLESHOOTING_*.md` | debugging/runbook | MERGE | `docs/DEBUGGING_GUIDE.md` | All troubleshooting |
| `docs/archive/**/*.md` | - | KEEP IN PLACE | - | Already archived (70+ files) |
| `docs/*_COMPLETE.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Move to archive |
| `docs/*_IMPLEMENTATION.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Move to archive |
| `docs/*_SUMMARY.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Move to archive |
| `docs/DEPLOYMENT_*.md` | scratch/backlog | ARCHIVE | `docs/archive/` | Move to archive |

## Summary Statistics

| Category | Count | Action |
|----------|-------|--------|
| **KEEP (Final Docs)** | 5 | Create/refactor core docs |
| **MERGE** | ~30 | Extract content → final docs |
| **ARCHIVE** | ~150 | Move to `docs/archive/` |
| **DELETE** | ~100 | Remove obsolete/redundant |
| **KEEP IN PLACE** | ~20 | Specialized docs stay put |
| **ALREADY ARCHIVED** | ~70 | No action needed |
| **Total** | 366 | - |

## Implementation Plan

1. **Phase 1**: Create final doc structure
   - Refactor `README.md` (recruiter focus)
   - Create `docs/OVERVIEW.md` (from `docs/ARCHITECTURE.md` + merges)
   - Create `docs/INFRASTRUCTURE.md` (from deploy docs)
   - Create `docs/RELEASE_NOTES.md` (from CHANGELOG.md)
   - Create `docs/DEBUGGING_GUIDE.md` (from troubleshooting docs)

2. **Phase 2**: Archive completed/obsolete docs
   - Move ~150 files to `docs/archive/`
   - Pattern: `*_COMPLETE.md`, `*_FIX.md`, `*_IMPLEMENTATION.md`, `DEPLOYMENT_RECORD_*.md`, `PHASE*.md`

3. **Phase 3**: Delete redundant/obsolete
   - Delete ~100 files
   - Pattern: test-specific docs (keep minimal READMEs), duplicates, scratch notes

4. **Phase 4**: Update links & validate
   - Fix any broken links in final docs
   - Ensure all final docs are well-formatted
   - Add "For Recruiters" sections

## Recruiter Value Proposition

The final docs should highlight that LedgerMind demonstrates:
- **Full-stack development**: React/TypeScript frontend, FastAPI backend
- **Modern infrastructure**: Docker, nginx, PostgreSQL, Redis, Cloudflare
- **AI/ML integration**: LLM agents, RAG (pgvector), ML categorization
- **Production readiness**: Auth (OAuth), encryption, monitoring, E2E tests
- **DevOps practices**: CI/CD, canary deployments, hermetic testing
- **Scale considerations**: Multi-tenancy, caching, background jobs

---

*Next: Execute Phase 1 - Create final doc structure*
