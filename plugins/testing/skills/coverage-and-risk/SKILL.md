---
name: coverage-and-risk
description: Priorizar pruebas por riesgo y no por porcentaje en Collie — por qué la cobertura es un síntoma y nunca una meta, cómo se identifica dónde duele que falle, el mapa de riesgo por módulo, qué cubrir siempre, cómo se lee un informe de cobertura buscando huecos peligrosos, y los efectos perversos de imponer un umbral. Cargar al decidir qué probar de una funcionalidad, al mirar un informe de cobertura, al discutir umbrales en CI, al priorizar trabajo de testing, o al justificar por qué algo no está cubierto.
---

# Skill: coverage-and-risk

Cómo se decide qué probar cuando no se puede probar todo. La respuesta no es un porcentaje.

> **La regla:** la cobertura mide qué líneas se **ejecutaron**, no qué comportamiento se
> **verificó**. Es útil para encontrar huecos; es dañina como objetivo.

## 1. Por qué el porcentaje engaña

```python
def test_place_order_does_not_explode() -> None:
    use_case.execute(command)      # sin una sola aserción
```

Este test cubre el caso de uso entero, sus entidades y su repositorio. Sube la cobertura varios
puntos y **no verifica absolutamente nada**.

La cobertura no sabe distinguir entre una línea ejecutada y una línea cuyo resultado se comprobó.
Por eso un 90% puede ser una suite sólida o un decorado.

### Lo que sí dice

Un dato de cobertura tiene un uso legítimo y sólo uno: **encontrar lo que no se ha ejecutado
nunca**. Un 0% en un módulo de facturación es información valiosa e inmediata. El 87% global, no.

Se lee **por módulo y buscando huecos**, jamás como una nota agregada.

## 2. Los efectos perversos de un umbral

Imponer "mínimo 80% o CI falla" produce, de forma predecible:

- **Tests escritos para cubrir líneas**, sin aserciones significativas.
- **Cobertura donde es fácil** (getters, configuración) en vez de donde importa.
- **`# pragma: no cover`** repartido para hacer pasar el build.
- **Resistencia a borrar tests inútiles**, porque baja el número.
- **Falsa sensación de seguridad** en dirección: "estamos al 85%".

Por eso en Collie **no hay umbral global obligatorio**. Lo que sí hay:

- **Cobertura visible** en el informe de CI, para poder mirarla.
- **Un mínimo alto en los módulos de riesgo alto**, decidido por módulo y justificado.
- **Y la regla que de verdad importa**: toda regla de negocio y todo bug arreglado tienen test.

## 3. El mapa de riesgo

Se construye una vez por módulo y se revisa cuando cambia algo importante. Riesgo = **impacto × 
probabilidad**.

| Factor de impacto | Pregunta |
|---|---|
| Dinero | ¿Un error cuesta dinero directamente? |
| Datos | ¿Puede corromper o exponer datos? |
| Irreversibilidad | ¿Se puede deshacer si sale mal? |
| Alcance | ¿Afecta a un usuario o a todos? |
| Detección | ¿Nos enteraríamos enseguida o en tres meses? |

| Factor de probabilidad | Pregunta |
|---|---|
| Complejidad | ¿Cuántas ramas y estados tiene? |
| Volatilidad | ¿Cuántas veces se ha tocado este año? |
| Acoplamiento | ¿Cuántas cosas dependen de esto? |
| Familiaridad | ¿Lo entiende más de una persona? |
| Historial | ¿Ya ha fallado antes? |

**Lo que fue bug una vez vuelve a serlo.** El historial de incidencias es el mejor predictor
disponible, y el menos consultado.

### El resultado

| Riesgo | Qué exige |
|---|---|
| **Alto** | Cobertura exhaustiva de reglas y bordes, tests de contrato, casos de error, revisión de otra persona |
| **Medio** | Camino feliz, bordes principales, errores esperables |
| **Bajo** | Camino feliz y poco más |

Cálculo de dinero o impuestos: alto, siempre. Un CRUD de catálogo que nadie toca: bajo, y está
bien.

## 4. Lo que se cubre siempre

Independientemente del riesgo del módulo:

- **Toda regla de negocio**, con el caso que la cumple y el que la viola.
- **Todo bug arreglado**, con el test que lo reproduce. Sin excepción.
- **Todo cálculo de dinero, impuestos, stock, plazos o cantidades.**
- **Toda comprobación de permisos.**
- **Todo puerto**, con su batería de contrato.
- **Todo límite y transición de estado** (de borrador a confirmado, etc.).
- **Toda migración**, aplicada y revertida.

Esta lista no se negocia por falta de tiempo. Es más corta que "todo" precisamente para que sea
cumplible.

## 5. Cómo se lee un informe

```bash
pytest --cov=src --cov-report=term-missing --cov-report=html
```

Lo que se busca, en este orden:

1. **Módulos de riesgo alto con cobertura baja.** Es la única señal realmente accionable.
2. **Ramas no cubiertas** (`--cov-branch`): un `if` cuyo `else` nunca se ejecuta suele ser el
   camino de error, que es justo el que falla en producción.
3. **Excepciones nunca lanzadas en tests.** Si un `raise` no se cubre, ese error no se ha probado
   nunca.
4. **Archivos al 100% sin aserciones reales.** Sospechoso: mirar los tests, no el número.

Lo que **no** se hace: perseguir el porcentaje global hacia arriba.

## 6. Cuándo está bien no cubrir

Decir "esto no lo cubro" es legítimo si se dice **por qué**:

- Código de arranque y cableado trivial, verificado al ejecutar la app.
- Adaptadores de un servicio externo cuya única lógica es traducir, cubiertos por el test de
  contrato.
- Un módulo de bajo riesgo y estable.
- Código que se va a eliminar en breve (con su tarjeta).

Lo que no vale como motivo: "no tuve tiempo" en algo de la lista del §4.

## 7. Testing mutante, cuando importa de verdad

Para los módulos de riesgo más alto, hay una forma de medir si los tests **verifican** en vez de
sólo ejecutar: alterar el código a propósito y ver si algún test se pone rojo.

```bash
mutmut run --paths-to-mutate src/modules/billing/domain
```

Cada mutante que **sobrevive** es una línea que se ejecuta sin que nada compruebe su resultado. Es
caro de ejecutar, así que se reserva para el núcleo crítico — pero un solo pase revela más sobre
la calidad de una suite que cualquier porcentaje.

La versión barata y manual, que sí se hace siempre: **rompe la línea a propósito y mira si el test
falla** (ver `test-quality` §0).

## 8. Priorizar cuando no da tiempo

Con tiempo limitado, el orden es:

1. **Lo de la lista del §4** que falte.
2. **El módulo de riesgo más alto con menos cobertura.**
3. **Las ramas de error** no cubiertas en código de riesgo alto.
4. **Lo que más ha cambiado** este trimestre.
5. El resto.

Escribir veinte tests de un módulo de bajo riesgo mientras el cálculo de impuestos sigue sin
cubrir es trabajo que se siente productivo y no reduce riesgo.

## 9. Reglas duras

- **La cobertura es un síntoma, nunca una meta.**
- **Sin umbral global obligatorio**; sí un mínimo justificado en módulos de riesgo alto.
- **Se lee por módulo y buscando huecos**, no como nota agregada.
- **Toda regla de negocio y todo bug arreglado llevan test.** No se negocia.
- **Las ramas de error se cubren antes que las líneas fáciles.**
- **Un `# pragma: no cover` lleva justificación.**
- **Un archivo al 100% sin aserciones reales es peor que uno al 40% bien probado.**
- **El historial de incidencias marca dónde volver a probar.**
- **Se prioriza por riesgo**, no por lo que es cómodo de cubrir.
- **Decir "esto no lo cubro" es válido si se dice por qué.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué nivel merece cada prueba | `test-strategy` |
| Tests que ejecutan sin verificar | `test-quality` |
| Probar reglas de negocio | `unit-testing-domain` |
| Contratos de puertos | `contract-testing` |
| Qué merece navegador | `e2e-scope` |
| Riesgo declarado de la tarjeta | `definition-of-ready` |
| Evidencia exigida al cerrar | `definition-of-done` |
| Informes y umbrales en el pipeline | `local-dev-and-ci` |
