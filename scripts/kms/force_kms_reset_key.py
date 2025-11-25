import os
import secrets
from sqlalchemy import text
from app.db import get_db
from google.cloud import kms_v1


def main() -> None:
    db = next(get_db())

    # New 32-byte DEK
    plain = secrets.token_bytes(32)

    # Wrap under GCP KMS
    name = os.environ["GCP_KMS_KEY"]
    aad_s = os.environ.get("GCP_KMS_AAD")
    aad = aad_s.encode() if aad_s else None
    client = kms_v1.KeyManagementServiceClient()
    resp = client.encrypt(
        request={
            "name": name,
            "plaintext": plain,
            "additional_authenticated_data": aad,
        }
    )

    # Insert as active; set optional columns if present
    cols = {
        r[0]
        for r in db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='encryption_keys'"
            )
        )
    }
    sql = (
        "INSERT INTO encryption_keys(label, dek_wrapped, dek_wrap_nonce{extra_cols}) "
        "VALUES (:label, :wrapped, NULL{extra_vals})"
    )
    extra_cols = ""
    extra_vals = ""
    params = {"label": "active", "wrapped": resp.ciphertext}
    if "wrap_scheme" in cols:
        extra_cols += ", wrap_scheme"
        extra_vals += ", :scheme"
        params["scheme"] = "gcp_kms"
    if "kms_key_id" in cols:
        extra_cols += ", kms_key_id"
        extra_vals += ", :kms"
        params["kms"] = name
    sql = sql.format(extra_cols=extra_cols, extra_vals=extra_vals)

    db.execute(text("DELETE FROM encryption_keys WHERE label='active'"))
    db.execute(text(sql), params)
    db.commit()
    print("Created fresh KMS-wrapped DEK as label=active")


if __name__ == "__main__":
    main()


def main() -> None:
    db = next(get_db())

    # Generate a fresh 32-byte DEK
    plain = secrets.token_bytes(32)

    # Wrap with GCP KMS
    name = os.environ["GCP_KMS_KEY"]
    aad_s = os.environ.get("GCP_KMS_AAD")
    aad = aad_s.encode() if aad_s else None
    client = kms_v1.KeyManagementServiceClient()
    resp = client.encrypt(
        request={
            "name": name,
            "plaintext": plain,
            "additional_authenticated_data": aad,
        }
    )

    # Insert as active; if optional columns exist, populate them
    cols = {
        r[0]
        for r in db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='encryption_keys'"
            )
        )
    }
    sql = (
        "INSERT INTO encryption_keys(label, dek_wrapped, dek_wrap_nonce{extra_cols}) "
        "VALUES (:label, :wrapped, NULL{extra_vals})"
    )
    extra_cols = ""
    extra_vals = ""
    params = {"label": "active", "wrapped": resp.ciphertext}
    if "wrap_scheme" in cols:
        extra_cols += ", wrap_scheme"
        extra_vals += ", :scheme"
        params["scheme"] = "gcp_kms"
    if "kms_key_id" in cols:
        extra_cols += ", kms_key_id"
        extra_vals += ", :kms"
        params["kms"] = name
    sql = sql.format(extra_cols=extra_cols, extra_vals=extra_vals)

    # Upsert-like: remove any existing active row, then insert the new one
    db.execute(text("DELETE FROM encryption_keys WHERE label='active'"))
    db.execute(text(sql), params)
    db.commit()
    print("Created fresh KMS-wrapped DEK as label=active")


if __name__ == "__main__":
    main()
