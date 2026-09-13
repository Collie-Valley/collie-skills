---
name: test-quality
description: Detectar y arreglar tests que no prueban nada en Collie — aserciones tautológicas, tests que verifican el mock, acoplamiento a la implementación, tests flaky y sus cuatro causas reales, sleep, dependencias de orden, tests que se arreglan cambiando la aserción, y cómo se decide borrar un test. Cargar al revisar tests en un PR, al ver tests que fallan intermitentemente, al notar que un refactor rompe muchos tests, al heredar una suite desconocida, o al arreglar un test que falla.
---

# Skill: test-quality

Un test malo es peor que ningún test: consume tiempo, da confianza falsa y hay que mantenerlo.

> **La prueba de un test:** si rompes a propósito el código que dice cubrir y el test sigue verde,
> ese test no prueba nada. Es la comprobación más barata que existe y casi nadie la hace.

## 1. Tests que no prueban nada

### 1.1 Sin aserción

```python
# ✗ sólo verifica que no revienta
def test_place_order() -> None:
    use_case.execute(command)
```

A veces es intencional (verificar que no lanza), y entonces se escribe explícito con un comentario
de contrato o `pytest.raises` invertido. Casi siempre es un test a medio escribir.

### 1.2 Tautológica

```python
# ✗ compara el resultado consigo mismo
total = order.total()
assert total == order.total()

# ✗ recalcula la misma fórmula que el código bajo prueba
expected = sum(line.price * line.quantity for line in lines)
assert order.total().amount == expected
```

La segunda es la peligrosa: si la fórmula del código está mal, la del test lo está igual y el test
pasa. **El valor esperado se escribe a mano**, calculado por una persona: `assert order.total() ==
Money(Decimal("1800.00"), USD)`.

### 1.3 Verifica el mock

```python
# ✗ afirma sobre el test, no sobre el sistema
repo = Mock()
use_case = PlaceOrder(orders=repo, ...)
use_case.execute(command)
repo.save.assert_called_once()
```

Prueba que el caso de uso llamó a un método. No prueba que el pedido quedó guardado correctamente,
ni con qué datos, ni que las reglas se aplicaron. Con un fake se afirma sobre el estado resultante
(ver `unit-testing-domain` §4).

### 1.4 No se ejecuta

Un archivo que no empieza por `test_`, una función fuera de la convención, un `@pytest.mark.skip`
olvidado, un marcador filtrado en CI. La suite sale verde sin haberlo corrido.

```bash
pytest tests/unit/billing/test_invoice.py -v    # verlo pasar por su nombre
```

## 2. Tests acoplados a la implementación

Se reconocen porque **un refactor que no cambia el comportamiento rompe muchos tests**. Si eso
pasa, los tests están probando cómo, no qué.

| Acoplamiento | Arreglo |
|---|---|
| Aserciones sobre atributos privados | Afirmar sobre el comportamiento público |
| Verificar orden y número de llamadas | Afirmar sobre el resultado |
| Parchear funciones internas del módulo | Inyectar por puerto |
| Depender de la estructura interna de un `dict` de respuesta | Afirmar sobre los campos que importan |
| Un test por método privado | Probar el método público que los usa |

El síntoma inverso también importa: si puedes reescribir la implementación entera y todos los
tests siguen verdes **y siguen siendo significativos**, están al nivel correcto.

## 3. Tests flaky: las cuatro causas

Un test que falla de vez en cuando sin que nada cambie. Es el defecto más corrosivo: entrena al
equipo a reintentar en vez de mirar, y así los fallos reales pasan desapercibidos.

### 3.1 Tiempo

`datetime.now()` en el código o en el test, esperas fijas, pruebas que fallan al cruzar la
medianoche o en otra zona horaria, timeouts ajustados al límite.

**Arreglo:** puerto `Clock` con `FixedClock`; esperar por condición, nunca por tiempo.

### 3.2 Orden y estado compartido

Tests que dependen de lo que dejó el anterior, variables de módulo mutadas, una base de datos que
no se limpia, `dependency_overrides` sin limpiar.

**Arreglo:** cada test crea lo suyo; `pytest -p no:randomly --randomly-seed=...` o `pytest-random-order`
para detectarlo.

```bash
pytest -p randomly              # ejecutar en orden aleatorio: si falla, hay acoplamiento
```

### 3.3 Concurrencia y recursos

Puertos fijos que colisionan al paralelizar, archivos temporales con nombre fijo, la misma base de
datos compartida entre workers.

**Arreglo:** recursos únicos por test o por worker (`tmp_path`, puerto dinámico, base por worker).

