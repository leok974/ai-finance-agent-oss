# Coverage Ratchet Plan

Date established: 2025-10-01
Current measured backend coverage: ~87.6% (after aggressive temporary omit list).
Fail-under gate: 85%
Review date (see .coveragerc header): 2025-12-31

## Principles
1. Only keep modules in the omit list that are legacy, deprecated, or pending refactor.
2. Before removing any module from `omit`, add a minimal (10–20 LOC) smoke test hitting a representative code path.
3. Never drop the global fail-under; instead raise coverage in tandem with denominator growth.
4. Prefer adding tests to high-value leaf/service functions rather than broad integration where possible.
5. Remove (not add) new items to `omit` unless a compelling short-term blocker exists—add a comment and a target test issue if you must.

## Incremental Reintroduction Order (suggested)
1. `agent_tools_meta.py` – already partially exercised; add DB-backed latest_month test when DB fixture stable.
2. `agent_tools_rules_save.py` – split into smaller helpers, then add unit tests for rule application logic.
3. Selected router slices: `charts.py`, `budget.py` (thin request/response contracts) with simple happy-path tests.
4. Services with analytic logic (e.g., forecasting) after isolating pure functions for deterministic tests.

## Workflow
- PR removing an omit entry MUST:
  * Add or extend at least one test covering a success path and one error/edge branch (if trivial).
  * Include rationale in PR description referencing this document.
  * Pass existing 85% gate (will naturally tighten if done right).
- CI guard (`Freeze omit list`) blocks silent omit edits; override via `ALLOW_OMIT_DIFF=1` env with rationale.

## Tracking
Maintain a simple checklist in the issue tracker ("Coverage Ratchet 2025Q4") with one item per reintroduced module.

## Long Term
By review date aim to remove ≥50% of the temporary omissions and hold or raise coverage to ≥88–90%.
After stabilization, replace aggressive omit with narrow surgical excludes (migrations, scripts, generated code).

## Optional Dependency Fallback Exclusions (2025-10-01)
The `app/routers/agent_tools_rules_save.py` router contains import-time fallback blocks for optional dependencies (`csrf_protect`, `create_rule_db`, `build_ack`, `get_db`). These are now marked with `# pragma: no cover` because they only execute when modules fail to import (synthetic in test/env). See rationale in this doc; re-evaluate if we introduce minimal builds where those imports can legitimately fail.

---
Generated 2025-10-01 to formalize the temporary strategy and prevent coverage erosion.
