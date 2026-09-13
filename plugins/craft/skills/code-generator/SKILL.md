---
name: code-generator
description: Cómo se escribe código nuevo en Collie — leer el código vecino antes de escribir, seguir sus convenciones, nombrar con precisión, funciones cortas con un solo nivel de abstracción, el camino de error antes que el feliz, tipado completo, sin abstracciones especulativas, y qué NO generar (código muerto, capas vacías, manejo de errores decorativo). Cargar antes de escribir código nuevo, al crear un archivo o una función, al implementar una tarjeta, o al añadir algo a un módulo existente.
---

# Skill: code-generator

Cómo se escribe código nuevo aquí. `clean-architecture` dice dónde va; esta skill dice **cómo se
escribe** lo que va dentro.

> **La regla:** el código nuevo debe parecerse al código bueno que ya existe alrededor. Un
> archivo que se lee distinto al de al lado obliga a cambiar de idioma mental en cada salto, y
> eso cuesta más que cualquier ganancia de estilo personal.

## 1. Antes de escribir: leer

Tres lecturas, en orden. **No se salta ninguna.**

1. **El módulo donde vas a escribir.** Cómo se llaman las cosas, cómo se estructuran los casos de
   uso, cómo se manejan los errores, qué se testea y cómo.
2. **Algo equivalente ya resuelto.** Si vas a escribir un repositorio, lee otros dos. Si vas a
   escribir un router, lee tres. Las convenciones están ahí, no en la documentación.
3. **`CLAUDE.md` y el `README.md` del módulo.** Comandos, nivel de arquitectura, restricciones.

Y una comprobación que ahorra trabajo entero: **¿ya existe?** Un `grep` por el concepto antes de
escribir evita la tercera implementación de lo mismo. La duplicación silenciosa es más cara que
cualquier abstracción.

## 2. Nombrar

El nombre es la documentación que sí se mantiene. Es lo que más veces se lee y lo más barato de
corregir hoy.

| Regla | ✗ | ✓ |
|---|---|---|
| Revela intención | `data`, `info`, `temp`, `result` | `pending_orders`, `tax_rate` |
| Sin abreviar | `usr`, `qty`, `calc`, `mgr` | `user`, `quantity`, `calculate`, `manager` |
| Función = verbo | `invoice_total()` | `calculate_invoice_total()` |
| Booleano = afirmación | `flag`, `check` | `is_overdue`, `has_pending_lines` |
| Sin ruido de tipo | `order_list`, `user_dict` | `orders`, `users_by_id` |
| Sin negación doble | `if not is_not_valid` | `if is_valid` |
| Longitud ∝ alcance | `customer_identifier` en un `for` de 2 líneas | `c` en un `for` corto está bien |

**El nombre del adaptador lleva su tecnología** (`SqlOrderRepository`); el del puerto, jamás.

## 3. Funciones

- **Cortas.** Si pasa de ~20 líneas, casi siempre hace dos cosas.
- **Un solo nivel de abstracción por función.** No mezcles orquestar con calcular: o llama a tres
  funciones con nombre, o hace un cálculo, no ambas.
- **Pocos parámetros.** Más de tres suele significar que faltaba un value object o un comando.
- **Sin banderas booleanas.** `render(data, True)` no se entiende en la llamada. Dos funciones con
  nombre, o un enum.
- **Sin efectos secundarios ocultos.** Una función llamada `validate_order` que además guarda algo
  es una trampa para el siguiente.
- **Salida temprana.** Anidar tres `if` para el caso feliz es más difícil de leer que tres
  `return` de guarda.

```python
# ✓ guardas primero, el camino feliz sin anidar
def confirm(self, approved_by: UserId | None = None) -> None:
    if self._status is not OrderStatus.DRAFT:
        raise OrderAlreadyConfirmed(self._id)
    if self._requires_approval() and approved_by is None:
        raise ApprovalRequired(self._id, self.total())

    self._status = OrderStatus.CONFIRMED
```

## 4. El camino de error, primero

El camino feliz es el fácil y el que todo el mundo escribe. Lo que separa código sólido de código
frágil es lo otro.

Antes de dar por escrita una función, responde:

- ¿Qué pasa con la entrada vacía, `None`, la lista de cero elementos?
- ¿Qué pasa si el recurso no existe? ¿Y si existe duplicado?
- ¿Qué pasa si el servicio externo tarda, falla o devuelve algo inesperado?
- ¿Qué pasa si dos peticiones hacen esto a la vez?
- ¿Qué pasa si el valor es negativo, cero, o enorme?

Y las reglas al manejarlo:

- **Falla ruidoso y pronto.** Un error tragado se convierte en datos corruptos tres capas más
  allá.
