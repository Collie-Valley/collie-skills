---
name: scope-discipline
description: Disciplina de alcance en Collie — entregar lo que la tarjeta pide, ni más ni menos; qué hacer con lo que se encuentra de camino (registrar, no arreglar en silencio), cuándo un arreglo sí entra en el diff, por qué el refactor sorpresa hace daño, y cómo se dice que algo no entra sin abandonarlo. Cargar al implementar una tarjeta, al ver algo roto que no era tu tarea, al sentir la tentación de "ya que estoy", al recibir una petición que crece a mitad, o al preparar un PR.
---

# Skill: scope-discipline

Entregar exactamente lo que se pidió. Ni recortado, ni ampliado.

> **La regla:** el alcance de la tarjeta es el contrato. Ampliarlo por cuenta propia no es
> generosidad: convierte un cambio revisable en uno que nadie puede evaluar, y mezcla riesgos que
> deberían desplegarse por separado.

## 1. Las dos formas de romperlo

### Ampliar

"Ya que estoy aquí": renombrar cosas de paso, reformatear un archivo, refactorizar una función
vecina, arreglar un bug que se vio, actualizar una dependencia, añadir una funcionalidad obvia que
nadie pidió.

Cada una parece buena por separado. Juntas producen un diff donde **el cambio real es el 20% y
nadie lo encuentra**.

### Recortar

Entregar la mitad y llamarlo terminado: dejar fuera el manejo de errores, saltarse un criterio
"menor", omitir los tests porque el código es evidente, dejar sin cubrir un caso que sí estaba en
el alcance.

Recortar sin decirlo es peor que ampliar, porque el otro **no se entera**.

## 2. Por qué el PR ampliado hace daño

| Consecuencia | Explicación |
|---|---|
| La revisión se vuelve imposible | Nadie distingue el cambio pedido del arreglo espontáneo |
| El riesgo se mezcla | Un cambio seguro y uno peligroso se despliegan juntos |
| Revertir se vuelve caro | Volver atrás por el bug se lleva por delante el refactor bueno |
| El historial se ensucia | `git blame` sobre una línea reformateada apunta al PR equivocado |
| Los conflictos se multiplican | Tocar archivos ajenos choca con el trabajo de otros |
| La estimación deja de valer | Lo que iba a ser un día se convierte en tres, sin que nadie lo decidiera |

## 3. Qué hacer con lo que encuentras de camino

Encontrar cosas es bueno: significa que estás mirando. El problema es qué haces después.

| Lo que encuentras | Qué haces |
|---|---|
| Bug ajeno a tu cambio | **Tarjeta**, con cómo reproducirlo. No lo arreglas aquí |
| Código feo pero correcto | Tarjeta de deuda si vale la pena; si no, nada |
| Nombre malo en código que no tocas | Nada. Se anota si molesta de verdad |
| Falta un test de algo existente | Tarjeta |
| **Bug en el código que estás tocando y que tu cambio activa** | **Se arregla aquí**, y se dice en el PR |
| **Algo que impide terminar tu tarjeta** | Se arregla aquí, se dice en el PR, y se avisa si crece |
| Vulnerabilidad de seguridad | Se escala **ahora**, no es una tarjeta más |

Las dos filas en negrita son la excepción legítima: **si sin arreglarlo no puedes entregar, entra
en el diff** — pero se nombra explícitamente en la descripción del PR, nunca se cuela en silencio.

## 4. Cuando la petición crece a mitad

Pasa, y no siempre es malo. Lo que no vale es absorberlo callando.

1. **Nómbralo.** "Esto que pides ahora no estaba en el alcance."
2. **Di lo que cuesta**, en tiempo y en riesgo.
3. **Ofrece las opciones:** entra ahora y se retrasa el resto; entra como tarjeta aparte; no
   entra.
4. **Que decida quien pidió el trabajo.** No es tu decisión, y absorberlo en silencio se la quita.
5. **Que quede escrito** en la tarjeta, no sólo hablado.

Si eres un agente y no hay nadie a quien preguntar: **entrega el alcance original completo**,
deja lo nuevo identificado y sin hacer, y dilo claramente. Nunca al revés.

## 5. Cuando el alcance resulta imposible

Si algo del alcance no se puede entregar:

- **Se hace todo lo demás, completo.** Un obstáculo en una parte no justifica entregar el resto a
  medias.
- **Se dice exactamente qué parte y por qué.**
- **Se propone alternativa** si la hay.
- **No se sustituye por otra cosa** sin avisar. Entregar algo distinto que "hace lo mismo" sin
  decirlo es ampliar y recortar a la vez.

Reducir el trabajo es decisión de quien lo pidió, no de quien lo ejecuta.

## 6. El refactor: cómo se hace bien

El refactor es necesario y no está prohibido. Lo que está prohibido es que sea sorpresa.

- **Refactor como tarjeta propia**, con su alcance y su justificación.
- **Refactor pequeño y contenido dentro de lo que ya tocas**: aceptable, si es proporcional y se
  menciona en el PR. Renombrar una variable de la función que estás cambiando, sí. Reorganizar el
  módulo, no.
- **Refactor y cambio funcional en commits separados**, siempre. Así se revisan y se revierten por
  separado (ver `git-discipline`).
- **Nunca refactor y cambio de comportamiento en el mismo commit.** Es la combinación que hace
  imposible saber qué rompió qué.

## 7. Señales de que se está ampliando

- El diff toca archivos que no tienen relación con la tarjeta.
- El número de archivos cambiados sorprende al propio autor.
- Aparecen cambios de formato en líneas cuya lógica no se tocó.
- Al describir el PR hace falta un "además".
- Se tarda el doble de lo estimado y no por dificultad, sino por acumulación.
- En la revisión, alguien pregunta "¿y esto por qué?".

## 8. Reglas duras

- **El alcance de la tarjeta es el contrato.** Ni más, ni menos.
- **Lo que se encuentra se registra como tarjeta**, no se arregla de paso.
- **La única excepción**: lo que impide entregar. Y se nombra en el PR.
- **Nada de reformatear líneas que no se tocan.**
- **Recortar sin decirlo está prohibido.** Si algo no entra, se dice cuál.
- **Un crecimiento de alcance lo decide quien pidió el trabajo**, y queda escrito.
- **Refactor y cambio funcional, en commits separados.**
- **Un refactor grande es una tarjeta propia.**
- **Una vulnerabilidad se escala de inmediato**, no se convierte en tarjeta ordinaria.
- **Si algo del alcance es imposible, se entrega todo lo demás completo** y se dice qué falta.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Definir el alcance y el no-alcance antes de empezar | `definition-of-ready` |
| Decir qué quedó fuera al entregar | `honest-status` · `definition-of-done` |
| Registrar lo encontrado | `tech-debt` |
| Commits separados y descripción del PR | `git-discipline` |
| Cuándo preguntar en vez de decidir solo | `ask-well` |
| No revisar código fuera del diff | `code-reviewer` |
| Promover un módulo como tarjeta propia | `architecture-hybrid` |