### 3.4 Dependencias externas reales

Red, DNS, un servicio de terceros. Falla cuando falla algo ajeno.

**Arreglo:** servidor simulado; lo que necesite el servicio real va marcado `external` y fuera del
CI por defecto.

### Qué se hace con un flaky

1. **Se registra** como bug, no se ignora.
2. **Se marca** (`@pytest.mark.flaky` o cuarentena) para que deje de bloquear, pero **con tarjeta
   asociada y fecha**.
3. **Se arregla o se borra.** Un test en cuarentena permanente es un test muerto que además
   engaña.

**Reintentar hasta que pase nunca es el arreglo.**

## 4. La trampa del test que se "arregla"

Un test falla. Dos reacciones posibles, y sólo una es correcta:

```python
# ✗ el arreglo más común y el más dañino
- assert order.total() == Money(Decimal("1800.00"), USD)
+ assert order.total() == Money(Decimal("1850.00"), USD)
```

Antes de cambiar una aserción, hay que responder: **¿cambió el comportamiento a propósito?**

- **Sí, es un cambio deliberado** → se actualiza la aserción **y se actualiza la spec o el criterio
  de aceptación**. El test no es la fuente de verdad.
- **No** → el test está detectando un bug. Se arregla el código.

Cambiar el número esperado para que el test pase, sin saber cuál de los dos casos es, es el
mecanismo por el que una suite deja de proteger nada.

## 5. Legibilidad

Un test es también documentación: cuando falla en CI, alguien que no escribió el código tiene que
entender qué se rompió.

- **El nombre es una afirmación**: `test_confirm_fails_when_approval_is_required`.
- **Tres bloques visibles**: preparar, actuar, afirmar. Si hay dos "actuar", son dos tests.
- **Sin lógica en el test.** Un `if` o un `for` dentro significa que el test decide qué comprobar:
  se parametriza en su lugar.
- **Los datos relevantes, visibles.** Si el umbral es 10.000, ese número aparece en el test, no
  escondido en un builder.
- **El mensaje de fallo debe ser útil.** `assert result` no dice nada; `assert result == expected`
  muestra ambos valores.

## 6. Cuándo borrar un test

Borrar es legítimo y se hace poco:

- **Duplicado**: otro test cubre lo mismo más barato.
- **Prueba implementación** ya eliminada.
- **Comportamiento que ya no existe.**
- **Flaky que nunca atrapó nada** y lleva meses en cuarentena.
- **Test de un getter, de configuración estática o de código de terceros.**

Antes de borrar: **¿qué riesgo deja de cubrirse?** Si el riesgo sigue vivo, se cubre en el nivel
correcto antes de borrar.

Lo que no se borra nunca: un test que falla porque encontró un bug.

## 7. Revisar los tests de un PR

En este orden:

1. **¿Hay test de lo nuevo?** Si no, el PR está incompleto.
2. **¿Se ve el test fallar sin el cambio?** Conceptualmente: ¿qué cubre exactamente?
3. **¿Hay un caso de error, no sólo el feliz?**
4. **¿Las aserciones son sobre comportamiento** o sobre llamadas y detalles internos?
5. **¿El valor esperado está escrito a mano** o recalculado con la misma fórmula?
6. **¿El nivel es el correcto?** Un e2e donde bastaba un unitario.
7. **¿Hay `sleep`, orden implícito, datos compartidos?**

## 8. Reglas duras

- **Un test que sigue verde con el código roto no prueba nada.**
- **Los valores esperados se escriben a mano**, nunca se recalculan con la fórmula del código.
- **Se afirma sobre el resultado**, no sobre llamadas a mocks.
- **Cero `sleep` y cero esperas por tiempo.**
- **Ningún test depende del orden ni del estado de otro.**
- **Un flaky se registra y se arregla o se borra.** Reintentar no es arreglar.
- **Antes de cambiar una aserción hay que saber si el cambio de comportamiento fue deliberado.**
- **Sin lógica condicional dentro de un test**: se parametriza.
- **Un solo comportamiento por test.**
- **Si un refactor sin cambio de comportamiento rompe muchos tests**, los tests están mal.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué nivel merece cada prueba | `test-strategy` |
| Fakes en vez de mocks | `unit-testing-domain` |
| Aislamiento contra base de datos real | `integration-testing` |
| Estabilidad en el navegador | `e2e-playwright` |
| Builders y datos deterministas | `test-data` |
| La cobertura como síntoma | `coverage-and-risk` |
| Ejecutar y leer la salida | `verify-for-real` |
| Revisar el PR completo | `code-reviewer` |
