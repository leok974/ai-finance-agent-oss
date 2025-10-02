import os
from google.cloud import kms_v1

_client = kms_v1.KeyManagementServiceClient()
_KEY_NAME = os.getenv("GCP_KMS_KEY")
_AAD = (os.getenv("GCP_KMS_AAD") or "").encode("utf-8") or None


def kms_wrap_dek(plain_dek: bytes) -> bytes:
    assert _KEY_NAME, "GCP_KMS_KEY env not set"
    resp = _client.encrypt(request={
        "name": _KEY_NAME,
        "plaintext": plain_dek,
        "additional_authenticated_data": _AAD,
    })
    return resp.ciphertext


def kms_unwrap_dek(wrapped_blob: bytes) -> bytes:
    assert _KEY_NAME, "GCP_KMS_KEY env not set"
    resp = _client.decrypt(request={
        "name": _KEY_NAME,
        "ciphertext": wrapped_blob,
        "additional_authenticated_data": _AAD,
    })
    return resp.plaintext
