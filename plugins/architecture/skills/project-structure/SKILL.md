---
name: project-structure
description: La estructura física del repositorio en Collie — el árbol completo de un backend FastAPI, dónde va cada tipo de archivo, convenciones de nombres de carpetas, archivos y símbolos, la organización espejo de los tests, los contratos de `import-linter` que hacen cumplir la arquitectura en CI, y los archivos de raíz esperados. Cargar al crear un repositorio o un módulo, al añadir un archivo y dudar del nombre o la ubicación, al configurar el linter de importaciones, al revisar un PR que añade carpetas, o al notar que el árbol no se parece al estándar.
---

# Skill: project-structure

Dónde va cada archivo y cómo se llama. `clean-architecture` define las capas; esta skill las
convierte en **carpetas concretas y reglas verificables**.

> **La idea:** el árbol de carpetas debe hacer **visible** la arquitectura. Alguien que abre el
> repositorio por primera vez tiene que poder deducir la regla de dependencias mirando los
> directorios.

## 1. El árbol completo

```
<repo>/
├── src/
│   ├── main.py                        crea la app, registra módulos y handlers
│   ├── modules/
│   │   ├── __init__.py
│   │   └── <module_name>/
│   │       ├── __init__.py
│   │       ├── README.md              qué hace y su nivel de arquitectura
│   │       ├── domain/
│   │       │   ├── entities/
│   │       │   ├── value_objects/
│   │       │   ├── ports/
│   │       │   ├── services/
│   │       │   ├── events/
│   │       │   └── exceptions.py
│   │       ├── application/
│   │       │   ├── use_cases/
│   │       │   ├── dto/
│   │       │   ├── ports/
│   │       │   └── exceptions.py
│   │       ├── infrastructure/
│   │       │   ├── persistence/
│   │       │   │   ├── models/
│   │       │   │   ├── repositories/
│   │       │   │   └── mappers/
│   │       │   ├── clients/
│   │       │   └── config.py
│   │       └── interfaces/
│   │           └── http/
│   │               ├── routers/
│   │               ├── schemas/
│   │               ├── dependencies.py
│   │               └── error_handlers.py
│   └── shared/
│       ├── domain/                    VOs y tipos comunes a varios módulos
│       ├── application/
│       │   └── ports/                 UnitOfWork, Clock, IdGenerator
│       └── infrastructure/
│           ├── settings.py            el ÚNICO sitio que lee el entorno
│           ├── database.py            engine y session factory
│           ├── logging.py
│           └── middleware/
├── tests/
│   ├── unit/                          espejo de src/modules/*/domain y application
│   ├── integration/                   adaptadores contra infraestructura real
│   ├── e2e/                           recorridos completos
│   ├── contract/                      fake y real contra la misma batería
│   ├── fakes/                         fakes en memoria de los puertos
│   └── conftest.py
├── migrations/                        Alembic
│   ├── versions/
│   └── env.py
├── scripts/                           utilidades operativas, no de negocio
├── docs/
│   └── decisions/                     ADRs numerados
├── .importlinter                      los contratos de arquitectura
├── pyproject.toml                     dependencias y config de herramientas
├── docker-compose.yml
├── Dockerfile
├── .env.example                       todas las variables, sin valores reales
├── CLAUDE.md
└── README.md
```

### Por qué `src/`

El layout `src/` obliga a instalar el paquete para importarlo, lo que impide que los tests pasen
por accidente importando desde el directorio actual con un entorno mal configurado. Si funciona en
tests, funciona instalado.

## 2. Convenciones de nombres

**Todo en inglés**, sin excepción: carpetas, archivos, clases, funciones, variables, docstrings,
mensajes de error y nombres de tablas.

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpeta de módulo | `snake_case`, contexto de negocio | `billing`, `logistics` |
| Carpeta de capa | fija, del estándar | `domain`, `application` |
| Archivo | `snake_case`, singular | `place_order.py`, `money.py` |
| Clase | `PascalCase` | `PlaceOrder`, `OrderRepository` |
| Función y variable | `snake_case` | `total_amount`, `find_by_sku` |
| Constante | `UPPER_SNAKE_CASE` | `APPROVAL_THRESHOLD` |
| Privado | prefijo `_` | `_session`, `_to_entity` |
| Test | `test_<qué>_<cuándo>` | `test_confirm_fails_without_approval` |

