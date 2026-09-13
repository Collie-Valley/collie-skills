---
name: dependency-injection
description: Cómo se cablea la aplicación en Collie — composition root único, inyección por constructor, `Depends` de FastAPI usado sólo como adaptador de entrada, ciclos de vida (singleton por proceso vs. por petición), la sesión de base de datos y el Unit of Work, sustitución de adaptadores en tests con `dependency_overrides`, y por qué no hace falta un framework de DI. Cargar al montar la app o un módulo nuevo, al añadir una dependencia a un caso de uso, al escribir `Depends`, al necesitar sustituir un adaptador en tests, o al ver imports de infraestructura dentro de un router.
---

# Skill: dependency-injection

Cómo se conecta todo. `hexagonal-ports-adapters` define los puertos; esta skill define **quién los
construye y dónde**.

> **La regla:** las dependencias se construyen en **un solo sitio del borde** —el composition
> root— y se inyectan por constructor. Ninguna clase de negocio construye lo que usa, ni sabe de
> dónde viene.

## 1. El composition root

Es el único lugar que conoce todas las piezas concretas. Vive en el borde y nada del interior lo
importa.

```
src/
├── main.py                          crea la app, registra módulos y handlers
├── shared/infrastructure/
│   ├── settings.py                  lee el entorno (el ÚNICO sitio que lo hace)
│   └── database.py                  engine y session factory
└── modules/<module>/interfaces/http/
    ├── dependencies.py              el cableado del módulo
    └── routers/
```

El reparto: `main.py` monta la aplicación; cada módulo cablea lo suyo en su propio
`dependencies.py`. Así un módulo se puede extraer sin desenredar un archivo central de 400 líneas.

## 2. Inyección por constructor, siempre

```python
# application/use_cases/place_order.py
class PlaceOrder:
    def __init__(
        self,
        orders: OrderRepository,
        stock: StockReader,
        uow: UnitOfWork,
        clock: Clock,
        ids: IdGenerator,
    ) -> None:
        self._orders = orders
        self._stock = stock
        self._uow = uow
        self._clock = clock
        self._ids = ids
```

- **Tipado por el puerto**, nunca por el adaptador concreto.
- **Todo lo que necesita, explícito en la firma.** El constructor documenta las dependencias
  reales de la clase, y una lista larga es una señal útil de que la clase hace demasiado (SRP).
- **Sin valores por defecto que construyan infraestructura.** `def __init__(self, orders:
  OrderRepository = SqlOrderRepository())` reintroduce el acoplamiento con disfraz.
- **Nada de inyección por atributo o por setter**: permite objetos a medio construir.

## 3. `Depends` de FastAPI: sólo en el borde

`Depends` es un mecanismo de **`interfaces/`**. Se usa para construir el caso de uso, no se propaga
hacia dentro.

```python
# interfaces/http/dependencies.py
from typing import Annotated
from fastapi import Depends
from sqlalchemy.orm import Session

from ....application.use_cases.place_order import PlaceOrder
from ....infrastructure.persistence.repositories.sql_order_repository import SqlOrderRepository
from ....infrastructure.persistence.sql_unit_of_work import SqlUnitOfWork
from .....shared.infrastructure.database import get_session
from .....shared.infrastructure.system_clock import SystemClock
from .....shared.infrastructure.uuid_generator import UuidGenerator

SessionDep = Annotated[Session, Depends(get_session)]


def get_order_repository(session: SessionDep) -> OrderRepository:
    return SqlOrderRepository(session)


def get_place_order(
    orders: Annotated[OrderRepository, Depends(get_order_repository)],
    stock: Annotated[StockReader, Depends(get_stock_reader)],
    session: SessionDep,
) -> PlaceOrder:
    return PlaceOrder(
        orders=orders,
        stock=stock,
        uow=SqlUnitOfWork(session),
        clock=SystemClock(),
        ids=UuidGenerator(),
    )
```

```python
# interfaces/http/routers/order_router.py
@router.post("/orders", response_model=OrderResponse, status_code=201)
def place_order(
    payload: PlaceOrderRequest,
    use_case: Annotated[PlaceOrder, Depends(get_place_order)],
) -> OrderResponse:
    order_id = use_case.execute(_to_command(payload))
    return OrderResponse(id=str(order_id))
```

El router recibe **el caso de uso ya construido**. No ve repositorios, ni sesiones, ni relojes.

### El anti-patrón que esto evita

```python
# ✗ el router cablea infraestructura y se queda con la sesión en la mano
@router.post("/orders")
def place_order(payload: PlaceOrderRequest, db: Session = Depends(get_db)):
    repo = SqlOrderRepository(db)
    use_case = PlaceOrder(repo, ...)
```

Cada router repite el cableado; cambiar una dependencia obliga a tocar todos; y tener `db` a mano
invita a colar una consulta rápida "sólo esta vez".

**Regla mecánica: `Session` no aparece en la firma de ningún router.** Sólo en
`dependencies.py`.

## 4. Ciclos de vida

