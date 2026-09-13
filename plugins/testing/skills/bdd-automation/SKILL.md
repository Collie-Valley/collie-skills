---
name: bdd-automation
description: Ejecutar los escenarios Gherkin en Collie — pytest-bdd contra los casos de uso para la gran mayoría (milisegundos) y Playwright sólo para los que exigen navegador, step definitions que llaman al dominio y no a la interfaz, el contexto compartido entre pasos, pasos reutilizables sin acoplar, y cómo se mantiene la correspondencia entre feature y código. Cargar al automatizar escenarios, al montar pytest-bdd, al ver una suite BDD lenta porque todo pasa por navegador, o al escribir step definitions.
---

# Skill: bdd-automation

Cómo se ejecutan los escenarios que `bdd-behavior` define. Sin esto, Gherkin es documentación que
se pudre.

> **La regla:** un escenario se ejecuta **en el nivel más barato que pueda demostrarlo**. La gran
> mayoría corre contra los casos de uso en milisegundos; sólo los que verifican la integración
> completa pasan por navegador.

## 1. Por qué esto es posible aquí

En un sistema donde la lógica vive en routers, el único sitio donde se puede ejecutar un escenario
de negocio es el navegador. Resultado: cincuenta escenarios, veinte minutos, y una suite que se
desactiva.

Con el dominio detrás de puertos, el escenario "un pedido mayorista supera el umbral y obtiene
descuento" se ejecuta **contra el caso de uso, con fakes**, en un milisegundo. La misma frase de
negocio, mil veces más rápida.

Es la segunda vez que la arquitectura se cobra sola. La primera fue `unit-testing-domain`.

## 2. El reparto

| Escenario | Se ejecuta contra | Velocidad |
|---|---|---|
| Reglas de negocio (la mayoría) | Casos de uso con fakes | < 10 ms |
| Persistencia real, consultas | Casos de uso con adaptadores reales | ~1 s |
| Contrato HTTP, permisos | `TestClient` | ~50 ms |
| Recorridos críticos completos | Playwright | segundos |

**El mismo archivo `.feature` puede ejecutarse en más de un nivel** si hace falta, pero lo normal
es uno. La decisión sigue el filtro de `e2e-scope`.

## 3. `pytest-bdd`: la ruta normal

```gherkin
# tests/bdd/features/volume_discount.feature
Feature: Volume discount on orders

  Scenario: An order above the threshold gets the discount
    Given a wholesale customer "Acme"
    And a price list where "Widget" costs 10.00 USD
    When "Acme" places an order of 200 "Widget"
    Then the order total is 1800.00 USD
```

```python
# tests/bdd/steps/test_volume_discount.py
from pytest_bdd import scenarios, given, when, then, parsers

scenarios("../features/volume_discount.feature")


@dataclass
class Context:
    customers: FakeCustomerRepository = field(default_factory=FakeCustomerRepository)
    orders: FakeOrderRepository = field(default_factory=FakeOrderRepository)
    prices: FakePriceList = field(default_factory=FakePriceList)
    placed_order_id: OrderId | None = None
    error: Exception | None = None


@pytest.fixture
def context() -> Context:
    return Context()


@given(parsers.parse('a wholesale customer "{name}"'))
def a_wholesale_customer(context: Context, name: str) -> None:
    context.customers.save(CustomerBuilder().wholesale().named(name).build())


@given(parsers.parse('a price list where "{sku}" costs {amount:f} {currency}'))
def a_price_list(context: Context, sku: str, amount: float, currency: str) -> None:
    context.prices.set(Sku(sku), Money(Decimal(str(amount)), Currency(currency)))


@when(parsers.parse('"{name}" places an order of {quantity:d} "{sku}"'))
def places_an_order(context: Context, name: str, quantity: int, sku: str) -> None:
    use_case = PlaceOrder(
        orders=context.orders,
        customers=context.customers,
        prices=context.prices,
        uow=FakeUnitOfWork(),
        clock=FixedClock(datetime(2026, 3, 14, tzinfo=UTC)),
        ids=SequentialIdGenerator(),
    )
    context.placed_order_id = use_case.execute(
        PlaceOrderCommand(customer_name=name, lines=[LineCommand(Sku(sku), Quantity(quantity))])
    )


@then(parsers.parse("the order total is {amount:f} {currency}"))
def the_order_total_is(context: Context, amount: float, currency: str) -> None:
    order = context.orders.get(context.placed_order_id)
    assert order.total() == Money(Decimal(str(amount)), Currency(currency))
```

Lo que hace que esto funcione:

- **El `When` llama al caso de uso**, no a una pantalla ni a un endpoint.
- **El contexto es un objeto tipado**, no un `dict` suelto: `mypy` lo verifica y se lee qué hay
  disponible.
