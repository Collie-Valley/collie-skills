"""SessionStart del plugin foundry: avisa de que hay tablero y a qué backend habla el MCP.

Lee la misma configuración que Claude Code, sin tocar la red, y se queda con la entrada
`foundry-boards` que de verdad arranca: la de ámbito local (`~/.claude.json`, por proyecto) le
gana al `.mcp.json` del proyecto —salvo que esté desactivado— y éste a la de ámbito usuario. Si
ninguna existe, calla. Recibe la ruta de `~/.claude.json` como argumento y el JSON del hook
(con su `cwd`) por stdin.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

NAME = "foundry-boards"
# El default del propio MCP (`foundry_mcp/config.py`): sin FOUNDRY_API_BASE, habla con producción.
DEFAULT_API_BASE = "https://foundry.collie.digital/api/v1"
PROD_HOSTS = {"foundry.collie.digital"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
SCOPES = {"local": "ámbito local", "project": ".mcp.json del proyecto", "user": "ámbito usuario"}
RITO = (
    "Si esta sesión trabaja una tarea, refleja el trabajo en su tarjeta: carga la skill "
    "foundry-tablero antes de operar el tablero (y la del repo, si la hay), y lee las columnas "
    "con get_board en vez de suponerlas."
)


def load_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def same_dir(a: str | Path, b: str | Path) -> bool:
    # ~/.claude.json guarda el mismo proyecto como `D:/x`, `d:/x` o `D:\x`.
    return os.path.normcase(os.path.normpath(a)) == os.path.normcase(os.path.normpath(b))


def expand(value: str) -> str:
    # Claude Code expande `${VAR}` y `${VAR:-default}` en el `env` de una entrada.
    return re.sub(
        r"\$\{(\w+)(?::-([^}]*))?\}",
        lambda m: os.environ.get(m.group(1)) or (m.group(2) or ""),
        value,
    )


def checkout_dotenv(entry: dict) -> str:
    """Un MCP arrancado desde un clon lee el `.env` de su raíz, y ese `.env` gana (override)."""
    args = [str(a) for a in entry.get("args") or []]
    dirs = [Path(args[i + 1]) for i, a in enumerate(args[:-1]) if a in ("--directory", "--project")]
    dirs += [Path(a).parent for a in args if a.endswith(".py")]
    for d in dirs:
        try:
            lines = (d / ".env").read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            key, sep, value = line.partition("=")
            if sep and key.strip() == "FOUNDRY_API_BASE" and value.strip():
                return value.strip().strip("\"'")
    return ""


def resolve_base(entry: dict) -> tuple[str, str]:
    """(endpoint, de dónde sale si no es del `env` de la entrada)."""
    dotenv = checkout_dotenv(entry)
    if dotenv:
        return dotenv, ".env del clon"
    declared = expand(str((entry.get("env") or {}).get("FOUNDRY_API_BASE") or "")).strip()
    if declared:
        return declared, ""
    # El MCP hereda el entorno de Claude Code, igual que este hook.
    if os.environ.get("FOUNDRY_API_BASE"):
        return os.environ["FOUNDRY_API_BASE"], "variable de entorno de la sesión"
    return DEFAULT_API_BASE, "la entrada no declara FOUNDRY_API_BASE: valor por defecto del MCP"


def classify(base: str) -> str:
    host = (urlparse(base).hostname or "").lower()
    if host in LOCAL_HOSTS:
        return "LOCAL"
    if host in PROD_HOSTS:
        return "PRODUCCION"
    return "OTRO BACKEND (ni local ni producción)"


def main() -> None:
    cfg_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / ".claude.json"
    cfg = load_json(cfg_path)
    hook_input: dict = {}
    if not sys.stdin.isatty():
        try:
            hook_input = json.loads(sys.stdin.read() or "{}")
        except ValueError:
            pass
    cwd = Path(hook_input.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())

    mcp_dir = next((d for d in (cwd, *cwd.parents) if (d / ".mcp.json").is_file()), None)
    projects = [
        p
        for key, p in (cfg.get("projects") or {}).items()
        if isinstance(p, dict) and (same_dir(key, cwd) or (mcp_dir and same_dir(key, mcp_dir)))
    ]

    # Un servidor del .mcp.json se apaga desde ~/.claude.json o desde cualquier settings.
    disabled: set[str] = set()
    settings = [cfg_path.parent / ".claude" / "settings.json"]
    if mcp_dir:
        settings += [mcp_dir / ".claude" / "settings.json", mcp_dir / ".claude" / "settings.local.json"]
    for source in [*projects, *map(load_json, settings)]:
        disabled.update(source.get("disabledMcpjsonServers") or [])

    candidates: list[tuple[str, dict]] = []
    local = next((e for p in projects if isinstance(e := (p.get("mcpServers") or {}).get(NAME), dict)), None)
    if local:
        candidates.append(("local", local))
    if mcp_dir and NAME not in disabled:
        project = (load_json(mcp_dir / ".mcp.json").get("mcpServers") or {}).get(NAME)
        if isinstance(project, dict):
            candidates.append(("project", project))
    user = (cfg.get("mcpServers") or {}).get(NAME)
    if isinstance(user, dict):
        candidates.append(("user", user))
    if not candidates:
        return

    scope, entry = candidates[0]
    base, origin = resolve_base(entry)
    detail = "; ".join(filter(None, [f"entrada de {SCOPES[scope]}", origin]))
    msg = f"Tablero de Foundry disponible (MCP {NAME}), apuntando a {classify(base)} - {base} ({detail})."

    # Si otra entrada apunta a otro sitio, quien lea el aviso tiene que saber que no manda.
    others = []
    for other_scope, other in candidates[1:]:
        other_base, _ = resolve_base(other)
        if other_base.rstrip("/") != base.rstrip("/"):
            others.append(f"{SCOPES[other_scope]}: {other_base}")
    if others:
        msg += (
            f" Ojo: hay otras entradas {NAME} que apuntan a otro sitio y no mandan "
            f"({'; '.join(others)}); si dudas, compruébalo con list_spaces."
        )

    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": f"{msg} {RITO}"}}))


if __name__ == "__main__":
    main()
