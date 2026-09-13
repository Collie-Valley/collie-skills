---
name: authn-authz
description: Autenticación y autorización en Collie — la diferencia que casi todo el mundo mezcla, tokens de acceso cortos y refresco rotatorio, dónde se comprueba el permiso (en el caso de uso, no en el router ni en el cliente), autorización a nivel de objeto, roles y permisos, contraseñas y protección contra fuerza bruta, y qué se prueba siempre. Cargar al tocar login, sesiones, tokens, roles o permisos, al crear un endpoint que recibe un identificador, al diseñar quién puede hacer qué, o al revisar un fallo de acceso.
---

# Skill: authn-authz

Quién eres y qué puedes hacer. Son dos problemas distintos, y confundirlos es el origen de la
mayoría de los fallos de acceso.

> **La regla:** la autenticación pasa en el borde; **la autorización pasa en el caso de uso**. Un
> permiso comprobado sólo en el router deja de aplicarse en cuanto la misma operación se invoca
> desde un worker, un script o una tarea programada.

## 1. Las dos cosas

| | Autenticación (authn) | Autorización (authz) |
|---|---|---|
| Pregunta | ¿Quién eres? | ¿Puedes hacer esto, sobre esto? |
| Cuándo | Una vez por petición, en el borde | En cada operación |
| Dónde | `interfaces/` | `application/` (el caso de uso) |
| Si falla | 401 | 403 |
| Error típico | Token mal validado | Comprobar el rol pero no el objeto |

El **401 frente a 403** importa: 401 significa "no sé quién eres, autentícate"; 403 significa "sé
quién eres y no puedes". Devolver 401 cuando el usuario está autenticado hace que los clientes
intenten refrescar el token en bucle.

## 2. Tokens

```python
access_token   TTL 15 minutos   sin estado, firmado, va en cada petición
refresh_token  TTL 7-30 días    con estado, rotatorio, revocable, sólo para renovar
```

- **El de acceso es corto** porque no se puede revocar: si se filtra, su ventana de daño es su
  TTL.
- **El de refresco es rotatorio**: cada uso emite uno nuevo e invalida el anterior. Si un token ya
  usado vuelve a aparecer, es señal de robo y **se invalida la familia entera** de esa sesión.
- **El de refresco se guarda en el servidor** (hash, no el valor) para poder revocarlo: cierre de
  sesión, cambio de contraseña, expulsión de un dispositivo.

### Qué lleva un token de acceso

```json
{
  "sub": "user-uuid", "exp": 1773400000, "iat": 1773399100,
  "jti": "token-uuid", "roles": ["sales"], "tenant": "acme"
}
```

Lo mínimo para identificar y autorizar sin consultar la base en cada petición. **Nunca datos
personales ni secretos**: un JWT va firmado, no cifrado — cualquiera lee su contenido.

Y la firma se valida **siempre**, con algoritmo fijo:

```python
jwt.decode(token, key, algorithms=["HS256"])     # explícito, nunca desde el header del token
```

Aceptar el algoritmo que declara el propio token permite el ataque `alg: none` y la confusión de
algoritmo.

### Dónde se guardan en el cliente

| Opción | Riesgo |
|---|---|
| Cookie `HttpOnly` + `Secure` + `SameSite=Lax/Strict` | **Preferida.** Inmune a XSS; exige protección CSRF si es `Lax` con formularios |
| Memoria (variable de JS) | Aceptable; se pierde al recargar |
| `localStorage` | **Evitar**: cualquier XSS lo lee |

## 3. Dónde se comprueba el permiso

```python
# ✗ sólo en el router: no vale desde un worker ni desde un script
@router.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: UUID, user: Annotated[User, Depends(require_role("admin"))]):
    use_case.execute(InvoiceId(invoice_id))
```

```python
# ✓ la regla vive donde vive la operación
class DeleteInvoice:
    def execute(self, invoice_id: InvoiceId, actor: Actor) -> None:
        invoice = self._invoices.get(invoice_id)
        if not actor.can_delete(invoice):
            raise PermissionDenied(actor.id, invoice_id)
        ...
```

El router sigue autenticando y puede filtrar pronto por rol (mejor experiencia, menos carga), pero
**la comprobación autoritativa está en el caso de uso**.

`Actor` es un objeto del dominio —identidad, roles, tenant—, no el modelo de usuario de la base ni
el token. Así el dominio expresa permisos sin saber nada de JWT.

## 4. Autorización a nivel de objeto

El fallo más frecuente y más caro. Comprobar el rol **no es** comprobar el acceso al objeto:

```python
# ✗ tiene rol "sales", así que puede leer las facturas de CUALQUIER cliente
if "sales" not in actor.roles:
    raise PermissionDenied(...)
return self._invoices.get(invoice_id)
```

Toda operación que recibe un identificador debe responder: **¿este actor puede operar sobre ESTE
objeto?** Pertenencia, tenant, jerarquía, o lo que corresponda al negocio.

