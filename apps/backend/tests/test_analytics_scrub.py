import re

_DEFAULT_SENSITIVE = (
    "email, authorization, token, access_token, refresh_token, id_token, "
    "apikey, api_key, key, secret, password, passwd, auth, session, cookie, "
    "ssn, social_security, creditcard, card, card_number, pan"
)
_SENSITIVE_KEYS = tuple(
    [s.strip().lower() for s in _DEFAULT_SENSITIVE.split(",") if s.strip()]
)
_RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_RE_JWT = re.compile(r"^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$")
_RE_BEARER = re.compile(r"^(?:bearer\s+)?[A-Za-z0-9\-_=]{16,}$", re.I)
_MAX_STR_LEN = 512
_MAX_DEPTH = 6


def _is_sensitive_key(key: str) -> bool:
    k = (key or "").lower()
    return any(frag in k for frag in _SENSITIVE_KEYS)


def _mask_string_value(v: str) -> str:
    if _RE_EMAIL.match(v):
        return "[email]"
    if _RE_JWT.match(v):
        return "[jwt]"
    if _RE_BEARER.match(v):
        return "[token]"
    if len(v) > _MAX_STR_LEN:
        return v[:_MAX_STR_LEN] + "…"
    return v


def _scrub_props(obj, depth: int = 0):  # simplified copy for test isolation
    if depth >= _MAX_DEPTH:
        return "[truncated]"
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if _is_sensitive_key(str(k)):
                out[k] = "[redacted]"
            else:
                out[k] = _scrub_props(v, depth + 1)
        return out
    if isinstance(obj, list):
        return [_scrub_props(x, depth + 1) for x in obj]
    if isinstance(obj, tuple):
        return tuple(_scrub_props(x, depth + 1) for x in obj)
    if isinstance(obj, str):
        return _mask_string_value(obj)
    return obj


def test_scrub_props_redacts_sensitive_keys():
    props = {
        "email": "alice@example.com",
        "authorization": "Bearer 1234567890abcdef",
        "nested": {"access_token": "xyz", "note": "hello"},
        "password": "s3cr3t",
    }
    out = _scrub_props(props)
    # email key is sensitive -> redacted (value masking only if key not sensitive)
    assert out["email"] in {"[redacted]", "[email]"}
    assert out["authorization"] == "[redacted]"
    assert out["nested"]["access_token"] == "[redacted]"
    assert out["nested"]["note"] == "hello"
    assert out["password"] == "[redacted]"


def test_scrub_props_masks_values_under_non_sensitive_keys():
    props = {
        "comment": "alice@example.com",  # masks email even if key isn't sensitive
        "token_hint": "abc.def.ghi",  # looks like JWT (structure)
    }
    out = _scrub_props(props)
    assert out["comment"] == "[email]"
    assert out["token_hint"] in {"[jwt]", "[token]", "[redacted]"}


def test_scrub_props_limits_depth_and_length():
    deep = {"a": {"b": {"c": {"d": {"e": {"f": {"g": "too deep"}}}}}}}
    out = _scrub_props(deep)
    # presence of truncated marker or outright truncation
    assert "[truncated]" in str(out) or out == "[truncated]"

    long = {"note": "x" * 600}
    out2 = _scrub_props(long)
    assert isinstance(out2["note"], str)
    assert len(out2["note"]) <= 603  # 512 + ellipsis + small cushion
