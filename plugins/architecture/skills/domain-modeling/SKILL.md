---
name: domain-modeling
description: Modelar el dominio en Collie — entidades que protegen sus invariantes en el constructor, value objects inmutables que eliminan la obsesión por tipos primitivos, agregados con una raíz y un límite transaccional claro, servicios de dominio para lo que no cabe en una entidad, eventos de dominio, y excepciones de negocio. Cargar al crear una entidad o un value object, al decidir dónde poner una validación o una regla, al ver parámetros `str`/`dict` sueltos, al diseñar el límite de un agregado, o al dudar de si algo es dominio.
---

# Skill: domain-modeling

Cómo se escribe el interior del hexágono. Es la capa que `clean-architecture` protege; aquí está
lo que va dentro.

> **La prueba de que un dominio está bien modelado:** se puede leer sin saber qué base de datos
> hay detrás, y **es imposible construir un objeto en estado inválido**.

## 1. Value objects: el mayor retorno por el esfuerzo

Un value object no tiene identidad, es inmutable y se compara por valor. Es la herramienta más
infravalorada del dominio y la que más errores elimina.

### El problema que resuelve

```python
# ✗ obsesión por primitivos: todo es str y todo encaja en todo
def transfer(from_account: str, to_account: str, amount: float, currency: str) -> None: ...

transfer(to_account, from_account, 100.0, "USD")   # argumentos invertidos, nadie se entera
```

Cuatro problemas: los argumentos se pueden intercambiar sin error, la validación se repite en cada
llamada, `float` para dinero es un bug de redondeo esperando, y el tipo no dice nada.

### El arreglo

```python
# domain/value_objects/money.py
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Money:
    amount: Decimal
    currency: Currency

    def __post_init__(self) -> None:
        if self.amount.as_tuple().exponent < -self.currency.decimals:
            raise InvalidMoney("amount has more decimals than the currency allows")

    def __add__(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise CurrencyMismatch(self.currency, other.currency)
        return Money(self.amount + other.amount, self.currency)
```

```python
def transfer(source: AccountId, target: AccountId, amount: Money) -> None: ...
```

Ahora los argumentos no se pueden invertir —el type checker lo impide—, sumar dólares con euros
revienta en el sitio correcto, y la validación existe **una sola vez**.

### Cómo se escriben

- **`@dataclass(frozen=True, slots=True)`.** Inmutable e imposible de mutar por accidente.
- **La validación va en `__post_init__`.** Si el objeto existe, es válido. Siempre.
- **Sin identidad**: dos `Money(100, USD)` son el mismo valor, y eso es correcto.
- **Las operaciones devuelven objetos nuevos**, nunca mutan.
- **Métodos de creación con intención** cuando hay varias formas: `Money.zero(USD)`,
  `Money.from_cents(1000, USD)`.

### Candidatos que casi siempre merecen value object

`Email`, `Money`, `Quantity`, `DateRange`, `Percentage`, `PhoneNumber`, `TaxId`, `Address`,
`Sku`, y **todos los identificadores**: `OrderId`, `CustomerId`. Un `OrderId` que es `str` se
puede pasar donde se espera un `CustomerId`; uno tipado, no.

## 2. Entidades: identidad e invariantes

Una entidad tiene identidad que persiste aunque cambien sus atributos, y **protege sus reglas**.

```python
# domain/entities/order.py
class Order:
    def __init__(self, id: OrderId, customer_id: CustomerId, lines: list[OrderLine]) -> None:
        if not lines:
            raise EmptyOrder()
        self._id = id
        self._customer_id = customer_id
        self._lines = list(lines)
        self._status = OrderStatus.DRAFT

    @property
    def id(self) -> OrderId:
        return self._id

    def total(self) -> Money:
        return sum((line.subtotal() for line in self._lines), Money.zero(self.currency))

    def confirm(self, approved_by: UserId | None = None) -> None:
        if self._status is not OrderStatus.DRAFT:
            raise OrderAlreadyConfirmed(self._id)
        if self.total() > APPROVAL_THRESHOLD and approved_by is None:
            raise ApprovalRequired(self._id, self.total())
        self._status = OrderStatus.CONFIRMED
```

Las cuatro propiedades que la hacen entidad:

1. **Imposible de construir inválida.** Un pedido sin líneas no llega a existir.
2. **Estado privado**, expuesto por propiedades de sólo lectura. Sin setters públicos.
3. **Métodos con nombre de negocio** (`confirm`, `cancel`, `add_line`), no `set_status`. El nombre
   dice **qué** ocurre; el cuerpo protege **cuándo** se permite.
4. **Igualdad por identidad**: dos `Order` son el mismo si comparten `id`, aunque difieran en todo
   lo demás.

### Anti-patrón: la entidad anémica

```python
# ✗ esto es un registro, no una entidad
@dataclass
class Order:
    id: str
    status: str
    total: float
```

Con setters públicos y sin reglas, cualquiera puede poner `status = "confirmed"` saltándose la
aprobación. La lógica acaba dispersa en servicios, repetida, y cada copia se actualiza por
separado hasta que una se olvida. **Si una clase del dominio sólo tiene datos, la regla que
debería protegerlos está en otro sitio — y ahí está el bug.**

## 3. Agregados: el límite de consistencia

Un agregado es un grupo de entidades y value objects que **cambian juntos** y deben ser
consistentes en todo momento. Tiene una **raíz**, y es lo único que el exterior toca.

```
Order (raíz)
├── OrderLine  ─┐
├── OrderLine   │  sólo existen dentro del pedido
└── Address     ┘
```

### Las cuatro reglas

