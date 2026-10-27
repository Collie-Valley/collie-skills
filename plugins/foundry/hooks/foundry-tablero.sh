#!/usr/bin/env bash
# SessionStart — avisa de que hay tablero de Foundry y contra qué backend apunta.
# No toca la red. Silencioso si el MCP foundry-boards no está configurado.
# La lectura de la configuración vive en foundry-tablero.py; aquí solo se busca un Python que
# funcione (en Windows, `python3` suele ser el atajo de la Microsoft Store, que no ejecuta nada).
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CFG="$HOME/.claude.json"
if [ ! -f "$CFG" ] && [ -n "${USERPROFILE:-}" ]; then
  CFG="$(printf '%s' "$USERPROFILE" | tr '\\' '/')/.claude.json"
fi

for PY in python3 python py; do
  if "$PY" -c 'import json' >/dev/null 2>&1; then
    exec "$PY" -I "$DIR/foundry-tablero.py" "$CFG"
  fi
done

# Sin Python no se puede saber a dónde apunta: mejor decirlo que adivinarlo.
cat >/dev/null
grep -qs '"foundry-boards"' "$CFG" .mcp.json || exit 0
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Tablero de Foundry disponible (MCP foundry-boards), pero no pude leer a qué backend apunta (falta Python): compruébalo con list_spaces antes de operar. Si esta sesión trabaja una tarea, refleja el trabajo en su tarjeta: carga la skill foundry-tablero antes de operar el tablero (y la del repo, si la hay), y lee las columnas con get_board en vez de suponerlas."}}'
