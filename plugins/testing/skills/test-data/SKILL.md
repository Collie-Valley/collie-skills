---
name: test-data
description: Datos de prueba en Collie — builders con valores por defecto sensatos frente a fixtures rígidas, el patrón de nombrar sólo lo relevante para la prueba, datos deterministas sin azar ni fechas reales, siembra y limpieza en tests de integración, y por qué no se comparten datos entre tests. Cargar al escribir tests que necesitan construir objetos, al ver constructores de veinte campos repetidos, al montar fixtures, al sembrar una base de datos de test, o al arreglar tests que se rompen por datos.
---

# Skill: test-data

Cómo se construyen los datos que los tests necesitan. Determina si un test se lee en tres segundos
o en tres minutos.

> **La regla:** en un test **sólo aparece lo que la prueba usa**. Todo lo demás lo pone un valor
> por defecto. Un dato irrelevante visible hace creer que influye en el resultado.

## 1. El problema

```python
# ✗ ¿qué de esto importa para la regla que se prueba?
def test_confirm_requires_approval() -> None:
    order = Order(
        id=OrderId(uuid4()),
        customer_id=CustomerId(uuid4()),
        lines=[OrderLine(sku=Sku("WIDGET"), quantity=Quantity(200),
                         unit_price=Money(Decimal("75.00"), USD))],
        shipping_address=Address("Av. Siempre Viva 742", "Lima", "PE", "15001"),
        placed_at=datetime(2026, 3, 14, tzinfo=UTC),
        currency=USD,
        notes=None,
        channel=Channel.WEB,
    )
    with pytest.raises(ApprovalRequired):
        order.confirm()
```

Nueve campos, y sólo uno importa: que el total supere el umbral. Además, cada campo nuevo en la
entidad rompe **todos** los tests que la construyen así.

## 2. Builders

```python
# tests/builders/order_builder.py
class OrderBuilder:
    def __init__(self) -> None:
        self._id = OrderId(UUID(int=1))
        self._customer_id = CustomerId(UUID(int=1))
        self._lines = [OrderLine(Sku("WIDGET"), Quantity(1), Money(Decimal("10.00"), USD))]
        self._status = OrderStatus.DRAFT
        self._placed_at = datetime(2026, 1, 1, tzinfo=UTC)

    def with_total(self, total: Money) -> "OrderBuilder":
        self._lines = [OrderLine(Sku("WIDGET"), Quantity(1), total)]
        return self

    def with_lines(self, lines: list[OrderLine]) -> "OrderBuilder":
        self._lines = lines
        return self

    def confirmed(self) -> "OrderBuilder":
        self._status = OrderStatus.CONFIRMED
        return self

    def build(self) -> Order:
        return Order.rehydrate(
            id=self._id, customer_id=self._customer_id,
            lines=self._lines, status=self._status, placed_at=self._placed_at,
        )
```

```python
# ✓ se lee de un vistazo qué importa
def test_confirm_requires_approval() -> None:
    order = OrderBuilder().with_total(Money(Decimal("15000"), USD)).build()

    with pytest.raises(ApprovalRequired):
        order.confirm()
```

Lo que compran:

- **Sólo lo relevante es visible.** El lector sabe inmediatamente qué influye.
- **Un campo nuevo en la entidad no rompe ningún test**: se añade su valor por defecto en el
  builder, en un solo sitio.
- **Los métodos llevan nombre de negocio** (`confirmed()`, `wholesale()`), así el test se lee como
  una frase.

### Dónde viven

`tests/builders/`, uno por agregado o entidad relevante. Se comparten entre unit, integration y
BDD: son la misma construcción de dominio.

## 3. Valores por defecto

Deben ser **válidos, sencillos y aburridos**:

- Válidos: el objeto construido pasa todas sus invariantes sin tocar nada.
- Sencillos: el caso más simple posible (una línea, cantidad 1).
- Aburridos: nada de valores en el borde por defecto. Si el defecto de `quantity` fuera 0 o el
  máximo, la mitad de los tests estarían probando un caso límite sin saberlo.

Y **deterministas**: ids secuenciales (`UUID(int=1)`), fechas fijas. Nunca `uuid4()` ni
`datetime.now()` dentro de un builder.

## 4. Determinismo

```python
# ✗ el test depende del día en que se ejecute
order = OrderBuilder().placed_at(datetime.now()).build()

# ✗ los ids cambian en cada ejecución: las aserciones no pueden nombrarlos
customer_id = uuid4()
```

