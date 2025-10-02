import gc
import warnings


def test_no_resource_warnings(client):
    """Ensure hitting common endpoints does not leak unclosed resources.

    Escalates ResourceWarning to error within this scope only; if this fails
    we likely have a stray engine/session creation path not disposed properly.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("error", ResourceWarning)
        assert client.get("/healthz").status_code == 200
        assert client.get("/ready").status_code == 200
        # Force finalizers / GC sweep to surface any pending resource warnings
        gc.collect()