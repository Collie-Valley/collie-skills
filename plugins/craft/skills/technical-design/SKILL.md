---
name: technical-design
description: Decidir y registrar el diseño técnico en Collie — cuándo una decisión merece escribirse, el formato ADR corto (contexto, opciones con trade-offs, decisión, consecuencias), cómo se evalúan alternativas sin teatro, la reversibilidad como criterio de cuánto pensar, y qué hacer cuando una decisión registrada deja de valer. Cargar antes de elegir una tecnología, un patrón o un límite de módulo, al tomar una decisión difícil de revertir, al escribir un ADR, o al encontrar una decisión que nadie sabe por qué se tomó.
---

# Skill: technical-design

Cómo se decide antes de construir, y cómo queda registrado.

> **La regla:** una decisión que alguien va a cuestionar en seis meses se escribe **cuando se
> toma**. Reconstruir el porqué después es imposible: lo que queda es el código, que dice qué se
> hizo pero nunca por qué se descartó lo otro.

## 1. Qué merece registrarse

No todo. El criterio es **coste de cambiarla después**:

| Se registra | No se registra |
|---|---|
| Elegir una tecnología o un proveedor | El nombre de una variable |
| Trazar el límite de un módulo o un agregado | Cómo se estructura una función |
| El nivel de arquitectura de un módulo | Qué patrón usar dentro de un caso de uso |
| Un contrato público de API | El orden de los parámetros |
| El formato de datos persistidos | El formato de una respuesta interna |
| Una deuda deliberada | Un arreglo evidente |
| Rechazar un enfoque en revisión | Una preferencia de estilo |
| Algo que ya se discutió más de una vez | Algo que nadie va a cuestionar |

La última fila es la más práctica: **si la discusión se repite, escríbela**. El ADR existe
justamente para no volver a tenerla.

## 2. Reversibilidad: cuánto pensar

El factor que decide el esfuerzo de la decisión:

| Tipo | Ejemplo | Cómo se trata |
|---|---|---|
| **Reversible y barata** | Elegir una librería de fechas | Se elige y se sigue. Sin ADR |
| **Reversible y cara** | Estructura de un módulo nuevo | Se piensa, se registra en una línea |
| **Difícil de revertir** | Formato de datos persistidos, contrato público | ADR completo, revisado por otra persona |
| **Irreversible** | Migrar datos sin vuelta atrás, comprometerse con un proveedor | ADR + decisión explícita de quien manda |

El error simétrico en ambos sentidos: reunirse tres días para una decisión que se cambia en una
tarde, y decidir en cinco minutos algo que va a condicionar dos años.

## 3. El formato ADR

Corto. Una página. Si no cabe, la decisión es varias decisiones.

```markdown
# 0007 - Store money as integer minor units

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** equipo de backend

## Context

Invoice totals are computed in Python with Decimal and stored in MySQL. Two
production discrepancies of 0.01 traced to DECIMAL(10,2) rounding on aggregate
queries. Tax rules require up to 4 decimals in intermediate steps.

## Options

1. **DECIMAL(19,4) in the database.** Keeps arithmetic readable in SQL.
   Still rounds in aggregates, and the exact precision depends on the engine.
2. **Integer minor units (cents).** Exact for every operation. Requires a
   conversion at the persistence boundary and readable reports become harder.
3. **String storage.** Exact, but no arithmetic in SQL at all.

## Decision

Option 2. Money is stored as BIGINT in the currency's minor unit, with the
currency code alongside. The `Money` value object owns the conversion, so the
domain never sees the integer.

## Consequences

- Aggregates in SQL are exact.
- Reports that used to `SUM(total)` need a division at the presentation layer.
- A currency with a different number of decimals is supported by the Currency
  value object; no schema change needed.
- Migration 0043 converts the existing columns and is not reversible without
  precision loss beyond 2 decimals.
```

Las cinco partes, y qué las hace útiles:

- **Contexto**: los hechos que forzaron la decisión, con datos reales. No la teoría.
- **Opciones**: las que se consideraron de verdad, **con su desventaja real**. Una opción
  presentada sin contras es teatro: se escribió para justificar la que ya estaba elegida.
