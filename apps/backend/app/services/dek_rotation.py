from __future__ import annotations
import os
import logging
from typing import Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.orm_models import Transaction, EncryptionKey, EncryptionSettings  # adjusted to actual orm_models
from app.core.crypto_state import get_dek_for_label, purge_dek_cache  # canonical DEK retrieval
from app.services.crypto import EnvelopeCrypto
import time

# Optional Prometheus instrumentation
try:  # pragma: no cover - metrics optional
    from prometheus_client import Counter, Gauge, Histogram
    _ROTATE_SCANNED = Counter("crypto_rotation_scanned_total", "Rows scanned during DEK rotation")
    _ROTATE_PROCESSED = Counter("crypto_rotation_processed_total", "Rows re-encrypted during DEK rotation")
    _ROTATE_FAILED = Counter("crypto_rotation_decrypt_fail_total", "Decrypt failures during DEK rotation")
    _ROTATE_OK = Counter("crypto_rotation_decrypt_ok_total", "Successful decrypt operations during rotation")
    _ROTATE_REMAINING = Gauge("crypto_rotation_remaining", "Remaining rows under source label needing rotation")
    _ROTATE_LAST_BATCH = Gauge("crypto_rotation_last_batch_size", "Row count processed in last rotation batch")
    _ROTATE_BATCH_LATENCY = Histogram(
        "crypto_rotation_batch_seconds",
        "Wall time to process a yielded batch of rows",
        buckets=(0.01,0.05,0.1,0.25,0.5,1,2,5,10,30)
    )
    _ROTATE_FAIL_FIELD = Counter(
        "crypto_rotation_decrypt_fail_field_total",
        "Decrypt failures grouped by field",
        labelnames=("field",)
    )
    _ROTATE_FINALIZE = Counter(
        "crypto_rotation_finalize_total",
        "Successful finalize (promotion) events for rotation"
    )
except Exception:  # pragma: no cover
    _ROTATE_SCANNED = _ROTATE_PROCESSED = _ROTATE_FAILED = _ROTATE_OK = _ROTATE_REMAINING = _ROTATE_LAST_BATCH = _ROTATE_BATCH_LATENCY = _ROTATE_FAIL_FIELD = _ROTATE_FINALIZE = None

_last_rotation_stats: Dict[str, Any] = {}
_logger = logging.getLogger(__name__)

_TXN_AAD = b"txn:v1"
_FAIL_SAMPLE_LIMIT = 5

def _to_bytes(x):
    if x is None: return None
    if isinstance(x, memoryview): x = x.tobytes()
    if isinstance(x, bytearray): return bytes(x)
    return x if isinstance(x, (bytes, bytearray)) else None

def rotation_status(db: Session) -> Dict[str, Any]:
    settings = db.execute(select(EncryptionSettings).limit(1)).scalar_one()
    # For backward compatibility with in-progress schema: treat write_label as active;
    # derive rotating label (assume there is at most one 'rotating::' key if separate field absent)
    active = getattr(settings, 'write_label', 'active')
    rotating = getattr(settings, 'rotating_label', None)
    if rotating is None:
        # attempt to discover latest rotating key label
        row = db.execute(select(EncryptionKey.label).where(EncryptionKey.label.like('rotating::%')).order_by(EncryptionKey.created_at.desc())).first()
        rotating = row.label if row else None
    done = db.query(Transaction).filter(Transaction.enc_label == rotating).count() if rotating else 0
    total = db.query(Transaction).filter(Transaction.enc_label.in_([active, rotating]) if rotating else Transaction.enc_label == active).count()
    return {"active": active, "rotating": rotating, "done": done, "total": total}

