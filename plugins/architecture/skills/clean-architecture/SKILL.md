---
name: clean-architecture
description: El estándar de arquitectura limpia de Collie — la regla de dependencias (hacia dentro, siempre), las cuatro capas y qué vive en cada una, la estructura de carpetas por módulo, el test para ubicar un archivo dudoso, los anti-patrones que la rompen en silencio, y cómo se hace cumplir en CI. Cargar al crear un módulo o servicio nuevo, al colocar un archivo y dudar de dónde va, al añadir una dependencia externa, al revisar imports o un PR que toca la estructura, o ante cualquier pregunta de "dónde pongo esto".
---

# Skill: clean-architecture

El estándar de arquitectura para el backend de Collie. Es **prescriptivo**: no describe opciones,
define cómo se construye aquí.

> **La regla, en una línea:** las dependencias apuntan **hacia dentro**, siempre. El dominio no
> sabe que existen FastAPI, SQLAlchemy, Pydantic, Redis ni HTTP. Si el dominio importa algo de
> fuera, la arquitectura ya está rota — da igual cómo se llamen las carpetas.

Todo lo demás de esta skill deriva de esa frase.

## 1. Por qué, en dos párrafos (no es ceremonia)

La regla compra tres cosas concretas, y si no las está comprando es que se está aplicando mal:

1. **Tests rápidos y sin infraestructura.** La lógica de negocio se prueba sin levantar una base
   de datos ni un servidor. Miles de tests en segundos, no minutos.
2. **Cambiar lo de fuera sin tocar lo de dentro.** Migrar de MySQL a Postgres, de REST a gRPC, o
   de un proveedor de correo a otro, toca adaptadores. No toca reglas de negocio.
3. **Las reglas de negocio se pueden leer.** Un caso de uso se lee de arriba abajo y se entiende
   qué hace el sistema, sin ruido de sesiones, transacciones ni códigos HTTP.

Si un módulo no gana nada de esto, ver §7 (proporcionalidad) antes de aplicarle el ritual
completo.

## 2. Las cuatro capas

De dentro hacia fuera. Cada capa puede importar hacia **dentro**; jamás hacia fuera.

```
┌─────────────────────────────────────────────────────────┐
│  interfaces/      routers, schemas, CLI, webhooks        │  ← el mundo entra
│  ┌───────────────────────────────────────────────────┐  │
│  │  infrastructure/   repos SQLAlchemy, clientes HTTP │  │  ← el mundo se toca
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  application/   casos de uso, orquestación   │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │  domain/   entidades, VOs, puertos     │  │  │  │  ← el corazón
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
          las flechas de import apuntan hacia dentro ↓
```

### 2.1 `domain/` — el corazón

Reglas de negocio que serían verdad aunque el sistema fuera papel y lápiz.

| Contiene | Qué es |
|---|---|
| `entities/` | Objetos con identidad y ciclo de vida. Protegen sus invariantes en el constructor. |
| `value_objects/` | Objetos sin identidad, inmutables, que se comparan por valor (`Money`, `Email`, `DateRange`). |
| `ports/` | Interfaces que el dominio **necesita** y alguien de fuera implementa. |
| `services/` | Lógica que no pertenece a una sola entidad. Sin estado. |
| `events/` | Hechos del negocio que ya ocurrieron, en pasado (`OrderPlaced`). |
| `exceptions/` | Errores del negocio (`InsufficientStock`), no errores técnicos. |

**Imports permitidos:** la librería estándar, y el propio `domain/`. Nada más.

### 2.2 `application/` — los casos de uso

Orquesta el dominio para cumplir una intención del usuario. Un caso de uso = una operación de
negocio, con un único método público.

| Contiene | Qué es |
|---|---|
| `use_cases/` | Una clase por operación. Recibe puertos por constructor, ejecuta, devuelve. |
| `dto/` | Datos de entrada y salida del caso de uso. Objetos planos, **no** Pydantic. |
| `ports/` | Puertos que necesita la aplicación pero no el dominio (`UnitOfWork`, `EventPublisher`). |
| `exceptions/` | Errores de orquestación (`PermissionDenied`). |

**Imports permitidos:** `domain/`, `application/`, estándar. **Aquí viven las transacciones**: el
caso de uso decide qué es atómico, mediante un puerto `UnitOfWork` — nunca abriendo una sesión.

