# collie-skills

Las **skills compartidas de Collie Valley** para Claude Code, publicadas como *marketplace* de
plugins. Aquí vive lo que no pertenece a un repo concreto: los ritos que se repiten en varios
proyectos. Lo específico de un repo se queda en el `.claude/skills/` de ese repo.

## Instalar

```
/plugin marketplace add Collie-Valley/collie-skills
/plugin install foundry@collie-skills
```

La primera línea da de alta el marketplace (una vez por máquina); la segunda instala el plugin.
A partir de ahí las skills se cargan solas cuando la tarea las pide, y se actualizan con
`/plugin marketplace update collie-skills`.

## Qué hay dentro

### Plugin `foundry`

| Skill | Para qué |
|---|---|
| [`foundry-tablero`](plugins/foundry/skills/foundry-tablero/SKILL.md) | El rito de trabajar contra un tablero de Foundry por el MCP `foundry-boards`: ubicarse (a qué backend apunta, qué tablero, qué columnas), mover la tarjeta al empezar, dejar avance y verificación con el commit al entregar, y registrar cada dato en su flujo. |

> `foundry-tablero` es **genérica**: sirve contra cualquier tablero. Lo propio de un tablero
> concreto vive en la skill de su repo — en Foundry, `tarjeta-fnv` — que se apoya en ésta.

Y un hook de `SessionStart` ([`hooks/`](plugins/foundry/hooks/)): al abrir sesión, si hay MCP
`foundry-boards`, le dice al agente que hay tablero y **a qué backend apunta** (LOCAL,
PRODUCCION u otro). Lee la misma configuración que Claude Code, sin tocar la red: la entrada de
ámbito local le gana al `.mcp.json` del proyecto (si no está en `disabledMcpjsonServers`), y éste
a la de ámbito usuario; si otra entrada apunta a otro sitio, lo avisa. Necesita Python en el
`PATH`; sin él, lo dice en vez de adivinar.

## Añadir una skill

1. Créala en el plugin que le toque: `plugins/<plugin>/skills/<nombre>/SKILL.md`, con
   frontmatter `name` y `description`. **El `name` es obligatorio** en un plugin distribuido:
   sin él, el nombre de invocación cambia con cada actualización.
2. La `description` es lo único que Claude lee para decidir si carga la skill. Escribe *cuándo*
   se usa, no solo qué hace.
3. Si el plugin es nuevo, dale su `plugins/<plugin>/.claude-plugin/plugin.json` y añádelo al
   array `plugins` de [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).
4. Sube la `version` del plugin (y la del marketplace) al cambiar algo que ya usa el equipo.

## Estructura

```
.claude-plugin/marketplace.json     el catálogo: qué plugins publica este repo
plugins/
  foundry/
    .claude-plugin/plugin.json      el manifiesto del plugin
    skills/
      foundry-tablero/SKILL.md      una carpeta por skill
    hooks/
      hooks.json                    los hooks que trae el plugin
      foundry-tablero.sh / .py      el aviso de SessionStart
```

## Trabajarla sin instalarla

Para editar una skill y verla en vivo, enlaza la carpeta en lugar de copiarla:

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\foundry-tablero" `
  -Target "D:\PROYECTOS\collie-valley\collie-skills\plugins\foundry\skills\foundry-tablero"
```

En Windows va **junction**, no `SymbolicLink`: el segundo pide privilegios de administrador y el
primero no, y para una carpeta hacen lo mismo. En macOS/Linux, `ln -s`.

Así se edita en un solo sitio. Reinicia Claude Code para que la vea. **No hagas las dos cosas**
(instalar el plugin *y* enlazar): la skill saldría duplicada.

El hook se trabaja igual, apuntando tu `~/.claude/settings.json` al script del repo:

```json
"hooks": {
  "SessionStart": [
    { "matcher": "startup|resume",
      "hooks": [{ "type": "command", "timeout": 10,
        "command": "bash \"D:/PROYECTOS/collie-valley/collie-skills/plugins/foundry/hooks/foundry-tablero.sh\"" }] }
  ]
}
```

Lo mismo aquí: con el plugin instalado, el aviso saldría dos veces.
