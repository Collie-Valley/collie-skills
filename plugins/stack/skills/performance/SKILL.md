---
name: performance
description: Rendimiento en Collie — medir antes de optimizar, dónde está de verdad el tiempo (base de datos y red, casi nunca Python), presupuestos de latencia, N+1 y consultas sin índice, paginación, caché y su invalidación, trabajo fuera de la petición, y cómo se verifica que una optimización funcionó. Cargar al ver algo lento, antes de optimizar cualquier cosa, al diseñar algo que crecerá en volumen, al plantear una caché, o al fijar objetivos de latencia.
---

# Skill: performance

Cómo se hace rápido lo que está lento, y cómo no se pierde el tiempo haciendo rápido lo que ya
bastaba.

> **La regla:** no se optimiza sin medir. La intuición sobre dónde está el tiempo acierta poco, y
> una optimización a ciegas suele añadir complejidad permanente a cambio de nada.

## 1. Medir primero

```python
# perfilado de una función concreta
python -m cProfile -s cumtime script.py

# consultas que emite un endpoint
engine = create_engine(url, echo=True)

# qué hace el planificador con una consulta
EXPLAIN ANALYZE SELECT ...;
```

Y en producción, la traza (ver `observability` §6) es lo que da la respuesta real: qué tramo del
recorrido consume el tiempo.

**Antes de tocar nada hay que poder responder tres cosas:** qué operación es lenta, cuánto tarda
hoy, y cuánto debería tardar. Sin las tres, no se está optimizando: se está cambiando código.

## 2. Dónde está el tiempo

Por orden de frecuencia real en una aplicación como la nuestra:

| Causa | Peso típico |
|---|---|
| **Consultas a la base**: N+1, sin índice, trayendo de más | La mayoría de los casos |
| **Llamadas de red** en serie que podrían ser concurrentes | Frecuente |
| **El event loop bloqueado** (ver `async-discipline`) | Frecuente, y muy mal diagnosticado |
| **Serializar demasiados datos** | Cuando hay listados grandes |
| **Cálculo en Python** | Raro |

La última fila es la que sorprende: **casi nunca el problema es que Python sea lento**. Reescribir
un bucle mientras hay un N+1 al lado es trabajo desperdiciado.

## 3. Base de datos

### N+1

El caso más común. `lazy="raise"` lo convierte en un error de test en vez de una degradación
silenciosa; se carga explícitamente con `selectinload`. Detalle en `data-modeling` §4.

**Test de regresión**: contar consultas por endpoint. Un test que afirma "como mucho 3 consultas"
detecta el día que alguien reintroduzca el problema.

### Consultas sin índice

`EXPLAIN ANALYZE` y buscar `Seq Scan` sobre tablas grandes. El índice compuesto correcto sirve
para filtrar y ordenar en una pasada; el orden de sus columnas importa.

### Traer de más

```python
# ✗ trae todas las columnas y todas las filas para contar
orders = session.scalars(select(OrderModel)).all()
count = len([o for o in orders if o.status == "CONFIRMED"])

# ✓ el trabajo lo hace la base
count = session.scalar(
    select(func.count()).select_from(OrderModel).where(OrderModel.status == "CONFIRMED")
)
```

Agregar, filtrar y ordenar en SQL, no en Python. Y `select` de las columnas necesarias cuando la
fila es ancha.

### Paginación

Todo listado pagina, con límite máximo del servidor. Por cursor en listados grandes: `OFFSET` alto
obliga a la base a recorrer y descartar todas las filas anteriores (ver `api-contracts` §4).

## 4. Concurrencia

Llamadas independientes en paralelo con `asyncio.gather`, con semáforo si el número lo marca la
entrada (ver `async-discipline` §5). Tres llamadas de 100 ms en serie son 300 ms; concurrentes,
~100 ms.

Y antes de eso: **comprobar que el event loop no está bloqueado**. Un `async def` con un driver
síncrono dentro anula toda la concurrencia del proceso, y el síntoma —latencias altas con CPU
baja— se confunde a menudo con "necesitamos más réplicas".

## 5. Caché

Potente y la fuente de una clase entera de bugs. Antes de añadirla, dos preguntas: **¿el dato
tolera estar desactualizado, y cuánto?** y **¿cómo se invalida?**

