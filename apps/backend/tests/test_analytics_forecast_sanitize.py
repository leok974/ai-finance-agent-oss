import math
import pytest

from app.services.analytics_forecast import _sanitize_sequence, _jitter_if_constant

def test_sanitize_sequence_replaces_nan_and_inf():
    seq = [1.0, float('nan'), float('inf'), None, 2.5]
    cleaned = _sanitize_sequence(seq, last_obs=1.0)
    # After first element, every invalid value should be replaced by previous valid
    # Expected progression: [1.0, 1.0, 1.0, 1.0, 2.5]
    assert cleaned == [1.0, 1.0, 1.0, 1.0, 2.5]


def test_sanitize_sequence_preserves_valid_chain():
    seq = [2.0, 2.1, 2.2]
    cleaned = _sanitize_sequence(seq, last_obs=2.0)
    assert cleaned == seq


def test_jitter_if_constant_applies_deterministic_delta():
    base_seq = [5.0, 5.0, 5.0]
    jittered = _jitter_if_constant(base_seq)
    assert jittered != base_seq
    assert len(jittered) == 3
    # Deterministic increments of 0.01 * (i+1)
    assert jittered == [5.01, 5.02, 5.03]


def test_jitter_if_constant_no_change_for_non_constant():
    seq = [1.0, 1.01, 1.02]
    assert _jitter_if_constant(seq) == seq


def test_jitter_if_constant_single_element_no_change():
    assert _jitter_if_constant([3.14]) == [3.14]
