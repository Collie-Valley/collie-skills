---
name: boundary-mapping
description: La costura entre las tres representaciones de un mismo concepto en Collie — schema Pydantic en el borde HTTP, entidad en el dominio, modelo SQLAlchemy en persistencia — con mappers explícitos, por qué no se unifican aunque tienten, dónde vive cada traducción, cómo se traducen las excepciones de dominio a códigos HTTP, y los atajos que acoplan el sistema entero. Cargar al escribir un router o un repositorio, al ver `from_orm`/`model_validate` sobre un modelo ORM, al exponer datos en una API, al traducir errores, o al notar que un cambio de columna obliga a tocar la API.
---

# Skill: boundary-mapping

Un mismo concepto de negocio vive en tres formas a la vez. Esta skill define **cómo se traducen** y
por qué no se colapsan en una sola.

> **La regla:** cada representación pertenece a una capa y **muere en su frontera**. El schema no
> cruza hacia dentro; el modelo ORM no sale hacia fuera; la entidad no viaja por la red.

## 1. Las tres formas, y para qué existe cada una

```
   HTTP                  APLICACIÓN                 BASE DE DATOS
 ┌────────────┐         ┌─────────────┐            ┌─────────────┐
 │  Schema    │  ──►    │   Entity    │    ──►     │  ORM Model  │
 │ (Pydantic) │  ◄──    │  (dominio)  │    ◄──     │(SQLAlchemy) │
 └────────────┘         └─────────────┘            └─────────────┘
   interfaces/            domain/                   infrastructure/
   valida forma          protege reglas             describe columnas
```

| | **Schema Pydantic** | **Entidad** | **Modelo ORM** |
|---|---|---|---|
| Vive en | `interfaces/http/schemas/` | `domain/entities/` | `infrastructure/persistence/models/` |
| Responde a | El contrato de la API | Las reglas del negocio | El esquema de la base de datos |
| Cambia cuando | Cambia el contrato público | Cambian las reglas | Cambia el almacenamiento |
| Valida | **Forma**: tipos, rangos, formato | **Reglas**: invariantes, estados | Nada; sólo declara |

Las tres cambian por motivos distintos y a ritmos distintos. Esa es la razón de que sean tres.

## 2. Por qué no se unifican (aunque tiente mucho)

Usar una sola clase parece ahorrar trabajo. Lo que cuesta:

- **Un cambio de columna rompe la API.** Renombrar `qty` a `quantity` en la tabla cambia el JSON
  público y rompe a los clientes. Con tres formas, el mapper absorbe el cambio.
- **Se filtran campos sin querer.** Devolver el modelo ORM expone `password_hash`,
  `internal_notes` o `deleted_at` en cuanto alguien añade la columna. **Es la causa más común de
  fuga de datos en una API**, y no aparece en ninguna revisión porque nadie tocó el endpoint.
- **El dominio queda preso del esquema.** Si la entidad es la tabla, las reglas de negocio se
  diseñan alrededor de columnas y no al revés.
- **Las relaciones perezosas explotan al serializar.** Serializar un modelo ORM fuera de la
  sesión lanza `DetachedInstanceError`, o peor: dispara N+1 consultas silenciosas.
- **El dominio no se puede probar sin base de datos.** Si la entidad es un modelo SQLAlchemy,
  instanciarla ya requiere metadata.

El mapper cuesta unas líneas por agregado. Cada uno de esos problemas cuesta mucho más.

## 3. El flujo de entrada

```python
# interfaces/http/schemas/order_schemas.py
class OrderLineRequest(BaseModel):
    sku: str = Field(min_length=1, max_length=32)
    quantity: int = Field(gt=0)


class PlaceOrderRequest(BaseModel):
    customer_id: UUID
    lines: list[OrderLineRequest] = Field(min_length=1)
```

```python
# interfaces/http/routers/order_router.py
@router.post("/orders", response_model=OrderResponse, status_code=201)
def place_order(
    payload: PlaceOrderRequest,
    use_case: Annotated[PlaceOrder, Depends(get_place_order)],
) -> OrderResponse:
    command = PlaceOrderCommand(
        customer_id=CustomerId(payload.customer_id),
        lines=[LineCommand(Sku(l.sku), Quantity(l.quantity)) for l in payload.lines],
    )
    order_id = use_case.execute(command)
    return OrderResponse(id=str(order_id))
```

