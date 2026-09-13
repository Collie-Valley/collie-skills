---
name: security-diff-review
description: La pasada de seguridad a un cambio en Collie — qué se revisa siempre (autorización a nivel de objeto, inyección, validación en el borde, fuga de datos, secretos, SSRF, path traversal, deserialización), cómo se escribe un hallazgo de seguridad, la escala de severidad y qué se escala de inmediato, y las herramientas automáticas que corren en CI. Cargar antes de cerrar una tarjeta, al revisar un PR, al tocar autenticación, permisos, consultas, subida de archivos o llamadas salientes, o al preparar una entrega de riesgo alto.
---

# Skill: security-diff-review

La pasada de seguridad sobre lo que cambia. No es una auditoría del sistema entero: es la revisión
del diff, proporcional al riesgo.

> **La regla:** la seguridad se revisa **sobre lo que el cambio introduce o toca**, no sobre el
> repositorio completo. Y hay una comprobación que se hace siempre, sea cual sea el cambio:
> **¿quién puede llamar a esto y sobre qué datos?**

## 1. Lo que se revisa siempre

### 1.1 Autorización a nivel de objeto

El fallo más común en APIs, y el más caro. Un endpoint verifica que el usuario **está
autenticado**, pero no que el recurso **sea suyo**:

```python
# ✗ cualquier usuario autenticado lee la factura de cualquier otro
@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: UUID, user: CurrentUser) -> InvoiceResponse:
    return InvoiceResponse.from_entity(use_case.execute(InvoiceId(invoice_id)))
```

**Todo endpoint que recibe un identificador debe verificar pertenencia o permiso sobre ese
objeto concreto.** La comprobación vive en el caso de uso, no en el router, para que valga también
desde un worker o un script.

```python
def execute(self, invoice_id: InvoiceId, actor: Actor) -> Invoice:
    invoice = self._invoices.get(invoice_id)
    if not actor.can_read(invoice):
        raise PermissionDenied(actor.id, invoice_id)
    return invoice
```

### 1.2 Inyección

- **SQL**: cualquier consulta construida con concatenación o f-string. Con SQLAlchemy, parámetros
  siempre; `text()` con `:param`, nunca interpolando.
- **Comandos**: `subprocess` con `shell=True` y algo que venga del usuario.
- **Plantillas**: contenido de usuario renderizado sin escapar.
- **NoSQL / filtros dinámicos**: un `dict` del usuario pasado como criterio de búsqueda.

```python
# ✗
session.execute(text(f"SELECT * FROM orders WHERE customer = '{name}'"))
# ✓
session.execute(text("SELECT * FROM orders WHERE customer = :name"), {"name": name})
```

### 1.3 Validación en el borde

Todo lo que entra se valida en `interfaces/` con Pydantic: tipos, longitudes máximas, rangos,
formatos, valores permitidos. Sin límite de longitud, un campo de texto es un vector de
agotamiento de memoria y de almacenamiento.

Y la paginación: **un listado sin límite máximo** es una denegación de servicio accidental el día
que alguien pida `?limit=1000000`.

### 1.4 Fuga de datos en la salida

- Modelo ORM devuelto por la API (ver `boundary-mapping` §7.1): publica cada columna nueva.
- Un schema con campos de más: `password_hash`, `internal_notes`, `deleted_at`.
- Un mensaje de error que revela existencia: "usuario no encontrado" frente a "contraseña
  incorrecta" permite enumerar cuentas.
- Trazas de excepción devueltas al cliente en producción.

### 1.5 Secretos

Credenciales, tokens, claves o URLs con contraseña en el código, en los tests, en los logs o en un
archivo de ejemplo con valores reales. Detalle en `secrets-and-config`.

### 1.6 Llamadas salientes (SSRF)

Si el sistema hace una petición a una URL que viene del usuario —webhooks, importar desde una URL,
previsualizar un enlace— se puede usar para alcanzar la red interna o el servicio de metadatos del
proveedor cloud.

Defensa: lista blanca de destinos, resolución y validación de la IP resultante (rechazar rangos
privados y loopback), sin seguir redirecciones automáticamente, y timeout corto.

### 1.7 Archivos

- **Path traversal**: un nombre de archivo del usuario usado para construir una ruta (`../../`).
  Se normaliza y se verifica que la ruta final está dentro del directorio permitido; mejor aún, se
  genera un nombre propio y se guarda el original sólo como metadato.
- **Tipo y tamaño**: límite de tamaño **antes** de leer el archivo entero, y validación del tipo
  real, no de la extensión.
- **Nunca se sirve un archivo subido desde el mismo origen** que la aplicación sin cabeceras que
  impidan ejecutarlo.

### 1.8 Deserialización

