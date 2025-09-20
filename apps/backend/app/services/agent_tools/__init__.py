import importlib.util as _ilu
from pathlib import Path as _Path

_loaded = False
route_to_tool = None  # type: ignore

def _load_flat():
	global _loaded, route_to_tool
	if _loaded:
		return
	base_dir = _Path(__file__).resolve().parent.parent  # .../services
	target = base_dir / 'agent_tools.py'
	if not target.exists():
		raise ImportError("agent_tools flat module not found at " + str(target))
	spec = _ilu.spec_from_file_location('app.services._agent_tools_flat_impl', target)
	if spec and spec.loader:  # type: ignore
		mod = _ilu.module_from_spec(spec)  # type: ignore
		mod.__package__ = 'app.services'  # ensure relative imports (e.g., .rules_engine) resolve
		spec.loader.exec_module(mod)  # type: ignore
		route_to_tool = getattr(mod, 'route_to_tool')  # type: ignore
		_loaded = True
	else:
		raise ImportError("Unable to load agent_tools flat module spec")

def route_to_tool(*args, **kwargs):  # re-export with lazy load
	if not _loaded:
		_load_flat()
	return route_to_tool(*args, **kwargs)  # type: ignore

__all__ = ["route_to_tool"]

