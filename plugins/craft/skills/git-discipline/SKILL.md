---
name: git-discipline
description: Disciplina de git en Collie — commits atómicos con mensaje convencional que explica el porqué, separar refactor de cambio funcional, nombres de rama, descripción de PR que permite revisar, qué nunca se commitea, y cómo se mantiene un historial que sirva para investigar un bug. Cargar antes de hacer un commit, al preparar un PR, al nombrar una rama, al resolver un conflicto, o al necesitar rastrear cuándo se introdujo un cambio.
---

# Skill: git-discipline

Cómo se usa git aquí. El historial es documentación: es lo único que explica **por qué** el código
es como es cuando quien lo escribió ya no está.

> **La regla:** un commit es una unidad de cambio completa y revertible, y su mensaje explica el
> **porqué**. El qué ya está en el diff.

Además, este repositorio publica versiones a partir de los mensajes de commit, así que el formato
no es cosmético: **determina qué versión se publica**.

## 1. El formato de los mensajes

Commits convencionales, en inglés:

```
<type>(<scope>): <descripción en imperativo, minúscula, sin punto final>

<cuerpo: el porqué, si no es evidente>

<pie: referencias, breaking changes>
```

### Tipos

| Tipo | Para qué | Efecto en la versión |
|---|---|---|
| `feat` | Funcionalidad nueva | minor |
| `fix` | Corrección de un bug | patch |
| `perf` | Mejora de rendimiento | patch |
| `refactor` | Cambio interno sin cambio de comportamiento | patch |
| `docs` | Documentación | — |
| `test` | Tests | — |
| `build` | Dependencias, empaquetado | — |
| `ci` | Pipeline | — |
| `chore` | Mantenimiento sin efecto en el producto | — |

Un cambio incompatible lleva `!` tras el scope y un pie `BREAKING CHANGE:`, y provoca **major**:

```
feat(api)!: return invoice totals as strings instead of numbers

BREAKING CHANGE: `total` and `tax` are now decimal strings. Clients parsing
them as JSON numbers lose precision on values above 2^53.
```

### El scope

El módulo o el área: `feat(billing)`, `fix(orders)`, `ci(release)`. En este repositorio de skills,
el plugin: `feat(architecture)`, `docs(craft)`.

### La descripción

- **Imperativo**: `add`, `fix`, `remove`. No `added`, no `adds`.
- **Minúscula inicial, sin punto final.**
- **Menos de ~72 caracteres.**
- **Dice qué cambia para quien usa el sistema**, no qué archivo tocaste.

```
✗ fix(orders): cambios en el repositorio
✗ fix(orders): update sql_order_repository.py
✓ fix(orders): keep cancelled orders out of the pending list
```

### El cuerpo: el porqué

Se escribe cuando el cambio no es obvio. Es la parte que más valor tiene dentro de seis meses:

```
fix(billing): recalculate tax when the invoice country changes

The country was only read at creation time, so invoices edited after being
issued kept the original rate. Found while reconciling March exports.
```

## 2. Commits atómicos

Un commit = un cambio completo con un solo propósito.

- **Completo**: el repositorio compila y los tests pasan en cada commit. Un commit que rompe el
  build hace inservible `git bisect`.
- **Un solo propósito**: si el mensaje necesita un "y", son dos commits.
- **Del tamaño de lo que se revierte junto.** Esa es la prueba práctica.

### Refactor y cambio funcional, siempre separados

Es la regla que más veces salva una investigación:

```
refactor(billing): extract tax calculation into TaxPolicy
feat(billing): apply reduced rate to food products
```

Mezclados, nadie puede saber si el fallo vino de mover el código o de la regla nueva, y revertir
la funcionalidad se lleva por delante la mejora estructural.

## 3. Ramas

```
<tipo>/<identificador>-<descripción-corta>

feat/COL-482-volume-discount
fix/COL-517-duplicate-index
chore/COL-530-bump-alembic
```

- **Desde `main` actualizado**, y se actualizan a menudo para que el conflicto sea pequeño.
- **Cortas**: una rama de dos semanas es una tarjeta que debió partirse.
- **Nunca se commitea directamente en `main`.**
- Se borran tras el merge.

## 4. La descripción del PR

Lo que permite revisar sin reconstruir el contexto desde cero:

