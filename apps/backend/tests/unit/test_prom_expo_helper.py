from ..helpers.prom_expo import iter_samples, count_unlabeled, count_labeled, value_for

_SAMPLE = """# HELP edge_csp_policy_length length of CSP
# TYPE edge_csp_policy_length gauge
edge_csp_policy_length 617
edge_csp_policy_sha{sha="deadbeef"} 1
edge_csp_policy_sha{sha="beadfeed"} 0
"""

def test_helper_parses_samples():
    assert count_unlabeled(_SAMPLE, "edge_csp_policy_length") == 1
    assert count_labeled(_SAMPLE, "edge_csp_policy_sha", sha="deadbeef") == 1
    assert value_for(_SAMPLE, "edge_csp_policy_sha", sha="deadbeef") == 1.0
    samples = list(iter_samples(_SAMPLE, "edge_csp_policy_sha"))
    assert len(samples) == 2 and samples[0][0]["sha"] == "deadbeef"
