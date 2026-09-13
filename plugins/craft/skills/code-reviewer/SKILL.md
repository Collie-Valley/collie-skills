---
name: code-reviewer
description: Revisión de corrección del código en Collie — el orden de lectura de un diff, el catálogo de defectos que se buscan (casos límite, errores tragados, concurrencia, transacciones, N+1, fugas de datos, tests que no prueban), cómo se escribe un hallazgo con escenario de fallo concreto, la escala de severidad, y qué NO es materia de revisión. Cargar al revisar un PR o un diff, al revisar el propio trabajo antes de entregarlo, o al recibir una revisión que hay que interpretar.
---

# Skill: code-reviewer

Revisión de **corrección**: buscar lo que está mal, no lo que es distinto. La revisión de altitud
—si el diseño resuelve el problema correcto— vive en `engineer-reviewer`.

> **La regla:** un hallazgo se sostiene con un **escenario de fallo concreto**: qué entrada, qué
> estado, qué resultado erróneo. Sin eso es una opinión, y las opiniones en una revisión gastan
> el crédito que necesitas para los hallazgos reales.

## 1. El orden de lectura

Leer el diff de arriba abajo es el peor método: se juzgan líneas sin saber qué intentan hacer.

1. **La tarjeta**: qué se pedía, alcance y no-alcance, criterios de aceptación.
2. **La descripción del PR**: qué dice el autor que hizo y qué dejó fuera.
3. **Los tests**: dicen qué comportamiento se consideró importante, y su ausencia dice más.
4. **El dominio y los casos de uso**: ahí están las reglas y los errores caros.
5. **Los adaptadores y el borde.**
6. **Migraciones y configuración**, al final, con atención especial: es lo irreversible.

Y una pregunta antes de empezar: **¿el diff hace sólo lo que la tarjeta pedía?** Lo que sobra es
tan revisable como lo que falta.

## 2. El catálogo de defectos

Lo que se busca, por orden de frecuencia real.

### 2.1 Casos límite no cubiertos

Lista vacía, `None`, cero, negativo, valor enorme, cadena vacía, duplicado, fecha límite, zona
horaria. **La colección vacía es el bug más frecuente de todos**: un `max()`, un `[0]` o una
división entre `len()` sobre algo vacío.

### 2.2 Errores tragados o mal traducidos

```python
# ✗ el fallo desaparece y el flujo continúa con datos incompletos
try:
    stock = self._stock.reserve(lines)
except Exception:
    stock = None
```

También: capturar y loguear sin relanzar, capturar `Exception` donde se esperaba uno concreto, y
dejar escapar excepciones de librería hacia el dominio.

### 2.3 Transacciones y atomicidad

Dos escrituras que deben ocurrir juntas y no comparten transacción. Un `commit` dentro de un
repositorio. Un efecto externo (correo, webhook) disparado **antes** del commit: si la transacción
revierte, el correo ya salió.

### 2.4 Concurrencia

Dos peticiones simultáneas sobre el mismo registro: leer-modificar-escribir sin bloqueo ni
versión. Comprobar-y-luego-actuar (`if not exists: create`) sin restricción única detrás. Estado
mutable compartido entre peticiones (un singleton con un `dict` que se muta).

### 2.5 Consultas y rendimiento

N+1 (un `for` que consulta dentro), consulta sin índice sobre tabla grande, `SELECT` de todo para
contar, paginación ausente en un listado que crecerá, carga perezosa que se dispara al serializar.

### 2.6 Fuga de datos

Un modelo ORM devuelto por la API, un schema con campos de más, un log que imprime el objeto
entero con tokens o datos personales, un mensaje de error que revela si un usuario existe.

### 2.7 Autorización

El permiso comprobado en el cliente y no en el servidor. Un endpoint que verifica que el usuario
está autenticado pero no que el recurso sea suyo (**autorización a nivel de objeto**: el fallo de
seguridad más común en APIs). Un identificador de la petición usado sin validar pertenencia.

### 2.8 Tests que no prueban

Un test que afirma sobre el mock en vez de sobre el resultado. Aserciones tautológicas
(`assert result == result`). Un test sin `assert`. Un fake más permisivo que el real. Tests
acoplados al orden. `sleep()` en vez de espera por condición.

### 2.9 La arquitectura, mecánicamente

Imports prohibidos en `domain/`, `Session` en la firma de un router, lógica de negocio en el
borde, modelo ORM cruzando capas. Buena parte lo atrapa `lint-imports`; lo que no, se mira aquí.

### 2.10 Restos

`print`, `breakpoint`, credenciales, URLs de desarrollo, código comentado, TODOs sin tarjeta,
imports sin usar, `Any` innecesario.

## 3. Cómo se escribe un hallazgo

Cuatro partes. La tercera es la que lo hace accionable y la que más se omite.

