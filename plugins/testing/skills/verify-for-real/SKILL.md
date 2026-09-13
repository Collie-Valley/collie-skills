---
name: verify-for-real
description: Verificar de verdad antes de decir que algo funciona en Collie — ejecutar en vez de razonar, la secuencia de comandos que se corre siempre, cómo se lee una salida (incluidos los skipped y los warnings), ejercitar la ruta real además de los tests, qué hacer cuando no se puede verificar, y las trampas de la falsa verificación. Cargar antes de decir que algo funciona o está listo, al cerrar una tarea, al escribir un reporte o un PR, después de cualquier cambio de código, o al arreglar un bug.
---

# Skill: verify-for-real

Ejecutar antes de afirmar. `honest-status` dice cómo se reporta; esta skill dice **cómo se
obtiene** lo que se reporta.

> **La regla:** leer el código no es verificarlo. Un cambio no verificado es una hipótesis, por
> obvio que parezca — y los cambios obvios son precisamente los que se rompen, porque nadie los
> comprueba.

## 1. La secuencia mínima

Después de cualquier cambio de código, en este orden. Se para en el primero que falle.

```bash
ruff check . && ruff format --check .     # estilo y formato
mypy src                                   # tipos
lint-imports                               # la arquitectura
pytest -q                                  # la suite
```

Y para lo que toca el borde o la infraestructura, además:

```bash
docker compose up -d
alembic upgrade head
uvicorn src.main:app --reload             # y ejercitar la ruta real
```

**La salida se conserva.** Es lo que se pega en el reporte (`definition-of-done` §1.2); escribirla
de memoria es inventarla.

## 2. Los tests no bastan

Cuatro clases de fallo que la suite verde no detecta y que la ruta real sí:

- **Cableado.** El caso de uso construido con el adaptador equivocado, una dependencia que no se
  registró.
- **Migraciones.** Pasan en una base vacía y fallan sobre la real.
- **Configuración.** Una variable que falta, un valor por defecto que sólo existe en tests.
- **Serialización.** Un `Decimal` o un `datetime` que revienta al convertir a JSON, o un campo que
  sale con otro nombre.

**Arrancar la aplicación y ejercitar el recorrido es parte de la verificación**, no un extra.

## 3. Leer la salida entera

Una salida verde no se mira por encima. Tres cosas dentro de ella importan:

```
312 passed, 2 skipped, 3 warnings in 8.41s
```

- **Los `skipped`.** Cada uno se explica. Un test saltado por una condición de entorno es
  aceptable si se dice; uno saltado con `@pytest.mark.skip` sin motivo es un test roto que alguien
  escondió.
- **Los `warnings`.** Un `DeprecationWarning` de hoy es el fallo del próximo upgrade. Y a veces el
  warning es el bug: `RuntimeWarning: coroutine was never awaited`.
- **El tiempo.** Si la suite tarda de pronto el triple, algo empezó a tocar red o base de datos
  donde no debía.

Y la comprobación que más veces salva: **¿el test que acabo de escribir se ejecutó de verdad?** Un
archivo mal nombrado, un `conftest` en el sitio equivocado o un filtro de marcador hacen que
`pytest` no lo recoja y la suite salga verde sin haberlo corrido.

```bash
pytest tests/unit/billing/test_invoice.py -v    # verlo pasar por su nombre
```

## 4. El test debe fallar antes

Un test que nunca se vio fallar no prueba nada. Es la comprobación más barata y la que más falsos
positivos elimina.

- **Al arreglar un bug**: escribe el test, **córrelo y compruébalo en rojo** reproduciendo el
  fallo, y sólo después arregla. Un test escrito después del arreglo puede estar pasando por
  motivos que no tienen que ver con el bug.
- **Al escribir una funcionalidad**: si el test pasa a la primera antes de implementar nada, el
  test está mal.
- **Comprobación rápida**: rompe a propósito la línea que el test cubre y mira si se pone rojo. Si
  sigue verde, el test no cubre lo que crees.