### 2.3 `infrastructure/` — los adaptadores

Implementa los puertos contra el mundo real. Es la única capa que conoce tecnología concreta.

| Contiene | Qué es |
|---|---|
| `persistence/models/` | Tablas SQLAlchemy. **No son entidades**, son un detalle de almacenamiento. |
| `persistence/repositories/` | Implementan los puertos del dominio. Traducen tabla ↔ entidad. |
| `persistence/mappers/` | La traducción explícita entre modelo ORM y entidad. |
| `clients/` | Clientes HTTP, colas, almacenamiento, correo. |
| `config/` | Settings, variables de entorno, conexiones. |

**Imports permitidos:** todo. Es el borde sucio, y está bien que lo sea.

### 2.4 `interfaces/` — por dónde entra el mundo

Traduce una petición externa en una llamada a un caso de uso, y su resultado en una respuesta.

| Contiene | Qué es |
|---|---|
| `http/routers/` | Routers de FastAPI. **Delgados**: validar, llamar, devolver. Sin lógica. |
| `http/schemas/` | Modelos Pydantic de request y response. Nunca cruzan hacia dentro. |
| `http/dependencies.py` | El cableado: construye adaptadores e inyecta casos de uso. |
| `http/error_handlers.py` | Traduce excepciones de dominio a códigos HTTP. En un solo sitio. |
| `cli/`, `workers/` | Otros puntos de entrada, si los hay. |

**Imports permitidos:** todo. Es el otro borde.

## 3. La estructura de carpetas

Módulos verticales por contexto de negocio; dentro de cada módulo, las cuatro capas. Un módulo se
entiende —y se extrae— sin leer los demás.

```
src/
├── modules/
│   └── <module_name>/
│       ├── domain/
│       │   ├── entities/
│       │   ├── value_objects/
│       │   ├── ports/
│       │   ├── services/
│       │   ├── events/
│       │   └── exceptions/
│       ├── application/
│       │   ├── use_cases/
│       │   ├── dto/
│       │   ├── ports/
│       │   └── exceptions/
│       ├── infrastructure/
│       │   ├── persistence/
│       │   │   ├── models/
│       │   │   ├── repositories/
│       │   │   └── mappers/
│       │   ├── clients/
│       │   └── config/
│       └── interfaces/
│           └── http/
│               ├── routers/
│               ├── schemas/
│               ├── dependencies.py
│               └── error_handlers.py
├── shared/
│   ├── domain/            tipos y VOs comunes a varios módulos
│   ├── application/       puertos transversales (UnitOfWork, Clock, IdGenerator)
│   └── infrastructure/    engine, sesión, logging, settings, middleware
├── migrations/            Alembic
└── main.py                composition root: monta la app y registra los módulos
```

**Todo en inglés**: carpetas, archivos, clases, funciones, variables, docstrings. Un módulo se
nombra por el contexto de negocio en singular conceptual (`billing`, `logistics`, `identity`), no
por la tabla ni por la tecnología.

### Reglas entre módulos

- Un módulo **no importa** el `domain/`, `infrastructure/` ni `interfaces/` de otro.
- Si un módulo necesita algo de otro, lo pide por un **puerto propio** que un adaptador satisface
  llamando al caso de uso ajeno. La dependencia queda explícita y sustituible.
- Lo verdaderamente común sube a `shared/`. Si `shared/` crece sin freno, es que faltaba un
  módulo.

## 4. El test de ubicación

Ante la duda de dónde va un archivo, tres preguntas. Se responden en orden y la primera que dé
"no" decide:

1. **¿Seguiría siendo verdad si cambiáramos de base de datos?** No → `infrastructure/`.
2. **¿Seguiría siendo verdad si esto fuera un CLI en vez de una API?** No → `interfaces/`.
3. **¿Describe una regla del negocio, o coordina varios pasos para cumplir una intención?**
   Regla → `domain/`. Coordinación → `application/`.

Y el chequeo mecánico, que no opina:

```bash
# Ningún archivo del dominio puede importar infraestructura. Salida vacía = correcto.
grep -rnE '^\s*(from|import)\s+(sqlalchemy|fastapi|pydantic|redis|httpx|boto3)' \
  src/modules/*/domain/ src/modules/*/application/
```

## 5. Los puertos: cómo se ve la regla en código