```
[Alta] El listado revienta cuando el cliente no tiene pedidos.

src/modules/billing/application/use_cases/list_invoices.py:34
`max(invoice.issued_at for invoice in invoices)` sobre una lista vacía.

Escenario: GET /customers/{id}/invoices para un cliente recién creado
→ ValueError: max() arg is an empty sequence → 500.

Sugerencia: `if not invoices: return InvoiceSummary.empty()` antes del cálculo,
y un test con un cliente sin facturas.
```

- **Severidad** declarada.
- **Ubicación** exacta, `archivo:línea`.
- **Escenario de fallo concreto**: entrada, estado, resultado. Sin esto, no es un hallazgo.
- **Sugerencia**, no una orden. Quien escribió el código conoce contexto que el revisor no tiene.

## 4. Severidad

| Nivel | Qué es | Qué implica |
|---|---|---|
| **Crítica** | Pérdida o exposición de datos, fallo de autorización, corrupción, caída | Bloquea la entrega. Se arregla antes de seguir |
| **Alta** | Bug que un usuario encontrará, caso límite roto, transacción no atómica | Bloquea la entrega |
| **Media** | Funciona, pero fallará al crecer o al cambiar: N+1, falta un test, error mal traducido | Se arregla ahora o se registra como tarjeta con acuerdo explícito |
| **Baja** | Mejora real pero no urgente | Sugerencia; el autor decide |
| **Nota** | Preferencia, curiosidad, alternativa | Se marca como opcional, o no se escribe |

**Si todo es alta, nada es alta.** La escala sólo funciona si se usa con honestidad: una revisión
con doce "críticas" se lee como ruido y se ignora entera.

## 5. Qué NO es materia de revisión

| No revisar | Por qué |
|---|---|
| Formato, comillas, longitud de línea | Lo decide `ruff`. Si no lo decide, se configura |
| Preferencias de estilo equivalentes | Comprensión de lista vs. `for` sin diferencia real |
| Reescribir a "como lo haría yo" | Distinto no es peor |
| Rediseñar la solución entera en comentarios | Si el enfoque está mal, eso es `engineer-reviewer` y es una conversación, no veinte comentarios |
| Código que el diff no toca | Si ves algo, va a `tech-debt`, no a este PR |

El corolario: **una revisión sin hallazgos es un resultado válido**. Buscar algo que decir para
justificar la revisión produce ruido y entrena al autor a ignorarte.

## 6. El tono

- **Sobre el código, nunca sobre la persona.** "Esta función no maneja la lista vacía", no "no
  pensaste en".
- **Pregunta cuando no sepas.** "¿Qué pasa aquí si llegan dos peticiones a la vez?" suele ser más
  eficaz que una afirmación equivocada, y no cuesta crédito si estabas en lo cierto.
- **Reconoce lo bueno cuando lo haya**, brevemente y sólo si es real.
- **Separa lo bloqueante de lo opcional** de forma explícita. El autor necesita saber qué le
  impide entregar.

## 7. Revisar el propio trabajo

Antes de pedir revisión, la misma pasada sobre el propio diff, **leyéndolo entero en la interfaz
de revisión** y no en el editor: el cambio de contexto hace ver cosas que el editor esconde.

El propio autor tiene una ventaja que nadie más: sabe qué partes le costaron y cuáles hizo
deprisa. Esas son las que hay que releer.

Y la trampa: la autorrevisión **no sustituye** la revisión ajena en riesgo alto. Detalle en
`definition-of-done` §5.

## 8. Reglas duras

- **Sin escenario de fallo concreto, no es un hallazgo.**
- **Cada hallazgo lleva severidad y ubicación exacta.**
- **Los tests se leen antes que el código.**
- **El formato no se revisa a mano**: lo decide el linter.
- **Ningún hallazgo sobre código que el diff no toca**; eso es una tarjeta.
- **Se distingue explícitamente lo bloqueante de lo opcional.**
- **Cero hallazgos es un resultado válido.**
- **Migraciones y configuración se revisan siempre**, aunque el diff sea pequeño.
- **Autorización a nivel de objeto se verifica en todo endpoint** que reciba un identificador.
- **La revisión no rediseña**: si el enfoque está mal, es una conversación aparte.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| ¿Resuelve el problema correcto? ¿Está al nivel adecuado? | `engineer-reviewer` |
| Pasada de seguridad al diff | `security-diff-review` |
| Cómo se escribe el código que se revisa | `code-generator` |
| Comentarios obsoletos o de más | `comment-discipline` |
| Tests que no prueban nada | `test-quality` |
| Registrar lo que se ve fuera del diff | `tech-debt` |
| La checklist de entrega | `definition-of-done` |
| Commits y descripción del PR | `git-discipline` |
