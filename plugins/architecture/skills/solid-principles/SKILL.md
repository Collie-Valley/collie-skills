---
name: solid-principles
description: Los cinco principios SOLID como estándar de Collie, con el olfato para detectar cada violación en Python y el arreglo concreto — SRP (una razón para cambiar), OCP (extender sin modificar), LSP (sustituible de verdad), ISP (puertos pequeños) y DIP (que es la regla de dependencias de la arquitectura limpia). Cargar al diseñar una clase o un puerto, al ver una clase que crece, al añadir un `if` por tipo, al heredar, al escribir una interfaz, o al revisar código y dudar si una abstracción está bien puesta.
---

# Skill: solid-principles

Los cinco principios, aplicados a Python y al estándar de arquitectura de Collie. No son teoría de
entrevista: tres de los cinco (LSP, ISP, DIP) son exactamente lo que hace que los puertos de
`clean-architecture` funcionen.

> **La forma de usar esta skill:** SOLID no se aplica por adelantado "para hacerlo bien". Se usa
> como **diagnóstico** cuando algo ya duele: una clase que no se deja probar, un `if` que crece
> cada mes, una herencia que sorprende. Aplicarlo preventivamente a todo produce cinco clases
> donde bastaba una función.

## 1. SRP — una sola razón para cambiar

**No es "una clase hace una sola cosa".** Es: una clase responde ante **un solo interesado**. Si
el equipo de finanzas y el de logística pueden pedir cambios en la misma clase por motivos
distintos, hay dos responsabilidades.

### El olfato

- El nombre lleva `Manager`, `Helper`, `Utils`, `Processor` o `Service` a secas.
- Para describir qué hace hay que usar "y".
- Un cambio de formato de reporte obliga a tocar la clase que calcula el reporte.
- El archivo pasa de ~200 líneas sin una razón clara.

### La violación

```python
# ✗ tres interesados en una clase: negocio, contabilidad y comunicaciones
class Order:
    def total(self) -> Money: ...
    def to_pdf(self) -> bytes: ...
    def send_confirmation_email(self) -> None: ...
```

Cambiar la plantilla del correo obliga a tocar la entidad que guarda las reglas del pedido. Y esa
entidad, para existir, ahora necesita un cliente de correo.

### El arreglo

```python
# domain/entities/order.py
class Order:
    def total(self) -> Money: ...

# infrastructure/reports/order_pdf_renderer.py
class OrderPdfRenderer:
    def render(self, order: Order) -> bytes: ...

# application/use_cases/confirm_order.py
class ConfirmOrder:
    def __init__(self, notifier: Notifier) -> None: ...
```

Cada pieza cambia por su propio motivo y vive en su propia capa.

### Dónde NO aplicarlo

Partir una clase cohesionada en cinco micro-clases que siempre cambian juntas es el error
contrario, y es más caro de leer. Si dos responsabilidades **siempre** cambian a la vez, eran una.

## 2. OCP — abierto a extensión, cerrado a modificación

Añadir un caso nuevo no debería obligar a editar código que ya funciona y ya está probado.

### El olfato

- Un `if/elif` o un `match` sobre un tipo, un rol o un código, que **crece con cada caso nuevo**.
- El mismo condicional replicado en varios sitios: al calcular, al validar y al mostrar.
- Cada funcionalidad nueva es un PR que toca el mismo archivo central.

### La violación

```python
# ✗ cada método de pago nuevo obliga a editar esta función, y las otras tres iguales
def calculate_fee(payment_type: str, amount: Money) -> Money:
    if payment_type == "credit_card":
        return amount * Decimal("0.029")
    elif payment_type == "bank_transfer":
        return Money.zero()
    elif payment_type == "crypto":
        return amount * Decimal("0.015")
    raise ValueError(payment_type)
```

### El arreglo

```python
# domain/ports/payment_method.py
class PaymentMethod(Protocol):
    def fee_for(self, amount: Money) -> Money: ...

# domain/payment_methods/credit_card.py
class CreditCard:
    def fee_for(self, amount: Money) -> Money:
        return amount * Decimal("0.029")
```

Un método de pago nuevo es un archivo nuevo. Nada de lo existente se toca, y nada de lo existente
se puede romper.

