---
name: api-contracts
description: Diseñar el contrato público de la API en Collie — recursos y verbos, códigos de estado, forma única del error, paginación, filtrado y orden, idempotencia, versionado y cambios compatibles, OpenAPI como fuente de verdad, y qué se considera ruptura. Cargar al crear o modificar un endpoint, al diseñar la forma de una respuesta, al cambiar algo que ya consumen clientes, al definir paginación o errores, o al discutir versionado.
---

# Skill: api-contracts

El contrato es lo único que un cliente ve. Una vez publicado, cambiarlo cuesta coordinación con
todos los que lo consumen.

> **La regla:** el contrato se diseña **antes** de la implementación y expresa conceptos de
> negocio, no la estructura interna. La tabla es un detalle; el recurso es el contrato.

## 1. Recursos y verbos

```
GET    /api/v1/orders                 listar
POST   /api/v1/orders                 crear
GET    /api/v1/orders/{id}            obtener
PATCH  /api/v1/orders/{id}            modificar parcialmente
DELETE /api/v1/orders/{id}            eliminar
POST   /api/v1/orders/{id}/confirm    ejecutar una acción de negocio
```

- **Sustantivos en plural**, en `kebab-case` si llevan varias palabras
  (`/purchase-orders`).
- **Sin verbos en la ruta** para el CRUD: `POST /orders`, no `/createOrder`.
- **Las acciones de negocio que no son CRUD sí son un subrecurso con verbo**
  (`/orders/{id}/confirm`). Forzar una transición de estado dentro de un `PATCH` genérico esconde
  la regla y permite saltársela.
- **Anidar sólo un nivel**: `/orders/{id}/lines`. Más profundo, se accede por el recurso propio
  con un filtro.
- **`PATCH` frente a `PUT`**: en Collie, `PATCH` con los campos a cambiar. `PUT` exige enviar el
  recurso completo y provoca sobreescrituras accidentales.

## 2. Códigos de estado

| Código | Cuándo |
|---|---|
| 200 | Éxito con cuerpo |
| 201 | Creado. Con el recurso o su id, y cabecera `Location` |
| 204 | Éxito sin cuerpo (un `DELETE`) |
| 400 | Petición mal formada |
| 401 | No autenticado, o token inválido o caducado |
| 403 | Autenticado pero sin permiso |
| 404 | No existe — **o existe y no puedes verlo** |
| 409 | Conflicto con el estado actual (ya confirmado, duplicado) |
| 422 | Sintaxis válida, contenido inválido (lo que devuelve Pydantic) |
| 429 | Límite de peticiones superado. Con `Retry-After` |
| 500 | Error nuestro, no del cliente |
| 503 | Dependencia caída. Con `Retry-After` si se sabe |

Dos matices que importan: **404 en vez de 403** cuando revelar la existencia del recurso ya es una
fuga (facturas de otro cliente); y **nunca un 200 con un error dentro del cuerpo** — rompe todo
manejo de errores automático en los clientes.

## 3. La forma del error: una sola

```json
{
  "error": "InsufficientStock",
  "detail": "Only 3 units of WIDGET are available",
  "fields": { "lines.0.quantity": "requested 10, available 3" },
  "request_id": "01JQ8F3N7K2M"
}
```

- **`error`**: un código estable, legible por máquina. El cliente ramifica por esto, no por el
  texto.
- **`detail`**: mensaje para una persona. Puede cambiar sin romper nada.
- **`fields`**: sólo en errores de validación.
- **`request_id`**: correlaciona con los logs; es lo que convierte "me dio error" en algo
  investigable.

Se genera en **un único handler** (ver `boundary-mapping` §6 y `error-handling`). Un cliente que
sabe leer un error, sabe leerlos todos.

## 4. Paginación, filtros y orden

```
GET /api/v1/orders?status=confirmed&placed_after=2026-01-01&sort=-placed_at&limit=50&cursor=eyJ...
```

```json
{
  "items": [ ... ],
  "next_cursor": "eyJwbGFjZWRfYXQiOi...",
  "has_more": true
}
```

- **Paginación por cursor** para listados grandes o que cambian: `OFFSET` alto es lento y salta o
  repite elementos cuando se insertan filas mientras se pagina.
- **`limit` con máximo impuesto por el servidor.** Sin tope, un cliente pide un millón de filas.
- **Sin `total` por defecto**: contar exige recorrer la tabla. Se ofrece como opción explícita si
  de verdad se necesita.
- **Orden con prefijo `-` para descendente**, y **sólo campos permitidos por lista blanca** —
  ordenar por un campo arbitrario es una consulta sin índice a demanda del cliente.
- **Filtros explícitos**, nunca un filtro genérico que traduzca a SQL lo que mande el cliente.