Y en las **consultas**, el filtro va en la consulta, no después:

```python
# ✗ trae todo y filtra en memoria: fuga por paginación y coste inútil
invoices = [i for i in self._invoices.all() if i.tenant_id == actor.tenant_id]

# ✓ el alcance entra en la consulta
invoices = self._invoices.find_for_tenant(actor.tenant_id, page=page)
```

## 5. Roles y permisos

Empezar simple, crecer sólo cuando duela:

1. **Roles** (`admin`, `sales`, `viewer`) — suficiente al principio.
2. **Permisos** (`invoice:read`, `invoice:delete`) agrupados en roles — cuando los roles empiezan
   a multiplicarse por casos particulares.
3. **Reglas sobre el objeto** (el dueño, el equipo, el tenant) — complementan siempre a lo
   anterior.

Principios que no cambian:

- **Mínimo privilegio**: se concede lo necesario, no lo cómodo.
- **Denegar por defecto**: lo no concedido explícitamente, se niega. Un endpoint nuevo nace cerrado.
- **Sin escalada**: un usuario no puede concederse a sí mismo ni a otros un permiso que no tiene.
- **Los permisos se comprueban en el servidor.** Ocultar un botón en el frontend es experiencia de
  usuario, no seguridad.

## 6. Contraseñas y fuerza bruta

- **Hash con `argon2id`** (o `bcrypt`), nunca SHA ni MD5, nunca sin salt. `passlib` o
  `argon2-cffi`.
- **Longitud mínima razonable** (12+) y comprobación contra listas de contraseñas filtradas;
  reglas de composición complejas empeoran la seguridad real.
- **Comparación en tiempo constante** en cualquier verificación de secreto (`secrets.compare_digest`).
- **Límite de intentos** por cuenta y por IP, con espera creciente.
- **Mensajes idénticos** para usuario inexistente y contraseña incorrecta, y tiempo de respuesta
  similar: si no, se enumeran cuentas.
- **Restablecer contraseña**: token de un solo uso, corto, invalidado al usarse, y el mismo mensaje
  tanto si el correo existe como si no.
- **Cambio de contraseña revoca las sesiones** activas.

## 7. Qué se prueba siempre

Los permisos son de lo poco que **siempre** lleva test, en cualquier módulo:

```python
def test_delete_invoice_denies_a_viewer(...) -> None:
    with pytest.raises(PermissionDenied):
        use_case.execute(invoice.id, actor=ActorBuilder().with_role("viewer").build())

def test_get_invoice_denies_another_tenant(...) -> None:
    with pytest.raises(PermissionDenied):
        use_case.execute(invoice.id, actor=ActorBuilder().with_tenant("other").build())

def test_list_invoices_only_returns_own_tenant(...) -> None:
    ...
```

Y en el borde: que un token ausente da 401, uno caducado da 401, y uno válido sin permiso da 403.

## 8. Errores frecuentes

| Error | Consecuencia |
|---|---|
| Permiso sólo en el router | No aplica desde workers ni scripts |
| Rol comprobado, objeto no | Acceso a datos ajenos |
| Filtrar por tenant en memoria | Fuga por paginación |
| Token de acceso de larga duración | Ventana de daño enorme, no revocable |
| Refresco no rotatorio | Un robo dura para siempre |
| Algoritmo tomado del token | `alg: none`, confusión de algoritmo |
| Datos personales en el JWT | Cualquiera los lee |
| Token en `localStorage` | Un XSS se lleva la sesión |
| Mensajes distintos según exista el usuario | Enumeración de cuentas |
| Seguridad basada en ocultar el botón | No es seguridad |

## 9. Reglas duras

- **Authn en el borde; authz en el caso de uso.**
- **Todo endpoint con identificador comprueba permiso sobre ese objeto.**
- **El alcance (tenant, dueño) entra en la consulta**, no se filtra en memoria.
- **Denegar por defecto.** Un endpoint nuevo nace cerrado.
- **Token de acceso corto; refresco rotatorio, revocable y con estado.**
- **Algoritmo de firma fijo y explícito**, nunca el que declara el token.
- **Nada personal ni secreto dentro de un JWT.**
- **Contraseñas con `argon2id`**, comparación en tiempo constante, límite de intentos.
- **Mismo mensaje y tiempo tanto si la cuenta existe como si no.**
- **Los permisos llevan test, en todos los módulos.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La pasada de seguridad al diff | `security-diff-review` |
| Claves de firma y su rotación | `secrets-and-config` |
| Datos personales y logs | `sensitive-data` |
| Dónde vive la regla de permiso | `clean-architecture` · `dependency-injection` |
| 401/403 y forma del error | `error-handling` |
| Sesión en el cliente | `frontend-architecture` |
| Probar permisos | `unit-testing-domain` · `integration-testing` |
