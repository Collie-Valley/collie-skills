---
name: spec-driven-development
description: La especificación como fuente de verdad en Collie — escribir la spec antes que el código, la cadena spec → escenarios → casos de uso → implementación, qué contiene una spec y qué no, qué hacer cuando el código y la spec discrepan, cómo se mantiene viva en vez de pudrirse, y la diferencia entre spec, criterios de aceptación y documentación. Cargar al empezar una funcionalidad, al recibir un encargo que hay que definir, antes de escribir código de algo no trivial, al encontrar una spec desactualizada, o al discutir si el comportamiento actual es el correcto.
---

# Skill: spec-driven-development

Escribir qué debe hacer el sistema **antes** de escribirlo, y mantener esa especificación como la
fuente de verdad.

> **La regla:** cuando el código y la spec discrepan, **gana la spec** — o se cambia la spec
> explícitamente, con alguien decidiéndolo. Lo que no vale es que el código se convierta en la
> especificación por el mero hecho de existir.

## 1. Qué es y qué no

**No es** documentación escrita después, ni un documento de cincuenta páginas, ni un contrato
burocrático que congela el diseño.

**Es** el enunciado de comportamiento observable que se acuerda antes de construir, lo bastante
preciso para que dos personas lo implementen igual, y lo bastante corto para que alguien lo lea.

| | Spec | Criterios de aceptación | Documentación |
|---|---|---|---|
| Cuándo | Antes de construir | Antes de construir | Después |
| Qué describe | El comportamiento completo | Lo que hay que demostrar | Cómo se usa lo construido |
| Audiencia | Quien construye y quien pide | Quien verifica | Quien consume |
| Vive en | `docs/specs/` o la tarjeta | La tarjeta | README, OpenAPI |

Los criterios de aceptación son un **subconjunto verificable** de la spec: lo que se va a
demostrar. La spec cubre además los casos que no se van a testear uno a uno pero deben quedar
definidos.

## 2. Por qué antes y no después

Escribir la spec obliga a descubrir en minutos lo que el código descubre en días: qué pasa si la
lista está vacía, qué se hace con el duplicado, quién puede hacer esto, qué ocurre si se pide dos
veces.

Ese descubrimiento **va a ocurrir igual**. La única decisión es si ocurre cuando cuesta una
conversación o cuando ya hay código, tests y una migración que rehacer.

Y hay un segundo efecto: la spec es el único artefacto que permite **verificar sin ambigüedad**.
Sin ella, "funciona" significa "hace lo que el autor entendió".

## 3. Qué contiene una spec

Seis secciones. Para una funcionalidad normal, cabe en una página.

```markdown
# Export orders to CSV

## Purpose
Finance reconciles orders against the ERP by hand every Monday (~300 rows).

## Scope
Export the orders matching the active filter, from the orders view.

## Out of scope
Scheduled exports, other formats, exporting from other views.

## Behaviour
- The export includes every order matching the active filter, cancelled ones included.
- Columns: order id, customer, status, placed_at, total, currency.
- Amounts are decimal strings with the currency's own precision.
- The file is UTF-8 with BOM (the ERP rejects it otherwise).
- Rows are ordered by placed_at, newest first.

## Edge cases
- No matching orders → a file with only the header row, not an error.
- More than 50.000 orders → rejected with a message asking to narrow the filter.
- An order without a customer (imported legacy data) → the customer column is empty.

## Open questions
- Does the ERP accept commas as separators, or does it need semicolons?
  Assumption: commas, since the import is configured as CSV.
```

- **Comportamiento observable**, no implementación. La spec no dice qué clase se crea.
- **Los casos límite son la mitad del valor.** Es donde vive la ambigüedad.
- **Las preguntas abiertas se escriben con el supuesto tomado** (ver `ask-well`), no se esconden.
- **El fuera-de-alcance es parte de la spec**, no un añadido.

## 4. La cadena

La spec no es un documento aislado: es el primer eslabón de una cadena en la que cada paso deriva
del anterior.