Las fechas reales producen tests que fallan el día que cruzan un límite (fin de mes, cambio de
año, horario de verano). Los ids aleatorios impiden aserciones exactas y hacen ilegibles los
mensajes de fallo.

**Fechas fijas y explícitas**, elegidas para que el caso sea claro:

```python
PLACED_AT = datetime(2026, 1, 1, tzinfo=UTC)
DUE_AT = datetime(2026, 1, 31, tzinfo=UTC)      # 30 días: el límite de la regla
```

Cuando la regla depende de "ahora", eso entra por el puerto `Clock` con `FixedClock`, no por el
dato.

### Datos falsos generados

`faker` es útil para volumen (sembrar mil registros) pero **con semilla fija**, y nunca para
valores que el test afirma. Un nombre aleatorio en una aserción es un test que falla un día de
cada mil por una comilla o un carácter no ASCII.

## 5. Fixtures de pytest: cuándo sí

| Usa fixture | Usa builder |
|---|---|
| Recursos con ciclo de vida (sesión, cliente, contenedor) | Objetos de dominio |
| Algo caro que se comparte (contenedor de sesión) | Variaciones por test |
| Configuración del entorno de test | Cualquier cosa que cambie entre tests |

El anti-patrón habitual es la fixture que devuelve una entidad concreta:

```python
# ✗ cuando un test necesita un pedido distinto, nacen order_2, order_confirmed, order_big...
@pytest.fixture
def order() -> Order:
    return Order(...)
```

Acaba en una familia de fixtures casi idénticas que nadie entiende. Un builder cubre todas las
variantes con una sola pieza.

## 6. Datos en tests de integración

- **Cada test siembra lo suyo.** Nada de un conjunto global compartido: crea acoplamiento y hace
  que un cambio de datos rompa tests lejanos.
- **Se limpia por transacción revertida** cuando se puede (ver `integration-testing` §2).
- **Identificadores únicos por test** cuando la limpieza no es total, para evitar colisiones de
  restricciones únicas.
- **Sembrar por el repositorio o por SQL directo**, no navegando la aplicación.

Para e2e, los datos se crean **por API** (ver `e2e-playwright` §3): más rápido y no rompe el test
cuando cambia una pantalla intermedia.

## 7. Datos reales de producción: nunca

Copiar un volcado de producción a un entorno de test expone datos personales, y la anonimización
parcial casi siempre deja rastros (correos, teléfonos, identificadores fiscales cruzables).

Si hace falta volumen o formas realistas: **generar** con `faker` y semilla fija, respetando las
mismas restricciones que la base real.

## 8. Errores frecuentes

| Error | Consecuencia |
|---|---|
| Constructor completo en cada test | Ilegible; un campo nuevo rompe todo |
| Datos irrelevantes visibles | Sugieren que influyen en la regla |
| `uuid4()` o `datetime.now()` en builders | Tests no deterministas |
| Familia de fixtures casi iguales | Nadie sabe cuál usar |
| Conjunto de datos global compartido | Acoplamiento entre tests lejanos |
| Valores por defecto en el borde | Se prueba un caso límite sin querer |
| `faker` sin semilla en aserciones | Fallos de uno entre mil |
| Volcado de producción | Exposición de datos personales |

## 9. Reglas duras

- **En el test sólo aparece lo que la prueba usa.**
- **Builders para objetos de dominio**, fixtures sólo para recursos con ciclo de vida.
- **Los valores por defecto son válidos, simples y aburridos.**
- **Cero `uuid4()` y cero `datetime.now()` en builders.** Ids secuenciales y fechas fijas.
- **El tiempo del sistema entra por `Clock`**, no por el dato.
- **Cada test crea sus propios datos**; nada compartido entre tests.
- **`faker` con semilla fija**, y nunca en valores que se afirman.
- **Los builders viven en `tests/builders/`** y se comparten entre niveles.
- **Jamás datos de producción en entornos de test.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Fakes de puertos | `unit-testing-domain` · `hexagonal-ports-adapters` |
| Aislamiento y limpieza de base de datos | `integration-testing` |
| Crear datos para e2e por API | `e2e-playwright` |
| Los `Given` de los escenarios | `bdd-automation` |
| Entidades y sus invariantes | `domain-modeling` |
| Tests no deterministas | `test-quality` |
| Datos personales y anonimización | `sensitive-data` |
