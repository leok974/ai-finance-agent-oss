def build_explanation(txn, suggestions, applied_rule=None):
    pieces = []
    if applied_rule:
        pieces.append(f"Matched rule: /{applied_rule['pattern']}/ on {applied_rule['target']} -> {applied_rule['category']}")
    if suggestions:
        best = suggestions[0]
        pieces.append(f"LLM top guess: {best['category']} ({int(best['confidence']*100)}%)")
    return " | ".join(pieces) if pieces else "No signal available."
