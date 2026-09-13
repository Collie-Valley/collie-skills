---
name: sensitive-data
description: Datos personales y sensibles en Collie — qué cuenta como dato personal, minimización (no guardar lo que no se necesita), qué nunca entra en un log, cifrado en tránsito y en reposo, enmascarado en respuestas, retención y borrado, anonimización para entornos no productivos, y los derechos que obligan a poder localizar y borrar los datos de una persona. Cargar al modelar datos de personas, al escribir logs, al exponer campos en una API, al sembrar entornos de prueba, al implementar borrado, o al integrar un tercero que recibirá datos.
---

# Skill: sensitive-data

Cómo se tratan los datos de personas. Aplica desde el momento en que se modela una tabla, no
cuando alguien pregunta por cumplimiento.

> **La regla:** el dato más seguro es el que no se guarda. Antes de añadir un campo con
> información de una persona, hay que responder **para qué se usa** y **cuánto tiempo se
> conserva**.

## 1. Qué cuenta como dato personal

Más de lo que parece. Cualquier cosa que identifique a alguien **sola o combinada con otra**:

| Categoría | Ejemplos |
|---|---|
| Identificación directa | Nombre, documento de identidad, RUC/RUT/DNI, pasaporte |
| Contacto | Correo, teléfono, dirección |
| Identificadores técnicos | IP, id de dispositivo, cookies, identificadores publicitarios |
| Financiero | Cuenta bancaria, tarjeta, ingresos, historial de compras |
| Laboral | Salario, evaluaciones, contrato |
| **Categorías especiales** | Salud, biometría, religión, afiliación sindical, orientación, origen étnico |

Las **categorías especiales** exigen más: base legal más estricta, cifrado, acceso restringido y
registro de quién las consulta. Si un módulo las toca, es riesgo alto por definición.

Y la combinación importa: código postal + fecha de nacimiento + sexo identifica a una persona
concreta con alta probabilidad, aunque ningún campo por separado sea "identificador".

## 2. Minimización

Antes de añadir un campo, tres preguntas:

1. **¿Para qué se usa?** Si la respuesta es "por si acaso" o "para analítica futura", no se
   guarda.
2. **¿Se puede guardar menos?** El año de nacimiento en vez de la fecha; el rango de ingresos en
   vez del importe; un hash en vez del valor cuando sólo hace falta comparar.
3. **¿Cuánto tiempo hace falta?** Todo dato personal tiene fecha de caducidad.

Casos concretos de guardar menos:

- **Tarjetas**: nunca el número completo. Se guarda el token del proveedor, y los últimos cuatro
  dígitos si hacen falta para que el usuario reconozca la tarjeta.
- **Contraseñas**: sólo el hash (ver `authn-authz` §6).
- **Documentos escaneados**: sólo si hay obligación legal, con caducidad y acceso restringido.

## 3. Logs: la fuga más común

Los logs se copian, se envían a servicios externos, se retienen meses y los lee mucha gente. **Es
la vía por la que más datos personales se filtran**, y casi siempre por accidente.

```python
# ✗ todo esto acaba en el log
logger.info("Creating customer: %s", payload)
logger.info("Login attempt for %s with %s", email, password)
logger.exception("Failed", extra={"request": request.body})
```

| Nunca en un log | En su lugar |
|---|---|
| Contraseñas, tokens, claves, cookies | Nada. Jamás |
| Números de tarjeta, cuentas bancarias | Los últimos 4 dígitos, si hace falta |
| Documentos de identidad | El id interno del cliente |
| Correo, teléfono, dirección | El id interno del cliente |
| Cuerpos de petición o respuesta completos | Campos concretos, ya filtrados |
| Datos de salud o categorías especiales | Nada |

```python
# ✓ identificadores internos, que sólo significan algo dentro del sistema
logger.info("customer_created", extra={"customer_id": str(customer.id)})
```

Y dos defensas estructurales:

- **`SecretStr` en settings** (ver `secrets-and-config` §2): imprimir la configuración no expone
  nada.
- **Un filtro de logging** que enmascare patrones conocidos (correos, tarjetas, `Authorization`)
  como última red de seguridad. No sustituye a no loguearlos.

**Las trazas de excepción también filtran**: una excepción que lleva el objeto entero en su mensaje
acaba en el log con todo dentro.

## 4. Cifrado

| Dónde | Qué |
|---|---|
| **En tránsito** | TLS siempre, también entre servicios internos. `HSTS` activado |
| **En reposo, disco** | Cifrado del volumen o de la base: lo da la infraestructura |
| **En reposo, campo** | Cifrado a nivel de campo para categorías especiales y datos financieros |
| **Copias de seguridad** | Cifradas, y con el mismo control de acceso que el original |

