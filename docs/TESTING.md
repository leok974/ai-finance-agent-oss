# TESTING

Overview of the testing strategy: fast hermetic core tests, broader optional integration, and deployment smoke.

## Test Layers
| Layer | Command (Linux/macOS) | PowerShell Equivalent | Purpose | Determinism |
|-------|-----------------------|-----------------------|---------|-------------|
| Hermetic (default) | `./apps/backend/scripts/test.ps1 -Hermetic` (via pwsh Core) | `pwsh ./apps/backend/scripts/test.ps1 -Hermetic` | Runs isolated logic & router tests with stubs (no external services) | High |
| Full Pytest | `(cd apps/backend && pytest -q)` | `pwsh -NoProfile -Command "cd apps/backend; pytest -q"` | Expanded coverage; may exercise slower paths | Medium |
| Smoke (HTTP) | `./scripts/smoke.sh` | `./scripts/smoke.ps1` | External surface readiness | High |
| Manual Verify | Follow `VERIFY_PROD.md` | Same | Human observation (UI, logs) | N/A |

Hermetic tests mock/replace:
- LLM calls (deterministic stub responses)
- Network I/O that is non-essential for logic
- Time-sensitive randomness (seeded where applicable)

## Running Hermetic Tests Directly
If you prefer raw pytest:
```
cd apps/backend
pytest -q -m hermetic
```
(Assuming markers applied; if not, leverage provided PowerShell script for selection.)

## Coverage
Add `--cov=app --cov-report=term-missing` to pytest invocation for coverage reporting:
```
pytest --cov=app --cov-report=term-missing -q
```
CI Gate (future): fail build if coverage < threshold (e.g., 85%).

## Deterministic Stubs
The LLM adapter returns fixed strings or structured placeholders in hermetic mode. This ensures:
- Reproducible snapshots
- Stable assertion of reasoning traces

## Adding New Tests
1. Place unit-level tests under `apps/backend/tests/` or root-style `test_*.py` collocated with modules (consistent with existing layout).
2. Use fixtures for common setup (DB session, sample transactions) avoiding global state.
3. For new routers, write at least:
   - 1 happy path
   - 1 validation / error case
   - 1 edge (empty payload / boundary numeric)
4. Avoid real network calls; inject adapters / clients.

## Marking Slow Tests
Use `@pytest.mark.slow` for optional heavy tests; exclude by default in hermetic script to keep cycle fast.

## Smoke vs Hermetic Distinction
| Aspect | Hermetic | Smoke |
|--------|----------|-------|
| Runtime | sub-seconds to few seconds | seconds (network + TLS) |
| Scope | Function + router logic | Deployment health (end-to-end) |
| Dependencies | None outside Python stdlib / local packages | Live containers / tunnel (if remote) |
| Failure Meaning | Regressed logic | Broken deployment / infra issue |

## Example Hermetic Assertion (Pseudo)
```python
def test_explain_stub(client):
    resp = client.post('/agent/chat', json={'messages':[{'role':'user','content':'Explain txn 1'}], 'intent':'explain_txn'})
    data = resp.json()
    assert resp.status_code == 200
    assert 'citations' in data
    assert data['model']  # stub default model name
```

## Tooling & Linters
| Tool | Scope | Typical Command |
|------|-------|-----------------|
| Ruff | Lint + some formatting | `ruff check .` |
| Black | Formatting | `black .` |
| MyPy (if enabled) | Static typing | `mypy app` |
| ESLint | Web linting | `pnpm -C apps/web run lint` |
| TypeScript | Type checks | `pnpm -C apps/web run typecheck` |

## Continuous Integration (Future Enhancements)
- Run hermetic tests + lint on PR.
- Optional nightly full test suite (including slower integration tests).
- Upload coverage XML to codecov.

## Related Docs
- [SMOKE_TESTS](SMOKE_TESTS.md)
- [VERIFY_PROD](VERIFY_PROD.md)
- [ARCHITECTURE](ARCHITECTURE.md)
- [CONTRIBUTING](CONTRIBUTING.md) (if present)