```
   Spec                    qué debe hacer el sistema
     ↓
   Escenarios (Gherkin)    el comportamiento, ejecutable        → bdd-behavior
     ↓
   Casos de uso            la operación, en código              → clean-architecture
     ↓
   Implementación          entidades, puertos, adaptadores
     ↓
   Verificación            los escenarios corren y pasan        → bdd-automation
```

La propiedad importante: **se puede recorrer hacia atrás**. Ante cualquier línea de código se
puede preguntar de qué caso de uso viene, de qué escenario, y de qué línea de la spec. Lo que no
se puede rastrear hasta la spec es código que nadie pidió.

## 5. Cuándo el código y la spec discrepan

Tres casos, y se distinguen **antes** de tocar nada:

### 5.1 El código está mal → es un bug

La spec dice lo correcto y el código no lo cumple. Se arregla el código.

### 5.2 La spec está desactualizada → se actualiza explícitamente

El comportamiento cambió a propósito y nadie tocó la spec. Se actualiza **y se dice que se
actualiza**, con quién lo decidió. No se corrige en silencio: alguien puede estar dependiendo de
lo que decía.

### 5.3 La spec estaba mal → se corrige y se reevalúa

Lo que se especificó no era lo que hacía falta. Se corrige la spec, y **se revisa qué código
construido sobre ella hay que cambiar**. Es el caso más caro y el que justifica escribirla con
cuidado.

**Lo que nunca se hace:** ajustar la spec para que describa lo que el código ya hace, sin que nadie
decida que ese comportamiento es el correcto. Eso convierte cualquier bug en una funcionalidad por
el simple hecho de existir.

## 6. Mantenerla viva

Una spec desactualizada es peor que ninguna: se lee con confianza y miente.

- **La spec se actualiza en el mismo PR** que cambia el comportamiento. No en uno posterior.
- **Vive cerca del código**, en `docs/specs/` del repositorio, no en una herramienta aparte que
  nadie abre.
- **Si sus escenarios son ejecutables**, se desactualiza mucho menos: un escenario que ya no
  refleja el sistema **falla** (ver `bdd-automation`). Ésa es la mejor defensa disponible.
- **Lo que ya no es cierto se borra.** Una spec no es un registro histórico; para eso está git.

## 7. Proporcionalidad

No todo lleva spec escrita:

| Trabajo | Spec |
|---|---|
| Funcionalidad nueva con reglas de negocio | Sí, completa |
| Cambio de comportamiento observable | Sí, actualizar la existente |
| Integración con un sistema externo | Sí, sobre todo los casos límite |
| Bug | No. La spec ya existía; el bug es que no se cumple |
| Refactor | No. Por definición no cambia el comportamiento |
| Cambio de texto, estilo, orden visual | No |
| Spike | No: su producto es una respuesta, no un comportamiento |

Cuando no hay spec escrita, **los criterios de aceptación de la tarjeta hacen ese papel**. Lo que
nunca hay es cero de ambos.

## 8. Reglas duras

- **La spec se escribe antes que el código**, no después.
- **Describe comportamiento observable**, nunca implementación.
- **Los casos límite son obligatorios**; son la mitad del valor.
- **El fuera-de-alcance forma parte de la spec.**
- **Las preguntas abiertas se escriben, con el supuesto que se tomó.**
- **Si el código y la spec discrepan, gana la spec** — o se cambia la spec con alguien
  decidiéndolo.
- **Nunca se reescribe la spec para describir lo que el código hace**, sin decisión explícita.
- **La spec se actualiza en el mismo PR que cambia el comportamiento.**
- **Vive en el repositorio**, junto al código.
- **Todo el código debe poder rastrearse hasta una línea de la spec o un criterio.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Escenarios en Gherkin | `bdd-behavior` |
| Ejecutar esos escenarios | `bdd-automation` |
| Criterios verificables | `acceptance-criteria` |
| Qué debe estar definido para empezar | `definition-of-ready` |
| Demostrar que la spec se cumple | `definition-of-done` |
| Decisiones técnicas y ADRs | `technical-design` |
| Supuestos y preguntas abiertas | `ask-well` |
| El contrato público de la API | `api-contracts` |
