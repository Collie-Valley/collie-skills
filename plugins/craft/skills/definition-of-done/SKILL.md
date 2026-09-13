---
name: definition-of-done
description: La puerta de salida del trabajo en Collie — la checklist que una tarjeta debe cumplir antes de pasar a revisión (criterios cubiertos uno a uno con evidencia, tests verdes con salida pegada, arquitectura respetada, seguridad, documentación, migración reversible, deuda registrada), el veredicto ok/parcial/fallo, y por qué `done` lo decide siempre el humano. Cargar antes de dar una tarea por terminada, al mover una tarjeta a revisión, al escribir un reporte de avance o verificación, al abrir un PR, o al sentir la tentación de decir "listo".
---

# Skill: definition-of-done

La puerta de salida. Nada entra en revisión sin cruzarla.

> **La regla:** "terminado" no es "el código está escrito". Es **"alguien puede comprobar que
> funciona"**. Si la evidencia no existe, la tarea no está terminada — está escrita.

Es la pareja de `definition-of-ready`. Los criterios que aquella exigió escribir son exactamente
los que ésta exige demostrar.

## 1. La checklist

Nueve puntos. Se recorren **antes** de mover la tarjeta.

### 1.1 Cada criterio de aceptación, cubierto y demostrado

Uno por uno, no en bloque. Para cada criterio: cómo se cumple y **qué lo demuestra**.

```
✓ "Con 10.000 pedidos el archivo empieza en <3s"
  → test_export_large_dataset: 1.4s (tests/integration/billing/test_export.py)

✓ "Los pedidos cancelados se incluyen"
  → test_export_includes_cancelled_orders

✗ "El CSV se abre en Excel sin romper acentos"
  → falta prueba humana: generado con UTF-8 BOM, no verificado en Excel real
```

Un criterio sin evidencia es un criterio **no cumplido**. Y si uno queda fuera, el veredicto es
`parcial` y se dice cuál, sin enterrarlo.

### 1.2 Los tests corren y su salida está pegada

No "los tests pasan": **la salida real, con números**.

```
pytest -q
  312 passed, 2 skipped in 8.41s
lint-imports
  Contracts: 4 kept, 0 broken.
ruff check . && mypy src
  All checks passed.
```

Los dos `skipped` se explican. Un test saltado sin explicación es un test roto que nadie quiere
mirar.

Y **tests nuevos para lo nuevo**: una funcionalidad sin test propio no está terminada, aunque la
suite entera esté verde. La suite verde sólo prueba que no rompiste lo de antes.

### 1.3 La aplicación arranca y la ruta funciona

Correr la app y ejercitar el recorrido real, no sólo los tests. Muchos fallos —cableado,
migraciones, configuración, serialización— sólo aparecen ahí.

Si no se puede correr (falta un entorno, una credencial), se dice **explícitamente** en la
verificación. No se omite.

### 1.4 La arquitectura se respeta

- `lint-imports` en verde. Si el módulo es nuevo, **sus contratos están añadidos**.
- El nivel de arquitectura declarado corresponde a lo que se escribió (`architecture-hybrid`).
- Sin modelos ORM saliendo por la API, sin `Session` en firmas de routers, sin lógica de negocio
  en el borde.

### 1.5 La pasada de seguridad está hecha

Proporcional al riesgo declarado en la DoR: sin secretos en el código, autorización verificada en
el servidor, entradas validadas en el borde, sin datos sensibles en logs, dependencias nuevas
revisadas. Detalle en `security-diff-review`.

### 1.6 Los errores y los bordes están cubiertos

El camino feliz no es la entrega. Qué pasa con la entrada vacía, el permiso denegado, el servicio
caído, el timeout, los datos duplicados. Cada respuesta de error tiene su forma y su código
correctos.

### 1.7 La documentación tocada está actualizada

Sólo lo que este cambio afecta: `README` si cambió cómo se arranca, `.env.example` si hay variable
nueva, el `README.md` del módulo si cambió su nivel, un ADR si se tomó una decisión estructural.
OpenAPI se genera solo, pero **se mira** que el contrato publicado sea el que se quería.

No se escribe documentación de relleno. Se actualiza la que este cambio dejó mentirosa.

### 1.8 Migraciones y reversibilidad

Si hay migración: se aplica y se revierte limpia en local, no bloquea tablas grandes en caliente,
y es compatible con la versión anterior del código mientras dura el despliegue.

Si el cambio es difícil de revertir, **el plan de reversión está escrito** en la tarjeta.

### 1.9 La deuda encontrada está registrada