1. **Se accede sólo por la raíz.** Nadie obtiene un `OrderLine` suelto; se pide el `Order` y él
   gestiona sus líneas.
2. **Un repositorio por agregado**, no por tabla. `OrderRepository` guarda el pedido con sus
   líneas, en una operación.
3. **Una transacción modifica un solo agregado.** Si dos deben cambiar a la vez, o el límite está
   mal trazado, o hace falta consistencia eventual por eventos.
4. **Entre agregados se referencia por id, nunca por objeto.** Un `Order` guarda `CustomerId`, no
   un `Customer`. Si no, cargar un pedido arrastra medio sistema.

### Cómo se traza el límite

La pregunta correcta: **¿qué debe ser verdad en el mismo instante?** Si una regla dice "el total
del pedido es la suma de sus líneas", pedido y líneas son un agregado. Si dice "el cliente tiene
un límite de crédito", eso se verifica en un caso de uso que consulta ambos, no metiendo el
cliente dentro del pedido.

**En la duda, agregados pequeños.** Uno grande genera bloqueos, cargas pesadas y conflictos de
escritura; uno pequeño de más se corrige con un caso de uso que coordina.

## 4. Servicios de dominio

Para lógica de negocio que **no pertenece naturalmente a ninguna entidad**, típicamente porque
involucra varias.

```python
# domain/services/pricing_service.py
class PricingService:
    def price_for(self, order: Order, customer: Customer, tariff: Tariff) -> Money: ...
```

- **Sin estado.** Reciben todo por parámetro.
- **En el dominio**, sin acceso a infraestructura: reciben objetos ya cargados, no repositorios.
- **Son la excepción, no la norma.** Antes de crear uno, pregunta si la lógica cabe en una
  entidad o en un value object. Un dominio lleno de servicios y con entidades vacías es un dominio
  anémico con otro nombre.

**No confundir con el caso de uso.** El servicio de dominio calcula una regla; el caso de uso de
`application/` orquesta: carga, llama, guarda, publica.

## 5. Eventos de dominio

Un hecho que ya ocurrió, en **pasado**, inmutable.

```python
# domain/events/order_confirmed.py
@dataclass(frozen=True, slots=True)
class OrderConfirmed:
    order_id: OrderId
    customer_id: CustomerId
    total: Money
    occurred_at: datetime
```

- **Nombre en pasado**: `OrderConfirmed`, no `ConfirmOrder` (eso es un comando).
- **La entidad los acumula; no los publica.** El caso de uso los recoge y los entrega al
  `EventPublisher` tras el commit. Publicar dentro del dominio requeriría infraestructura.
- **Llevan datos, no referencias a objetos vivos.** Ids y value objects.
- Son la vía correcta para que **otro módulo reaccione** sin acoplarse (ver `clean-architecture`
  §3, reglas entre módulos).

## 6. Excepciones de negocio

```python
# domain/exceptions.py
class DomainError(Exception):
    """Base for all business rule violations."""


class OrderNotFound(DomainError):
    def __init__(self, order_id: OrderId) -> None:
        super().__init__(f"Order {order_id} does not exist")
        self.order_id = order_id
```

- **Una base por dominio**, para que `interfaces/` traduzca familias completas a códigos HTTP en
  un solo sitio.
- **Nombre de negocio** (`InsufficientStock`), no técnico (`ValidationError`).
- **Llevan los datos del fallo** como atributos, para que el borde construya una respuesta útil
  sin parsear el mensaje.
- **Nunca `HTTPException` en el dominio.** El dominio no sabe que existe HTTP.

## 7. Qué NO va en el dominio

| Fuera | Dónde va |
|---|---|
| `Column`, `relationship`, `Base` | `infrastructure/persistence/models/` |
| `BaseModel` de Pydantic | `interfaces/http/schemas/` |
| `datetime.now()`, `uuid4()` | Puertos `Clock` e `IdGenerator` |
| Lectura de variables de entorno | `infrastructure/config/` |
| Llamadas HTTP, consultas SQL | Adaptadores |
| Formato de presentación, textos de UI | `interfaces/` |
| Validación de forma de una petición | Schema Pydantic en el borde |

La última merece matiz: **validar que un campo es un email bien formado es del borde; validar que
ese email no está ya registrado es del dominio.** Forma fuera, regla dentro.

## 8. Reglas duras

- **Si un objeto existe, es válido.** La validación vive en el constructor, no en quien lo usa.
- **Sin setters públicos en las entidades.** Métodos con nombre de negocio.
- **Los identificadores son value objects tipados**, nunca `str`.
- **`Decimal` para dinero y cantidades exactas.** `float` jamás.
- **Value objects `frozen=True`.** Las operaciones devuelven objetos nuevos.
- **Se accede al agregado sólo por su raíz**, y una transacción toca un solo agregado.
- **Entre agregados, referencias por id.**
- **El dominio no importa nada de fuera** — ni siquiera bajo `TYPE_CHECKING`.
- **Excepciones de negocio con nombre de negocio**, derivadas de una base común.
- **Una entidad sin comportamiento es una señal de bug**, no un estilo.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La regla de dependencias y las capas | `clean-architecture` |
| SRP, OCP y el resto del diagnóstico | `solid-principles` |
| Puertos, adaptadores y fakes | `hexagonal-ports-adapters` |
| Entidad ↔ modelo ORM ↔ schema Pydantic | `boundary-mapping` |
| Tablas, índices y migraciones | `data-modeling` |
| Probar entidades e invariantes | `unit-testing-domain` |
| Comandos, casos de uso y transacciones | `clean-architecture` §2.2 |
