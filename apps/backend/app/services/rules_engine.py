def apply_rules(txn, rules):
    text_fields = {
        "merchant": (txn.get("merchant") or "").lower(),
        "description": (txn.get("description") or "").lower(),
    }
    for r in rules:
        hay = text_fields.get(r["target"], "")
        if r["pattern"].lower() in hay:
            return r["category"]
    return None