Lo que se vio de camino y no se arregló: tarjeta nueva con cómo reproducirlo y por qué se dejó. No
se arregla en silencio (ensucia el PR) ni se pierde (vuelve como incidencia).

## 2. El veredicto

| Veredicto | Cuándo | Qué se reporta |
|---|---|---|
| **ok** | Todos los criterios cubiertos con evidencia, checklist completa | Los números y qué se verificó |
| **parcial** | Lo entregado funciona, pero algo queda fuera o sin verificar | **Qué falta exactamente** y por qué |
| **fallo** | No cumple el alcance, o algo verificado no funciona | Qué falla y con qué salida |

`parcial` es el veredicto honesto más frecuente y **no es un fracaso**: la prueba en un Excel real,
el comportamiento con datos de producción o la validación de negocio suelen necesitar a una
persona. Decirlo tal cual es lo correcto. Declarar `ok` cuando falta la prueba de fuego humana es
el error que esta skill existe para impedir.

## 3. `done` lo decide el humano

La tarjeta se mueve a **revisión**, nunca a `done`. Quien pidió el trabajo decide si está hecho,
y hasta entonces el trabajo está entregado pero no aceptado.

Es también la razón de que el reporte importe: el humano decide **leyendo la evidencia**, y si la
evidencia es "listo ✅" no puede decidir nada.

## 4. Cómo se reporta

Con tablero (ver `foundry-tablero`):

- **`report_progress`** — qué se construyó, respondiendo al alcance de la tarjeta, y qué quedó
  fuera y por qué. `repo_url` apunta al commit; si la rama no está pusheada, se avisa.
- **`report_verification`** — el veredicto con la evidencia y los números.
- **`transition_task`** — a la columna de revisión.

Sin tablero, lo mismo en el PR: qué se construyó, qué queda fuera, y la salida de las
verificaciones pegada.

## 5. Proporcionalidad

La checklist es la misma; el rigor de la evidencia escala con el riesgo declarado en la DoR:

| Riesgo | Evidencia esperada |
|---|---|
| Bajo (texto, estilo, interno) | Tests verdes y la ruta ejercitada |
| Medio (funcionalidad de usuario) | + tests nuevos, bordes cubiertos, pasada de seguridad |
| Alto (dinero, datos personales, borrado, integraciones) | + plan de reversión escrito, verificación humana explícita, revisión de otra persona |

Lo que **no** escala: los criterios de aceptación se demuestran uno a uno siempre, y la salida de
los tests se pega siempre.

## 6. Las excusas que no valen

| Excusa | Por qué no |
|---|---|
| "Es un cambio pequeño" | Los cambios pequeños rompen producción a menudo; correr los tests cuesta segundos |
| "Los tests ya pasaban antes" | Eso prueba que no rompiste lo viejo, no que lo nuevo funcione |
| "Lo probé a mano y va bien" | Sin test, el siguiente cambio lo rompe y nadie se entera |
| "El linter no aplica aquí" | Si de verdad no aplica, se cambia el contrato y se justifica |
| "Lo documento después" | Después es nunca; el `.env.example` desactualizado bloquea al siguiente |
| "Total, lo reviso yo mismo" | La autorrevisión no sustituye la revisión; ver `honest-status` |

## 7. Reglas duras

- **Sin evidencia, no está hecho.** Un criterio sin demostración es un criterio incumplido.
- **La salida de los tests se pega con números.** "Los tests pasan" no es evidencia.
- **Funcionalidad nueva, test nuevo.** Sin excepciones por tamaño.
- **La app se arranca y la ruta se ejercita**, no sólo los tests.
- **`lint-imports`, `ruff` y `mypy` en verde**, y los contratos del módulo nuevo añadidos.
- **`parcial` cuando falta la prueba humana**, dicho tal cual y con qué falta.
- **Nunca `ok` sobre algo no verificado.**
- **La tarjeta va a revisión, jamás a `done`.**
- **La deuda encontrada se registra como tarjeta**, no se arregla en silencio.
- **Riesgo alto lleva plan de reversión escrito.**

## 8. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La puerta de entrada | `definition-of-ready` |
| Cómo se ejecuta y se pega la evidencia | `verify-for-real` |
| No declarar hecho lo no verificado | `honest-status` |
| Criterios verificables | `acceptance-criteria` |
| La pasada de seguridad al diff | `security-diff-review` |
| Registrar deuda encontrada | `tech-debt` |
| Commits y descripción del PR | `git-discipline` |
| Avance, verificación y transición | `foundry-tablero` |
| Migraciones reversibles | `data-modeling` |
