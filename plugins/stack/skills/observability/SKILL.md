---
name: observability
description: Ver qué hace el sistema en producción en Collie — logging estructurado con niveles correctos, request_id que cruza frontend, API y logs, qué se loguea y qué jamás, las métricas que importan (latencia por percentiles, errores, saturación), trazas distribuidas, healthchecks que dicen la verdad, y alertas sobre síntomas y no sobre causas. Cargar al añadir logging, al instrumentar un servicio, al diseñar healthchecks o alertas, al investigar un incidente sin datos suficientes, o al preguntarse qué haría falta saber a las 3 de la mañana.
---

# Skill: observability

Lo que permite saber qué está pasando cuando algo falla y no se puede reproducir.

> **La pregunta que guía todo:** son las 3 de la mañana, un cliente dice que su pedido no se
> guardó, y sólo tienes los logs. **¿Puedes averiguar qué pasó?** Si la respuesta es no, falta
> instrumentación.

## 1. Logging estructurado

```python
# ✗ imposible de consultar, filtrar o agregar
logger.info(f"Order {order_id} placed by {customer_id} for {total}")

# ✓ campos consultables
logger.info("order_placed", extra={
    "order_id": str(order.id),
    "customer_id": str(order.customer_id),
    "total_minor": order.total().minor_units,
    "currency": order.total().currency.code,
})
```

Salida JSON en producción (`structlog` o `python-json-logger`), legible en local. La diferencia
práctica: con estructura se puede preguntar "todos los pedidos de más de 10.000 que fallaron hoy";
con texto plano, sólo se puede buscar una cadena.

- **El mensaje es un evento estable** (`order_placed`), no una frase con variables dentro. Así se
  agrupa y se cuenta.
- **Nada de `print`.** No tiene nivel, ni estructura, ni destino configurable.
- **Los campos se nombran igual en todo el sistema**: `order_id` siempre, nunca `orderId` en un
  sitio y `order` en otro.

## 2. Niveles

| Nivel | Cuándo | Alerta |
|---|---|---|
| `DEBUG` | Detalle para desarrollo. Apagado en producción | No |
| `INFO` | Eventos de negocio: se creó, se confirmó, se envió | No |
| `WARNING` | Algo anómalo pero manejado: reintento, degradación, límite alcanzado | Si se repite |
| `ERROR` | Falló algo que debía funcionar; alguien tiene que mirarlo | Sí |
| `CRITICAL` | El servicio no puede operar | Sí, inmediata |

El error más común es **loguear errores de negocio como `ERROR`**. Un pedido rechazado por stock
insuficiente es funcionamiento normal: va en `INFO`. Si el nivel `ERROR` se llena de cosas
normales, nadie mira las alertas — y ahí se pierde el fallo real.

## 3. `request_id`: la pieza que une todo

Un identificador por petición que atraviesa el sistema entero y aparece en cada log.

```python
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(ULID())
    request.state.request_id = request_id
    bind_contextvars(request_id=request_id)     # entra en todos los logs de esta petición
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

La cadena completa: **el frontend lo genera o lo recibe → lo envía en la cabecera → el backend lo
propaga a los logs, a los servicios internos y a las tareas en segundo plano → vuelve en la
respuesta y en el cuerpo del error** (ver `api-contracts` §3).

Con esto, un usuario que reporta un error da un identificador y aparece la historia completa.
Sin esto, se busca por hora aproximada entre miles de líneas.

## 4. Qué no se loguea nunca

| Nunca | Por qué |
|---|---|
| Contraseñas, tokens, claves, cookies | Compromiso directo |
| Números de tarjeta o cuenta | Datos financieros |
| Documentos de identidad, correo, teléfono, dirección | Datos personales (ver `sensitive-data`) |
| Cuerpos completos de petición o respuesta | Todo lo anterior, sin control |
| Datos de salud o categorías especiales | Nunca |

Se loguean **identificadores internos**, que sólo significan algo dentro del sistema. Y el objeto
de settings usa `SecretStr` para que imprimirlo no exponga nada.

## 5. Métricas

Cuatro señales cubren la mayoría de los problemas:

| Señal | Qué medir |
|---|---|
| **Latencia** | Percentiles p50, p95, p99 por endpoint. **Nunca la media** |
| **Tráfico** | Peticiones por segundo, por endpoint |
| **Errores** | Tasa de 5xx y de 4xx, por endpoint |
| **Saturación** | Conexiones del pool en uso, memoria, cola de tareas |

**La media miente.** Con 99 peticiones de 10 ms y una de 10 s, la media son 110 ms y parece
correcto; el p99 muestra los 10 s que está sufriendo el 1% de los usuarios.

Y métricas de negocio, que suelen detectar incidentes antes que las técnicas: pedidos por hora,
pagos rechazados, exportaciones fallidas. Una caída a cero en "pedidos creados por hora" es una
alerta más útil que cualquier métrica de CPU.

**Cardinalidad**: nunca una etiqueta con valores ilimitados (`customer_id`, `order_id`). Eso
multiplica las series temporales hasta reventar el sistema de métricas. Los identificadores van en
logs y trazas, no en etiquetas de métricas.

## 6. Trazas

Una traza muestra el camino completo de una petición con el tiempo de cada tramo: router, caso de
uso, consultas, llamadas externas.

Es lo que responde "¿por qué este endpoint tarda 3 segundos?" sin adivinar. Con OpenTelemetry y la
instrumentación automática de FastAPI, SQLAlchemy y httpx se cubre casi todo; se añaden tramos
manuales sólo en operaciones de negocio relevantes.

El muestreo: 100% de los errores y de lo lento, un porcentaje pequeño del resto.

## 7. Healthchecks que dicen la verdad

```python
@router.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}          # ¿el proceso responde?