```markdown
## Qué

Añade exportación a CSV de los pedidos filtrados, desde la vista de pedidos.

## Por qué

Finanzas concilia con el ERP copiando ~300 filas a mano cada lunes. COL-482.

## Qué NO entra

Envíos programados, otros formatos, exportar desde otras vistas.

## Cómo probarlo

1. `docker compose up -d && alembic upgrade head`
2. Filtrar pedidos por estado "confirmado"
3. Exportar → CSV con las columnas del criterio 2 de la tarjeta

## Verificación

pytest -q → 312 passed, 2 skipped in 8.41s
lint-imports → Contracts: 4 kept, 0 broken
Ejercitado a mano con 10.000 pedidos: primer byte en 1.4s

## Notas

- El BOM UTF-8 es intencional: el ERP lo exige (comentado en el código).
- **No verificado**: apertura en Excel real. Necesita comprobación humana.
- Deuda encontrada: COL-533 (la consulta de pedidos no tiene índice por fecha).
```

Las secciones que no se omiten: **qué no entra**, **verificación con salida real**, y lo **no
verificado**. Son las que `definition-of-done` y `honest-status` exigen.

## 5. Qué nunca se commitea

| Nunca | Por qué |
|---|---|
| `.env`, credenciales, tokens, claves | Un secreto commiteado está comprometido **aunque se borre después**: queda en el historial |
| `__pycache__`, `.venv`, `node_modules`, `dist` | Ruido que ensucia cada diff |
| `.DS_Store`, archivos del IDE | Ídem |
| Volcados de base de datos, backups | Suelen contener datos reales de personas |
| Archivos grandes binarios | Engordan el clon para siempre |
| Código comentado | Para eso está el historial |

Si un secreto llega a commitearse: **se rota inmediatamente**. Borrarlo con un commit nuevo no
sirve de nada — sigue en el historial y ya fue expuesto.

## 6. Historial limpio antes de abrir el PR

En tu rama, antes de pedir revisión, **sí se reescribe** para que los commits cuenten la historia
real y no el proceso de tanteo:

- `git rebase -i` para juntar los "arreglo el test", "ahora sí", "typo" en el commit al que
  pertenecen.
- Reordenar para que refactor y funcionalidad queden separados.

Y lo que **no** se hace: reescribir historia ya compartida en `main` o en una rama que otro está
usando. Ahí sólo commits nuevos.

Durante la revisión, los cambios pedidos van en **commits nuevos** —así el revisor ve qué cambió
desde su última lectura— y se compactan al final si hace falta.

## 7. El historial como herramienta

Todo lo anterior existe para que esto funcione:

- **`git log --oneline -- <archivo>`** — qué le ha pasado a esto y por qué.
- **`git blame`** — quién y, sobre todo, **con qué motivo**. Inútil si el commit es "cambios".
- **`git bisect`** — encontrar en qué commit se rompió algo. Sólo funciona si cada commit compila.
- **`git revert`** — deshacer un cambio concreto. Sólo funciona si el commit era atómico.

Cuando alguien pregunta "¿por qué esto es así?", la respuesta debería estar en el mensaje del
commit que lo introdujo.

## 8. Reglas duras

- **Commits convencionales en inglés**, con tipo y scope.
- **El mensaje explica el porqué**; el diff ya dice el qué.
- **Un propósito por commit.** Si el mensaje lleva "y", son dos.
- **Cada commit compila y pasa los tests.**
- **Refactor y cambio funcional, en commits separados.**
- **Nunca se commitea en `main` directamente.**
- **`BREAKING CHANGE` se declara** cuando se rompe un contrato público.
- **Cero secretos.** Si entra uno, se rota, no se borra y ya.
- **La descripción del PR lleva qué no entra, la verificación y lo no verificado.**
- **Se limpia el historial de la rama antes del PR**, nunca el historial compartido.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué se reporta al entregar | `definition-of-done` · `honest-status` |
| No mezclar arreglos ajenos en el diff | `scope-discipline` |
| Registrar la deuda que se menciona en el PR | `tech-debt` |
| Cómo se revisa el PR | `code-reviewer` · `engineer-reviewer` |
| Secretos y configuración | `secrets-and-config` |
| Versionado, changelog y publicación | `local-dev-and-ci` |
| Enlazar commit y tarjeta | `foundry-tablero` |