Un puerto lo **define el dominio** y habla sólo su idioma: entidades, value objects y tipos
estándar. Se implementa fuera.

```python
# domain/ports/order_repository.py
from typing import Protocol
from ..entities.order import Order
from ..value_objects.order_id import OrderId


class OrderRepository(Protocol):
    def get(self, order_id: OrderId) -> Order | None: ...
    def save(self, order: Order) -> None: ...
```

```python
# infrastructure/persistence/repositories/sql_order_repository.py
from sqlalchemy.orm import Session
from ...domain.entities.order import Order
from ..mappers.order_mapper import to_entity, to_model


class SqlOrderRepository:
    def __init__(self, session: Session) -> None:
        self._session = session          # la sesión vive aquí, y sólo aquí

    def get(self, order_id: OrderId) -> Order | None:
        row = self._session.get(OrderModel, str(order_id))
        return to_entity(row) if row else None

    def save(self, order: Order) -> None:
        self._session.merge(to_model(order))
```

El caso de uso recibe el puerto, no el adaptador:

```python
# application/use_cases/place_order.py
class PlaceOrder:
    def __init__(self, orders: OrderRepository, uow: UnitOfWork) -> None:
        self._orders = orders
        self._uow = uow

    def execute(self, command: PlaceOrderCommand) -> OrderId:
        order = Order.place(command.customer_id, command.lines)
        with self._uow:
            self._orders.save(order)
        return order.id
```

Se usa `Protocol` en lugar de `ABC`: da tipado estructural, no obliga a heredar desde
infraestructura, y permite que un fake de test lo satisfaga sin importar nada del dominio. Reserva
`ABC` para cuando necesites compartir implementación entre adaptadores.

## 6. Anti-patrones: cómo se rompe esto en silencio

Los cinco que aparecen una y otra vez. Todos **parecen** limpios, y ninguno lo es.

### 6.1 El puerto que filtra la infraestructura

```python
# ✗ el puerto habla de sesiones: SQLAlchemy atraviesa la interfaz
class OrderRepository(ABC):
    @abstractmethod
    def get(self, db: Session, order_id: str) -> Order | None: ...
```

Si el puerto recibe una `Session`, el dominio depende de SQLAlchemy aunque el import esté
escondido en una firma. No se puede probar sin base de datos y no se puede sustituir el adaptador.
**La conexión se inyecta en el constructor del adaptador, no viaja por los métodos del puerto.**

### 6.2 La tabla disfrazada de entidad

```python
# ✗ esto no es una entidad, es una fila
class Order(Base):
    __tablename__ = "orders"
    id = Column(String(36), primary_key=True)
```

Una entidad protege invariantes y expresa comportamiento; un modelo ORM describe columnas. Cuando
son la misma clase, el esquema de base de datos dicta el diseño del negocio y cada cambio de
columna se propaga por todo el sistema. Van **separados**, con un mapper explícito entre ambos.

### 6.3 El caso de uso anémico

Un "servicio" que sólo llama al repositorio y devuelve el resultado no es un caso de uso: es un
paso a través. O falta la regla de negocio que debía vivir ahí, o el módulo no necesita esta capa
(ver §7). No se escriben capas vacías por simetría.

### 6.4 El schema Pydantic que cruza hacia dentro

Un `OrderCreateRequest` que llega hasta el repositorio acopla el dominio al contrato HTTP: cambiar
un nombre de campo en la API obliga a tocar la persistencia. El schema muere en el router, que
construye un DTO o un comando.

### 6.5 La lógica en el router

```python
# ✗ el router decide reglas de negocio
@router.post("/orders")
def create_order(payload: OrderCreateRequest, db: Session = Depends(get_db)):
    if payload.total > 10_000 and not payload.approved_by:
        raise HTTPException(400, "Approval required")
```

Esa condición es una regla del negocio y pertenece al dominio. Un router hace tres cosas: recibir,
llamar a un caso de uso, devolver. Si tiene un `if` de negocio, está en la capa equivocada.

## 7. Proporcionalidad: cuándo NO aplicar todo esto

Un estándar que se aplica sin criterio se convierte en ceremonia, y la ceremonia se abandona. La
arquitectura completa se gana; no se impone por defecto.

**Merece las cuatro capas** un módulo con al menos una de estas señales:

- Reglas de negocio con condiciones, estados o validaciones cruzadas.
- Invariantes que deben cumplirse pase lo que pase.
- Más de una fuente de datos, o integraciones externas.
- Cambios frecuentes en las reglas, o alto coste de un fallo.

**No lo merece** un módulo que es una tabla con CRUD y cero reglas (catálogos, parámetros,
tablas de apoyo). Para eso: `interfaces/` + `infrastructure/`, sin `domain/` ni `application/`.
Cuando aparezca la primera regla de negocio, se promueve a la estructura completa — y ese momento
llega con una tarjeta propia, no con un refactor silencioso.

La decisión de aplicar o no la estructura completa **se registra por escrito** cuando se crea el
módulo. No se deduce después leyendo carpetas.

## 8. Hacerla cumplir: el linter de importaciones

Una regla que sólo vive en un documento se rompe en tres sprints. La regla de dependencias se
verifica en CI con `import-linter`.

```ini
# .importlinter
[importlinter]
root_package = src

[importlinter:contract:domain-is-pure]
name = El dominio no depende de frameworks
type = forbidden
source_modules = src.modules.*.domain
forbidden_modules =
    sqlalchemy
    fastapi
    pydantic
    httpx
    redis

[importlinter:contract:layers]
name = Las dependencias apuntan hacia dentro
type = layers
layers =
    interfaces
    infrastructure
    application
    domain
containers = src.modules.<module_name>

[importlinter:contract:modules-are-independent]
name = Los módulos no se importan entre sí
type = independence
modules =
    src.modules.billing
    src.modules.logistics
```

Se ejecuta con `lint-imports` y **falla el build**. Cada módulo nuevo se añade a los contratos
`layers` e `independence` en el mismo PR que lo crea.

## 9. Adoptar sin parar el mundo

En código existente que no cumple, la migración es **por erosión, no de golpe**:

1. **Lo nuevo nace limpio.** Todo módulo creado a partir de ahora cumple el estándar completo. Sin
   excepciones, porque es donde no cuesta nada.
2. **Lo viejo se corrige cuando se toca.** Si una tarjeta entra en un módulo que no cumple, se
   endereza la parte que se toca. No se abre un refactor paralelo.
3. **El orden lo marca el valor**, no la pureza: primero los módulos con más reglas de negocio y
   más cambios, que es donde el desorden cuesta dinero. Un CRUD que lleva dos años sin tocarse se
   queda como está.
4. **Cada tramo migrado entra en los contratos del linter**, para que no retroceda.
5. La deuda detectada por el camino **se registra como tarjeta**, no se arregla en silencio ni se
   pierde.

## 10. Reglas duras

- **El dominio no importa nada de fuera.** Ni SQLAlchemy, ni FastAPI, ni Pydantic, ni en el cuerpo
  ni en las firmas ni bajo `TYPE_CHECKING`.
- **Un puerto habla el idioma del dominio.** Si su firma menciona `Session`, `Request`, `Response`
  o un tipo de librería, está mal diseñado.
- **Modelo ORM y entidad son clases distintas**, con un mapper explícito entre ellas.
- **El router no decide nada de negocio.** Recibe, llama, devuelve.
- **El schema Pydantic muere en `interfaces/`.** No cruza hacia dentro.
- **Las transacciones las decide `application/`**, a través de un puerto. No el repositorio ni el
  router.
- **Un módulo no importa otro módulo.** Se comunica por un puerto propio.
- **`import-linter` corre en CI y rompe el build.** La arquitectura que no se verifica, no existe.
- **Ningún archivo fuera de `infrastructure/config/` lee variables de entorno.**
- Estructura, nombres y código **en inglés**, siempre.

## 11. Qué vive en otra skill

Esta skill define la regla y la estructura. El detalle va en su sitio:

| Tema | Skill |
|---|---|
| Puertos y adaptadores en profundidad, driving vs. driven | `hexagonal-ports-adapters` |
| SOLID, y por qué DIP es esta misma regla | `solid-principles` |
| Traducción Pydantic ↔ entidad ↔ modelo ORM | `boundary-mapping` |
| Entidades, value objects, invariantes, agregados | `domain-modeling` |
| Cableado, `Depends` y composition root | `dependency-injection` |
| Cuándo mezclar limpia con hexagonal y hasta dónde | `architecture-hybrid` |
| Probar el dominio sin infraestructura | `unit-testing-domain` |