- **Los `Given` construyen estado con builders** (ver `test-data`), no con constructores de veinte
  campos.
- **El `Then` afirma sobre el resultado observable**, leyéndolo del fake.

## 4. Capturar errores esperados

Un `When` que lanza excepción rompería el escenario antes del `Then`. Se captura:

```python
@when(parsers.parse('"{name}" places an order of {quantity:d} "{sku}"'))
def places_an_order(context: Context, ...) -> None:
    try:
        context.placed_order_id = use_case.execute(command)
    except DomainError as exc:
        context.error = exc


@then(parsers.parse("the order is rejected because {reason}"))
def the_order_is_rejected(context: Context, reason: str) -> None:
    assert context.error is not None, "expected the order to be rejected"
    assert type(context.error).__name__ == _EXPECTED[reason]
```

## 5. Escenarios que sí necesitan navegador

Sólo los que pasan el filtro de `e2e-scope`. Se marcan y se ejecutan con Playwright:

```gherkin
@e2e
Scenario: A customer completes a purchase
```

```python
scenarios("../features/checkout.feature", example_converters=...)

@when(parsers.parse('"{name}" places an order of {quantity:d} "{sku}"'))
def places_an_order_via_ui(page: Page, name: str, quantity: int, sku: str) -> None:
    page.get_by_label("Product").select_option(sku)
    page.get_by_label("Quantity").fill(str(quantity))
    page.get_by_role("button", name="Place order").click()
```

**El archivo `.feature` no cambia.** Es el mismo texto de negocio; sólo cambia la implementación de
los pasos. Esa es la ventaja real de separar el escenario de su ejecución.

## 6. Step definitions reutilizables sin acoplar

- **Se agrupan por dominio**, no por feature: `steps/order_steps.py`, `steps/customer_steps.py`, y
  se comparten con `conftest.py`.
- **Un paso hace una cosa.** Un `Given` que crea un cliente, un precio y tres pedidos es un paso
  que nadie puede reutilizar.
- **Los parámetros van en la frase**, no cableados dentro. `parsers.parse` con tipos (`{n:d}`,
  `{amount:f}`) evita conversiones manuales.
- **Nada de lógica condicional en un paso.** Si un paso tiene un `if` sobre el texto recibido, son
  dos pasos.
- **Si dos pasos hacen lo mismo con frases distintas**, se unifica la frase en el `.feature`. La
  proliferación de sinónimos es lo que vuelve inmanejable una suite BDD.

## 7. Mantener la correspondencia

- **Un paso sin definición** hace fallar el escenario. Bien: es el mecanismo que impide que el
  `.feature` se desincronice.
- **Una definición sin uso** es código muerto: `pytest-bdd` no avisa, así que se revisa al borrar
  escenarios.
- **El `.feature` y sus steps viven cerca**, en `tests/bdd/features/` y `tests/bdd/steps/`.
- **Los escenarios corren en cada PR**, no en una ejecución nocturna aparte. Un escenario que no
  se ejecuta a diario vuelve a ser documentación.

## 8. Errores frecuentes

| Error | Consecuencia |
|---|---|
| Todos los escenarios por navegador | Suite lenta que acaba desactivada |
| El `When` llama a un endpoint en vez del caso de uso | Más lento y acoplado al transporte |
| Contexto como `dict` global | Sin tipos, sin saber qué hay dentro |
| Pasos con lógica condicional | El escenario deja de ser declarativo |
| Un archivo de steps por feature | Duplicación masiva de pasos |
| Sinónimos para el mismo paso | La suite se vuelve inmanejable |
| Escenarios escritos después del código | Describen lo hecho, no lo pedido |
| Ejecutar BDD sólo en nightly | Se desincroniza sin que nadie se entere |

## 9. Reglas duras

- **La mayoría de escenarios se ejecuta contra los casos de uso, con fakes.**
- **Sólo pasan por navegador los que cumplen el filtro de `e2e-scope`.**
- **El `.feature` no cambia según dónde se ejecute.**
- **El contexto compartido es un objeto tipado**, no un `dict`.
- **Un paso hace una sola cosa** y no contiene lógica condicional.
- **Los pasos se agrupan por dominio y se comparten.**
- **Un mismo concepto, una sola frase.** Sin sinónimos.
- **Los escenarios corren en cada PR.**
- **Un escenario que tarda segundos sin necesitar navegador está en el nivel equivocado.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Cómo se redactan los escenarios | `bdd-behavior` |
| La spec de la que derivan | `spec-driven-development` |
| Qué merece navegador | `e2e-scope` |
| Cómo se escribe un test de navegador | `e2e-playwright` |
| Fakes y casos de uso | `unit-testing-domain` |
| Builders para los `Given` | `test-data` |
| El reparto entre niveles | `test-strategy` |