@router.get("/health/ready")
async def readiness(session: SessionDep) -> dict[str, str]:
    await session.execute(text("SELECT 1"))      # ¿puede atender de verdad?
    return {"status": "ok"}
```

- **`live`**: si falla, reiniciar el proceso. **No comprueba dependencias**: si la base de datos
  cae, reiniciar la aplicación no arregla nada y el bucle de reinicios empeora la situación.
- **`ready`**: si falla, dejar de enviarle tráfico. Sí comprueba lo imprescindible.
- **Rápidos y sin efectos.** Un healthcheck que tarda 5 segundos causa el problema que debía
  detectar.
- **Ni autenticados ni logueados en `INFO`**: se ejecutan cada pocos segundos y ahogan los logs.

## 8. Alertas: sobre síntomas

Se alerta sobre **lo que el usuario sufre**, no sobre causas intermedias:

| ✓ Alerta útil | ✗ Alerta que produce ruido |
|---|---|
| Tasa de 5xx > 1% durante 5 min | CPU > 80% |
| p95 de checkout > 2 s | Una consulta lenta puntual |
| Pedidos por hora caen a cero | Memoria al 70% |
| Cola de tareas creciendo sin parar | Un reintento aislado |

Toda alerta necesita tres cosas: **ser accionable** (si no se puede hacer nada, no es alerta, es
un panel), **decir qué hacer**, y **no dispararse por ruido**. Una alerta que salta a diario sin
que nadie actúe entrena al equipo a ignorarlas — y cuando salte la de verdad, también se ignorará.

## 9. Antes de dar por instrumentado algo

- ¿Cada petición tiene `request_id` en todos sus logs?
- ¿Se puede reconstruir qué pasó con un pedido concreto sólo con los logs?
- ¿Los errores de negocio están en `INFO`/`WARNING` y sólo lo inesperado en `ERROR`?
- ¿Hay algún dato personal en los logs?
- ¿Se ve la latencia por percentiles, no la media?
- ¿Hay una métrica de negocio que detecte el fallo antes que una técnica?
- ¿El `ready` comprueba lo que de verdad hace falta para atender?

## 10. Reglas duras

- **Logging estructurado con campos**, nunca cadenas formateadas. Cero `print`.
- **El mensaje es un evento estable**; los datos van en campos.
- **Los errores de negocio no son `ERROR`.**
- **`request_id` en toda petición**, propagado y devuelto.
- **Cero datos personales y cero secretos en logs.**
- **Latencia por percentiles**, nunca la media.
- **Ninguna métrica etiquetada con identificadores** de alta cardinalidad.
- **`live` no comprueba dependencias; `ready` sí.**
- **Los healthchecks no se loguean en `INFO`.**
- **Se alerta sobre síntomas del usuario**, y toda alerta es accionable.

## 11. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué se maneja y qué se deja subir | `error-handling` |
| Qué no puede salir en un log | `sensitive-data` |
| `SecretStr` y configuración | `secrets-and-config` |
| Medir antes de optimizar | `performance` |
| `request_id` en la respuesta de error | `api-contracts` |
| Propagarlo desde el navegador | `frontend-architecture` |
| Despliegue y recogida de logs | `local-dev-and-ci` |