def run_rotation(db: Session, *, target_label: str, source_label: str = 'active', batch_size: int = 500, dry_run: bool = False) -> Dict[str, Any]:
    """Re-encrypt rows under source_label → target_label.

    Tests set write_label to target early; we therefore ignore settings.write_label and rely on explicit source_label (default 'active').
    """
    rotating = target_label
    if not rotating or rotating == source_label:
        # Still proceed if equal (will result in 0 processed) but mark reason
        pass

    purge_dek_cache(source_label, rotating)

    try:
        old_dek = get_dek_for_label(source_label)
        new_dek = get_dek_for_label(rotating)
    except Exception as e:
        return {"ok": False, "reason": f"dek-lookup-failed: {e}"}

    scanned = processed = skipped = 0
    dec_ok = dec_fail = 0
    batches: List[Tuple[int, int]] = []
    batch_seen = 0
    current_batch = 0

    # Encrypted columns in the Transaction model
    enc_cols = [
        ("description_nonce", "description_enc"),
        ("merchant_raw_nonce", "merchant_raw_enc"),
        ("note_nonce", "note_enc"),
    ]

    payload_filter = (
        (Transaction.description_enc != None)  # noqa: E711
        | (Transaction.merchant_raw_enc != None)  # noqa: E711
        | (Transaction.note_enc != None)  # noqa: E711
    )

    count_source_label = (
        db.query(Transaction)
        .filter(payload_filter)
        .filter(Transaction.enc_label == source_label)
        .count()
    )
    count_rotating_label = (
        db.query(Transaction)
        .filter(payload_filter)
        .filter(Transaction.enc_label == rotating)
        .count()
    )

    q = (
        db.query(Transaction)
          .filter(payload_filter)
          .filter((Transaction.enc_label == None) | (Transaction.enc_label == source_label))  # noqa: E711
          .yield_per(batch_size)
    )

    fail_samples: List[Dict[str, Any]] = []

    last_batch_processed = 0
    rotation_start = time.monotonic()
    batch_start = time.monotonic()
    for row in q:
        scanned += 1
        current_batch += 1
        changed_any = False
        for nonce_field, ct_field in enc_cols:
            ct = _to_bytes(getattr(row, ct_field, None))
            nonce = _to_bytes(getattr(row, nonce_field, None))
            if not ct or not nonce:
                continue
            try:
                pt = EnvelopeCrypto.aesgcm_decrypt(old_dek, ct, nonce, aad=_TXN_AAD)
            except Exception as exc:
                dec_fail += 1
                if len(fail_samples) < _FAIL_SAMPLE_LIMIT:
                    fail_samples.append({
                        "id": getattr(row, "id", None),
                        "field": ct_field,
                        "nonce_len": len(nonce),
                        "ct_len": len(ct),
                        "nonce_prefix": nonce[:8].hex() if len(nonce) >= 1 else "",
                        "ct_prefix": ct[:8].hex() if len(ct) >= 1 else "",
                        "error": exc.__class__.__name__,
                    })
                if _ROTATE_FAIL_FIELD:
                    try:
                        _ROTATE_FAIL_FIELD.labels(field=ct_field).inc()
                    except Exception:
                        pass
                continue
            dec_ok += 1
            if dry_run:
                changed_any = True
                continue
            new_ct, new_nonce = EnvelopeCrypto.aesgcm_encrypt(new_dek, pt, aad=_TXN_AAD)
            setattr(row, nonce_field, new_nonce)
            setattr(row, ct_field, new_ct)
            changed_any = True
        if changed_any:
            if not dry_run:
                row.enc_label = rotating
            processed += 1
            last_batch_processed += 1
        else:
            skipped += 1
        if current_batch == batch_size:
            batches.append((batch_seen, current_batch))
            batch_seen += current_batch
            if _ROTATE_BATCH_LATENCY:
                try:
                    _ROTATE_BATCH_LATENCY.observe(time.monotonic() - batch_start)
                except Exception:
                    pass
            batch_start = time.monotonic()
            current_batch = 0

    if current_batch:
        batches.append((batch_seen, current_batch))
        if _ROTATE_BATCH_LATENCY:
            try:
                _ROTATE_BATCH_LATENCY.observe(time.monotonic() - batch_start)
            except Exception:
                pass

    if not dry_run:
        db.commit()

    result = {
        "ok": True,
        "source": source_label,
        "rotating": rotating,
        "scanned": scanned,
        "processed": processed,
        "skipped": skipped,
        "diagnostics": {
            "decrypt_ok": dec_ok,
            "decrypt_fail": dec_fail,
            "count_source_label": count_source_label,
            "count_rotating_label": count_rotating_label,
            "fail_samples": fail_samples,
            "batches": batches,
        },
        "dry_run": dry_run,
    }
    # Metrics update
    if _ROTATE_SCANNED:
        try:
            _ROTATE_SCANNED.inc(scanned)
            _ROTATE_PROCESSED.inc(processed)
            _ROTATE_FAILED.inc(dec_fail)
            _ROTATE_OK.inc(dec_ok)
            remaining = max(0, (count_source_label - processed)) if not dry_run else count_source_label
            _ROTATE_REMAINING.set(remaining)
            _ROTATE_LAST_BATCH.set(last_batch_processed)
        except Exception:
            pass
    # Cache last stats for JSON health endpoint
    global _last_rotation_stats
    elapsed = time.monotonic() - rotation_start
    remaining_est = max(0, (count_source_label - processed))
    rate = (processed / elapsed) if elapsed > 0 else None
    eta_seconds = (remaining_est / rate) if (rate and rate > 0) else None
    prev_eta = None
    if _last_rotation_stats:
        prev_eta = _last_rotation_stats.get("eta_sec")
    # Compare ETA growth and emit warning if it regresses beyond thresholds
    eta_growth_warn = False
    if eta_seconds is not None and prev_eta is not None:
        try:
            pct_threshold = float(os.getenv("ROTATION_ETA_WARN_INCREASE_PCT", "0.25"))  # 25%
        except Exception:
            pct_threshold = 0.25
        try:
            min_delta = float(os.getenv("ROTATION_ETA_WARN_MIN_DELTA", "30"))  # 30s
        except Exception:
            min_delta = 30.0
        if eta_seconds - prev_eta >= min_delta and eta_seconds > prev_eta * (1 + pct_threshold):
            eta_growth_warn = True
            try:
                _logger.warning(
                    "rotation eta growth warning: prev=%.1fs new=%.1fs (+%.1fs, %.1f%% > thresholds pct=%.2f min_delta=%.1f)",
                    prev_eta, eta_seconds, (eta_seconds - prev_eta),
                    ((eta_seconds - prev_eta)/prev_eta*100.0) if prev_eta else 0.0,
                    pct_threshold, min_delta
                )
            except Exception:
                pass
    _last_rotation_stats = {
        "source": source_label,
        "target": rotating,
        "scanned": scanned,
        "processed": processed,
        "decrypt_ok": dec_ok,
        "decrypt_fail": dec_fail,
        "remaining_est": remaining_est,
        "elapsed_sec": round(elapsed, 3),
        "rate_rows_per_sec": round(rate, 3) if rate else None,
        "eta_sec": round(eta_seconds, 1) if eta_seconds else None,
        "eta_prev_sec": round(prev_eta, 1) if prev_eta is not None else None,
        "eta_growth_warn": eta_growth_warn,
        "dry_run": dry_run,
    }
    return result

def finalize_rotation(db: Session, *, target_label: str) -> Dict[str, Any]:
    settings = db.execute(select(EncryptionSettings).limit(1)).scalar_one()
    active = getattr(settings, 'write_label', 'active')
    rotating = target_label
    if rotating == active:
        return {"ok": False, "reason": "already-active"}
    rotated_rows = db.query(Transaction).filter(Transaction.enc_label == rotating).count()
    if rotated_rows == 0:
        return {"ok": False, "reason": "no-rows-with-rotating-label"}
    # Flip active label in settings to rotating
    setattr(settings, 'write_label', rotating)
    db.flush()
    # Relabel rows
    db.query(Transaction).filter(Transaction.enc_label == rotating).update({Transaction.enc_label: rotating}, synchronize_session=False)
    db.commit()
    # Metrics finalize counter
    if _ROTATE_FINALIZE:
        try:
            _ROTATE_FINALIZE.inc()
        except Exception:
            pass
    return {"ok": True, "active": rotating, "rotating": None, "relabelled": rotated_rows}