### Nombres de archivo por tipo

| Tipo | Patrón | Ejemplo |
|---|---|---|
| Entidad | `<entity>.py` | `order.py` |
| Value object | `<concept>.py` | `money.py`, `order_id.py` |
| Puerto | `<concept>_<role>.py` | `order_repository.py`, `payment_gateway.py` |
| Caso de uso | `<verb>_<noun>.py` | `place_order.py`, `cancel_shipment.py` |
| Adaptador | `<tech>_<port>.py` | `sql_order_repository.py`, `smtp_notifier.py` |
| Modelo ORM | `<entity>_model.py` | `order_model.py` |
| Mapper | `<entity>_mapper.py` | `order_mapper.py` |
| Router | `<resource>_router.py` | `order_router.py` |
| Schema | `<resource>_schemas.py` | `order_schemas.py` |

**Un caso de uso por archivo**, y el nombre del archivo es el nombre de la operación. El adaptador
lleva su tecnología en el nombre porque **es** un detalle de tecnología; el puerto nunca.

### Nombres prohibidos

`utils.py`, `helpers.py`, `common.py`, `misc.py`, `manager.py`, `base.py` suelto. Son cajones
donde se acumula lo que nadie quiso ubicar, y crecen hasta que nadie los entiende. **Todo archivo
declara qué contiene.** Si de verdad es una función de apoyo, se nombra por lo que hace:
`date_ranges.py`, `slugify.py`.

## 3. Los tests son espejo

```
src/modules/billing/domain/entities/invoice.py
tests/unit/billing/domain/entities/test_invoice.py

src/modules/billing/application/use_cases/issue_invoice.py
tests/unit/billing/application/use_cases/test_issue_invoice.py

src/modules/billing/infrastructure/persistence/repositories/sql_invoice_repository.py
tests/integration/billing/persistence/test_sql_invoice_repository.py
```

Dado un archivo, su test se encuentra sin buscar. Y al revés, más importante: **un archivo sin
test correspondiente se ve de un vistazo.**

Los tests de dominio y aplicación van en `unit/` porque no tocan infraestructura; los de
adaptadores en `integration/` porque sí.

## 4. Los contratos de `import-linter`

La arquitectura que no se verifica, no existe. Cuatro contratos:

```ini
# .importlinter
[importlinter]
root_package = src
include_external_packages = True

[importlinter:contract:domain-is-pure]
name = El dominio no conoce frameworks ni librerías de infraestructura
type = forbidden
source_modules =
    src.modules.*.domain
    src.shared.domain
forbidden_modules =
    sqlalchemy
    fastapi
    pydantic
    httpx
    redis
    boto3
    alembic

[importlinter:contract:application-is-framework-free]
name = La aplicación no conoce el transporte ni el ORM
type = forbidden
source_modules =
    src.modules.*.application
forbidden_modules =
    sqlalchemy
    fastapi
    httpx

[importlinter:contract:layers-billing]
name = Las dependencias de billing apuntan hacia dentro
type = layers
layers =
    interfaces
    infrastructure
    application
    domain
container = src.modules.billing

[importlinter:contract:modules-are-independent]
name = Los módulos no se importan entre sí
type = independence
modules =
    src.modules.billing
    src.modules.logistics
    src.modules.identity
```

Notas que importan:

- **Un contrato `layers` por módulo.** `import-linter` no acepta comodines en `container`, así que
  cada módulo nuevo añade su bloque **en el mismo PR que lo crea**. Es la línea que impide que el
  estándar se erosione.
- **`application` prohíbe `sqlalchemy` y `fastapi` pero permite `pydantic`** sólo si de verdad lo
  usáis para DTOs; el estándar de `boundary-mapping` es `dataclass`, así que lo normal es
  prohibirlo también.
- `include_external_packages = True` es necesario para que los contratos `forbidden` vean las
  librerías de terceros.

