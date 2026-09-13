---
name: local-dev-and-ci
description: Que el proyecto arranque y se verifique en Collie — uv, ruff, mypy y pytest configurados en pyproject.toml, docker compose para las dependencias locales, hooks de pre-commit, el pipeline de CI con sus etapas y su orden, imágenes Docker reproducibles, y el arranque en una máquina nueva en un comando. Cargar al montar un repositorio, al configurar herramientas o CI, al ver un pipeline lento o inestable, al escribir un Dockerfile, o cuando alguien no consigue arrancar el proyecto.
---

# Skill: local-dev-and-ci

Que cualquiera pueda arrancar el proyecto y que la máquina verifique lo que no debe verificar una
persona.

> **La prueba:** alguien clona el repositorio en una máquina limpia y tiene el proyecto corriendo
> con los tests en verde **en menos de diez minutos**, siguiendo sólo el README. Si no, falta
> trabajo aquí.

## 1. Herramientas

| Herramienta | Para qué |
|---|---|
| **uv** | Entorno y dependencias. Mucho más rápido que pip/poetry, con lockfile |
| **ruff** | Linter y formateador. Sustituye a flake8, isort, black y más |
| **mypy** | Tipos, en modo estricto |
| **pytest** | Tests |
| **import-linter** | La arquitectura (ver `clean-architecture` §8) |
| **alembic** | Migraciones |
| **pre-commit** | Lo barato antes del commit |

Todo se configura **en `pyproject.toml`**. Sin `setup.py`, sin `requirements.txt` sueltos, sin
`.flake8` ni `setup.cfg` dispersos: una sola fuente de verdad.

## 2. `pyproject.toml`

```toml
[project]
name = "collie-backend"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115,<0.116",
    "sqlalchemy>=2.0,<2.1",
    "pydantic-settings>=2.6,<3.0",
]

[dependency-groups]
dev = ["pytest", "pytest-cov", "pytest-randomly", "testcontainers[postgres]",
       "ruff", "mypy", "import-linter", "pre-commit"]

[tool.ruff]
line-length = 100
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "S", "ASYNC", "RUF"]
ignore = ["S101"]                       # assert permitido en tests

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["S105", "S106"]

[tool.mypy]
python_version = "3.13"
strict = true
warn_unreachable = true

[[tool.mypy.overrides]]
module = ["testcontainers.*"]
ignore_missing_imports = true

[tool.pytest.ini_options]
addopts = "-q --strict-markers --strict-config"
testpaths = ["tests"]
markers = [
    "slow: tarda más de un segundo",
    "external: necesita un servicio externo real",
    "e2e: requiere navegador",
]
```

Las selecciones que no son obvias: **`S`** son las reglas de seguridad (bandit dentro de ruff);
**`ASYNC`** detecta llamadas bloqueantes dentro de funciones async (ver `async-discipline` §8);
**`--strict-markers`** hace fallar un marcador mal escrito en vez de ignorarlo en silencio.

## 3. Arrancar en local

```bash
# 1. dependencias
uv sync

# 2. configuración
cp .env.example .env

# 3. servicios
docker compose up -d

# 4. esquema
uv run alembic upgrade head

# 5. arrancar
uv run uvicorn src.main:app --reload
```

```yaml
# docker-compose.yml — sólo dependencias, la app corre fuera para tener recarga
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: collie
      POSTGRES_PASSWORD: collie
      POSTGRES_DB: collie
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U collie"]
      interval: 5s
volumes:
  pgdata:
```

**El `healthcheck` importa**: sin él, la aplicación intenta conectar antes de que Postgres acepte
conexiones y falla de forma confusa la primera vez.

Estos cinco pasos van en el README, literalmente, y se prueban de vez en cuando **en una máquina
limpia**. Un README desactualizado es la primera barrera para quien se incorpora.

## 4. Pre-commit: sólo lo barato

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.0
    hooks:
      - id: gitleaks
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: check-merge-conflict
      - id: end-of-file-fixer
      - id: check-added-large-files
