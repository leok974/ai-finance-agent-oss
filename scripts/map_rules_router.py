#!/usr/bin/env python3
from __future__ import annotations
import ast
import json
import re
import sys
from pathlib import Path

TARGET = Path("apps/backend/app/routers/agent_tools_rules_save.py")


def _routes(mod: ast.Module):
    out = []
    for fn in (n for n in ast.walk(mod) if isinstance(n, ast.FunctionDef)):
        for d in fn.decorator_list:
            if not (isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)):
                continue
            if d.func.attr not in {"post", "get", "put", "patch"}:
                continue
            if not (
                isinstance(d.func.value, ast.Name)
                and d.func.value.id in {"router", "api", "rules"}
            ):
                continue
            path = None
            if (
                d.args
                and isinstance(d.args[0], ast.Constant)
                and isinstance(d.args[0].value, str)
            ):
                path = d.args[0].value
            out.append(
                {
                    "fn": fn.name,
                    "method": d.func.attr.upper(),
                    "path": path,
                    "params": [a.arg for a in fn.args.args],
                }
            )
    return out


def _envs(mod: ast.Module):
    env = set()
    for n in ast.walk(mod):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute):
            if (
                n.func.attr in {"getenv", "get"}
                and n.args
                and isinstance(n.args[0], ast.Constant)
            ):
                v = n.args[0].value
                if isinstance(v, str) and v:
                    env.add(v)
    return sorted(env)


def _headers(src: str):
    hdrs = set(re.findall(r"[Hh]eader\\([^)]*alias\\s*=\\s*['\"]([^'\"]+)['\"]", src))
    hdrs |= set(re.findall(r"headers\\s*\\[\\s*['\"]([^'\"]+)['\"]\\s*\\]", src))
    return sorted(hdrs)


def _core_calls(mod: ast.Module):
    hits = set()
    for n in ast.walk(mod):
        if isinstance(n, ast.Call):
            f = n.func
            name = (
                f.id
                if isinstance(f, ast.Name)
                else (f.attr if isinstance(f, ast.Attribute) else None)
            )
            if (
                name
                and "rule" in name.lower()
                and any(
                    k in name.lower()
                    for k in ("merge", "save", "plan", "apply", "dedupe", "compute")
                )
            ):
                hits.add(name)
    return sorted(hits)


def main():
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else TARGET
    if not p.exists():
        print(json.dumps({"error": f"file not found: {p}"}, indent=2))
        return
    src = p.read_text(encoding="utf-8")
    mod = ast.parse(src)
    print(
        json.dumps(
            {
                "file": str(p),
                "routes": _routes(mod),
                "headers": _headers(src),
                "env_vars": _envs(mod),
                "core_calls": _core_calls(mod),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