`pickle`, `yaml.load` sin `SafeLoader`, o cualquier deserialización de datos que vengan de fuera,
permiten ejecución de código. `yaml.safe_load` y JSON; `pickle` nunca sobre entrada externa.

## 2. Lo que se revisa según lo que toque el cambio

| Si el cambio toca | Revisar |
|---|---|
| Login, sesiones, tokens | `authn-authz`: expiración, rotación, revocación, fuerza bruta |
| Datos personales | `sensitive-data`: qué se guarda, qué se loguea, cifrado, retención |
| Una dependencia nueva | `dependency-hygiene` |
| Una migración | ¿Expone datos? ¿Bloquea? ¿Es reversible? |
| Configuración o despliegue | `secrets-and-config`: CORS, cabeceras, TLS, entorno |
| Subida o descarga de archivos | §1.7 completo |
| Una operación destructiva | ¿Requiere confirmación? ¿Es reversible? ¿Queda registro? |

## 3. Herramientas: lo que no se revisa a mano

En CI, bloqueando el build:

```bash
bandit -r src -ll              # patrones inseguros en Python
pip-audit                      # CVEs en dependencias
ruff check .                   # incluye reglas de seguridad (S)
gitleaks detect                # secretos en el código y el historial
npm audit --audit-level=high   # dependencias del frontend
```

Las herramientas atrapan lo mecánico. **Lo que no atrapan y sólo ve una persona**: autorización a
nivel de objeto, lógica de negocio que permite saltarse un límite, y fugas por diseño del
contrato. Esos tres son los que más importan en la revisión manual.

## 4. Cómo se escribe un hallazgo

```
[Crítica] Cualquier usuario autenticado puede leer facturas ajenas.

src/modules/billing/interfaces/http/routers/invoice_router.py:41
El endpoint valida el token pero no comprueba que la factura pertenezca al
usuario ni que tenga permiso sobre su cliente.

Explotación: un usuario con una cuenta válida cambia el UUID de la ruta e
itera identificadores. Devuelve importes, cliente y detalle fiscal.

Arreglo: mover la comprobación al caso de uso (actor.can_read(invoice)) y
añadir test_get_invoice_denies_other_customers.
```

Cuatro partes: **severidad**, **ubicación**, **cómo se explota** (concreto, sin publicar un
exploit completo), y **arreglo con su test**.

## 5. Severidad y qué se hace

| Nivel | Qué es | Qué se hace |
|---|---|---|
| **Crítica** | Acceso a datos ajenos, ejecución de código, salto de autenticación, secreto expuesto | **Se escala ahora.** No espera al PR ni a la planificación |
| **Alta** | Inyección con condiciones, fuga de datos personales, permiso mal comprobado | Bloquea la entrega |
| **Media** | Falta de límite, cabecera ausente, mensaje que revela información | Se arregla ahora o entra como tarjeta con fecha |
| **Baja** | Endurecimiento recomendable sin explotación clara | Tarjeta |

**Crítica y secretos expuestos no son tarjetas ordinarias.** Un secreto en el repositorio se
**rota inmediatamente**: borrarlo con un commit nuevo no sirve, ya estuvo expuesto y sigue en el
historial.

## 6. Proporcionalidad

| Cambio | Pasada |
|---|---|
| Texto, estilo, refactor interno | Comprobar que no hay secretos ni datos en logs |
| Funcionalidad interna | + validación de entrada, autorización |
| Endpoint nuevo o modificado | + §1 completo |
| Autenticación, permisos, pagos, datos personales | + `authn-authz` y `sensitive-data`, y revisión de otra persona |

## 7. Reglas duras

- **Todo endpoint que recibe un identificador verifica permiso sobre ese objeto.**
- **La comprobación de permisos vive en el caso de uso**, no sólo en el router.
- **Cero SQL construido por concatenación.**
- **Toda entrada se valida en el borde**, con longitud y rango máximos.
- **Todo listado tiene límite máximo de página.**
- **Nunca se devuelve un modelo ORM** ni una traza de excepción al cliente.
- **Cero secretos en código, tests, logs o ejemplos.** Uno expuesto se rota de inmediato.
- **Ninguna URL del usuario se llama sin lista blanca y validación de IP.**
- **Ninguna ruta de archivo se construye con entrada del usuario sin normalizar y acotar.**
- **`pickle` y `yaml.load` nunca sobre datos externos.**
- **Un hallazgo crítico se escala en el momento**, no se registra y ya.

## 8. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Secretos, entorno, CORS, cabeceras | `secrets-and-config` |
| Sesiones, tokens, roles y permisos | `authn-authz` |
| Datos personales, logs, cifrado, retención | `sensitive-data` |
| Dependencias y CVEs | `dependency-hygiene` |
| Corrección general del código | `code-reviewer` |
| Forma del error hacia el cliente | `error-handling` |
| La checklist de cierre | `definition-of-done` |
