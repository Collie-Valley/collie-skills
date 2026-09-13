---
name: definition-of-ready
description: La puerta de entrada del trabajo en Collie — la checklist que una tarjeta debe cumplir antes de pasar a in_progress (problema, alcance y no-alcance, criterios verificables, dependencias, supuestos, tamaño, riesgo), el veredicto pasa/no pasa/pasa con salvedad, qué hacer cuando falla en vez de empezar igual, y las excepciones legítimas. Cargar antes de empezar cualquier tarea, al mover una tarjeta a in_progress, al recibir un encargo vago, al planificar un sprint, o al dudar de si algo está listo para trabajarse.
---

# Skill: definition-of-ready

La puerta de entrada. Una tarjeta no se empieza hasta que la cruza.

> **La regla:** si no se puede describir qué significa que esto esté terminado, no se puede
> empezar. Empezar igual no acelera nada — mueve el trabajo de descubrimiento al final, donde
> cuesta diez veces más y ya hay código escrito que tirar.

Es la pareja de `definition-of-done`: una controla lo que entra, la otra lo que sale.

## 1. La checklist

Siete puntos. **Todos** se responden antes de mover la tarjeta a `in_progress`.

### 1.1 El problema está enunciado

Qué le pasa hoy a quién, y por qué importa. **No la solución**: el problema.

- ✗ "Añadir un botón de exportar a Excel en la tabla de pedidos"
- ✓ "Finanzas necesita conciliar pedidos con el ERP y hoy copia 300 filas a mano cada lunes"

La versión correcta admite soluciones que la primera cierra de entrada (un endpoint, un envío
programado, una integración directa). Cuando la tarjeta trae la solución ya decidida, se acepta —
pero se comprueba que alguien decidió eso a sabiendas, y se registra dónde.

### 1.2 El alcance y el **no**-alcance están escritos

Qué entra, y explícitamente **qué no**. El no-alcance es lo que evita que la tarea crezca a mitad
de camino y lo que hace que la entrega sea evaluable.

```
Alcance:     exportar los pedidos del filtro activo a CSV, desde la vista de pedidos.
No-alcance:  programar envíos, otros formatos, exportar desde otras vistas.
```

### 1.3 Los criterios de aceptación son verificables

Cada uno tiene que poder responderse con sí o no observando el sistema. Sin "debe ser rápido", sin
"debe ser usable".

- ✗ "La exportación debe ser rápida"
- ✓ "Con 10.000 pedidos, el archivo empieza a descargarse en menos de 3 segundos"

Detalle en `acceptance-criteria`. **Cero criterios es un no automático.**

### 1.4 Las dependencias están identificadas

Qué necesita esta tarjeta que no está en su control: un endpoint de otro equipo, una credencial,
una decisión de producto, un dato que nadie ha modelado. Cada una, con su estado.

Una dependencia **no resuelta** no impide que la tarjeta esté lista, pero sí obliga a declararla y
enlazarla (`link_tasks`, `flag_blocker`). Una dependencia **no identificada** es lo que para el
trabajo al tercer día.

### 1.5 Los supuestos están declarados

Todo lo que se está dando por hecho sin confirmar. Escribirlos convierte una suposición invisible
en algo que alguien puede corregir antes de que cueste.

```
Supuestos: los pedidos cancelados también se exportan;
           el CSV va en UTF-8 con BOM porque el ERP lo abre con Excel.
```

### 1.6 El tamaño es razonable

Si no cabe en unos pocos días de trabajo, se parte. Una tarjeta grande esconde descubrimientos, no
se puede revisar bien y bloquea la columna.

Partir **por valor entregable**, no por capas. "Backend" y "frontend" no son dos tarjetas: son dos
mitades que no sirven de nada por separado.

### 1.7 El riesgo está valorado

Una línea: qué pasa si esto sale mal. Toca dinero, datos personales, algo irreversible, algo que
usan clientes ahora mismo. Determina cuánta verificación pedirá `definition-of-done` y si hace
falta plan de reversión.

## 2. El veredicto

Tres resultados posibles. **Siempre se declara uno.**