| Vida | Qué | Cómo |
|---|---|---|
| **Por proceso** (singleton) | Engine, settings, pool HTTP, clientes sin estado | Módulo o `lifespan` |
| **Por petición** | Sesión de BD, Unit of Work, repositorios, casos de uso | `Depends` |
| **Por llamada** | Value objects, comandos | Se construyen y se tiran |

Lo caro de crear y seguro de compartir va por proceso; **todo lo que toca la sesión va por
petición**. Un repositorio singleton que guarda una sesión es una fuga de conexiones y datos entre
peticiones a la vez.

```python
# main.py
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.http = httpx.AsyncClient(timeout=10.0)
    yield
    await app.state.http.aclose()
```

## 5. La sesión y el Unit of Work

```python
# shared/infrastructure/database.py
def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

La dependencia **abre y cierra**; no hace `commit`. Quien decide qué es atómico es el caso de uso,
por el puerto `UnitOfWork`:

```python
# infrastructure/persistence/sql_unit_of_work.py
class SqlUnitOfWork:
    def __init__(self, session: Session) -> None:
        self._session = session

    def __enter__(self) -> "SqlUnitOfWork":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if exc_type is not None:
            self._session.rollback()

    def commit(self) -> None:
        self._session.commit()
```

Con `commit` automático en la dependencia, una petición que falla a medias puede dejar escrituras
parciales confirmadas.

## 6. Sustituir adaptadores en tests

Es la razón práctica de todo lo anterior.

### Test de caso de uso: sin FastAPI

```python
def test_place_order_reserves_stock() -> None:
    use_case = PlaceOrder(
        orders=FakeOrderRepository(),
        stock=FakeStockReader(available=10),
        uow=FakeUnitOfWork(),
        clock=FixedClock(datetime(2026, 1, 1)),
        ids=SequentialIdGenerator(),
    )
    order_id = use_case.execute(command)
```

Sin app, sin base de datos, sin cliente HTTP. Milisegundos, y determinista gracias a `FixedClock` y
`SequentialIdGenerator`.

### Test de endpoint: `dependency_overrides`

```python
@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_place_order] = lambda: PlaceOrder(
        orders=FakeOrderRepository(), ...
    )
    yield TestClient(app)
    app.dependency_overrides.clear()
```

**Siempre con `clear()`** al terminar: `dependency_overrides` es estado global de la app y un
override olvidado contamina los tests siguientes de forma difícil de rastrear.

Sobrescribe **la dependencia de más alto nivel** que sirva (`get_place_order`, no `get_session`):
menos acoplamiento del test a la estructura del cableado.

## 7. Por qué no usamos un framework de DI

En Python, con `Depends` y constructores explícitos, un contenedor (`dependency-injector`,
`punq`, `wired`) añade más de lo que quita:

- El cableado explícito **se lee y se sigue**; un contenedor lo esconde tras registros y strings.
- Los errores de cableado aparecen **al arrancar y con tipos**, no en runtime al resolver.
- No hay que aprender una API extra ni pelear con su integración en FastAPI.

Si `dependencies.py` se vuelve inmanejable, el problema casi siempre es que un módulo hace
demasiado, no que falte un contenedor. La excepción razonable: una app con muchos grafos de
objetos profundos y variantes por entorno — y entonces se decide y **se registra la decisión**.

## 8. El cableado por entorno

La variación entre entornos se resuelve **en el composition root**, no con `if` dentro de la
lógica:

```python
def get_notifier(settings: SettingsDep) -> Notifier:
    if settings.environment == "production":
        return EmailNotifier(settings.smtp_url)
    return ConsoleNotifier()
```

Ninguna clase de negocio pregunta en qué entorno corre. Si lo hace, la decisión está en la capa
equivocada — y además es imposible de probar.

## 9. Reglas duras

- **Un composition root por módulo** (`interfaces/http/dependencies.py`), y `main.py` como raíz de
  la app.
- **Ninguna clase construye sus dependencias.** Las recibe por constructor.
- **Tipar por el puerto**, nunca por el adaptador concreto.
- **`Depends` sólo en `interfaces/`.** No aparece en `application/` ni en `domain/`.
- **`Session` no aparece en la firma de ningún router.**
- **El router recibe el caso de uso ya construido.**
- **La sesión es por petición.** Nada que la guarde puede ser singleton.
- **El `commit` lo decide el caso de uso** por `UnitOfWork`, no la dependencia de sesión.
- **`dependency_overrides` siempre se limpia** al terminar el test.
- **Sólo `infrastructure/config/` lee variables de entorno**, y la variación por entorno se
  resuelve en el cableado.

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La regla de dependencias y las capas | `clean-architecture` |
| DIP: por qué se inyecta | `solid-principles` |
| Puertos, adaptadores y fakes | `hexagonal-ports-adapters` |
| `async def` y dependencias bloqueantes | `async-discipline` |
| Fakes en tests de dominio | `unit-testing-domain` |
| Tests contra base de datos real | `integration-testing` |
| Settings, secretos y entorno | `secrets-and-config` |
