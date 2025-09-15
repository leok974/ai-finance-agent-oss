from __future__ import annotations

import base64
import os
import ast

import pytest

import app.cli as cli


def _run_cli(monkeypatch, capsys, *args: str) -> list[str]:
    # Simulate `python -m app.cli <args>` within the same process
    monkeypatch.setattr(cli.sys, "argv", ["app.cli", *args], raising=False)
    cli.main()
    out = capsys.readouterr().out.strip().splitlines()
    return [line for line in out if line.strip()]


@pytest.mark.rotation
def test_cli_rotation_begin_run_finalize_e2e(monkeypatch, capsys):
    # Stable KEK for the process
    monkeypatch.setenv("ENCRYPTION_MASTER_KEY_BASE64", base64.b64encode(os.urandom(32)).decode())

    # Initialize crypto and ensure active key exists
    _run_cli(monkeypatch, capsys, "crypto-init")

    # Ensure writes go to active initially
    _run_cli(monkeypatch, capsys, "write-label-set", "--label", "active")

    # Seed a few encrypted rows using CLI txn-demo
    for i in range(3):
        _run_cli(monkeypatch, capsys, "txn-demo", "--desc", f"d{i}")

    # Begin rotation via CLI
    begin_out = _run_cli(monkeypatch, capsys, "dek-rotate-begin")
    assert begin_out, "no output from dek-rotate-begin"
    try:
        payload = ast.literal_eval(begin_out[-1])
    except Exception:
        payload = {}
    new_label = payload.get("new_label")
    assert new_label and new_label.startswith("rotating::")

    # Status should show label exists; remaining >= 0
    st_begin = _run_cli(monkeypatch, capsys, "dek-rotate-status", "--new-label", new_label)
    assert st_begin, "no output from dek-rotate-status (begin)"
    st0 = ast.literal_eval(st_begin[-1])
    assert st0.get("label") == new_label
    assert isinstance(st0.get("total_cipher_rows"), int)
    assert isinstance(st0.get("done"), int)

    # Run one batch
    _run_cli(monkeypatch, capsys, "dek-rotate-run", "--new-label", new_label, "--batch-size", "100", "--max-batches", "1")

    # Status after run
    st_after = _run_cli(monkeypatch, capsys, "dek-rotate-status", "--new-label", new_label)
    assert st_after, "no output from dek-rotate-status (after)"
    st1 = ast.literal_eval(st_after[-1])
    assert st1.get("label") == new_label
    assert st1.get("total_cipher_rows") >= st1.get("done") >= 0
    # Delta: done should increase after a run when there are cipher rows
    assert st1.get("done") > st0.get("done") or st0.get("total_cipher_rows") == 0

    # Finalize rotation
    fin_out = _run_cli(monkeypatch, capsys, "dek-rotate-finalize", "--new-label", new_label)
    assert fin_out, "no output from dek-rotate-finalize"

    # Status still callable (may report latest rotating label or same)
    st_final = _run_cli(monkeypatch, capsys, "dek-rotate-status")
    assert st_final, "no output from dek-rotate-status (final)"

    # Verify latest row readable via CLI (doesn't assert content; ensures no crash)
    _run_cli(monkeypatch, capsys, "txn-show-latest")
