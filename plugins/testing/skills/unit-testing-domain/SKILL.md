---
name: unit-testing-domain
description: Probar el interior del hexágono en Collie — entidades e invariantes, value objects, casos de uso con fakes escritos a mano en vez de Mock, reloj e ids deterministas, property-based testing con hypothesis donde gana, parametrización de bordes, y por qué un test de dominio nunca toca infraestructura. Cargar al escribir tests de entidades, value objects o casos de uso, al necesitar sustituir una dependencia en un test, al ver `Mock` en tests de dominio, o al notar que un test unitario necesita base de datos.
---

# Skill: unit-testing-domain

Los tests de la base de la pirámide: rápidos, deterministas y sin infraestructura.

> **La regla:** si un test del dominio necesita base de datos, red o reloj real, el problema no es
> el test — es que la dependencia no está detrás de un puerto.

## 1. Probar un value object

Lo más barato de probar y donde más bugs se previenen: la validación existe en un solo sitio.

```python
class TestMoney:
    def test_rejects_more_decimals_than_the_currency_allows(self) -> None:
        with pytest.raises(InvalidMoney):
            Money(Decimal("10.005"), USD)

    def test_adding_different_currencies_fails(self) -> None:
        with pytest.raises(CurrencyMismatch):
            Money(Decimal("10"), USD) + Money(Decimal("10"), EUR)

    def test_is_compared_by_value(self) -> None:
        assert Money(Decimal("10"), USD) == Money(Decimal("10"), USD)
```

Se prueba: la validación del constructor, las operaciones, la igualdad por valor y la
inmutabilidad.

## 2. Probar una entidad

Las invariantes y las transiciones. **No los getters.**

```python
class TestOrder:
    def test_cannot_be_created_without_lines(self) -> None:
        with pytest.raises(EmptyOrder):
            OrderBuilder().with_lines([]).build()

    def test_confirm_requires_approval_above_the_threshold(self) -> None:
        order = OrderBuilder().with_total(Money(Decimal("15000"), USD)).build()

        with pytest.raises(ApprovalRequired):
            order.confirm()

    def test_confirm_succeeds_with_approval_above_the_threshold(self) -> None:
        order = OrderBuilder().with_total(Money(Decimal("15000"), USD)).build()

        order.confirm(approved_by=UserId.generate())

        assert order.status is OrderStatus.CONFIRMED

    def test_cannot_be_confirmed_twice(self) -> None:
        order = OrderBuilder().confirmed().build()

        with pytest.raises(OrderAlreadyConfirmed):
            order.confirm()
```

El patrón: **por cada regla, el caso que la cumple y el que la viola.** Probar sólo el camino
feliz deja la regla sin verificar — que es justo lo que la entidad existe para proteger.

## 3. Probar un caso de uso con fakes

```python
def test_place_order_reserves_stock_and_persists() -> None:
    orders = FakeOrderRepository()
    stock = FakeStockReader(available={Sku("WIDGET"): 100})
    uow = FakeUnitOfWork()

    use_case = PlaceOrder(
        orders=orders,
        stock=stock,
        uow=uow,
        clock=FixedClock(datetime(2026, 3, 14, tzinfo=UTC)),
        ids=SequentialIdGenerator(),
    )

    order_id = use_case.execute(
        PlaceOrderCommand(customer_id=CustomerId.generate(),
                          lines=[LineCommand(Sku("WIDGET"), Quantity(10))])
    )

    saved = orders.get(order_id)
    assert saved.placed_at == datetime(2026, 3, 14, tzinfo=UTC)
    assert uow.committed
```

Se afirma sobre el **resultado observable**: qué quedó guardado, qué se devolvió, si se hizo
commit. No sobre qué métodos se llamaron.

## 4. Fakes, no `Mock`

Es la diferencia más importante de esta skill.

```python
# ✗ Mock: acepta cualquier cosa y no verifica nada
orders = Mock()
orders.get.return_value = order
use_case = PlaceOrder(orders=orders, ...)
orders.save.assert_called_once()      # prueba el test, no el sistema
```

Tres problemas concretos:

1. **Acepta llamadas que no existen.** Si el puerto cambia de `save` a `store`, el `Mock` sigue
   aceptando `save` y el test pasa con código roto.
2. **No tiene comportamiento.** No se puede afirmar sobre el estado resultante, sólo sobre
   llamadas — que es una aserción sobre la implementación, no sobre el comportamiento.
3. **Se rompe en cada refactor** que cambie el orden o el número de llamadas, aunque el
   comportamiento sea idéntico.