El cifrado a nivel de campo se aplica en el **adaptador de persistencia**, no en el dominio: la
entidad trabaja con el valor claro y el mapper cifra y descifra. Así la regla de negocio no sabe
nada de claves.

Coste que hay que aceptar antes de elegirlo: un campo cifrado **no se puede buscar ni ordenar** en
SQL. Si hace falta buscar por él, se guarda además un hash determinista para igualdad exacta.

## 5. En las respuestas

- **Sólo los campos que el cliente necesita**, declarados explícitamente (ver `boundary-mapping`).
- **Enmascarado por defecto** en listados: `••••1234`, `j***@example.com`. El valor completo, sólo
  cuando hay una razón y el permiso corresponde.
- **Nunca un dato personal en una URL**: queda en los logs de servidores, proxies y navegadores, y
  se filtra por el `Referer`. Van en el cuerpo.
- **Cuidado con los campos de búsqueda**: un endpoint que permite filtrar por documento de
  identidad y devuelve "existe / no existe" es un oráculo de verificación de identidades.

## 6. Retención y borrado

Todo dato personal tiene un ciclo de vida definido:

```
Se recoge → se usa → caduca → se borra o se anonimiza
```

- **Cada categoría tiene su plazo**, y el plazo se escribe (en un ADR o en la documentación del
  módulo). "Para siempre" no es un plazo.
- **El borrado es un proceso**, no un `DELETE`: hay copias de seguridad, réplicas, logs, índices de
  búsqueda, caché y sistemas de terceros a los que se envió el dato.
- **Borrado lógico y borrado real no son lo mismo.** Un `deleted_at` oculta pero no borra; si la
  obligación es eliminar, hay que eliminar.
- **Anonimizar es una alternativa válida** cuando el dato agregado sigue haciendo falta: se
  rompe el vínculo con la persona de forma irreversible.

Y la capacidad que hay que tener **antes** de que la pidan: poder **localizar todos los datos de
una persona** en el sistema. Si no se sabe dónde están, no se pueden ni entregar ni borrar.

## 7. Entornos no productivos

**Nunca datos reales de producción en desarrollo, pruebas o demostraciones.** Es la regla que más
se rompe y la que más expone, porque esos entornos tienen menos control de acceso, menos
monitorización y más gente con permisos.

Alternativas, en orden de preferencia:

1. **Datos generados** con `faker` y semilla fija (ver `test-data`).
2. **Datos sintéticos** que reproduzcan las formas y volúmenes reales.
3. **Anonimización irreversible** si de verdad hace falta partir de producción: sustituir, no
   ofuscar. Cambiar `Juan Pérez` por `Usuario 1` sirve; cambiarlo por `J*** P***` no, porque sigue
   identificando combinado con otros campos.

## 8. Terceros

Enviar datos a un proveedor (correo, analítica, pagos, soporte, un modelo de IA) **es una cesión de
datos**:

- Se envía **lo mínimo**. Un servicio de facturación no necesita el teléfono.
- Se comprueba **qué hace el proveedor** con lo que recibe y cuánto lo retiene.
- **Queda registrado** qué se envía y a quién: es parte de poder responder dónde están los datos
  de una persona.
- Un proveedor nuevo que recibirá datos personales es una **decisión que se registra**
  (`technical-design`), no un detalle de implementación.

## 9. Reglas duras

- **No se guarda lo que no se necesita.** Cada campo personal tiene propósito y plazo.
- **Cero datos personales en logs.** Sólo identificadores internos.
- **Cero contraseñas, tokens o números de tarjeta en cualquier registro.**
- **Nunca un dato personal en una URL.**
- **TLS siempre**, también entre servicios internos.
- **Categorías especiales y datos financieros: cifrado a nivel de campo**, aplicado en el adaptador.
- **Los campos sensibles se enmascaran por defecto** en las respuestas.
- **Todo dato personal tiene plazo de retención escrito.**
- **Jamás datos reales de producción en entornos no productivos.**
- **Se debe poder localizar y borrar todos los datos de una persona.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La pasada de seguridad al diff | `security-diff-review` |
| Permisos sobre los datos | `authn-authz` |
| Claves de cifrado y su custodia | `secrets-and-config` |
| Qué se loguea y cómo | `observability` |
| Campos expuestos en la API | `boundary-mapping` · `api-contracts` |
| Datos generados para tests | `test-data` |
| Registrar la cesión a un tercero | `technical-design` |
| Borrado y migraciones | `data-modeling` |
