# CONTRIBUTING

Thanks for your interest in improving LedgerMind! This document outlines how to propose changes, coding style, and testing expectations.

## 1. Ground Rules
- Small, focused PRs are easier to review.
- Keep public API / endpoint changes documented (update README + relevant doc files).
- Add or update tests when fixing a bug or adding a feature.
- Avoid introducing new dependencies unless justified (security, performance, clarity).

## 2. Development Environment
```bash
git clone https://github.com/leok974/ai-finance-agent-oss.git
cd ai-finance-agent-oss
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -U pip && pip install -e ./apps/backend
# Frontend
pnpm install -C apps/web
```

## 3. Coding Standards
| Domain | Tooling | Command |
|--------|---------|---------|
| Python Formatting | black | `black apps/backend` |
| Python Lint | ruff | `ruff check apps/backend` |
| Type Checking (opt) | mypy | `mypy apps/backend/app` |
| JavaScript/TS Lint | eslint | `pnpm -C apps/web run lint` |
| TS Typecheck | tsc | `pnpm -C apps/web run typecheck` |

Automate pre-commit hooks (optional) by adding a local pre-commit config referencing black/ruff.

## 4. Testing
| Layer | Command |
|-------|--------|
| Hermetic | `pwsh ./apps/backend/scripts/test.ps1 -Hermetic` |
| Full | `(cd apps/backend && pytest -q)` |
| Smoke | `./scripts/smoke.sh` or `./scripts/smoke.ps1` |

Add tests for new routers, logic branches, and failure modes. Deterministic stubs keep hermetic runs fast.

## 5. Documentation Updates
When changing behavior:
- Update or create relevant doc under `docs/` (Architecture, Operations, Security, etc.).
- Add entry to `[Unreleased]` in `CHANGELOG.md` describing the change and referencing the PR.
- Cross-link new docs where it improves discoverability.

## 6. Commit & PR Guidelines
| Aspect | Recommendation |
|--------|---------------|
| Commit Message | Imperative mood ("Add X", "Fix Y") |
| Branch Naming | `feat/<topic>` `fix/<issue>` `docs/<area>` |
| PR Description | What, why, how tested, doc impact |
| Linked Issues | Use GitHub keywords (Fixes #123) |
| Squash vs Merge | Squash recommended for small change sets |

## 7. Performance & Security Considerations
- Profile before optimizing hot paths.
- Do not log secrets or full PII records.
- Consider using feature flags (env) for experimental endpoints.

## 8. Release Process (Lightweight)
1. Ensure `CHANGELOG.md` updated.
2. Run smoke tests against deployment candidate.
3. Tag commit (future semantic versioning TBD).
4. Publish release notes summarizing added / changed / security / deprecated.

## 9. Getting Help
Open a GitHub Discussion or Issue with context (logs, steps, expected vs actual). Include environment (OS, Python/Node versions, model provider).

## 10. Scope Boundaries
Out of scope for now:
- Proprietary provider integrations requiring closed licenses.
- Multi-region replication logic.

## 11. Code Review Checklist (Reviewer Aid)
| Item | Check |
|------|-------|
| Tests Added/Updated | ✅ |
| Docs Updated | ✅ |
| CHANGELOG Entry | ✅ |
| No Secret Leakage | ✅ |
| Error Paths Covered | ✅ |
| Lint / Typeclean | ✅ |

Cross-refs: [TESTING](TESTING.md) · [ARCHITECTURE](ARCHITECTURE.md) · [SECURITY](SECURITY.md) · [OPERATIONS](OPERATIONS.md)
