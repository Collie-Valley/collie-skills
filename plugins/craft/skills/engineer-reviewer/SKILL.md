---
name: engineer-reviewer
description: Revisión de altitud en Collie — no si el código está bien escrito, sino si resuelve el problema correcto, al nivel adecuado, de forma reversible y sin duplicar lo que ya existe. Cubre las siete preguntas de diseño, el coste a seis meses, detectar sobre-diseño y sub-diseño, cuándo el enfoque debe rechazarse entero, y cómo se conduce esa conversación sin bloquear al equipo. Cargar al revisar un diseño o un PR estructural, antes de aprobar un enfoque, al sentir que algo "funciona pero no encaja", o al evaluar una propuesta técnica.
---

# Skill: engineer-reviewer

La otra mitad de la revisión. `code-reviewer` pregunta **¿está bien hecho?**; ésta pregunta
**¿está bien planteado?**

> **La regla:** un código correcto que resuelve el problema equivocado, o al nivel equivocado, es
> más caro que un bug — porque el bug se arregla y esto se hereda.

Esta revisión se hace **temprano**: sobre el plan o sobre el primer PR estructural. Señalar que el
enfoque está mal cuando ya hay tres semanas de trabajo es cierto e inútil.

## 1. Las siete preguntas

### 1.1 ¿Resuelve el problema que había?

Comparar contra el problema de la tarjeta, no contra la solución propuesta. Lo habitual no es que
el código falle: es que resuelve una versión adyacente del problema — la que era más fácil de
programar.

Señal: los criterios de aceptación se cumplen técnicamente pero el solicitante seguiría haciendo
su trabajo igual que antes.

### 1.2 ¿Existía ya?

La duplicación es la deuda más cara y la más invisible: dos implementaciones de la misma regla
divergen, y el bug aparece en la que nadie recordaba.

Buscar antes de aprobar: ¿hay otro módulo con esta lógica? ¿una función utilitaria que hace el
80%? ¿una librería del proyecto ya instalada? Y el matiz: **dos cosas parecidas no siempre deben
unificarse**. Si cambian por motivos distintos, la duplicación es correcta; unificarlas crea un
acoplamiento que dolerá más.

### 1.3 ¿Está al nivel adecuado?

- **Demasiado abajo:** una regla de negocio implementada en SQL, en un trigger, o repartida en
  tres adaptadores. Funciona y es invisible para quien lee el dominio.
- **Demasiado arriba:** una decisión técnica (el orden de un índice, el formato de un archivo)
  expuesta como opción de negocio en la API.
- **En la capa equivocada:** lo que `clean-architecture` verifica mecánicamente; aquí se mira lo
  que el linter no ve, como un caso de uso que sabe demasiado de HTTP sin importar FastAPI.

### 1.4 ¿Cuánta estructura tiene, y cuánta merece?

Contra `architecture-hybrid`:

- **Sobre-diseño:** puertos con un implementador que nunca se sustituye, casos de uso que
  reenvían, mappers entre clases idénticas, configuración que nadie cambia, genéricos donde había
  un tipo.
- **Sub-diseño:** reglas de negocio en routers o schemas, un servicio que hace de todo, lógica
  duplicada en dos sitios, imposibilidad de probar sin base de datos.

La pregunta que discrimina: **¿qué compra esta abstracción, hoy?** Si la respuesta es "flexibilidad
futura" sin un caso concreto a la vista, es sobre-diseño.

### 1.5 ¿Es reversible?

- ¿Se puede desplegar y volver atrás sin pérdida de datos?
- ¿Cambia un contrato público que otros ya consumen?
- ¿Escribe datos en un formato del que no hay vuelta?
- ¿Compromete con un proveedor difícil de abandonar?

**Una decisión reversible se toma rápido y se corrige si falla; una irreversible se piensa.** Es
el factor que más debería mover el nivel de escrutinio, y el que más se ignora.

### 1.6 ¿Qué pasa a seis meses?

- ¿Qué se rompe cuando el volumen se multiplique por diez?
- ¿Qué pasa cuando entre el segundo país, el segundo cliente, la segunda moneda?
- ¿Cuánto cuesta añadir el siguiente caso? ¿Un archivo nuevo, o tocar siete sitios?
- ¿Quién lo entiende si quien lo escribió no está?
- ¿Qué parte va a doler y ya lo sabemos?

La última pregunta es la más valiosa: **si el autor ya sabe qué va a doler, se escribe** (ADR o
tarjeta de deuda), no se deja en su cabeza.

### 1.7 ¿Los límites están bien trazados?

¿El módulo es un contexto de negocio o una tabla? ¿El agregado agrupa lo que cambia junto? ¿La
dependencia entre módulos es explícita o alguien está leyendo tablas ajenas? ¿El endpoint expone
un concepto de negocio o la estructura interna?

## 2. El coste de un límite mal trazado

Es lo más caro que se aprueba en una revisión, porque no se puede corregir después sin tocar todo:

| Error de límite | Coste |
|---|---|
| Módulos partidos por capa y no por negocio | Cada cambio toca cinco carpetas |
| Agregado demasiado grande | Bloqueos, cargas pesadas, conflictos de escritura |
| Agregado demasiado pequeño | Reglas que nadie puede garantizar atómicamente |
| Dependencia implícita entre módulos | Un cambio local rompe algo lejano |
| API que expone estructura interna | El esquema interno se vuelve contrato público |

Estos merecen bloquear un PR aunque el código sea impecable.

## 3. Sobre-diseño y sub-diseño

| | Sobre-diseño | Sub-diseño |
|---|---|---|
| Se ve como | Muchos archivos pequeños que sólo reenvían | Pocos archivos enormes |
| Síntoma | Seguir una llamada cuesta cinco saltos sin que nada pase | Nadie sabe dónde poner lo siguiente |
| Coste | Lectura y mantenimiento permanentes | Miedo a tocar, bugs en cascada |
| Corrección | Eliminar capas: barato | Extraer y separar: caro |

Asimetría importante: **el sub-diseño es más caro de corregir**, así que ante la duda se inclina
hacia algo más de estructura — pero sólo en módulos con reglas de negocio reales. En un CRUD, el
sobre-diseño es el riesgo dominante.

## 4. Cuándo se rechaza el enfoque entero

Es raro y hay que hacerlo bien. Sólo cuatro motivos:

1. **Resuelve el problema equivocado.**
2. **Es irreversible y no se ha evaluado como tal.**
3. **Duplica algo que ya existe**, sin motivo para divergir.
4. **El límite está mal trazado** de una forma que se heredará.

Cómo se hace:

- **Pronto.** Sobre el plan, no sobre el PR terminado.
- **En conversación**, no en veinte comentarios. Un rechazo de enfoque no cabe en un hilo de
  revisión.
- **Con una alternativa concreta**, no sólo con la objeción.
- **Reconociendo lo que sí sirve** del trabajo hecho.
- **Y la decisión se registra** (ADR o `record_decision`), para que no se rediscuta en tres meses.

Lo que no vale: rechazar por preferencia personal, o pedir un rediseño por algo que se corrige en
una iteración posterior sin coste.

## 5. Cuándo aprobar aunque no sea lo que tú harías

La mayoría de las veces. Aprobar es correcto si:

- Resuelve el problema real.
- Es reversible, o su irreversibilidad está evaluada y aceptada.
- No duplica nada silenciosamente.
- Su estructura corresponde al nivel declarado del módulo.
- El coste de cambiarlo después es asumible.

"Yo lo habría hecho distinto" no es un motivo. **Distinto no es peor**, y bloquear por gusto
personal es la forma más rápida de que el equipo deje de pedir revisiones a tiempo.

## 6. Cómo se escribe un hallazgo de altitud

Distinto al de `code-reviewer`: aquí no hay escenario de fallo, hay **coste futuro**. Y hay que
nombrarlo concretamente para que no sea una vaguedad.

```
[Enfoque] Las reglas de impuestos viven en el adaptador de persistencia.

Funciona hoy. El coste: cuando entre el segundo país, la regla habrá que cambiarla
en SQL sin test que la cubra, y el dominio seguirá sin poder responder "cuánto
impuesto lleva esta factura" sin base de datos.

Alternativa: un TaxPolicy en domain/services, con la tabla como fuente de tarifas.
Cuesta ~medio día ahora; después de la segunda integración, bastante más.

No bloqueante si entra como tarjeta de deuda con fecha. Bloqueante si el segundo
país ya está en el roadmap de este trimestre.
```

Las cuatro partes: **qué**, **qué cuesta y cuándo**, **alternativa con coste**, y **si bloquea o
no**.

## 7. Reglas duras

- **Esta revisión se hace temprano**, sobre el plan o el primer PR estructural.
- **Contra el problema de la tarjeta**, no contra la solución propuesta.
- **Buscar si ya existe** antes de aprobar algo nuevo.
- **La reversibilidad marca el nivel de escrutinio.**
- **Una abstracción se justifica por lo que compra hoy**, no por flexibilidad futura.
- **Un límite mal trazado bloquea aunque el código sea impecable.**
- **Rechazar un enfoque exige alternativa concreta y conversación**, no un hilo de comentarios.
- **"Yo lo haría distinto" no bloquea nada.**
- **Todo hallazgo de altitud declara si bloquea o no.**
- **Lo que se sabe que va a doler se escribe**: ADR o tarjeta.

## 8. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Corrección, bugs y casos límite | `code-reviewer` |
| Cuánta estructura merece cada módulo | `architecture-hybrid` |
| La regla de dependencias y las capas | `clean-architecture` |
| Detectar sobre-diseño en abstracciones | `solid-principles` |
| Límites de agregado y de módulo | `domain-modeling` |
| Registrar la decisión o la alternativa | `technical-design` |
| Convertir el coste futuro en tarjeta | `tech-debt` |
| Seguridad del cambio | `security-diff-review` |