### Dónde NO aplicarlo

**Con dos casos que llevan años estables, el `if` es mejor.** La abstracción se paga cuando
aparece el tercer caso, o cuando el segundo llega antes de lo previsto. Diseñar el polimorfismo
"por si acaso" es la forma más común de complicar código que nadie iba a extender.

## 3. LSP — un sustituto no puede sorprender

Si algo espera un `Repository`, cualquier implementación debe poder ponerse ahí **sin que el
código de arriba se entere**. En Collie esto no es teórico: es lo que permite que un fake de test
sustituya al adaptador real y el test siga diciendo la verdad.

### El olfato

- Una subclase que lanza `NotImplementedError` en un método que heredó.
- Una implementación que exige más que las otras (un `setup()` previo, un orden de llamadas).
- Código que pregunta `isinstance(...)` para decidir cómo tratar a un supuesto polimorfo.
- Una implementación que devuelve `None` donde las demás devuelven una lista vacía.

### La violación

```python
# ✗ el fake es más permisivo que el real: el test pasa y producción falla
class InMemoryOrderRepository:
    def save(self, order: Order) -> None:
        self._items[order.id] = order        # acepta duplicados en silencio

class SqlOrderRepository:
    def save(self, order: Order) -> None:
        ...                                   # revienta con IntegrityError
```

El test verde no prueba nada, porque el sustituto no cumple el mismo contrato.

### El arreglo

El contrato del puerto se define por escrito —qué excepciones lanza, qué devuelve si no hay nada,
qué pasa con un duplicado— y **todas** las implementaciones se verifican contra la misma batería
de tests. Un test de contrato parametrizado sobre cada implementación:

```python
@pytest.fixture(params=["in_memory", "sql"])
def repository(request) -> OrderRepository: ...

def test_save_rejects_duplicate_id(repository: OrderRepository) -> None:
    repository.save(order)
    with pytest.raises(DuplicateOrder):
        repository.save(order)
```

Si el fake y el real no pasan los mismos tests, el fake miente. Detalle en `contract-testing`.

### La regla práctica

Una implementación no puede **debilitar** lo que promete (devolver menos, o algo distinto) ni
**endurecer** lo que exige (pedir más que las demás).

## 4. ISP — puertos pequeños, del tamaño de quien los usa

Nadie debería depender de métodos que no usa. Un puerto lo define **quien lo necesita**, no quien
lo implementa, y por eso sale pequeño.

### El olfato

- Un `Repository` con quince métodos del que cada caso de uso usa dos.
- Un fake de test obligado a implementar métodos vacíos para compilar.
- Un puerto que crece cada vez que alguien necesita una consulta nueva.

### La violación

```python
# ✗ un caso de uso que sólo lee se acopla a borrar, archivar y exportar
class OrderRepository(Protocol):
    def get(self, order_id: OrderId) -> Order | None: ...
    def save(self, order: Order) -> None: ...
    def delete(self, order_id: OrderId) -> None: ...
    def archive(self, order_id: OrderId) -> None: ...
    def export_to_csv(self) -> bytes: ...
    def bulk_import(self, rows: list[dict]) -> None: ...
```

### El arreglo

```python
class OrderReader(Protocol):
    def get(self, order_id: OrderId) -> Order | None: ...

class OrderWriter(Protocol):
    def save(self, order: Order) -> None: ...
```

Un mismo adaptador puede implementar los dos; el caso de uso que sólo consulta depende sólo de
`OrderReader`, y su fake de test es una clase de tres líneas. **Que el adaptador sea uno solo no
justifica que el puerto lo sea.**

## 5. DIP — y por qué es la regla de dependencias

El más importante, y el que ya conoces con otro nombre: **los módulos de alto nivel no dependen de
los de bajo nivel; ambos dependen de abstracciones.** Eso es, literalmente, la regla de
`clean-architecture`.

El matiz que suele perderse: **la abstracción pertenece al de alto nivel.** El puerto se define en
`domain/` porque el dominio es quien lo necesita; el adaptador vive fuera porque es el detalle. Si
la interfaz vive junto a su implementación, se ha invertido la carpeta pero no la dependencia.

