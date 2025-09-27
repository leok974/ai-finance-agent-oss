import importlib


def test_help_copy_available():
    mod = importlib.import_module("app.services.help_copy")
    assert hasattr(mod, "get_static_help_for_panel"), "Expected get_static_help_for_panel in help_copy module"
