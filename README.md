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

### Plugin `architecture`

El estándar de arquitectura: limpia, hexagonal y SOLID.

| Skill | Para qué |
|---|---|
| [`clean-architecture`](plugins/architecture/skills/clean-architecture/SKILL.md) | La regla de dependencias, las cuatro capas, la estructura de módulos y el `import-linter` que lo hace cumplir en CI. |
| [`solid-principles`](plugins/architecture/skills/solid-principles/SKILL.md) | Los cinco principios como diagnóstico, con el olfato para cada violación en Python y su arreglo. |
| [`hexagonal-ports-adapters`](plugins/architecture/skills/hexagonal-ports-adapters/SKILL.md) | Puertos driving y driven, `Protocol` sobre `ABC`, el catálogo de puertos habituales y los fakes. |
| [`domain-modeling`](plugins/architecture/skills/domain-modeling/SKILL.md) | Entidades con invariantes, value objects, agregados, eventos y excepciones de negocio. |
| [`boundary-mapping`](plugins/architecture/skills/boundary-mapping/SKILL.md) | Schema Pydantic, entidad y modelo ORM: por qué son tres y cómo se traducen. |
| [`dependency-injection`](plugins/architecture/skills/dependency-injection/SKILL.md) | Composition root, `Depends` sólo en el borde, ciclos de vida y sustitución en tests. |
| [`architecture-hybrid`](plugins/architecture/skills/architecture-hybrid/SKILL.md) | Los tres niveles de arquitectura y cuál merece cada módulo. Contra la ceremonia. |
| [`project-structure`](plugins/architecture/skills/project-structure/SKILL.md) | El árbol completo, convenciones de nombres y los contratos del linter. |

### Plugin `craft`

El oficio: las puertas del trabajo, cómo se escribe y se revisa, y cómo se reporta.

| Skill | Para qué |
|---|---|
| [`definition-of-ready`](plugins/craft/skills/definition-of-ready/SKILL.md) | La puerta de entrada: nada se empieza sin problema, alcance y criterios. |
| [`definition-of-done`](plugins/craft/skills/definition-of-done/SKILL.md) | La puerta de salida: nada entra en revisión sin evidencia. |
| [`spec-driven-development`](plugins/craft/skills/spec-driven-development/SKILL.md) | La especificación como fuente de verdad, antes del código. |
| [`bdd-behavior`](plugins/craft/skills/bdd-behavior/SKILL.md) | Escenarios Gherkin desde el usuario, no desde la interfaz. |
| [`acceptance-criteria`](plugins/craft/skills/acceptance-criteria/SKILL.md) | Criterios que se responden con sí o no observando el sistema. |
| [`technical-design`](plugins/craft/skills/technical-design/SKILL.md) | Cuándo una decisión merece un ADR, y cómo se escribe. |
| [`code-generator`](plugins/craft/skills/code-generator/SKILL.md) | Cómo se escribe código nuevo: leer primero, nombrar bien, el error antes que el camino feliz. |
| [`code-reviewer`](plugins/craft/skills/code-reviewer/SKILL.md) | Revisión de corrección, con escenario de fallo concreto por hallazgo. |
| [`engineer-reviewer`](plugins/craft/skills/engineer-reviewer/SKILL.md) | Revisión de altitud: ¿resuelve el problema correcto, al nivel correcto? |
| [`comment-discipline`](plugins/craft/skills/comment-discipline/SKILL.md) | Comentarios mínimos: sólo el porqué, y bien escritos. |
| [`tech-debt`](plugins/craft/skills/tech-debt/SKILL.md) | Registrar la deuda en vez de arreglarla en silencio o dejar un TODO. |
| [`git-discipline`](plugins/craft/skills/git-discipline/SKILL.md) | Commits convencionales, atómicos, y descripción de PR que permite revisar. |
| [`honest-status`](plugins/craft/skills/honest-status/SKILL.md) | No declarar hecho lo no verificado. La skill de la que dependen las demás. |
| [`scope-discipline`](plugins/craft/skills/scope-discipline/SKILL.md) | Entregar lo que la tarjeta pide, ni más ni menos. |
| [`ask-well`](plugins/craft/skills/ask-well/SKILL.md) | Cuándo preguntar, cuándo declarar un supuesto y seguir. |

### Plugin `testing`