El schema **muere aquí**. Lo que entra al caso de uso es un comando con tipos del dominio.

### Schema y comando no son lo mismo

| | Schema | Comando |
|---|---|---|
| Capa | `interfaces/` | `application/dto/` |
| Tipo | `BaseModel` de Pydantic | `@dataclass(frozen=True)` |
| Tipos de campo | Primitivos (`str`, `UUID`) | Value objects (`Sku`, `Money`) |
| Motivo de cambio | El contrato HTTP | La operación de negocio |

Se parecen mucho al principio y divergen con el tiempo — un comando acaba recibiendo datos que no
vienen del body (el usuario autenticado, el tenant), y un schema acaba con campos de presentación.

## 4. El flujo de salida

```python
# interfaces/http/schemas/order_schemas.py
class OrderResponse(BaseModel):
    id: str
    status: str
    total: str
    currency: str

    @classmethod
    def from_entity(cls, order: Order) -> "OrderResponse":
        return cls(
            id=str(order.id),
            status=order.status.value,
            total=str(order.total().amount),
            currency=order.total().currency.code,
        )
```

Explícito: se ve exactamente qué se expone. Añadir un campo interno a la entidad **no** lo publica.

Dinero como `str`, no como `float`: JSON no tiene decimales exactos y `0.1 + 0.2` en el cliente
produce el bug clásico. Alternativa válida: enteros en la unidad mínima, documentado en el
contrato.

## 5. El mapper de persistencia

```python
# infrastructure/persistence/mappers/order_mapper.py
def to_entity(model: OrderModel) -> Order:
    return Order.rehydrate(
        id=OrderId(UUID(model.id)),
        customer_id=CustomerId(UUID(model.customer_id)),
        lines=[_line_to_entity(l) for l in model.lines],
        status=OrderStatus(model.status),
    )


def to_model(order: Order) -> OrderModel:
    return OrderModel(
        id=str(order.id),
        customer_id=str(order.customer_id),
        status=order.status.value,
        lines=[_line_to_model(l) for l in order.lines],
    )
```

### `rehydrate` vs. el constructor

Una entidad reconstruida desde la base de datos **ya pasó** por sus validaciones cuando se creó, y
puede estar en estados que el constructor no permite crear desde cero (un pedido ya confirmado).
Por eso hay dos vías:

- **`__init__`** — crear algo nuevo. Aplica todas las reglas de creación.
- **`rehydrate()`** — reconstruir algo existente. Acepta el estado tal cual está almacenado.

Sin esa distinción, o el constructor se relaja hasta no validar nada, o el repositorio no puede
cargar registros históricos que hoy serían inválidos.

## 6. Traducir excepciones a HTTP

El dominio lanza excepciones de negocio; el borde las traduce. **En un solo sitio**, no con
`try/except` repartidos por los routers.

```python
# interfaces/http/error_handlers.py
_STATUS_BY_EXCEPTION: dict[type[DomainError], int] = {
    OrderNotFound: 404,
    ApprovalRequired: 409,
    InsufficientStock: 409,
    EmptyOrder: 422,
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        status = _STATUS_BY_EXCEPTION.get(type(exc), 400)
        return JSONResponse(
            status_code=status,
            content={"error": type(exc).__name__, "detail": str(exc)},
        )
```

El cuerpo del error tiene **una sola forma** en toda la API. Un cliente que sabe leer un error,
sabe leerlos todos.

## 7. Los atajos que acoplan el sistema

### 7.1 `response_model` sobre un modelo ORM

```python
# ✗ el esquema de base de datos se convierte en el contrato público
@router.get("/orders/{id}", response_model=OrderModel)
```

Cada columna nueva aparece en la API sin que nadie lo decida. Incluidas las que no deberían
salir jamás.

### 7.2 `model_validate` directo sobre el ORM