- **Decisión**: cuál y por qué esa.
- **Consecuencias**: lo bueno **y lo malo** que se acepta. Es la sección que más se salta y la que
  más vale.
- **Estado**: `proposed`, `accepted`, `superseded by NNNN`.

### Dónde viven

`docs/decisions/NNNN-titulo-en-kebab-case.md`, numerados y **nunca borrados**. Una decisión
sustituida se marca `superseded`, no se elimina: quien lee el ADR nuevo necesita saber qué había
antes y por qué cambió.

Con tablero, además `record_decision` (ver `foundry-tablero`) para que quede enlazada a la
tarjeta.

## 4. Evaluar alternativas sin teatro

- **Mínimo dos opciones reales.** Si sólo hay una, o es evidente (y entonces no hace falta ADR) o
  no se buscó.
- **Cada opción con su desventaja.** Si una no tiene contras, no se ha entendido.
- **Comparar contra criterios explícitos**, nombrados antes de comparar: coste de cambio,
  rendimiento con el volumen previsto, quién lo mantiene, encaje con lo que ya hay.
- **"No hacer nada" es una opción**, y a menudo la correcta. Merece evaluarse.
- **Lo que ya se usa en el proyecto parte con ventaja.** Introducir una tecnología nueva tiene un
  coste que no aparece en su documentación: alguien tiene que aprenderla, operarla y mantenerla el
  día que falle.

## 5. Antes de decidir, comprobar

Muchas decisiones se toman sobre supuestos que se verifican en veinte minutos:

- **¿Es cierto el problema?** Si el motivo es rendimiento, **medir** antes. La mitad de las
  optimizaciones estructurales atacan algo que no era el cuello de botella.
- **¿Funciona la opción elegida?** Un spike acotado en tiempo vale más que tres días de debate.
- **¿Alguien ya lo resolvió en el repositorio?** Ver `engineer-reviewer` §1.2.

Un ADR basado en una medición vale mucho más que uno basado en intuiciones bien argumentadas.

## 6. Cuándo una decisión deja de valer

Pasa, y está bien. Lo que no está bien es que se erosione en silencio hasta que nadie sabe qué
regla aplica.

1. **Se escribe un ADR nuevo** que explica qué cambió en el contexto.
2. **El anterior se marca `superseded by NNNN`.** No se borra ni se edita su decisión.
3. **Si el código todavía sigue la decisión vieja**, se registra como tarjeta lo que falta migrar
   (`tech-debt`). Un ADR aceptado que el código no cumple es peor que no tenerlo.

## 7. Cuando la decisión la toma un agente

- **Se registra igual**, con el mismo formato.
- **Se declara como propuesta**, no como acuerdo: `status: proposed`. La aprobación es del humano
  (ver `foundry-tablero` §4: `review_decision` no se auto-aprueba).
- **Las opciones descartadas se listan de verdad**, porque quien revisa necesita ver que se
  consideraron.
- **Si es irreversible, se pregunta antes de ejecutar**, no se registra después (ver `ask-well`
  §6).

## 8. Reglas duras

- **Se registra lo que cuesta cambiar**, no todo.
- **Si la discusión se repite, se escribe.**
- **La reversibilidad determina cuánto pensar y cuánto revisar.**
- **Mínimo dos opciones reales, cada una con su desventaja.**
- **Las consecuencias incluyen lo malo que se acepta.**
- **Si el motivo es rendimiento, hay que medir antes.**
- **Un ADR nunca se borra**: se marca `superseded`.
- **Un ADR aceptado que el código no cumple se convierte en tarjeta.**
- **Un agente propone; el humano acepta.**
- **Lo irreversible se pregunta antes, no se registra después.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| El estándar de arquitectura ya decidido | `clean-architecture` |
| Qué nivel le toca a cada módulo | `architecture-hybrid` |
| Evaluar un enfoque en revisión | `engineer-reviewer` |
| Deuda deliberada y su vencimiento | `tech-debt` |
| La spec de comportamiento | `spec-driven-development` |
| Cuándo preguntar en vez de decidir | `ask-well` |
| Evaluar una dependencia nueva | `dependency-hygiene` |
| `record_decision` y su revisión | `foundry-tablero` |
