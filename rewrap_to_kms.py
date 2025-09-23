import os, base64
from sqlalchemy import text
from app.db import get_db
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.cloud import kms_v1

db = next(get_db())
row = db.execute(text(
  "SELECT id,label,dek_wrapped,dek_wrap_nonce FROM encryption_keys "
  "WHERE label='active' ORDER BY created_at DESC LIMIT 1"
)).first()
assert row, "No active key in encryption_keys"

kek_b64 = (os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or os.getenv("MASTER_KEK_B64") or "").strip()
kek_b64 += "=" * ((4 - len(kek_b64) % 4) % 4)
aes = AESGCM(base64.b64decode(kek_b64))

plain = None
for aad in (None, b"dek"):
    try:
        plain = aes.decrypt(row.dek_wrap_nonce, row.dek_wrapped, aad)
        print("Unwrap OK with AAD:", aad)
        break
    except Exception as e:
        print("Unwrap failed with AAD:", aad, repr(e))
if plain is None:
    raise SystemExit("Could not unwrap DEK with provided KEK")

client = kms_v1.KeyManagementServiceClient()
name = os.environ["GCP_KMS_KEY"]
aad_s = os.environ.get("GCP_KMS_AAD")
aad = aad_s.encode() if aad_s else None
resp = client.encrypt(request={"name": name, "plaintext": plain, "additional_authenticated_data": aad})

db.execute(text(
  "UPDATE encryption_keys SET dek_wrapped=:w, dek_wrap_nonce=NULL WHERE id=:i"
), {"w": resp.ciphertext, "i": row.id})
db.commit()
print("Rewrapped active DEK under GCP KMS.")
