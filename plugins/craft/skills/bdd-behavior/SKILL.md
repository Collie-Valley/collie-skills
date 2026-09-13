---
name: bdd-behavior
description: Escribir comportamiento en Gherkin en Collie — escenarios desde el punto de vista del usuario y no del código, un Given que declara estado real, escenarios independientes y sin pasos de interfaz, el lenguaje ubicuo compartido con el dominio, Scenario Outline para variantes, y los anti-patrones que convierten Gherkin en un script de clicks. Cargar al escribir o revisar escenarios, al traducir criterios de aceptación a comportamiento, al definir una funcionalidad con reglas de negocio, o al encontrar features ilegibles o frágiles.
---

# Skill: bdd-behavior

Cómo se escribe el comportamiento como contrato legible. La ejecución de estos escenarios vive en
`bdd-automation`; aquí está **cómo se redactan**.

> **La regla:** un escenario describe **qué hace el sistema para alguien**, nunca cómo se usa la
> interfaz ni cómo está implementado. Si menciona un botón, una URL o una tabla, está mal escrito.

## 1. Para qué sirve de verdad

Gherkin no existe para que los tests sean bonitos. Existe por tres razones concretas:

1. **Un lenguaje común.** Quien pide el trabajo y quien lo construye leen la misma frase y
   entienden lo mismo. Es donde se descubren los malentendidos, antes de escribir código.
2. **Una especificación que se ejecuta.** Un documento se pudre en silencio; un escenario
   desactualizado **falla** y alguien se entera.
3. **El registro de por qué el sistema hace lo que hace.** Un escenario explica la intención mucho
   mejor que el test unitario que la verifica.

Si los escenarios los escribe y los lee sólo quien programa, se ha perdido la razón 1 — y entonces
un test normal habría bastado.

## 2. La estructura

```gherkin
Feature: Volume discount on orders
  Wholesale customers get a discount when a single order is large enough,
  so the sales team does not have to apply it by hand.

  Background:
    Given a wholesale customer "Acme"

  Scenario: An order above the threshold gets the discount
    Given a price list where "Widget" costs 10.00 USD
    When "Acme" places an order of 200 "Widget"
    Then the order total is 1800.00 USD
    And the order shows a volume discount of 200.00 USD

  Scenario: An order below the threshold is charged in full
    Given a price list where "Widget" costs 10.00 USD
    When "Acme" places an order of 50 "Widget"
    Then the order total is 500.00 USD
    And the order shows no discount
```

- **`Feature`** lleva una o dos líneas de **por qué existe**, no una repetición del título.
- **`Background`** sólo para lo que comparten **todos** los escenarios, y corto. Un `Background`
  largo obliga a subir y bajar para entender cualquier escenario.
- **`Scenario`** con un título que describe el caso, no el mecanismo:
  `Scenario: An order above the threshold gets the discount`, no `Scenario: Test discount 200`.

### Given · When · Then

| Paso | Qué es | Regla |
|---|---|---|
| **Given** | El estado que existe antes | En pasado o como hecho. Nada de acciones |
| **When** | **La** acción que se está probando | **Una sola**. Si hay dos, son dos escenarios |
| **Then** | El resultado observable | Lo que cambió, no cómo se ve |

El error más frecuente es un `When` con tres acciones: entonces el escenario prueba tres cosas y,
cuando falla, no se sabe cuál.

## 3. Desde el usuario, no desde el código

Esta es la diferencia entre BDD que sirve y BDD que estorba.

```gherkin
# ✗ un script de clicks: describe la interfaz, no el comportamiento
Scenario: Discount
  Given I open "/login"
  And I fill "email" with "acme@example.com"
  And I click "#submit"
  And I navigate to "/orders/new"
  And I select "Widget" from the dropdown
  And I type "200" in the "quantity" input
  And I click the "Save" button
  Then I see "1800.00" in the element ".total"
```

Cuatro problemas: rediseñar la pantalla rompe el escenario sin que el comportamiento cambie; nadie
de negocio lo entiende; no dice qué regla se está verificando; y sólo se puede ejecutar por
navegador, así que tarda segundos en vez de milisegundos.

```gherkin
# ✓ el comportamiento, sin interfaz
Scenario: An order above the threshold gets the discount
  Given a wholesale customer "Acme"
  And a price list where "Widget" costs 10.00 USD
  When "Acme" places an order of 200 "Widget"
  Then the order total is 1800.00 USD
```

Este escenario sobrevive a un rediseño completo del frontend, se entiende sin saber programar, y
se puede ejecutar contra el caso de uso en milisegundos.

**La prueba:** si el escenario deja de ser cierto cuando alguien mueve un botón, está escrito al
nivel equivocado.

## 4. El lenguaje ubicuo

Los términos de los escenarios son **los mismos** que los del dominio y los de negocio. Si en el
código hay `Order`, `PriceList` y `VolumeDiscount`, el escenario dice *order*, *price list* y
*volume discount* — no *pedido*, no *carrito*, no *promo*.