| Veredicto | Cuándo | Qué se hace |
|---|---|---|
| **Pasa** | Los siete puntos cubiertos | La tarjeta se mueve a `in_progress` |
| **Pasa con salvedad** | Falta algo menor que no bloquea el inicio | Se empieza, con la salvedad **escrita** en la tarjeta y una fecha para cerrarla |
| **No pasa** | Falta el problema, el alcance o los criterios | **No se empieza.** Vuelve con lo que le falta, por escrito |

"Pasa con salvedad" es legítimo y frecuente. Lo que no es legítimo es usarlo para los tres puntos
críticos: problema, alcance y criterios. Sin ellos no hay contra qué verificar nada, y lo que se
entregue será una interpretación con suerte.

## 3. Qué hacer cuando no pasa

**No se empieza y no se abandona.** Se devuelve con trabajo hecho:

1. **Nombrar exactamente qué falta**, punto por punto. No "está incompleta".
2. **Proponer la respuesta** donde se pueda deducir. Es mucho más rápido confirmar una propuesta
   que redactar de cero: "Entiendo que el alcance es X y no incluye Y — ¿correcto?"
3. **Dejarlo en la tarjeta**, no en un chat que se pierde. Con `add_task_comment` si hay tablero.
4. **Seguir con otra cosa.** Una tarjeta bloqueada por falta de definición no justifica parar el
   día.

Si eres un agente y no hay nadie a quien preguntar en ese momento: escribe el análisis, declara
los supuestos que tomarías, y **pregunta antes de escribir código**, no después.

## 4. Excepciones legítimas

No todo pasa por esta puerta con el mismo rigor:

- **Incidencia en producción.** Se arregla primero. La DoR se reduce a: qué falla, cómo se
  reproduce, qué se considera arreglado. Lo demás se documenta después.
- **Spike de investigación.** No tiene criterios de aceptación porque su producto es una
  respuesta. Su DoR es: qué pregunta responde, cuánto tiempo se le da, y qué formato tendrá la
  respuesta. **El límite de tiempo es obligatorio.**
- **Tarea trivial y reversible** (un texto, un color, un nombre). El sentido común manda; la
  ceremonia aquí cuesta más que el trabajo.

Lo que **nunca** es excepción: una tarjeta de nivel de riesgo alto — dinero, datos personales,
borrado, integraciones externas — pasa la puerta completa siempre.

## 5. Señales de que la puerta no se está aplicando

- Tarjetas que llevan semanas en `in_progress` sin avance visible.
- Conversaciones de "¿esto también entraba?" a mitad de la implementación.
- Entregas que el solicitante rechaza porque "no era eso".
- Estimaciones que se desvían sistemáticamente por encima.
- Código escrito que se tira tras una conversación que debió ocurrir antes.

Todas tienen la misma causa: el descubrimiento ocurrió después de empezar.

## 6. La versión de bolsillo

Cuando no da para la checklist completa, estas tres preguntas atrapan la mayoría de los
problemas:

1. **¿Qué problema resuelve y de quién?**
2. **¿Qué NO entra?**
3. **¿Cómo sabremos que está bien?**

Sin respuesta a las tres, no se empieza.

## 7. Reglas duras

- **Sin problema, alcance y criterios, no se empieza.** No admiten salvedad.
- **El no-alcance se escribe**, no se sobrentiende.
- **Un criterio que no se puede observar no es un criterio.**
- **Cero criterios de aceptación es un "no pasa" automático.**
- **El veredicto se declara siempre**, y queda escrito en la tarjeta.
- **Una salvedad lleva fecha de cierre.** Sin fecha, es una tarea que se olvida.
- **Devolver una tarjeta incluye decir qué le falta y proponer respuestas.**
- **Un spike siempre lleva límite de tiempo.**
- **Riesgo alto no tiene excepciones.**
- **Si no cabe en unos días, se parte por valor**, nunca por capas.

## 8. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La puerta de salida | `definition-of-done` |
| Escribir criterios verificables | `acceptance-criteria` |
| El comportamiento como contrato en Gherkin | `bdd-behavior` |
| La spec como fuente de verdad | `spec-driven-development` |
| Decidir y registrar el diseño técnico | `technical-design` |
| No ampliar ni encoger la tarea | `scope-discipline` |
| Cuándo preguntar y cuándo asumir | `ask-well` |
| Mover la tarjeta, avance y verificación | `foundry-tablero` |
