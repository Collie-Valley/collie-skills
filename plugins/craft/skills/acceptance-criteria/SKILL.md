---
name: acceptance-criteria
description: Escribir criterios de aceptación verificables en Collie — cada criterio observable y con respuesta sí/no, cómo se convierte un requisito vago en algo demostrable, criterios para requisitos no funcionales (rendimiento, permisos, errores), cuántos hacen falta, la trampa de los criterios de implementación, y cómo se demuestra cada uno al entregar. Cargar al escribir o revisar criterios, al recibir una tarjeta con requisitos vagos, al preparar una tarjeta para que pase la DoR, o al demostrar el cierre de una tarea.
---

# Skill: acceptance-criteria

Los criterios son el contrato de la tarjeta: lo que se va a demostrar para decir que está
terminada.

> **La regla:** un criterio se responde **sí o no observando el sistema**. Si dos personas
> razonables pueden discrepar sobre si se cumple, no es un criterio: es un deseo.

## 1. Verificable quiere decir tres cosas

1. **Observable** desde fuera: en la respuesta de la API, en la pantalla, en el dato guardado, en
   el tiempo medido. No en el diseño interno.
2. **Binario**: se cumple o no se cumple. Sin "más o menos".
3. **Con umbral**, si habla de cantidad, tiempo o volumen. "Rápido" no es un umbral; "menos de 3
   segundos con 10.000 registros" sí.

## 2. De vago a verificable

| ✗ Vago | ✓ Verificable |
|---|---|
| La exportación debe ser rápida | Con 10.000 pedidos, la descarga empieza en menos de 3 s |
| El listado debe ser usable | El listado pagina de 50 en 50 y permite filtrar por estado y por rango de fechas |
| Debe manejar errores correctamente | Si el ERP no responde en 5 s, se devuelve 503 con `retry_after` y el pedido no cambia de estado |
| Sólo los administradores pueden borrar | Un usuario sin rol `admin` que llama a DELETE /orders/{id} recibe 403 y el pedido sigue existiendo |
| Los datos deben estar seguros | El `tax_id` no aparece en ningún log ni en la respuesta de listado |
| Debe funcionar con muchos usuarios | Con 100 peticiones concurrentes de exportación, ninguna supera 10 s ni devuelve 5xx |

El patrón de la conversión: **añadir el actor, la acción, la condición y el resultado observable.**

## 3. La forma

Dos formatos válidos. Se elige por claridad, no por norma.

### Enunciado directo

```
- Con 10.000 pedidos, la descarga empieza en menos de 3 segundos.
- Los pedidos cancelados aparecen en el archivo, con su estado en la columna status.
- Si el filtro no devuelve pedidos, se descarga un archivo con sólo la cabecera.
```

### Dado / cuando / entonces

```
- Dado un usuario sin rol admin
  Cuando llama a DELETE /orders/{id}
  Entonces recibe 403 y el pedido sigue existiendo
```

Se usa cuando el estado previo importa. Para criterios simples, el enunciado directo se lee mejor.

**Los criterios de la tarjeta van en el idioma del equipo; los escenarios Gherkin que derivan de
ellos van en inglés** (ver `bdd-behavior`), porque sus términos son los del código.

## 4. Qué cubrir

Un conjunto completo toca cinco frentes. Faltar el tercero y el cuarto es lo habitual.

| Frente | Ejemplo |
|---|---|
| **El camino feliz** | El caso principal, completo |
| **Los bordes** | Cero resultados, el límite exacto, el valor máximo |
| **Los errores** | Qué pasa cuando falla, y qué ve quien lo pidió |
| **Los permisos** | Quién puede y quién no, verificado en el servidor |
| **Lo no funcional** | Tiempo, volumen, concurrencia — cuando importa |

Y lo que **no** se cubre con criterios: comportamiento que no cambia en esta tarjeta. Un criterio
que describe algo que ya funcionaba infla la tarjeta sin añadir nada.

## 5. La trampa: criterios de implementación

Un criterio describe **qué hace el sistema**, no cómo está construido.

```
✗ Se crea una tabla `order_exports` con un índice por `created_at`
✗ El caso de uso ExportOrders recibe un puerto OrderReader
✗ Se usa la librería csv de la biblioteca estándar
```

Ninguno es verificable desde fuera y todos cierran decisiones de diseño que corresponden a quien
implementa. Si la elección técnica importa de verdad —un formato exigido por un tercero, una
restricción de infraestructura—, eso es una **restricción** y va en la spec o en un ADR, no como
criterio de aceptación.

La excepción real: cuando el sistema externo lo impone y es observable. "El CSV se entrega en
UTF-8 con BOM" **sí** es un criterio, porque es observable en el archivo y el ERP lo exige.

## 6. Cuántos

Entre tres y siete para una tarjeta normal.

- **Menos de tres** suele significar que faltan los bordes o los errores.
- **Más de diez** suele significar que la tarjeta es demasiado grande y hay que partirla (ver
  `definition-of-ready` §1.6).

Cada criterio debe merecer su línea: si dos se demuestran con la misma prueba, eran uno.

## 7. Cómo se demuestra cada uno

Aquí se cierra el círculo con `definition-of-done`: **cada criterio se demuestra uno a uno, con su
evidencia nombrada.**

```
✓ "Con 10.000 pedidos la descarga empieza en <3 s"
  → test_export_large_dataset: 1.4 s

✓ "Un usuario sin rol admin recibe 403"
  → test_delete_requires_admin_role

✗ "El CSV se abre en Excel sin romper acentos"
  → no verificado: generado con UTF-8 BOM, sin Excel en este entorno.
    Necesita comprobación humana.
```

Por eso importa que sean verificables: **un criterio vago no se puede demostrar**, y lo que no se
puede demostrar acaba en una discusión sobre si está terminado o no.

Un criterio sin evidencia es un criterio **no cumplido**, y el veredicto pasa a `parcial`.

## 8. Quién los escribe

Los escribe quien pide el trabajo, o quien lo va a hacer **y los confirma** con quien lo pide.
Los escribe alguien **antes de empezar**, siempre.

Si llegan vagos, no se empieza y no se abandona: se reescriben como propuesta y se pide
confirmación (`ask-well` §4). Proponer "entiendo que el criterio es X, ¿correcto?" es mucho más
rápido que pedir que los redacten de cero.

## 9. Reglas duras

- **Un criterio se responde sí o no observando el sistema.**
- **Todo lo cuantitativo lleva umbral y condición** (cuánto, con cuántos datos).
- **Nada de criterios de implementación.** Eso es spec o ADR.
- **Se cubren camino feliz, bordes, errores, permisos y lo no funcional relevante.**
- **Entre tres y siete.** Más de diez es señal de partir la tarjeta.
- **Se escriben antes de empezar**, nunca después de construir.
- **Cada criterio se demuestra uno a uno al entregar**, con evidencia nombrada.
- **Un criterio sin evidencia es un criterio incumplido.**
- **Si llegan vagos, se reescriben como propuesta y se confirman.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué debe estar definido para empezar | `definition-of-ready` |
| Demostrar el cumplimiento al cerrar | `definition-of-done` |
| La spec completa de la que derivan | `spec-driven-development` |
| Convertirlos en escenarios ejecutables | `bdd-behavior` · `bdd-automation` |
| Qué nivel de test demuestra cada criterio | `test-strategy` |
| Recoger la evidencia | `verify-for-real` |
| Proponer criterios y confirmarlos | `ask-well` |
| `propose_criterion` en el tablero | `foundry-tablero` |