| Skill | Para qué |
|---|---|
| [`test-strategy`](plugins/testing/skills/test-strategy/SKILL.md) | Qué nivel merece cada prueba, y la pirámide que el hexágono hace posible. |
| [`unit-testing-domain`](plugins/testing/skills/unit-testing-domain/SKILL.md) | Entidades y casos de uso con fakes escritos a mano, sin infraestructura. |
| [`integration-testing`](plugins/testing/skills/integration-testing/SKILL.md) | Adaptadores contra Postgres real con testcontainers, no SQLite. |
| [`contract-testing`](plugins/testing/skills/contract-testing/SKILL.md) | Que fake y real cumplan lo mismo; y que el front y el back no diverjan. |
| [`e2e-playwright`](plugins/testing/skills/e2e-playwright/SKILL.md) | Locators por rol, cero `sleep`, aislamiento y diagnóstico. |
| [`e2e-scope`](plugins/testing/skills/e2e-scope/SKILL.md) | Qué merece navegador y qué no. El filtro de tres preguntas. |
| [`bdd-automation`](plugins/testing/skills/bdd-automation/SKILL.md) | Ejecutar los escenarios contra los casos de uso, no contra la interfaz. |
| [`test-quality`](plugins/testing/skills/test-quality/SKILL.md) | Tests que no prueban nada, flaky y sus cuatro causas. |
| [`test-data`](plugins/testing/skills/test-data/SKILL.md) | Builders con defectos sensatos; sólo lo relevante visible. |
| [`verify-for-real`](plugins/testing/skills/verify-for-real/SKILL.md) | Ejecutar antes de afirmar, y pegar la salida con números. |
| [`coverage-and-risk`](plugins/testing/skills/coverage-and-risk/SKILL.md) | Priorizar por riesgo; la cobertura como síntoma, nunca como meta. |

### Plugin `security`

| Skill | Para qué |
|---|---|
| [`security-diff-review`](plugins/security/skills/security-diff-review/SKILL.md) | La pasada de seguridad al cambio, empezando por autorización a nivel de objeto. |
| [`secrets-and-config`](plugins/security/skills/secrets-and-config/SKILL.md) | Settings tipadas en un único punto, `.env` fuera de git, rotación al exponerse. |
| [`authn-authz`](plugins/security/skills/authn-authz/SKILL.md) | Authn en el borde, authz en el caso de uso. Tokens, roles y contraseñas. |
| [`sensitive-data`](plugins/security/skills/sensitive-data/SKILL.md) | Datos personales: minimizar, no loguear, cifrar, retener y borrar. |
| [`dependency-hygiene`](plugins/security/skills/dependency-hygiene/SKILL.md) | Antes de instalar, lockfiles, auditoría y cadena de suministro. |

### Plugin `stack`

FastAPI y SQLAlchemy en el backend; Astro con islas React en el frontend.

| Skill | Para qué |
|---|---|
| [`api-contracts`](plugins/stack/skills/api-contracts/SKILL.md) | Recursos, códigos, forma única del error, paginación, idempotencia y versionado. |
| [`data-modeling`](plugins/stack/skills/data-modeling/SKILL.md) | Modelos, restricciones en la base, índices, N+1, migraciones reversibles. |
| [`async-discipline`](plugins/stack/skills/async-discipline/SKILL.md) | `def` frente a `async def`, y no bloquear el event loop. |
| [`frontend-architecture`](plugins/stack/skills/frontend-architecture/SKILL.md) | Qué es isla y qué es estático, `client:*`, estado y cliente de API tipado. |
| [`frontend-quality`](plugins/stack/skills/frontend-quality/SKILL.md) | Accesibilidad, Core Web Vitals y los cuatro estados de toda vista. |
| [`error-handling`](plugins/stack/skills/error-handling/SKILL.md) | Nunca tragar, timeouts, reintentos con backoff, qué ve el usuario. |
| [`observability`](plugins/stack/skills/observability/SKILL.md) | Logs estructurados, `request_id`, métricas por percentiles, alertas útiles. |
| [`performance`](plugins/stack/skills/performance/SKILL.md) | Medir antes de optimizar; la base de datos y la red, no Python. |
| [`local-dev-and-ci`](plugins/stack/skills/local-dev-and-ci/SKILL.md) | Que arranque en una máquina nueva, y el pipeline que verifica. |

> Los nombres de las skills y todo lo que llega al entregable —carpetas, clases, funciones,
> docstrings— van **en inglés**. La prosa de las skills, en español.

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
