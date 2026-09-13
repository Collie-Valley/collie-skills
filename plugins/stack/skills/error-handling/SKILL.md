---
name: error-handling
description: Manejar errores en Collie — fallar ruidoso frente a degradar, la jerarquía de excepciones de dominio y su traducción única a HTTP, nunca tragar una excepción, timeouts obligatorios, reintentos con backoff sólo sobre operaciones idempotentes, cortocircuito ante un servicio caído, y qué ve el usuario frente a qué ve el log. Cargar al escribir un `try`, al integrar un servicio externo, al definir qué devuelve un endpoint cuando algo falla, al ver errores tragados, o al diseñar la respuesta ante una dependencia caída.
---

# Skill: error-handling

Qué pasa cuando algo sale mal. Es donde se decide si un fallo es un incidente de cinco minutos o
una corrupción que se descubre semanas después.

> **La regla:** un error se maneja donde hay **información para decidir qué hacer**. En cualquier
> otro sitio, se deja subir. Capturar sin saber qué hacer es tragar.

## 1. Fallar ruidoso o degradar

| Fallar ruidoso | Degradar |
|---|---|
| Los datos quedarían inconsistentes | La funcionalidad es secundaria |
| Es una operación de dinero o crítica | Hay una alternativa aceptable |
| Continuar propagaría datos erróneos | El usuario prefiere algo a nada |
| No se sabe qué pasó | Se sabe exactamente qué falló y da igual |

```python
# ✓ degradar: el precio de referencia es informativo
try:
    reference = await self._rates.current(currency)
except RateServiceUnavailable:
    logger.warning("rate_service_unavailable", extra={"currency": currency.code})
    reference = None      # la pantalla lo muestra como "no disponible"

# ✓ fallar: sin tipo de cambio no se puede cobrar
rate = await self._rates.current(currency)   # si falla, sube y la operación no ocurre
```

Degradar es una **decisión de negocio**, no una comodidad técnica. Y cuando se degrada, **el
usuario tiene que notarlo**: un dato ausente mostrado como si fuera cero es peor que un error.

## 2. Nunca tragar

```python
# ✗ el fallo desaparece y el flujo sigue con datos incompletos
try:
    stock = await self._inventory.reserve(lines)
except Exception:
    stock = None

# ✗ loguear no es manejar: el flujo continúa igual de roto
except Exception as exc:
    logger.error("something failed: %s", exc)
```

Un error tragado no desaparece: reaparece más adelante como datos corruptos, en otro sitio, sin
rastro de su origen.

Un `except` sólo es legítimo si hace una de estas cuatro cosas:

1. **Traducir** a una excepción del dominio.
2. **Reintentar** una operación idempotente.
3. **Degradar** de forma deliberada, con constancia.
4. **Añadir contexto** y relanzar (`raise ... from exc`).

```python
# ✓ traducir en el borde del adaptador
try:
    self._session.flush()
except IntegrityError as exc:
    raise DuplicateOrder(order.id) from exc
```

**`raise ... from exc` siempre**: conserva la causa original en la traza. Sin él, se pierde la
excepción que de verdad explicaba el fallo.

Y nunca `except Exception` sin relanzar. Captura hasta lo que no imaginabas, incluidos errores de
programación que deberían romper ruidosamente.

## 3. La jerarquía

```python
# domain/exceptions.py
class DomainError(Exception):
    """Base for all business rule violations."""

class NotFound(DomainError): ...
class Conflict(DomainError): ...
class PermissionDenied(DomainError): ...

class OrderNotFound(NotFound):
    def __init__(self, order_id: OrderId) -> None:
        super().__init__(f"Order {order_id} does not exist")
        self.order_id = order_id
```

Las familias intermedias permiten que el borde traduzca por categoría en vez de enumerar cada
excepción concreta — un error nuevo hereda el tratamiento correcto sin tocar el handler.

- **Nombre de negocio**, no técnico.
- **Los datos del fallo como atributos**, para construir la respuesta sin parsear el mensaje.
- **Nunca `HTTPException` en el dominio.**

## 4. La traducción: en un solo sitio

```python
# interfaces/http/error_handlers.py
_STATUS_BY_FAMILY: list[tuple[type[DomainError], int]] = [
    (NotFound, 404),
    (PermissionDenied, 403),
    (Conflict, 409),
]


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        status = next((s for family, s in _STATUS_BY_FAMILY if isinstance(exc, family)), 400)
        logger.info("domain_error", extra={"error": type(exc).__name__,
                                            "request_id": request.state.request_id})
        return JSONResponse(status_code=status, content={
            "error": type(exc).__name__,
            "detail": str(exc),
            "request_id": request.state.request_id,
        })

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error", extra={"request_id": request.state.request_id})
        return JSONResponse(status_code=500, content={
            "error": "InternalError",
            "detail": "An unexpected error occurred",
            "request_id": request.state.request_id,
        })
```