Cuando negocio y código usan palabras distintas para lo mismo, el escenario es donde se detecta, y
el arreglo es **cambiar el código**, no traducir en los pasos. Un glosario que hay que consultar
para leer un escenario significa que el dominio está mal nombrado.

Los escenarios se escriben **en inglés**, como el código, para que la palabra del escenario sea
literalmente la clase del dominio.

## 5. Escenarios independientes

Cada uno se ejecuta solo, en cualquier orden, y crea lo que necesita.

```gherkin
# ✗ el segundo depende del primero: si cambia el orden, o el primero falla, todo cae
Scenario: A customer is created
  When I create the customer "Acme"
  Then the customer exists

Scenario: The customer places an order
  When "Acme" places an order of 10 "Widget"
```

El segundo debe declarar su `Given a wholesale customer "Acme"`. La repetición aquí es correcta:
la independencia vale más que la brevedad.

## 6. Datos: sólo los que importan

En un escenario sólo aparece lo que la regla usa. Todo lo demás lo pone el builder por defecto
(ver `test-data`).

```gherkin
# ✗ ruido: el país, el teléfono y la fecha no intervienen en el descuento
Given a customer with name "Acme", tax id "20123456789", country "PE",
  phone "+51999888777", created on "2026-01-15", segment "wholesale"

# ✓ sólo lo que la regla necesita
Given a wholesale customer "Acme"
```

El dato irrelevante es peor que ruido: hace creer que influye en la regla.

### `Scenario Outline` para variantes de la misma regla

```gherkin
Scenario Outline: Volume discount by quantity bracket
  Given a wholesale customer "Acme"
  And a price list where "Widget" costs 10.00 USD
  When "Acme" places an order of <quantity> "Widget"
  Then the order total is <total> USD

  Examples:
    | quantity | total   |
    | 49       | 490.00  |
    | 50       | 475.00  |
    | 199      | 1890.50 |
    | 200      | 1800.00 |
```

Los valores elegidos son **los bordes**: justo debajo y justo encima de cada tramo. Ahí viven los
bugs.

Lo que **no** se hace: usar `Scenario Outline` para meter casos que no son la misma regla. Si una
fila necesita un `Then` distinto, es otro escenario.

## 7. Cuántos escenarios

Los escenarios cubren **las reglas de negocio**, no todas las combinaciones posibles.

| Sí | No |
|---|---|
| Cada regla de negocio, con su caso feliz | Cada combinación de campos |
| Los bordes de cada regla | Validaciones de formato (`email` mal escrito) |
| Los casos de error que el negocio define | Errores técnicos (timeout, 500) |
| Lo que alguien de negocio reconocería | Detalles internos de implementación |

La validación de forma y los casos técnicos se prueban en tests unitarios o de integración, que
son más baratos y más precisos. **Un feature con cuarenta escenarios casi siempre está probando
cosas que no son comportamiento de negocio.**

## 8. Anti-patrones

| Anti-patrón | Por qué es malo |
|---|---|
| Pasos de interfaz (`I click`, `I see`) | Frágil, ilegible para negocio, lento |
| `When` con varias acciones | Al fallar, no se sabe cuál |
| `Then` que comprueba estado interno (`the table has a row`) | Acopla a la implementación |
| Escenarios dependientes entre sí | Rompen en cascada y por orden |
| `Background` largo | Hay que leer dos sitios para entender uno |
| Datos irrelevantes en el `Given` | Sugieren que influyen |
| Un escenario por combinación de datos | Ruido que esconde las reglas |
| Pasos con lógica dentro (`And if the customer is...`) | El escenario es declarativo, no un programa |
| Escenarios escritos después del código | Describen lo que se hizo, no lo que se quería |

## 9. Reglas duras

- **El escenario describe comportamiento, nunca interfaz ni implementación.**
- **Un solo `When` por escenario.**
- **Cada escenario es independiente** y crea su propio estado.
- **Los términos son los del dominio**, y en inglés.
- **En el `Given` sólo lo que la regla usa.**
- **`Scenario Outline` para variantes de la misma regla**, con los bordes como ejemplos.
- **Los escenarios se escriben antes del código.**
- **Se cubren reglas de negocio**, no validaciones de formato ni errores técnicos.
- **Nada de pasos con lógica condicional dentro.**
- **Si nadie de negocio lo entiende, está mal escrito.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Ejecutar los escenarios (`pytest-bdd`, Playwright) | `bdd-automation` |
| La spec de la que derivan | `spec-driven-development` |
| Criterios de aceptación verificables | `acceptance-criteria` |
| Qué nivel de test merece cada cosa | `test-strategy` |
| Builders y datos por defecto | `test-data` |
| Qué recorridos merecen navegador | `e2e-scope` |
| Nombres del dominio | `domain-modeling` |