- **Nunca `except: pass`**, ni `except Exception` sin relanzar o sin traducir.
- **Las excepciones llevan datos**, no sólo un mensaje: qué id, qué valor, qué esperaba.
- **Traduce en el borde del adaptador.** Ninguna excepción de librería cruza hacia el dominio.

## 5. Tipado

- **Todo tipado**: parámetros, retornos, atributos. `mypy` en modo estricto es el estándar.
- **Sin `Any`.** Si aparece, o falta un tipo o falta un value object.
- **`X | None` explícito**, nunca implícito por un default `None`.
- **Tipos del dominio en las firmas del dominio.** `OrderId`, no `str`.
- **Colecciones concretas en retornos** (`list[Order]`), abstractas en parámetros
  (`Iterable[Order]`) cuando de verdad da igual lo que llegue.

El tipado no es burocracia: es la mitad de la documentación y el único chequeo automático de que
las capas hablan el idioma correcto.

## 6. Qué NO generar

Lo que más ensucia un PR no es lo que falta: es lo que sobra.

| No generar | Por qué |
|---|---|
| Abstracciones "por si acaso" | Un puerto con un implementador que nunca se sustituye es ceremonia (ver `architecture-hybrid` §7.4) |
| Parámetros de configuración que nadie pasa | Código muerto con aspecto de flexibilidad |
| `try/except` que sólo relanza | Ruido; si no añade contexto ni traduce, sobra |
| Logging de cada línea | El log útil se ahoga en el log decorativo |
| Comentarios narrando el código | Ver `comment-discipline` |
| Código comentado, TODOs sin tarjeta | Ídem |
| Helpers genéricos de un solo uso | Se inlinea hasta que haya un segundo uso |
| Capas vacías por simetría | Un caso de uso que sólo reenvía |
| Reformateo de líneas que no tocabas | Entierra el cambio real en la revisión |

Y la regla que las resume: **no amplíes el alcance**. Lo que descubras de camino se registra
(`tech-debt`), no se arregla de paso (`scope-discipline`).

## 7. Cómo se construye una pieza nueva

Para una funcionalidad de nivel 3, en este orden:

1. **La entidad y sus invariantes**, con tests que no tocan infraestructura.
2. **El puerto**, definido desde lo que el caso de uso necesita, no desde lo que la base de datos
   ofrece.
3. **El caso de uso**, con fakes de los puertos. Aquí ya está la lógica probada.
4. **El adaptador real** y su mapper.
5. **El router, el schema y el cableado.**
6. **El test de integración** del adaptador y el de endpoint.

El orden importa: empezar por el router lleva a diseñar el dominio alrededor del JSON, y empezar
por la tabla lleva a diseñarlo alrededor de las columnas.

## 8. Antes de decir que está escrito

- ¿Corre? ¿Los tests pasan? (`verify-for-real`)
- ¿Hay test de lo nuevo, y de al menos un caso de error?
- ¿Algún nombre es peor de lo que podría ser?
- ¿Alguna función pasa de lo razonable o mezcla niveles?
- ¿Queda algún `Any`, `TODO`, `print`, código comentado o import sin usar?
- ¿El diff contiene sólo lo que la tarjeta pedía?

## 9. Reglas duras

- **Leer el código vecino antes de escribir**, y comprobar si ya existe.
- **Nombres completos y con intención.** Sin abreviaturas ni `data`/`info`/`temp`.
- **Funciones cortas, un nivel de abstracción, sin banderas booleanas.**
- **Guardas primero**; el camino feliz sin anidar.
- **Nunca tragar una excepción.** Ni `except: pass`, ni capturar sin traducir.
- **Tipado completo y sin `Any`.** `mypy` estricto.
- **Tipos del dominio en las firmas del dominio.**
- **Sin abstracciones especulativas ni capas vacías.**
- **Sin `print`**: logging estructurado (ver `observability`).
- **El diff contiene sólo lo que la tarjeta pedía.**
- **Todo en inglés**: símbolos, mensajes de error, docstrings.

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Dónde va cada archivo | `clean-architecture` · `project-structure` |
| Cuánta estructura merece el módulo | `architecture-hybrid` |
| Entidades, value objects, invariantes | `domain-modeling` |
| Cuándo comentar y cómo | `comment-discipline` |
| Revisar lo escrito | `code-reviewer` · `engineer-reviewer` |
| Escribir los tests | `unit-testing-domain` · `test-strategy` |
| `async def` y bloqueo | `async-discipline` |
| Forma de los errores en la API | `error-handling` |
| Registrar lo que se encuentra de camino | `tech-debt` |
