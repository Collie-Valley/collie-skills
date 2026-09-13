---
name: ask-well
description: Cuándo preguntar y cuándo decidir en Collie — el test de si una duda bloquea de verdad, la diferencia entre pregunta bloqueante y supuesto declarado, cómo se formula una pregunta que se responde en segundos, qué no se pregunta nunca, y cómo se avanza con todo lo que no depende de la respuesta. Cargar al encontrar una ambigüedad a mitad de una tarea, antes de escribir una pregunta al usuario o al equipo, al dudar entre suponer y consultar, o al recibir un encargo incompleto.
---

# Skill: ask-well

Cuándo parar a preguntar y cuándo seguir. Los dos extremos son caros: el que pregunta todo no
avanza, y el que no pregunta nada construye lo que nadie pidió.

> **La regla:** se pregunta sólo cuando **la respuesta cambia lo que harías** y no se puede
> deducir. Todo lo demás se decide, se declara como supuesto, y se sigue.

## 1. El test de tres preguntas

Ante una duda, en este orden:

1. **¿Puedo averiguarlo?** Leyendo el código, la tarjeta, la documentación, el historial de git,
   un módulo equivalente. La mayoría de las "dudas" son búsquedas que no se hicieron.
2. **¿Cambia lo que voy a hacer?** Si las dos respuestas llevan al mismo código, no es una
   pregunta: es curiosidad. Se decide y se sigue.
3. **¿Puedo elegir, avanzar y corregir barato si me equivoco?** Si la corrección es trivial, se
   elige y se declara el supuesto. Si equivocarse significa tirar días de trabajo, o es
   irreversible, se pregunta.

Sólo lo que llega al final con tres "no" se convierte en pregunta.

## 2. Bloqueante o supuesto declarado

Dos formas de tratar una duda, y elegir mal es el error frecuente.

| | **Pregunta bloqueante** | **Supuesto declarado** |
|---|---|---|
| Cuándo | Equivocarse es caro o irreversible | Equivocarse se corrige barato |
| Qué haces | Paras esa parte, sigues con el resto | Eliges, lo dices y avanzas |
| Ejemplos | Borrar datos, contrato público, cobrar dinero, integración externa | Nombre de un campo, orden de un listado, formato de un texto |

**Un supuesto declarado no es una pregunta silenciada.** Se escribe donde el otro lo vea:

```
Supuesto: los pedidos cancelados también se exportan, porque finanzas los
concilia igual. Si no es así, es un filtro de una línea.
```

Eso permite corregir en diez segundos. Callarlo obliga a descubrirlo al final.

## 3. Avanzar con lo que no depende de la respuesta

La parte que más se olvida: una duda **casi nunca bloquea todo el trabajo**.

Si no sabes si el CSV va con punto y coma o con coma, puedes tener listo el caso de uso, el
puerto, los tests del filtrado, el endpoint y la exportación entera — con el separador en una
constante que se cambia en una línea.

Preguntar y quedarse esperando de brazos cruzados es tan malo como no preguntar. **Se pregunta y
se sigue con todo lo demás.**

## 4. Cómo se formula una pregunta

Una pregunta bien hecha se responde en segundos; una mal hecha genera tres mensajes de ida y
vuelta.

```
✗ "¿Cómo quieres que maneje los pedidos cancelados en la exportación?"

✓ "Exportación: ¿los pedidos cancelados entran?
   Mi propuesta: sí, con la columna status, porque finanzas los concilia igual.
   Si no, los filtro y es una línea.
   Mientras tanto sigo con el resto; esto se cambia al final sin coste."
```

Las cuatro partes:

1. **El contexto en una línea**, no la historia completa.
2. **La pregunta concreta**, con opciones cerradas si las hay.
3. **Tu recomendación y su porqué.** Confirmar una propuesta es mucho más rápido que redactar una
   respuesta desde cero.
4. **Qué haces mientras tanto**, y qué cuesta cambiarlo.

### Preguntas cerradas mejor que abiertas

"¿Prefieres A o B?" se contesta con una letra. "¿Qué quieres que haga aquí?" traslada el trabajo
entero a quien responde, que además tiene menos contexto que tú sobre el código.

### Todas las dudas de una vez

Si hay tres preguntas, van juntas y numeradas. Tres mensajes espaciados a lo largo del día cuestan
tres interrupciones y triplican el tiempo de bloqueo.

## 5. Qué no se pregunta

| No preguntes | Por qué |
|---|---|
| Lo que está en el código | Léelo |
| Lo que está en la tarjeta o el README | Léelo |
| Cómo se hace algo que ya está resuelto en el repositorio | Copia el patrón vecino |
| Permiso para hacer lo que la tarjeta ya pide | Ya te lo dieron |
| Confirmación de una decisión trivial y reversible | Decide y declara |
| "¿Voy bien?" sin nada concreto que evaluar | No se puede responder |
| La misma duda dos veces | Anótala la primera vez |

Y la más importante: **no se pregunta para trasladar la responsabilidad de una decisión que te
corresponde**. Elegir entre dos implementaciones equivalentes es tu trabajo.

## 6. Cuándo no hay nadie a quien preguntar

Situación normal para un agente. El procedimiento:

1. **Haz todo lo que no depende de la respuesta**, completo.
2. **Elige la opción más conservadora y más reversible** para lo que sí depende: la que menos daño
   hace si es la equivocada, la que se cambia con menos trabajo.
3. **Declara el supuesto de forma visible** — en el reporte, en el PR, en la tarjeta. No en un
   comentario perdido.
4. **Di qué cuesta cambiarlo.** "Es una línea" y "habría que rehacer el mapper" llevan a
   decisiones distintas.
5. **Nunca inventes el requisito y lo presentes como dado.** La diferencia entre "supuse X" y
   decir X como si te lo hubieran dicho es toda la diferencia.

Y hay un caso donde **sí se para en seco**: cuando actuar bajo cualquier supuesto puede causar
daño irreversible — borrar datos, enviar comunicaciones a clientes, mover dinero, tocar
producción. Ahí se espera, aunque cueste tiempo.

## 7. Después de preguntar

- **Escribe la respuesta donde quede.** Una decisión que vive en un chat se pierde y se vuelve a
  preguntar en dos meses. Si hay tablero, `record_decision`.
- **No vuelvas a preguntar lo mismo.**
- **Si la respuesta cambia el alcance**, eso es `scope-discipline`: se nombra el cambio, no se
  absorbe.

## 8. Reglas duras

- **Antes de preguntar: búscalo.** El código, la tarjeta, el historial, el módulo vecino.
- **Si la respuesta no cambia lo que harías, no es una pregunta.**
- **Reversible y barato → se decide y se declara.** Irreversible o caro → se pregunta.
- **Se avanza con todo lo que no depende de la respuesta.**
- **Toda pregunta lleva una propuesta.**
- **Preguntas cerradas, y todas juntas.**
- **Un supuesto se declara donde el otro lo vea**, con su coste de cambio.
- **Nunca se presenta un supuesto como si fuera un requisito dado.**
- **Daño irreversible: se para y se espera**, sin excepción.
- **La respuesta se registra** donde no se pierda.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué debe estar definido antes de empezar | `definition-of-ready` |
| Declarar supuestos y estado real | `honest-status` |
| Cambios de alcance a mitad | `scope-discipline` |
| Registrar decisiones | `technical-design` · `foundry-tablero` |
| Criterios que evitan la mitad de las dudas | `acceptance-criteria` |
