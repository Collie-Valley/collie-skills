---
name: hexagonal-ports-adapters
description: Puertos y adaptadores en Collie — puertos driving (entrada) y driven (salida), quién define cada uno, cómo se escriben en Python con Protocol, el catálogo de puertos que casi siempre hacen falta (repositorio, unit of work, clock, id generator, notifier, event publisher), los fakes en memoria como ciudadanos de primera, y los errores que convierten un puerto en un envoltorio inútil. Cargar al definir o cambiar un puerto, al escribir un adaptador, al integrar un servicio externo, al necesitar sustituir algo en tests, o al dudar de si algo merece un puerto.
---

# Skill: hexagonal-ports-adapters

Cómo se diseñan los puertos y adaptadores en Collie. Es la mecánica de la regla que
`clean-architecture` establece: aquí está el detalle de **cómo** se escriben.

> **La idea, en una línea:** la aplicación es un hexágono cerrado que sólo se comunica por
> **puertos** que él mismo define; el mundo exterior se conecta con **adaptadores** que encajan en
> esos puertos. La aplicación no sabe qué hay al otro lado.

## 1. Los dos lados del hexágono

La distinción que más se pierde, y la que ordena todo lo demás: **quién llama a quién.**

```
        driving (primarios)                    driven (secundarios)
        el mundo llama a la app                la app llama al mundo

   HTTP router    ──┐                                  ┌──  SqlOrderRepository
   CLI command    ──┤──►  [ puerto ]  APLICACIÓN  [ puerto ]  ──┤──  SmtpNotifier
   worker de cola ──┘                                  └──  StripeGateway
                                                       └──  SystemClock
```

| | **Driving / primarios** | **Driven / secundarios** |
|---|---|---|
| Quién inicia | El mundo exterior | La aplicación |
| Qué es el puerto | El caso de uso mismo | Una interfaz que define el dominio |
| Quién lo define | `application/` | `domain/` (o `application/`) |
| Quién lo implementa | La propia aplicación | `infrastructure/` |
| Quién lo llama | `interfaces/` | La aplicación |
| Ejemplo | `PlaceOrder.execute()` | `OrderRepository`, `Notifier` |

**El puerto driving no necesita una interfaz aparte.** Este es el error más común al aplicar
hexagonal por primera vez: crear un `IPlaceOrder` con un solo implementador. El caso de uso ya
**es** el puerto — su método público es el contrato. Una interfaz encima sólo añade un archivo que
mantener.

Los puertos que se escriben de verdad son los **driven**, porque ahí sí hay varias
implementaciones posibles: la real y el fake de test, como mínimo.

## 2. Cómo se escribe un puerto

```python
# domain/ports/order_repository.py
from typing import Protocol
from ..entities.order import Order
from ..value_objects.order_id import OrderId


class OrderRepository(Protocol):
    """Persistence boundary for orders.

    Raises OrderNotFound when the id does not exist.
    """

    def get(self, order_id: OrderId) -> Order: ...
    def save(self, order: Order) -> None: ...
```

Cuatro decisiones deliberadas:

1. **`Protocol`, no `ABC`.** Tipado estructural: el fake lo cumple sin heredar ni importar nada
   del dominio, y no hay registro ni jerarquía que mantener. `ABC` sólo cuando varios adaptadores
   comparten implementación de verdad.
2. **Vive en `domain/ports/`**, con quien lo necesita. Un puerto junto a su implementación no
   invierte nada.
3. **Habla el idioma del dominio**: `OrderId` y `Order`, nunca `str`, `dict`, `Session` o
   `Response`.
4. **El docstring declara el contrato**: qué devuelve si no hay nada, qué excepciones lanza. Es lo
   único que garantiza que fake y real se comporten igual. (Es una de las pocas veces en que la
   prosa en el código se gana su sitio — ver `comment-discipline`.)

### Nombrar por intención, no por tecnología

El nombre del puerto describe **qué necesita el dominio**, no cómo se resuelve:

| ✗ | ✓ |
|---|---|
| `S3Storage` | `DocumentStorage` |
| `SendGridClient` | `Notifier` |
| `RedisCache` | `RateLimiter` |
| `PostgresOrderDao` | `OrderRepository` |