| Nivel | Para qué | Cuidado |
|---|---|---|
| En proceso (`lru_cache`) | Datos inmutables o de configuración | No se comparte entre réplicas; no se invalida |
| Distribuida (Redis) | Datos compartidos y costosos | Invalidación explícita, y TTL siempre |
| HTTP (`ETag`, `Cache-Control`) | Respuestas públicas o poco cambiantes | Cuidado con lo personalizado por usuario |

Reglas que evitan los problemas típicos:

- **TTL siempre**, aunque haya invalidación explícita. Es la red de seguridad cuando la
  invalidación falla.
- **La clave incluye todo lo que afecta al resultado**, incluido el usuario o el tenant. Una clave
  incompleta sirve datos de una persona a otra: es a la vez un bug y una fuga.
- **Nunca se cachean datos personales** sin pensarlo bien.
- **Se mide el acierto.** Una caché con 5% de aciertos añade complejidad y latencia.
- **El sistema funciona con la caché vacía.** Si se cae y todo se desploma, no era caché: era una
  dependencia.

## 6. Sacar trabajo de la petición

Lo que el usuario no necesita esperar, no debería esperarlo: generar un informe, enviar correos,
sincronizar con un tercero, procesar un archivo grande.

- **Rápido y no crítico**: `BackgroundTasks`.
- **Todo lo demás**: cola con persistencia y reintentos. Si perderlo importa, va a la cola (ver
  `async-discipline` §6).

El patrón para lo pesado: responder 202 con un identificador de trabajo, y que el cliente consulte
el estado.

## 7. Presupuestos

Sin un objetivo, "lento" es una opinión. Orientativos, en p95:

| Operación | Objetivo |
|---|---|
| Lectura simple | < 100 ms |
| Listado paginado | < 300 ms |
| Escritura con reglas | < 500 ms |
| Operación con servicio externo | < 2 s |
| Exportación o informe | Asíncrono, con estado consultable |

Se miden **en p95 o p99, nunca en media** (ver `observability` §5), y se vigilan en producción, no
sólo en local con diez filas.

## 8. Cuándo NO optimizar

- **No se ha medido.**
- **No hay presupuesto incumplido**: algo que tarda 50 ms y el objetivo es 300 ms está bien.
- **El volumen real no lo justifica**: una consulta sobre una tabla de cien filas no necesita
  índice.
- **El coste es complejidad permanente** a cambio de una ganancia marginal.
- **Hay algo más lento al lado** sin atender.

La optimización prematura tiene un coste que no se ve en los benchmarks: código más difícil de
leer, de cambiar y de probar, para siempre.

## 9. Verificar que funcionó

Una optimización sin medición posterior es una hipótesis:

1. **Medir antes**, con números.
2. **Cambiar una cosa.**
3. **Medir después**, en las mismas condiciones.
4. **Comprobar que el comportamiento no cambió**: la suite completa en verde.
5. **Dejarlo escrito**: qué era, qué se hizo, qué se ganó. En el PR y, si fue estructural, en un
   ADR.

Si la ganancia no se puede demostrar con números, se revierte.

## 10. Reglas duras

- **No se optimiza sin medir antes y después.**
- **Primero la base de datos y la red**, no Python.
- **Todo listado pagina, con límite máximo.**
- **Agregar y filtrar en SQL**, no en memoria.
- **Se comprueba que el event loop no está bloqueado** antes de culpar a la concurrencia.
- **Toda caché lleva TTL y clave completa**, y el sistema funciona sin ella.
- **Nunca se cachean datos personales sin justificar.**
- **Lo que el usuario no necesita esperar sale de la petición.**
- **Los objetivos se expresan en p95/p99**, nunca en media.
- **Una optimización sin ganancia demostrada se revierte.**

## 11. Qué vive en otra skill

| Tema | Skill |
|---|---|
| N+1, índices, consultas y migraciones | `data-modeling` |
| Event loop, concurrencia y colas | `async-discipline` |
| Medir en producción, percentiles y trazas | `observability` |
| Paginación en el contrato | `api-contracts` |
| Peso del bundle y Core Web Vitals | `frontend-quality` |
| Registrar la decisión de optimizar | `technical-design` |
| Priorizar por riesgo | `coverage-and-risk` |
