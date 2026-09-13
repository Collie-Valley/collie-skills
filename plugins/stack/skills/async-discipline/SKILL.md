---
name: async-discipline
description: Async en FastAPI sin bloquear el event loop en Collie — cuándo `def` y cuándo `async def`, el error de llamar código bloqueante dentro de un endpoint async, `run_in_threadpool` y `asyncio.to_thread`, drivers async frente a síncronos, concurrencia con `gather` y límites, background tasks frente a cola real, y cómo se detecta un loop bloqueado. Cargar al escribir un endpoint o una dependencia, al elegir entre `def` y `async def`, al integrar una librería síncrona, al ver latencias que se disparan bajo carga, o al necesitar paralelizar llamadas.
---

# Skill: async-discipline

El error más caro y más silencioso de FastAPI: un endpoint `async def` que hace algo bloqueante.
No falla, no da error — simplemente el servidor deja de escalar y nadie sabe por qué.

> **La regla:** dentro de un `async def`, **cualquier operación bloqueante detiene a todas las
> peticiones del proceso**, no sólo a la suya. El event loop es un único hilo compartido.

## 1. Cómo funciona FastAPI con cada tipo

| Declaración | Dónde se ejecuta | Consecuencia |
|---|---|---|
| `def` (síncrono) | En un hilo del threadpool | Bloquear es seguro; limitado por el tamaño del pool |
| `async def` | En el event loop | **Bloquear congela todo el proceso** |

FastAPI es explícito en esto y la mayoría lo ignora: **declarar `def` no es peor que `async def`**.
Es lo correcto cuando el código es bloqueante.

## 2. La regla de decisión

```
¿Todo lo que hace este endpoint es async (await de verdad)?
  ├── Sí  → async def
  └── No  → def          ← y es la respuesta correcta, no un apaño
```

```python
# ✓ SQLAlchemy síncrono: def, y FastAPI lo lleva al threadpool
@router.get("/orders/{order_id}")
def get_order(order_id: UUID, use_case: GetOrderDep) -> OrderResponse:
    return OrderResponse.from_entity(use_case.execute(OrderId(order_id)))


# ✓ todo el camino es async
@router.get("/orders/{order_id}")
async def get_order(order_id: UUID, use_case: GetOrderDep) -> OrderResponse:
    order = await use_case.execute(OrderId(order_id))
    return OrderResponse.from_entity(order)
```

```python
# ✗ EL ERROR: async def con una llamada bloqueante dentro
@router.get("/orders/{order_id}")
async def get_order(order_id: UUID, session: SessionDep) -> OrderResponse:
    order = session.get(OrderModel, order_id)      # driver síncrono: bloquea el loop
    response = requests.get(url)                   # requests es bloqueante: bloquea el loop
```

Con diez peticiones concurrentes, cada una bloqueando 50 ms, la décima espera medio segundo. Con
carga real, el servidor parece caído aunque la CPU esté ociosa.

## 3. Qué bloquea

Todo lo que no se espera con `await`:

| Bloqueante | Alternativa async |
|---|---|
| `requests`, `urllib` | `httpx.AsyncClient` |
| SQLAlchemy síncrono (`Session`) | `AsyncSession` con `asyncpg` |
| `time.sleep()` | `await asyncio.sleep()` |
| `open()`, `read()`, `write()` | `aiofiles`, o threadpool |
| `subprocess.run()` | `asyncio.create_subprocess_exec` |
| Cálculo intensivo (parseo grande, criptografía, imágenes) | Threadpool o proceso aparte |
| Cualquier SDK síncrono de un proveedor | Threadpool, o su variante async |

El cálculo intensivo es el caso que más se olvida: **no hay E/S, pero ocupa el hilo igual**.
Generar un PDF de 200 páginas dentro de un `async def` congela el proceso entero.

## 4. Convivir con código síncrono

Cuando la librería no tiene versión async (un SDK de un proveedor, por ejemplo):

```python
from starlette.concurrency import run_in_threadpool

@router.post("/documents")
async def create_document(payload: DocumentRequest) -> DocumentResponse:
    pdf = await run_in_threadpool(render_pdf, payload.content)   # no bloquea el loop
    await storage.save(pdf)
    return DocumentResponse(...)
```

`asyncio.to_thread(...)` es el equivalente de la biblioteca estándar. Ambos mueven la ejecución a
un hilo.

**Antes de recurrir a esto: si todo el endpoint es síncrono, declara `def` y ya está.** El
threadpool es para mezclas — parte async, parte síncrona.

## 5. Concurrencia real

Lo que sí gana async: esperar varias cosas a la vez.

```python
# ✗ secuencial: 300 ms
customer = await customers.get(customer_id)
prices = await price_list.current()
stock = await inventory.available(skus)

# ✓ concurrente: ~100 ms
customer, prices, stock = await asyncio.gather(
    customers.get(customer_id),
    price_list.current(),
    inventory.available(skus),
)
```