## 5. Verificar un arreglo de bug

Cuatro pasos, en este orden. Saltarse el primero es lo que produce arreglos que no arreglan nada:

1. **Reproducir el fallo original** y ver el error real.
2. **Escribir el test** que lo captura, y verlo fallar por el mismo motivo.
3. **Arreglar.**
4. **Ver el test en verde y la suite completa también** — que el arreglo no haya roto otra cosa.

Sin el paso 1, no se sabe si el problema era el que se creía.

## 6. Cuando no se puede verificar

Pasa: falta una credencial, un servicio externo, un entorno, un dispositivo. Lo que **no** vale es
omitirlo.

```
Escrito, verificado en parte.

Sí verificado:
  pytest tests/unit -q → 48 passed in 0.9s
  El caso de uso funciona contra el fake del proveedor.

NO verificado:
  El adaptador real contra la pasarela de pagos: falta PAYMENT_API_KEY en
  este entorno. No sé si la firma de la petición es correcta.

Para verificarlo hace falta: la credencial de sandbox, y ejecutar
`pytest tests/integration/payments -m external`.
```

Se declara **qué falta, por qué, y qué haría falta para cerrarlo**. Eso convierte un hueco en algo
accionable.

## 7. Las trampas de la falsa verificación

| Trampa | Por qué engaña |
|---|---|
| "Los tests pasaban antes del cambio" | Prueba que no rompiste lo viejo, no que lo nuevo funcione |
| Correr sólo el test nuevo | No detecta lo que rompiste en otro sitio |
| Correr sólo la suite y no la app | No detecta cableado, migraciones ni serialización |
| Mirar el resumen y no la salida | Los skipped y los warnings viven ahí |
| Verificar con datos que tú elegiste | Los casos límite reales no suelen ser los que uno imagina |
| Confiar en la caché de un build | Un build incremental puede no recompilar lo que cambiaste |
| Dar por válida la salida de otro agente | Es un dato, no una verificación (ver `honest-status` §7) |
| "Es un cambio de una línea" | Los cambios de una línea rompen producción con frecuencia |

## 8. Proporcionalidad

Lo que siempre se corre, cambie lo que cambie: `ruff`, `mypy`, `lint-imports`, `pytest`. Es
cuestión de segundos.

Lo que escala con el cambio:

| Cambio | Además |
|---|---|
| Lógica de dominio | Los tests unitarios de ese módulo, vistos pasar por nombre |
| Adaptador o repositorio | Tests de integración contra el contenedor real |
| Endpoint | Arrancar y ejercitar la ruta con una petición real |
| Migración | Aplicarla **y revertirla** en local |
| Frontend | Abrirlo en el navegador; e2e si toca un recorrido crítico |
| Dependencia | La suite completa, no un subconjunto |
| Configuración o despliegue | Arrancar desde cero, como lo haría una máquina nueva |

## 9. Reglas duras

- **Leer el código no es verificarlo.** Se ejecuta.
- **La salida se conserva y se pega tal cual.** Nunca se escribe de memoria ni se inventa.
- **`ruff`, `mypy`, `lint-imports` y `pytest` se corren siempre.**
- **La aplicación se arranca y la ruta se ejercita**, no sólo los tests.
- **Un test que no se ha visto fallar no prueba nada.**
- **Un bug se reproduce antes de arreglarse.**
- **Se comprueba que el test nuevo se ejecutó de verdad.**
- **Los `skipped` y los `warnings` se leen y se explican.**
- **Lo que no se pudo verificar se declara**, con qué falta para cerrarlo.
- **"Es un cambio pequeño" no exime de nada.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Cómo se reporta lo verificado | `honest-status` |
| La checklist completa de cierre | `definition-of-done` |
| Qué nivel de test merece cada cosa | `test-strategy` |
| Tests que pasan sin probar nada | `test-quality` |
| Tests contra base de datos real | `integration-testing` |
| Recorridos por navegador | `e2e-playwright` |
| Comandos del proyecto y CI | `local-dev-and-ci` |
