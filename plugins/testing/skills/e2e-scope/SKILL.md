---
name: e2e-scope
description: Qué merece un test end-to-end en Collie y qué no — el filtro de tres preguntas, los recorridos críticos frente a las variaciones, el coste real de un e2e a lo largo del tiempo, cómo se decide que un e2e debe morir, y qué nivel de prueba usar en su lugar. Cargar antes de escribir un e2e, al revisar una suite e2e que crece o tarda demasiado, al decidir la cobertura de una funcionalidad nueva, o al plantearse borrar tests.
---

# Skill: e2e-scope

La decisión de si algo merece navegador. Es más importante que cómo se escribe el test, porque un
e2e que no debía existir sigue costando aunque esté impecablemente escrito.

> **La regla:** un e2e se justifica cuando prueba **la integración de todas las piezas en un
> recorrido que, si se rompe, nos enteramos tarde y duele**. Todo lo demás se prueba más abajo.

## 1. El coste real

Un e2e no cuesta lo que tarda en escribirse. Cuesta, durante años:

| Coste | Magnitud |
|---|---|
| Tiempo en cada ejecución | Segundos o minutos, en cada PR de todo el equipo |
| Mantenimiento | Se rompe con cada cambio de interfaz, aunque el comportamiento esté bien |
| Inestabilidad | Aunque esté bien escrito, la red y el entorno fallan a veces |
| Diagnóstico | Cuando falla, saber por qué cuesta mucho más que en un unitario |
| Infraestructura | Navegadores, entorno levantado, datos |

Un e2e que se ejecuta veinte veces al día durante dos años son miles de ejecuciones. **Si cubre
algo que un test de api verificaba igual de bien en 30 ms, es una mala inversión.**

## 2. El filtro de tres preguntas

Las tres deben dar "sí". Si alguna da "no", el test va a otro nivel.

### 2.1 ¿Es un recorrido crítico de negocio?

Que si se rompe: se pierde dinero, se bloquea a los usuarios, o nos enteramos por una queja.

- ✓ Registrarse e iniciar sesión.
- ✓ Completar una compra o un pedido.
- ✓ El flujo de pago.
- ✓ El recorrido principal del producto, el que hace todo el mundo cada día.
- ✗ Cambiar el avatar. Filtrar un listado. Ordenar una tabla.

### 2.2 ¿Sólo se puede verificar con todas las piezas juntas?

El e2e existe para probar **la integración**: front + API + base de datos + sesión + navegación
reales. Si el riesgo que cubre es de una sola pieza, se prueba en esa pieza.

- ✓ Que el token que emite el backend lo acepta el frontend y sobrevive a una recarga.
- ✓ Que tras pagar, el pedido aparece con el estado correcto en la pantalla.
- ✗ Que un email mal formado se rechaza. Eso es validación: unitario.
- ✗ Que un endpoint devuelve 403 sin permiso. Eso es un test de api.

### 2.3 ¿El fallo sería invisible en los otros niveles?

Si un test de api o de integración ya lo detectaría, el e2e es redundante. La pregunta concreta:
**¿qué fallo real atrapa este e2e que no atrape nada más?** Si no hay respuesta, no se escribe.

## 3. Recorrido principal, no variaciones

Para un recorrido que pasa el filtro, se escribe **un** e2e del camino principal. Las variaciones
van más abajo.

```
Checkout:
  e2e  → comprar con tarjeta válida, de principio a fin              (1 test)
  api  → tarjeta rechazada, stock insuficiente, cupón caducado,
         dirección inválida, sesión expirada                         (5 tests, 30 ms cada uno)
  unit → cálculo de totales, impuestos, descuentos, redondeo         (20 tests, 1 ms cada uno)
```

El error clásico es el inverso: seis e2e de checkout cubriendo cada variante de error, tardando
cuatro minutos, y cero tests unitarios del cálculo de impuestos — que es donde de verdad aparecen
los bugs.