Si el nombre del puerto menciona un proveedor, el dominio ya sabe demasiado.

## 3. Cómo se escribe un adaptador

```python
# infrastructure/persistence/repositories/sql_order_repository.py
from sqlalchemy.orm import Session

from ....domain.entities.order import Order
from ....domain.exceptions import OrderNotFound
from ..mappers.order_mapper import to_entity, to_model
from ..models.order_model import OrderModel


class SqlOrderRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, order_id: OrderId) -> Order:
        row = self._session.get(OrderModel, str(order_id))
        if row is None:
            raise OrderNotFound(order_id)
        return to_entity(row)

    def save(self, order: Order) -> None:
        self._session.merge(to_model(order))
```

- **No hereda del puerto.** `Protocol` es estructural: basta con tener los métodos. Si quieres que
  el type checker lo verifique explícitamente, usa una aserción en el composition root o
  `Protocol` con `@runtime_checkable` sólo si de verdad haces `isinstance`.
- **La conexión entra por el constructor** y se queda dentro. Jamás viaja por los métodos del
  puerto.
- **Traduce a excepciones del dominio.** Un `IntegrityError` de SQLAlchemy no puede escaparse
  hacia arriba: sería la infraestructura filtrándose por la vía de las excepciones.

## 4. El catálogo: los puertos que casi siempre hacen falta

Estos seis cubren la mayoría de necesidades. Viven en `shared/application/ports/` cuando son
transversales.

### 4.1 Repository — persistencia de un agregado

Uno por agregado, **no** uno por tabla. Métodos en idioma del negocio (`find_pending_for_customer`),
no en idioma SQL (`select_where`).

### 4.2 Unit of Work — la frontera transaccional

Quien decide qué es atómico es el caso de uso, no el repositorio ni el router.

```python
# shared/application/ports/unit_of_work.py
class UnitOfWork(Protocol):
    def __enter__(self) -> "UnitOfWork": ...
    def __exit__(self, *exc: object) -> None: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
```

```python
with self._uow:
    self._orders.save(order)
    self._stock.reserve(order.lines)
    self._uow.commit()
```

Si el `with` sale por excepción, se revierte todo. Sin esto, cada repositorio hace `commit` por su
cuenta y las operaciones dejan de ser atómicas.

### 4.3 Clock — el tiempo

```python
class Clock(Protocol):
    def now(self) -> datetime: ...
```

`datetime.now()` dentro del dominio hace que las reglas dependientes de fecha sean imposibles de
probar sin esperar o sin parchear. Con puerto, el test fija la hora y el caso "el pedido vence a
los 30 días" se prueba en un milisegundo.

### 4.4 IdGenerator — la identidad

```python
class IdGenerator(Protocol):
    def next(self) -> OrderId: ...
```

Mismo motivo: `uuid4()` en el dominio hace los tests no deterministas y obliga a aserciones
laxas.

### 4.5 Notifier / EventPublisher — hacia fuera

`Notifier` para avisar a una persona; `EventPublisher` para publicar un hecho del dominio que
otros módulos consumen. Distintos, aunque hoy ambos acaben en la misma cola.

### 4.6 Gateway — un servicio externo de negocio

Pasarela de pago, servicio de aduanas, proveedor de tipo de cambio. El puerto expresa la
**capacidad** (`PaymentGateway.charge`), no la API del proveedor.

## 5. Los fakes son código de primera

Cada puerto driven tiene un fake en memoria, y **se mantiene con el mismo cuidado que el
adaptador real**. No es código de segunda: es lo que hace que los tests del dominio corran en
milisegundos.

```python
# tests/fakes/fake_order_repository.py
class FakeOrderRepository:
    def __init__(self) -> None:
        self._items: dict[OrderId, Order] = {}

    def get(self, order_id: OrderId) -> Order:
        if order_id not in self._items:
            raise OrderNotFound(order_id)
        return self._items[order_id]

    def save(self, order: Order) -> None:
        self._items[order.id] = order
```

- **Escrito a mano, no `Mock`.** Un `Mock` acepta cualquier llamada y no verifica el contrato: el
  test pasa aunque el puerto haya cambiado de firma.