Dos cosas que no se negocian:

- **El error inesperado nunca revela el interior.** Ni traza, ni mensaje de la excepción, ni
  nombres de tabla. Todo eso va al log, con el `request_id` que los une.
- **Los errores de dominio se loguean como `info`/`warning`**, no como `error`. Son parte del
  funcionamiento normal; ensuciar el nivel de error con ellos hace que nadie mire las alertas.

## 5. Timeouts

**Toda operación que sale del proceso lleva timeout.** Sin él, una dependencia lenta acumula
peticiones hasta agotar el pool y tumba el servicio — un fallo mucho peor que una caída limpia.

```python
httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=10.0, write=10.0, pool=2.0))
```

El timeout se elige desde **cuánto puede esperar quien llama**, no desde cuánto suele tardar el
proveedor. Si el usuario espera una respuesta, 30 segundos ya es un fallo aunque el proveedor
acabe respondiendo.

También llevan timeout: las consultas a la base (`statement_timeout`), la adquisición de conexión
del pool, y los bloqueos.

## 6. Reintentos

Sólo bajo tres condiciones, las tres a la vez:

1. **La operación es idempotente** (o el destino acepta `Idempotency-Key`).
2. **El fallo es transitorio**: timeout, 502/503, conexión caída. **Nunca un 4xx**, que reintentado
   falla igual.
3. **Hay un límite** de intentos.

```python
@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, TransientProviderError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=0.2, max=5),
    reraise=True,
)
async def charge(self, ...) -> ChargeResult: ...
```

**Backoff exponencial con jitter**: sin espera creciente, se amplifica la caída del proveedor; sin
jitter, todos los clientes reintentan a la vez y crean una ola sincronizada.

Reintentar un `POST` no idempotente que crea pedidos es cómo se acaba con tres pedidos idénticos.

## 7. Cortocircuito

Cuando un proveedor está caído, seguir llamándolo agota tus recursos esperando timeouts. El patrón:
tras N fallos consecutivos, se abre el circuito y se falla **de inmediato** durante un periodo;
después se deja pasar una petición de prueba.

Merece la pena cuando: la dependencia es externa, hay volumen alto, y existe una respuesta
degradada aceptable. Para una llamada ocasional, el timeout basta.

## 8. Qué ve el usuario, qué ve el log

| | Usuario | Log |
|---|---|---|
| Error de negocio | Qué pasó y qué hacer | Código, contexto, `request_id` |
| Error de validación | Qué campo y qué se esperaba | Igual |
| Error inesperado | Mensaje genérico + `request_id` | **Traza completa** y contexto |
| Dependencia caída | "No disponible, inténtalo más tarde" | Qué dependencia, cuánto tardó, qué devolvió |

El `request_id` es la pieza que une ambos mundos: el usuario lo reporta, soporte lo busca, y
aparece la traza exacta.

## 9. Reglas duras

- **Nunca `except: pass`, ni `except Exception` sin relanzar.**
- **Un `except` sólo vale si traduce, reintenta, degrada o añade contexto.**
- **`raise ... from exc` siempre.**
- **Loguear no es manejar.**
- **Ninguna excepción de librería cruza hacia el dominio.**
- **Nunca `HTTPException` en el dominio.**
- **Una sola traducción de errores a HTTP**, en el handler global.
- **El error inesperado nunca revela el interior**; la traza va al log con `request_id`.
- **Toda llamada saliente lleva timeout.**
- **Reintentar sólo lo idempotente, sólo ante fallos transitorios, con backoff y jitter.**
- **Degradar es una decisión de negocio, y el usuario debe notarlo.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Excepciones de dominio y sus datos | `domain-modeling` |
| Traducción en el adaptador | `hexagonal-ports-adapters` |
| Forma del error y códigos de estado | `api-contracts` |
| Logs, niveles y `request_id` | `observability` |
| Timeouts y bloqueo del event loop | `async-discipline` |
| Idempotencia en escrituras | `api-contracts` · `data-modeling` |
| Errores en la interfaz | `frontend-quality` |
| Probar los caminos de error | `unit-testing-domain` · `integration-testing` |