Sólo cuando **no dependen entre sí**. Y con dos cuidados:

- **`return_exceptions=True`** si un fallo parcial es aceptable; si no, `gather` propaga la primera
  excepción y **las demás tareas siguen corriendo** salvo que se cancelen.
- **Límite de concurrencia** cuando el número de tareas depende de la entrada. Cien llamadas
  simultáneas a un proveedor externo es una forma de que te bloqueen:

```python
semaphore = asyncio.Semaphore(10)

async def fetch_one(sku: Sku) -> Price:
    async with semaphore:
        return await provider.price_for(sku)

prices = await asyncio.gather(*(fetch_one(sku) for sku in skus))
```

## 6. Background tasks: lo que no son

```python
@router.post("/orders")
async def place_order(payload: ..., background: BackgroundTasks) -> OrderResponse:
    order_id = await use_case.execute(command)
    background.add_task(send_confirmation_email, order_id)
    return OrderResponse(id=str(order_id))
```

`BackgroundTasks` se ejecuta **en el mismo proceso, después de la respuesta**. Sirve para algo
rápido y no crítico.

**No sirve** cuando el trabajo: debe sobrevivir a un reinicio, necesita reintentos, tarda más de
unos segundos, o es crítico para el negocio. Si el proceso muere, la tarea se pierde en silencio
— y nadie se entera, porque el cliente ya recibió su 201.

Para eso, una cola real (Celery, ARQ, Dramatiq) con persistencia y reintentos. La frontera es
clara: **si perderlo importa, va a la cola**.

## 7. Recursos compartidos

```python
# ✗ un cliente nuevo por petición: no reutiliza conexiones, agota puertos
async def call_provider() -> dict:
    async with httpx.AsyncClient() as client:
        return (await client.get(url)).json()
```

```python
# ✓ uno por proceso, con su ciclo de vida
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.http = httpx.AsyncClient(timeout=10.0, limits=httpx.Limits(max_connections=100))
    yield
    await app.state.http.aclose()
```

Y **timeout siempre**: un cliente HTTP sin timeout espera indefinidamente, acumula peticiones y
tumba el servicio cuando el proveedor se degrada — que es peor que cuando se cae del todo.

## 8. Detectar un loop bloqueado

Síntomas: latencias que se disparan bajo carga con CPU baja; el healthcheck que responde tarde; un
endpoint rápido que se vuelve lento cuando otro endpoint distinto recibe tráfico.

```python
# en local: avisa de cualquier tarea que ocupe el loop demasiado
asyncio.get_event_loop().set_debug(True)
```

Y la revisión mecánica, que atrapa la mayoría:

```bash
# llamadas bloqueantes conocidas dentro de funciones async
grep -rn "async def" -A 20 src/ | grep -E "requests\.|time\.sleep|\.execute\(|open\("
```

`ruff` con las reglas `ASYNC` (flake8-async) detecta varios de estos patrones automáticamente.

## 9. Errores frecuentes

| Error | Consecuencia |
|---|---|
| `async def` con driver síncrono | El loop se bloquea; el servidor no escala |
| `requests` dentro de async | Igual |
| `time.sleep` en async | Igual |
| Cálculo pesado en async | Igual, sin que haya E/S de por medio |
| Cliente HTTP nuevo por petición | Sin reutilización de conexiones |
| Sin timeout en llamadas salientes | Un proveedor lento tumba el servicio |
| `gather` sin límite sobre entrada del usuario | Ráfaga contra un tercero |
| `BackgroundTasks` para trabajo crítico | Se pierde en un reinicio |
| Mezclar `AsyncSession` y `Session` | Comportamiento transaccional impredecible |
| `async def` "por si acaso" | Falsa sensación de concurrencia |

## 10. Reglas duras

- **Si algo dentro es bloqueante, el endpoint se declara `def`.** No es un apaño.
- **Nunca código bloqueante dentro de un `async def`.**
- **Un solo mundo por camino**: todo async o todo síncrono, de extremo a extremo.
- **`run_in_threadpool` sólo para mezclas**, no para endpoints enteramente síncronos.
- **Toda llamada saliente lleva timeout.**
- **Clientes HTTP y pools: uno por proceso**, con `lifespan`.
- **`gather` sólo para operaciones independientes**, y con semáforo si el número lo marca la
  entrada.
- **`BackgroundTasks` sólo para lo rápido y no crítico.** Lo demás, cola con persistencia.
- **Cálculo intensivo fuera del event loop.**
- **Las reglas `ASYNC` de `ruff` activadas.**

## 11. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Cableado de dependencias y `lifespan` | `dependency-injection` |
| Sesiones, transacciones y N+1 | `data-modeling` |
| Timeouts, reintentos e idempotencia | `error-handling` |
| Medir antes de optimizar | `performance` |
| Detectar latencia en producción | `observability` |
| Probar endpoints async | `integration-testing` |
| Dónde vive la lógica | `clean-architecture` |
