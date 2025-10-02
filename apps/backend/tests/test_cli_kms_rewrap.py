from __future__ import annotations

import base64
import os
import ast

import pytest
import sys
import types

import app.cli as cli


def _run_cli(monkeypatch, capsys, *args: str) -> list[str]:
    monkeypatch.setattr(cli.sys, "argv", ["app.cli", *args], raising=False)
    cli.main()
    out = capsys.readouterr().out.strip().splitlines()
    return [line for line in out if line.strip()]


class _FakeKMS:
    # Very thin XOR wrapper to simulate encrypt/decrypt without external deps
    # Not secure, just deterministic within test
    def __init__(self):
        self._mask = b"KMSMASK-16-BYTES"  # 16 bytes

    def encrypt(self, request):
        pt: bytes = request["plaintext"]
        ct = bytes((pt[i] ^ self._mask[i % len(self._mask)]) for i in range(len(pt)))
        return type("Resp", (), {"ciphertext": ct})

    def decrypt(self, request):
        ct: bytes = request["ciphertext"]
        pt = bytes((ct[i] ^ self._mask[i % len(self._mask)]) for i in range(len(ct)))
        return type("Resp", (), {"plaintext": pt})


@pytest.mark.crypto
def test_cli_kek_to_kms_rewrap(monkeypatch, capsys):
    # Set stable KEK for initial active key creation
    monkeypatch.setenv("ENCRYPTION_MASTER_KEY_BASE64", base64.b64encode(os.urandom(32)).decode())

    # Stub KMS wrapper used by CLI and rotation helpers
    fake = _FakeKMS()
    monkeypatch.setenv("GCP_KMS_KEY", "projects/p/locations/l/keyRings/r/cryptoKeys/k")
    # Provide a fake google.cloud.kms_v1 before importing wrapper
    kms_v1_fake = types.SimpleNamespace(
        KeyManagementServiceClient=lambda: fake
    )
    google_cloud_fake = types.SimpleNamespace(kms_v1=kms_v1_fake)
    google_fake = types.SimpleNamespace(cloud=google_cloud_fake)
    monkeypatch.setitem(sys.modules, "google", google_fake)
    monkeypatch.setitem(sys.modules, "google.cloud", google_cloud_fake)
    monkeypatch.setitem(sys.modules, "google.cloud.kms_v1", kms_v1_fake)
    import app.services.gcp_kms_wrapper as gkms  # noqa: F401

    # Initialize crypto and ensure active key exists (KEK-wrapped)
    _run_cli(monkeypatch, capsys, "crypto-init")

    # Confirm CLI status prints rows
    status_lines = _run_cli(monkeypatch, capsys, "crypto-status")
    assert status_lines, "expected crypto-status output"
    # Parse last row to ensure fields present (some DBs may differ in order)
    last = ast.literal_eval(status_lines[-1])
    assert "wlen" in last and "nlen" in last
    assert last.get("label") in {"active", "rotating"} or isinstance(last.get("label"), str)

    # Perform KMS rewrap (in-place): unwrap via KEK, wrap via KMS, nonce becomes empty
    out = _run_cli(monkeypatch, capsys, "kek-rewrap-gcp")
    assert out and any("KMS rewrap: success" in line for line in out)

    # crypto-status should now show nlen == 0 for active row (empty nonce means KMS)
    status2 = _run_cli(monkeypatch, capsys, "crypto-status")
    # Find the first active row if present; else check last
    parsed = [ast.literal_eval(s) for s in status2]
    active_rows = [r for r in parsed if r.get("label") == "active"]
    row = active_rows[0] if active_rows else parsed[-1]
    assert row.get("wlen", 0) > 0
    assert row.get("nlen", 1) in (0, None)  # None on SQLite, 0 on Postgres bytea length

    # Sanity: we can still insert/read a txn
    _run_cli(monkeypatch, capsys, "txn-demo", "--desc", "kms")
    _run_cli(monkeypatch, capsys, "txn-show-latest")
