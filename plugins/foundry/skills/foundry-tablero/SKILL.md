---
name: foundry-tablero
description: El rito de trabajar contra un tablero de Foundry por el MCP foundry-boards, en cualquier proyecto — ubicarse (a qué backend apunta, qué tablero, qué columnas), mover la tarjeta al empezar, dejar avance y verificación con el commit al entregar, y registrar cada dato en su flujo. Cargar al empezar una tarea, al preguntar qué sigue, o antes de comentar/actualizar tarjetas.
---

# Skill: foundry-tablero

Procedimiento **genérico**: sirve en cualquier proyecto y contra cualquier tablero. Lo
específico de un tablero concreto vive en la skill de ese repo (p. ej. `tarjeta-fnv` en
Foundry), que se apoya en ésta.

## 0. Antes de nada: ¿hay tablero?

- Si las tools `mcp__foundry-boards__*` **no aparecen**, el MCP no está conectado: dilo en una
  línea y sigue con el trabajo sin tablero. No lo intentes ni inventes ids.
- Si aparecen, `whoami` dice **quién eres y contra qué backend** — que no es lo mismo que
  "conectado". El endpoint sale de `FOUNDRY_API_BASE` (el `.env` del MCP) y **solo cambia al
  reiniciar Claude Code**: si estás operando contra producción, actúa como tal.

## 1. Ubicarse (no supongas nada)

`list_spaces` → `list_boards` / `list_all_boards` → `get_board`.

> **Las columnas se leen, no se suponen.** Cada tablero tiene las suyas (de
> «To Do · In Progress · In QA · Pending To Deploy · Done» a «Backlog · Por hacer · En progreso
> · En revisión · Hecho», o las que haya montado el equipo). Lo único estable es la `category`
> de cada columna: `todo` / `in_progress` / `done`. El nombre lo cambia quien quiera.

Una tarjeta creada sin `column` nace en la columna de entrada del tablero.

## 2. El ciclo de una tarjeta

1. **Plan visible** — lo que vas a atacar sube a la columna `todo` con `transition_task`
   (`order` = 0 arriba; **el orden ES el plan**). Lo que no puedas cerrar tú (una decisión de
   producto) no lo muevas: déjale el análisis en un aporte.
2. **Al empezar** — `transition_task` → columna `in_progress`. **Una tarjeta a la vez.**
3. **Al entregar** — después de verificar el código de verdad:
   - `report_progress(content, percent, repo_url)` — QUÉ se construyó respondiendo al alcance
     de la tarjeta, y qué quedó fuera y por qué. `repo_url` = el commit. Si la rama no está
     pusheada, avisa de que el enlace vive tras el push.
   - `report_verification(status ok|fallo|parcial, detail, url)` — la EVIDENCIA con números
     (tests, e2e, build). `parcial` cuando falta la prueba de fuego humana: dilo tal cual.
   - `transition_task` → la columna de revisión.
4. **`done` lo decide el humano.** Nunca muevas una tarjeta a `done` por tu cuenta.
5. **Historias y épicas** — al mover las hijas, deja el estado del conjunto en la madre. Una
   historia solo pasa a revisión con TODOS sus criterios cubiertos; si uno queda pendiente, se
   dice en el avance y se queda en `in_progress`.
6. **Hallazgos colaterales** (bugs, deudas) — tarjeta nueva con `create_task`, con el
   cómo-reproducir en la descripción. No se arreglan en silencio ni se pierden.

## 3. Cada dato en su flujo (no aplanar en markdown)

Es el error más repetido: volcarlo todo en la descripción. El markdown lleva **el qué**; el
resto va por su tool, que es lo que hace el dato consultable:

| Dato | Tool |
|---|---|
| Depende de / bloquea | `link_tasks` |
| Commit, PR, repo | `link_repo` |
| Decisión tomada | `record_decision` |
| Criterio de aceptación | `propose_criterion` |
| Caso de prueba / veredicto | `add_test_case` · `mark_test_case` |
| Épica → historia → subtarea | `set_task_hierarchy` |
| Estimación, fechas, detalles | `set_task_details` |
| Etiquetas | `set_task_labels` |
| Está bloqueada | `flag_blocker` |
| Nota o acta relacionada | `link_note_to_task` |

`meta` es solo para contexto efímero.

## 4. Reglas duras

- **Declara `agent_model`** al comentar, reportar avance, bloqueo o verificación, si conoces el
  modelo con el que trabajas. Es la trazabilidad de identidad IA: los aportes del MCP ya quedan
  con procedencia `ia` automáticamente, así que **no firmes ni dupliques** la autoría.
- **No auto-apruebes lo tuyo.** `review_criterion`, `review_decision` y
  `review_task_proposal` son del humano. Tú propones.
- **Antes de borrar**, el MCP pregunta de verdad (elicitation). No fuerces borrados de tarjetas,
  columnas o notas ajenas.
- **El WAF de producción** devuelve 403 «Blocked» si un texto contiene patrones tipo comando
  (p. ej. `python -m ...`): reescríbelo sin el patrón. Las rutas `/api/...` sí pasan.
- Tras un cambio en las tools del MCP hay que **reiniciar el cliente** para verlas.