```python
# ✓ fake: tiene comportamiento y cumple el contrato
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

Viven en `tests/fakes/`, se comparten entre tests, y **se verifican contra la misma batería que el
adaptador real** (ver `contract-testing`).

`Mock` tiene un uso legítimo: verificar que un efecto **sin resultado observable** ocurrió — que se
publicó un evento, que se envió una notificación. Incluso ahí, un fake que acumula en una lista se
lee mejor.

## 5. Determinismo: reloj e ids

```python
class FixedClock:
    def __init__(self, now: datetime) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now


class SequentialIdGenerator:
    def __init__(self) -> None:
        self._n = 0

    def next(self) -> OrderId:
        self._n += 1
        return OrderId(UUID(int=self._n))
```

Con esto, una regla como "el pedido vence a los 30 días" se prueba en un milisegundo y sin
esperas, y los ids son predecibles en las aserciones.

**Nunca se parchea `datetime.now` con `monkeypatch`.** Eso indica que falta un puerto.

## 6. Parametrizar los bordes

```python
@pytest.mark.parametrize(
    ("quantity", "expected_total"),
    [
        (49, Decimal("490.00")),
        (50, Decimal("475.00")),     # primer tramo
        (199, Decimal("1890.50")),
        (200, Decimal("1800.00")),   # segundo tramo
    ],
)
def test_volume_discount_by_bracket(quantity: int, expected_total: Decimal) -> None:
    order = OrderBuilder().with_quantity(quantity).build()
    assert order.total().amount == expected_total
```

Los valores son **justo debajo y justo encima de cada frontera**. Ahí viven los off-by-one, no en
el centro de los tramos.

## 7. `hypothesis` donde gana

Property-based testing: en vez de ejemplos, se declara una propiedad que debe cumplirse **siempre**
y la librería busca el contraejemplo.

```python
from hypothesis import given, strategies as st

@given(
    amount=st.decimals(min_value=0, max_value=10**6, places=2),
    other=st.decimals(min_value=0, max_value=10**6, places=2),
)
def test_money_addition_is_commutative(amount: Decimal, other: Decimal) -> None:
    a, b = Money(amount, USD), Money(other, USD)
    assert a + b == b + a
```

Gana en: aritmética y redondeo, serialización de ida y vuelta (`to_entity(to_model(x)) == x`),
invariantes que deben cumplirse para cualquier entrada, y parsers.

No gana en: reglas de negocio con casos concretos, donde un ejemplo explícito documenta mejor la
intención que una propiedad abstracta.

## 8. Errores frecuentes

| Error | Arreglo |
|---|---|
| El test necesita base de datos | Falta un puerto; la lógica está en la capa equivocada |
| `monkeypatch` sobre `datetime.now` | Puerto `Clock` con `FixedClock` |
| Aserción sobre llamadas del mock | Afirmar sobre el estado resultante |
| Un test que construye el objeto con veinte campos | Falta un builder (`test-data`) |
| Probar sólo el camino feliz | Por cada regla, el caso que la viola |
| Un test con tres `act` | Son tres tests |
| Aserciones sobre atributos privados | Prueba implementación; se romperá sin motivo |
| Fake más permisivo que el real | Tests verdes y producción rota (`contract-testing`) |

## 9. Reglas duras

- **Cero infraestructura**: ni base de datos, ni red, ni disco, ni reloj real, ni azar.
- **Fakes escritos a mano**, no `Mock`, para todo puerto con comportamiento.
- **Se afirma sobre el resultado observable**, nunca sobre qué métodos se llamaron.
- **Tiempo e ids entran por puerto.** Nada de `monkeypatch` sobre `datetime`.
- **Por cada regla, el caso que la cumple y el que la viola.**
- **Los bordes se parametrizan**, justo por debajo y por encima de cada frontera.
- **Un solo comportamiento por test.**
- **Nada de aserciones sobre atributos privados.**
- **Los fakes viven en `tests/fakes/` y se verifican con la batería de contrato.**
- **Si tarda más de ~50 ms, no es un test unitario.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué nivel merece cada prueba | `test-strategy` |
| Fake y real cumpliendo el mismo contrato | `contract-testing` |
| Builders y datos por defecto | `test-data` |
| Adaptadores contra infraestructura real | `integration-testing` |
| Tests que no prueban nada | `test-quality` |
| Entidades, invariantes y value objects | `domain-modeling` |
| Puertos y fakes en memoria | `hexagonal-ports-adapters` |