```python
# ✗ traducción implícita: nadie ve qué se expone
class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

return OrderResponse.model_validate(order_model)
```

Cómodo y peligroso: los campos se emparejan por nombre, así que renombrar una columna rompe la
respuesta en silencio, y un campo sensible con el nombre correcto se publica solo. Si se usa —hay
casos de lectura simple donde es razonable— **el schema declara sus campos de forma explícita** y
nunca se construye con `from_attributes` sobre una entidad que tiene secretos.

### 7.3 El schema como parámetro del caso de uso

```python
# ✗ application/ importando de interfaces/: la regla de dependencias, rota
def execute(self, payload: PlaceOrderRequest) -> OrderId:
```

Ahora el caso de uso sólo se puede invocar desde HTTP. Un worker de cola o un comando de CLI
tendría que construir un objeto Pydantic de una petición que no existe.

### 7.4 El modelo ORM dentro del caso de uso

Si un caso de uso recibe o devuelve `OrderModel`, la sesión de SQLAlchemy tiene que seguir abierta
mientras se usa, y la capa de aplicación pasa a depender de la persistencia.

### 7.5 Validación de negocio en el schema

```python
# ✗ una regla de negocio escondida en el borde
@field_validator("discount")
def check_discount(cls, v: Decimal) -> Decimal:
    if v > Decimal("0.30"):
        raise ValueError("Discount cannot exceed 30%")
```

Esa regla deja de aplicarse en cuanto el pedido se crea desde un worker o un script. Las reglas
viven en el dominio; el schema valida **forma**, no política.

## 8. Dónde vive cada traducción

| Traducción | Quién la hace | Dónde vive |
|---|---|---|
| Schema → Comando | El router | `interfaces/http/routers/` |
| Entidad → Response | El schema (`from_entity`) | `interfaces/http/schemas/` |
| Modelo ORM → Entidad | El mapper | `infrastructure/persistence/mappers/` |
| Entidad → Modelo ORM | El mapper | `infrastructure/persistence/mappers/` |
| Excepción de dominio → HTTP | El handler global | `interfaces/http/error_handlers.py` |

## 9. La excepción sensata: consultas de sólo lectura

Para un listado o un reporte que no aplica reglas de negocio, forzar el viaje completo ORM →
entidad → response es coste sin beneficio. Está permitido un **modelo de lectura**: una consulta
en `infrastructure/` que devuelve directamente un DTO de lectura, saltándose la entidad.

Condiciones, las tres a la vez:

1. Es **estrictamente de lectura**. Nada que escriba puede saltarse el dominio.
2. **No aplica reglas de negocio**, sólo proyecta y formatea.
3. El DTO de lectura **declara sus campos explícitamente**. Nunca se devuelve el modelo ORM.

Esto es CQRS en su versión modesta, y es legítimo. Lo que no es legítimo es usarlo como excusa
para saltarse el dominio en operaciones de escritura.

## 10. Reglas duras

- **Tres representaciones, tres capas.** No se unifican.
- **El schema Pydantic muere en el router.** Jamás cruza a `application/` ni a `domain/`.
- **El modelo ORM muere en el repositorio.** Jamás sale hacia `application/` ni a la respuesta.
- **Nunca un modelo ORM como `response_model`.**
- **Los campos de respuesta se declaran de forma explícita.** Nada de publicar por reflexión.
- **El dinero no viaja como `float`** en JSON.
- **El schema valida forma; el dominio valida reglas.**
- **Las excepciones de dominio se traducen en un único handler global.**
- **Entidad nueva por constructor; entidad cargada por `rehydrate`.**
- **Un modelo de lectura sólo se permite en consultas**, y con campos explícitos.

## 11. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La regla de dependencias y las capas | `clean-architecture` |
| Entidades, value objects, agregados | `domain-modeling` |
| Puertos, adaptadores y traducción de excepciones | `hexagonal-ports-adapters` |
| Tablas, índices, migraciones, N+1 | `data-modeling` |
| Contrato público, versionado, OpenAPI | `api-contracts` |
| Forma del error y códigos HTTP | `error-handling` |
| Tipos generados para el cliente | `contract-testing` |