## 5. Idempotencia

`GET`, `PUT`, `DELETE` son idempotentes por definición. `POST` no lo es, y ahí está el problema:
el cliente reintenta tras un timeout y crea dos pedidos.

```
POST /api/v1/orders
Idempotency-Key: 7f3a2b10-...
```

El servidor guarda la clave con su respuesta: si llega repetida, devuelve la respuesta original sin
volver a ejecutar. **Obligatorio en todo lo que cobra dinero, envía algo o crea un recurso que
duele duplicado.**

## 6. Tipos y formatos

| Dato | Formato |
|---|---|
| Dinero | Cadena decimal (`"1800.00"`) + código de moneda. **Nunca `float`** |
| Fechas | ISO 8601 con zona (`2026-03-14T10:30:00Z`). Siempre UTC |
| Identificadores | Cadena (UUID). Nunca enteros autoincrementales expuestos |
| Enumerados | Cadenas en mayúsculas (`"CONFIRMED"`), no números |
| Booleanos | `true`/`false`, no `1`/`0` ni `"yes"` |
| Ausencia | Omitir el campo o `null`, de forma **consistente** en toda la API |

El dinero como `float` es el error clásico: JSON no distingue decimales exactos y el cliente recibe
`1800.0000000001`. Los ids autoincrementales expuestos permiten enumerar recursos y estimar
volúmenes de negocio.

## 7. Versionado y compatibilidad

Versión en la ruta: `/api/v1/`. Simple, visible en logs y fácil de enrutar.

### Cambios compatibles (no rompen)

- Añadir un endpoint.
- Añadir un campo **opcional** a una petición.
- Añadir un campo a una respuesta — **siempre que los clientes ignoren lo desconocido**, y eso se
  documenta como requisito para ellos.
- Añadir un valor a un enumerado **sólo si el cliente lo tolera**; si ramifica exhaustivamente, no
  es compatible.

### Cambios que rompen

- Quitar o renombrar un campo.
- Cambiar el tipo de un campo (número a cadena).
- Hacer obligatorio algo que era opcional.
- Cambiar un código de estado o el significado de un campo.
- Cambiar el orden por defecto o el tamaño de página por defecto.
- Endurecer una validación.

Un cambio que rompe exige: **versión nueva** con la anterior viva durante la transición, o
**coordinación explícita** si el único cliente es interno y se despliega a la vez. Y siempre el
commit con `BREAKING CHANGE` (ver `git-discipline`).

**Nunca** se cambia el tipo o el nombre de un campo existente y se despliega.

## 8. OpenAPI es el contrato

FastAPI lo genera desde los schemas. Para que sea útil de verdad:

```python
@router.post(
    "/orders",
    response_model=OrderResponse,
    status_code=201,
    summary="Place an order",
    responses={
        409: {"model": ErrorResponse, "description": "Stock is insufficient"},
        422: {"model": ErrorResponse, "description": "Invalid payload"},
    },
)
```

- **`response_model` siempre**, y nunca un modelo ORM.
- **Los errores documentados**, no sólo el camino feliz: es la mitad del contrato.
- **Ejemplos en los schemas** (`json_schema_extra`): lo que hace usable la documentación.
- **`openapi.json` versionado en el repositorio**, con CI fallando si cambió sin regenerarse (ver
  `contract-testing` §2). Convierte un cambio de contrato en una decisión explícita.

## 9. Reglas duras

- **El contrato se diseña antes de implementar.**
- **Recursos en plural, sin verbos**, salvo acciones de negocio como subrecurso.
- **Nunca un modelo ORM como `response_model`.**
- **Una sola forma de error en toda la API**, con código estable y `request_id`.
- **Nunca 200 con un error dentro.**
- **Todo listado pagina, con límite máximo del servidor.**
- **Orden y filtros por lista blanca.**
- **Dinero como cadena decimal con moneda; fechas ISO 8601 en UTC.**
- **Ids opacos**, nunca autoincrementales expuestos.
- **`POST` que cobra, envía o crea algo caro acepta `Idempotency-Key`.**
- **Un cambio incompatible exige versión nueva o coordinación explícita**, y `BREAKING CHANGE`.

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Schema, entidad y modelo ORM | `boundary-mapping` |
| Tipos generados y detección de cambios | `contract-testing` |
| Traducción de excepciones y forma del error | `error-handling` |
| Permisos y 401/403 | `authn-authz` |
| Validación de entrada y límites | `security-diff-review` |
| Campos sensibles en respuestas | `sensitive-data` |
| Paginación e índices | `data-modeling` |
| Consumo desde el frontend | `frontend-architecture` |
| La spec de la que sale el contrato | `spec-driven-development` |