Se ejecuta con `lint-imports`, **falla el build**, y va en el mismo paso de CI que `ruff` y
`mypy`.

## 5. Archivos de raíz esperados

| Archivo | Para qué |
|---|---|
| `pyproject.toml` | Dependencias y configuración de `ruff`, `mypy`, `pytest`. Sin `setup.py` ni `requirements.txt` sueltos. |
| `.importlinter` | Los contratos de arquitectura. |
| `.env.example` | **Todas** las variables con valores de ejemplo. Es la documentación real de la configuración. |
| `docker-compose.yml` | Levantar dependencias locales (base de datos, cola) con un comando. |
| `README.md` | Qué es, cómo se arranca en una máquina nueva, cómo se corren los tests. |
| `CLAUDE.md` | Instrucciones para agentes: comandos, convenciones, qué no tocar. |
| `docs/decisions/` | ADRs numerados: `0001-use-hexagonal-architecture.md`. |

**`.env` nunca se commitea**, y `.env.example` se actualiza en el mismo PR que añade una variable.

## 6. El `README.md` de cada módulo

Cuatro líneas, no un documento:

```markdown
# billing

Issues invoices and credit notes, and keeps them consistent with tax rules per country.

**Architecture level:** 3 (full hexagon)
**Owner:** finance squad
**Depends on:** identity (via `CustomerLookup` port)
```

El nivel viene de `architecture-hybrid`; las dependencias declaradas aquí deben coincidir con lo
que permite el contrato `independence` del linter.

## 7. Errores de estructura frecuentes

| Error | Por qué duele |
|---|---|
| Carpetas por tipo técnico en la raíz (`routers/`, `models/`, `services/`) | Un cambio de negocio toca cinco carpetas lejanas; nada se puede extraer |
| `utils.py` | Cajón de sastre que crece sin dueño |
| Un módulo por tabla | Los módulos son contextos de negocio, no tablas |
| `shared/` creciendo sin freno | Casi siempre es un módulo que nadie quiso nombrar |
| Tests en una estructura distinta a `src/` | No se ve qué falta por probar |
| Archivos de más de ~400 líneas | Suele ser SRP roto (ver `solid-principles`) |
| `__init__.py` con re-exports masivos | Esconde de dónde viene cada cosa y crea ciclos |
| Scripts de negocio en `scripts/` | Si tiene reglas de negocio, es un caso de uso |

Sobre el último: `scripts/` es para operación (sembrar datos locales, una migración puntual). Un
script que calcula facturación es un caso de uso al que le falta su punto de entrada.

## 8. Reglas duras

- **Layout `src/`**, siempre.
- **Módulos por contexto de negocio**, nunca por tipo técnico ni por tabla.
- **Los nombres de carpeta de capa son fijos**: `domain`, `application`, `infrastructure`,
  `interfaces`. No se inventan sinónimos.
- **Todo en inglés**: carpetas, archivos, símbolos, docstrings, mensajes.
- **Prohibidos `utils.py`, `helpers.py`, `common.py`, `misc.py`.**
- **`tests/` es espejo exacto de `src/`.**
- **Cada módulo nuevo añade su contrato `layers` y entra en `independence`** en el mismo PR.
- **`lint-imports` corre en CI y rompe el build.**
- **`.env.example` se actualiza en el mismo PR que añade una variable**; `.env` nunca se sube.
- **Cada módulo tiene `README.md` con su nivel de arquitectura.**
- **Un caso de uso por archivo.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La regla de dependencias y las capas | `clean-architecture` |
| Cuánta estructura merece cada módulo | `architecture-hybrid` |
| Qué va exactamente en `domain/` | `domain-modeling` |
| Puertos y adaptadores | `hexagonal-ports-adapters` |
| El cableado y el composition root | `dependency-injection` |
| `ruff`, `mypy`, CI, Docker | `local-dev-and-ci` |
| Organización y nombres de tests | `test-strategy` |
| `settings.py` y variables de entorno | `secrets-and-config` |
| ADRs y registro de decisiones | `technical-design` |