## 4. Cuántos

Una suite e2e sana en un producto normal tiene **entre cinco y veinte** tests. No cientos.

Si crece más:

- Se están probando variaciones que pertenecen a niveles inferiores.
- O el producto tiene de verdad muchos recorridos críticos, y entonces la suite debe partirse:
  un subconjunto de humo en cada PR, la suite completa antes de desplegar o por la noche.

**Regla práctica:** si la suite e2e tarda más que el resto del pipeline junto, está mal
dimensionada y alguien acabará desactivándola.

## 5. Cuándo un e2e debe morir

Borrar un test es una acción legítima y se hace poco. Un e2e se elimina cuando:

- **Cubre algo que ya cubre un test más barato**, escrito después.
- **Se rompe constantemente por cambios de interfaz** y nunca ha atrapado un bug real.
- **El recorrido dejó de ser crítico** porque el producto cambió.
- **Nadie sabe qué verifica.** Un test cuyo fallo no se sabe interpretar no protege nada.

Antes de borrar: comprobar **qué riesgo deja de cubrir** y, si el riesgo sigue vivo, cubrirlo en el
nivel correcto. Borrar sin sustituir es aceptable sólo cuando el riesgo desapareció.

Y lo contrario: **un e2e que atrapa un bug real justifica su existencia entera**. Eso se recuerda
cuando se discute si vale la pena.

## 6. El cálculo, en una tabla

| Lo que quieres verificar | Nivel |
|---|---|
| Una regla de negocio, un cálculo | unit |
| Una validación de entrada | unit o api |
| Un código de estado, un permiso | api |
| Que el repositorio guarda y lee bien | integration |
| Que el fake y el real se comportan igual | contract |
| Que el contrato front-back encaja | contract (tipos generados) |
| Que el recorrido crítico completo funciona de punta a punta | **e2e** |
| Que una pantalla se ve bien | revisión visual, no e2e |
| Que algo es accesible | herramienta de accesibilidad en CI |
| Que algo es rápido | prueba de rendimiento, no e2e |

Las tres últimas filas importan: es habitual intentar meter en e2e cosas que tienen herramientas
mejores.

## 7. Preguntas antes de escribir uno

1. ¿Qué fallo concreto atrapa esto que no atrape ningún otro test?
2. ¿Podría verificarlo con un test de api en 30 ms?
3. ¿Este recorrido lo hacen los usuarios todos los días?
4. Si se rompe, ¿nos enteraríamos por otra vía antes de que duela?
5. ¿Cuánto va a tardar, y quién lo mantendrá cuando la interfaz cambie?

Si la primera no tiene respuesta clara, no se escribe.

## 8. Reglas duras

- **Un e2e exige las tres respuestas afirmativas del filtro.**
- **Un recorrido crítico, un e2e del camino principal.** Las variaciones, más abajo.
- **Ningún e2e prueba validaciones, cálculos ni códigos de estado.**
- **La suite e2e no debe tardar más que el resto del pipeline.**
- **Si la suite pasa de unas decenas de tests, se ha desbordado** hacia abajo.
- **Un e2e que nunca atrapó un bug y se rompe a menudo se borra.**
- **Antes de borrar, se comprueba qué riesgo queda descubierto.**
- **Accesibilidad, rendimiento y aspecto visual tienen sus propias herramientas**, no e2e.
- **Todo e2e debe poder responder qué fallo único atrapa.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Cómo se escribe un e2e sin fragilidad | `e2e-playwright` |
| El reparto entre niveles | `test-strategy` |
| Escenarios de negocio y dónde se ejecutan | `bdd-automation` |
| Priorizar por riesgo | `coverage-and-risk` |
| Tests inestables | `test-quality` |
| Accesibilidad y rendimiento del front | `frontend-quality` |
| Duración del pipeline | `local-dev-and-ci` |