### El olfato

- Un `import` de una librería concreta en `domain/` o `application/`.
- Una clase de negocio que construye por dentro lo que necesita (`self._db = SessionLocal()`).
- Una firma que menciona un tipo de librería (`db: Session`, `request: Request`).
- `datetime.now()` o `uuid4()` dentro del dominio: dependencias ocultas del sistema que hacen el
  código imposible de probar de forma determinista.

### La violación

```python
# ✗ el caso de uso decide su propia infraestructura: no hay forma de sustituirla
class PlaceOrder:
    def __init__(self) -> None:
        self._session = SessionLocal()
        self._mailer = SmtpMailer(host="smtp.internal")

    def execute(self, command: PlaceOrderCommand) -> OrderId:
        order = Order(id=uuid4(), placed_at=datetime.now())
```

### El arreglo

```python
class PlaceOrder:
    def __init__(self, orders: OrderWriter, clock: Clock, ids: IdGenerator) -> None:
        self._orders = orders
        self._clock = clock
        self._ids = ids

    def execute(self, command: PlaceOrderCommand) -> OrderId:
        order = Order(id=self._ids.next(), placed_at=self._clock.now())
```

El reloj y el generador de ids también son dependencias, aunque no lo parezcan: son el mundo
exterior entrando por la puerta de atrás. Con puertos, el test fija la hora y los ids, y deja de
ser aleatorio. Viven en `shared/application/ports/`.

## 6. Tabla de diagnóstico rápido

| Lo que ves | Principio | Arreglo |
|---|---|---|
| Clase que crece sin parar, nombre con `Manager` | SRP | Partir por interesado, no por tamaño |
| `if` por tipo que crece con cada caso | OCP | Polimorfismo — **sólo desde el tercer caso** |
| `isinstance` para tratar distinto a un polimorfo | LSP | El contrato estaba mal definido |
| `NotImplementedError` en una subclase | LSP | La jerarquía es falsa; usar composición |
| Fake de test con métodos vacíos | ISP | Partir el puerto por caso de uso |
| `import sqlalchemy` en `domain/` | DIP | Puerto en el dominio, adaptador fuera |
| `datetime.now()` en el dominio | DIP | Puerto `Clock` inyectado |
| Clase que construye sus dependencias | DIP | Recibirlas por constructor |

## 7. Cómo se verifica

SOLID no se mide con un linter, pero deja huellas medibles:

- **Un test que necesita levantar base de datos para probar una regla de negocio** es una
  violación de DIP, siempre.
- **Un fake con métodos vacíos** es una violación de ISP, siempre.
- **`grep -rn "isinstance" src/modules/*/domain/ src/modules/*/application/`** — cada resultado es
  un candidato a LSP roto; hay excepciones legítimas (validación en el borde), pero se justifican.
- El contrato `domain-is-pure` de `import-linter` (ver `clean-architecture` §8) verifica DIP
  mecánicamente y rompe el build.

## 8. Reglas duras

- **SOLID es diagnóstico, no profilaxis.** Se aplica a un dolor concreto, no a código que aún no
  duele.
- **La abstracción la define quien la usa**, y vive con él. Un puerto en `infrastructure/` no es
  inversión de dependencias.
- **Del tercer caso en adelante**, no del segundo: hasta ahí el `if` gana en claridad.
- **Un puerto que un fake no puede implementar en pocas líneas es demasiado grande.**
- **Todas las implementaciones de un puerto pasan los mismos tests de contrato.** Si no, el fake
  miente.
- **El tiempo, el azar y los ids son dependencias.** Entran por puerto, nunca por llamada directa.
- **Ninguna clase construye sus propias dependencias.** Las recibe por constructor.
- Herencia sólo para sustitución verdadera; para reutilizar código, **composición**.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La regla de dependencias, capas y estructura | `clean-architecture` |
| Puertos y adaptadores en profundidad | `hexagonal-ports-adapters` |
| Entidades, value objects, invariantes | `domain-modeling` |
| Cableado y composition root | `dependency-injection` |
| Tests de contrato sobre implementaciones | `contract-testing` |
| Fakes escritos a mano en vez de `Mock` | `unit-testing-domain` |