- **Cumple el mismo contrato**, incluidas las excepciones. Un fake más permisivo que el real
  produce tests verdes y producción rota (ver `solid-principles` §3).
- **Se verifica con los mismos tests de contrato** que el adaptador real. Detalle en
  `contract-testing`.

## 6. Errores que vacían el patrón

### 6.1 El puerto que copia la librería

```python
# ✗ el "puerto" es la API de SQLAlchemy con otro nombre
class OrderRepository(Protocol):
    def query(self) -> Query: ...
    def filter_by(self, **kwargs) -> Query: ...
```

Si el puerto expone los conceptos de la librería, cambiar de librería obliga a cambiar el puerto —
y el puerto existía justamente para evitar eso. El puerto expresa **intención de negocio**, no
mecánica de acceso a datos.

### 6.2 El repositorio genérico

```python
# ✗ no expresa nada: ni qué se guarda, ni qué reglas tiene
class Repository(Protocol, Generic[T]):
    def get(self, id: Any) -> T | None: ...
    def save(self, entity: T) -> None: ...
```

Parece elegante y no dice nada. Cada agregado tiene necesidades distintas: unos se buscan por
criterios de negocio, otros se reconstruyen desde eventos. El repositorio genérico obliga a todos
al mínimo común denominador, y acaba con métodos `Any`.

### 6.3 Un puerto para cada cosa

No todo merece puerto. **Merece puerto lo que cruza el borde del proceso** (base de datos, red,
disco, reloj, azar) o **lo que necesitas sustituir en tests**. Una función pura de cálculo no
necesita puerto: es dominio, y se llama directamente.

### 6.4 El adaptador con lógica de negocio

Si un repositorio decide cuándo un pedido es válido, la regla acabó fuera del dominio y sólo se
puede probar levantando base de datos. El adaptador traduce y transporta; no decide.

### 6.5 La excepción de librería que se escapa

Un `IntegrityError`, un `httpx.TimeoutException` o un `KeyError` de un `dict` interno que llegan al
caso de uso son infraestructura filtrándose. El adaptador los captura y los traduce al lenguaje
del dominio.

## 7. Decidir si algo merece puerto

Tres preguntas, en orden:

1. **¿Cruza el borde del proceso?** (red, disco, base de datos, reloj, azar, entorno) → sí, puerto.
2. **¿Necesito sustituirlo en un test para que sea rápido o determinista?** → sí, puerto.
3. **¿Es plausible que cambie el proveedor o la tecnología?** → sí, puerto.

Tres "no" → no es puerto, es código de dominio o una función de apoyo. Escribir el puerto de todas
formas es la ceremonia que hace que el equipo abandone el patrón.

## 8. Reglas duras

- **El caso de uso es el puerto driving.** No se le escribe una interfaz encima.
- **El puerto lo define quien lo usa**, y vive en `domain/ports/` o `application/ports/`.
- **El nombre del puerto no menciona tecnología ni proveedor.**
- **La firma del puerto sólo usa tipos del dominio y de la librería estándar.**
- **La conexión entra por el constructor del adaptador**, nunca por los métodos del puerto.
- **El adaptador traduce toda excepción de librería** a una excepción del dominio.
- **Cada puerto driven tiene un fake en memoria escrito a mano**, no un `Mock`.
- **Fake y adaptador real pasan la misma batería de tests de contrato.**
- **El adaptador no decide reglas de negocio.** Traduce y transporta.
- **Un puerto por agregado**, no por tabla, y sin repositorios genéricos.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La regla de dependencias, capas y estructura | `clean-architecture` |
| DIP, ISP y LSP — el sustento teórico de los puertos | `solid-principles` |
| Entidades, value objects, agregados | `domain-modeling` |
| Traducción entidad ↔ modelo ORM ↔ Pydantic | `boundary-mapping` |
| Cómo se cablea todo en el composition root | `dependency-injection` |
| Hasta dónde llevar el hexágono en cada módulo | `architecture-hybrid` |
| Tests de contrato sobre fake y real | `contract-testing` |
| Probar casos de uso con fakes | `unit-testing-domain` |