```

Segundos, no minutos. **`gitleaks` es el hook más valioso**: impide commitear un secreto, que es el
error más caro de deshacer (ver `secrets-and-config` §5).

**Los tests no van en pre-commit.** Un hook que tarda un minuto se salta con `--no-verify` y deja
de existir. Los tests son responsabilidad de CI y de la persona antes de abrir el PR.

## 5. El pipeline

Etapas en orden de coste, para fallar rápido:

```yaml
jobs:
  static:                          # ~30 s
    steps:
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy src
      - run: uv run lint-imports

  test:                            # ~2 min
    needs: static
    steps:
      - run: uv run pytest -m "not e2e" --cov=src --cov-report=xml

  security:                        # en paralelo con test
    needs: static
    steps:
      - run: uv run pip-audit
      - run: uv run bandit -r src -ll

  contract:
    needs: static
    steps:
      - run: uv run python scripts/export_openapi.py > openapi.json
      - run: git diff --exit-code openapi.json      # ¿cambió sin regenerarse?

  e2e:                             # sólo en main o bajo etiqueta
    needs: [test]
    steps:
      - run: npx playwright test
```

Principios:

- **Lo barato primero.** Un error de formato no debe descubrirse tras cuatro minutos de tests.
- **En paralelo lo independiente.**
- **Caché de dependencias** (`uv`, `npm`, Playwright) — es lo que más tiempo ahorra.
- **E2E no en cada PR** si la suite es lenta: en `main`, antes de desplegar, o bajo etiqueta.
- **CI verde es requisito para fusionar**, sin excepciones.

**Objetivo: menos de cinco minutos** para el camino normal. Un pipeline de veinte minutos hace que
la gente agrupe cambios y trabaje en ramas largas, que es el problema que el pipeline debía evitar.

## 6. Docker

```dockerfile
FROM python:3.13-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.13-slim
RUN useradd --create-home --uid 1000 app
WORKDIR /app
COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --chown=app:app src/ src/
COPY --chown=app:app migrations/ migrations/ alembic.ini ./
USER app
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- **Multi-etapa**: la imagen final no lleva compiladores ni herramientas de build.
- **`--frozen`**: instala exactamente el lockfile. Sin esto, la imagen puede no ser lo que se
  probó.
- **Usuario no root**, siempre.
- **Dependencias antes que el código**: así el caché de capas no se invalida en cada cambio de
  fuente.
- **Cero secretos** en `ARG`, `ENV` o capas: quedan en el historial de la imagen.
- **`.dockerignore`** con `.git`, `.venv`, `tests`, `.env`.

## 7. El `README.md`

Lo mínimo que responde:

1. **Qué es** esto, en dos líneas.
2. **Cómo se arranca**, los comandos exactos copiables.
3. **Cómo se corren los tests.**
4. **Cómo se crea una migración.**
5. **Dónde está la documentación** de arquitectura y decisiones.

Y `CLAUDE.md` para los agentes: comandos, convenciones, qué no tocar, el nivel de arquitectura de
cada módulo.

## 8. Errores frecuentes

| Error | Consecuencia |
|---|---|
| Instrucciones de arranque desactualizadas | Horas perdidas por cada persona nueva |
| Tests en pre-commit | Se salta con `--no-verify` |
| Sin lockfile commiteado | Producción instala algo distinto a lo probado |
| CI que tarda veinte minutos | Ramas largas y cambios agrupados |
| E2E en cada PR con suite lenta | El pipeline se vuelve el cuello de botella |
| Tests que pasan en local y fallan en CI | Dependencia del entorno o del orden |
| Secretos en la imagen Docker | Quedan para siempre |
| `pip install` sin `--frozen` en el build | Versiones distintas a las probadas |
| Contenedor como root | Superficie de ataque innecesaria |

Sobre "pasan en local y fallan en CI": casi siempre es dependencia del orden. `pytest-randomly`
lo detecta en local antes de que CI lo descubra.

## 9. Reglas duras

- **Todo se configura en `pyproject.toml`.**
- **El lockfile se commitea**, y los builds instalan con `--frozen`.
- **`ruff`, `mypy` estricto, `lint-imports` y `pytest` corren en CI** y bloquean la fusión.
- **`gitleaks` en pre-commit y en CI.**
- **Pre-commit sólo lo que tarda segundos.** Los tests, no.
- **El pipeline ordena por coste**: estático, tests, e2e.
- **Objetivo de menos de cinco minutos** en el camino normal.
- **Imagen multi-etapa, usuario no root, sin secretos.**
- **El arranque en una máquina limpia está en el README y se prueba.**
- **CI verde es requisito para fusionar.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Los contratos de `import-linter` | `clean-architecture` · `project-structure` |
| Variables de entorno y secretos | `secrets-and-config` |
| Auditoría de dependencias | `dependency-hygiene` |
| Organización y marcadores de tests | `test-strategy` |
| Contenedores en tests | `integration-testing` |
| Playwright en CI | `e2e-playwright` |
| Commits convencionales y versionado | `git-discipline` |
| Migraciones | `data-modeling` |
