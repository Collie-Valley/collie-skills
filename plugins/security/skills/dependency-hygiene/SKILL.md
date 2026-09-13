---
name: dependency-hygiene
description: Añadir y mantener dependencias en Collie — las preguntas antes de instalar algo, cuándo escribirlo uno mismo, fijado de versiones y lockfiles, auditoría de CVEs en CI, actualizaciones como rutina en vez de saltos traumáticos, riesgos de la cadena de suministro, y cómo se sale de una dependencia abandonada. Cargar antes de añadir una librería, al actualizar dependencias, al ver una alerta de vulnerabilidad, al revisar un PR que toca pyproject.toml o package.json, o al evaluar sustituir algo.
---

# Skill: dependency-hygiene

Cada dependencia es código de terceros que se ejecuta con los permisos de la aplicación. Tratarla
como gratis es el origen de una parte grande de los incidentes.

> **La regla:** una dependencia se añade cuando resuelve un problema real **mejor de lo que lo
> resolveríamos nosotros**, y se elige sabiendo qué cuesta mantenerla — no sólo qué ahorra hoy.

## 1. Antes de instalar

Seis preguntas. Las tres primeras descartan la mayoría:

### 1.1 ¿Se puede hacer en poco código?

Una función de 20 líneas bien probada es preferible a una dependencia con su propio árbol de
subdependencias, sus CVEs y sus cambios incompatibles. El ejemplo canónico es la utilidad trivial
que arrastra media docena de paquetes.

**El umbral orientativo:** si lo que se necesita cabe en menos de ~50 líneas y no es criptografía,
fechas, zonas horarias o parseo de un formato complejo, se escribe.

### 1.2 ¿Está viva?

- Último *release* en los últimos ~12 meses.
- Incidencias y PRs con respuesta.
- Más de un mantenedor activo.
- CVEs históricos atendidos con rapidez.

Una librería abandonada es deuda con fecha: el día que aparezca un CVE, no habrá parche.

### 1.3 ¿Qué arrastra?

```bash
pipdeptree -p <paquete>          # antes de instalar, ver el árbol
npm info <paquete> dependencies
```

Una dependencia con cuarenta subdependencias multiplica la superficie de ataque y la probabilidad
de conflicto de versiones.

### 1.4 ¿La licencia sirve?

MIT, BSD, Apache-2.0: sin problema. **GPL/AGPL en un producto propietario: no**, sin decisión
explícita — AGPL puede obligar a publicar el código del servicio. Sin licencia declarada: no se
usa.

### 1.5 ¿Ya hay algo equivalente?

Dos librerías de HTTP, dos de fechas o dos de validación en el mismo proyecto es coste doble de
mantenimiento y confusión sobre cuál usar. Se busca antes de añadir.

### 1.6 ¿Qué cuesta salir?

Si se abandona o se vuelve incompatible, ¿cuánto cuesta sustituirla? Una dependencia que atraviesa
todo el código es cara de sustituir; **una detrás de un puerto** (ver `hexagonal-ports-adapters`)
se cambia en un adaptador.

Para lo crítico —pagos, almacenamiento, notificaciones— el puerto no es opcional.

## 2. Fijado de versiones

```toml
# pyproject.toml — rangos que permiten parches, sin saltos sorpresa
dependencies = [
    "fastapi>=0.115,<0.116",
    "sqlalchemy>=2.0,<2.1",
    "pydantic>=2.9,<3.0",
]
```

Y **el lockfile se commitea siempre** (`uv.lock`, `poetry.lock`, `package-lock.json`): es lo que
garantiza que producción instale exactamente lo que se probó. Sin él, un despliegue puede traer una
versión distinta de la que pasó los tests.

En Docker, se instala **desde el lockfile**, no resolviendo de nuevo:

```dockerfile
RUN uv sync --frozen --no-dev
```

## 3. Auditoría en CI

```bash
pip-audit                        # CVEs en dependencias Python
npm audit --audit-level=high     # idem frontend
```

Bloquea el build en severidad alta o crítica. Para las que no tienen parche todavía, se documenta
la excepción **con fecha de revisión**, no se silencia sin más.

Y algo que se olvida: **las dependencias de desarrollo también importan**. Un paquete de tests
comprometido se ejecuta en CI con acceso a los secretos del pipeline.

## 4. Actualizar como rutina

Actualizar poco es más peligroso que actualizar a menudo:

- **Parches y menores: rutina.** Automatizado (Dependabot/Renovate), agrupado, revisado y
  fusionado si CI está verde. Semanal o quincenal.
- **Mayores: tarjeta propia**, con lectura del changelog y prueba real. Nunca junto a un cambio
  funcional.
- **Seguridad: inmediato**, con prioridad sobre el trabajo en curso si la severidad lo pide.

Un salto de tres años acumulado es un proyecto entero con riesgo alto. Muchos saltos pequeños son
trabajo rutinario y aburrido, que es exactamente lo que debe ser.

**La suite de tests es lo que hace esto viable**: sin ella, ninguna actualización es segura y el
equipo deja de actualizar.

## 5. Cadena de suministro

El riesgo que no cubre `pip-audit`: que el paquete sea malicioso desde el origen.

| Riesgo | Defensa |
|---|---|
| **Typosquatting** (`reqeusts`, `python-dateutils`) | Verificar el nombre exacto y el repositorio oficial |
| **Cuenta de mantenedor comprometida** | Lockfile con hashes; no actualizar a ciegas el mismo día del release |
| **Paquete que ejecuta código al instalar** | Instalar desde lockfile; CI sin secretos innecesarios |
| **Dependencia confusa** (interno vs. público) | Índice privado con prioridad configurada correctamente |

Señales de alarma al instalar algo nuevo: un paquete muy reciente con pocas descargas y un nombre
casi idéntico a uno famoso; un repositorio que no coincide con el declarado; un paquete sin código
fuente público.

## 6. Dependencias del frontend

`node_modules` amplifica todo lo anterior: árboles enormes y ritmo de cambio alto.

- **Cada paquete pesa** en el bundle que descarga el usuario. Se mide antes de añadir.
- **Preferir lo que ya trae la plataforma**: `Intl` para formatos y fechas, `fetch`, el DOM.
- **Vigilar los paquetes de un solo uso** que arrastran árboles enteros.
- **`npm ci`** en CI y en el build, nunca `npm install`.

## 7. Cuando una dependencia hay que abandonarla

Señales: sin mantenimiento y con CVE abierto, incompatible con una versión de Python o Node que
necesitamos, licencia cambiada, o el proyecto se archiva.

El procedimiento:

1. **Tarjeta propia**, no un refactor de paso.
2. **Evaluar sustitutos** con los criterios del §1, y registrarlo (`technical-design`).
3. **Si estaba detrás de un puerto**, se escribe el adaptador nuevo y se cambia el cableado. Los
   tests de contrato verifican que el sustituto se comporta igual.
4. **Si no lo estaba**, este es el momento de ponerle uno, no de repetir el mismo error.

## 8. Reglas duras

- **Una dependencia se justifica**: se comprueba mantenimiento, árbol, licencia y coste de salida.
- **Si cabe en ~50 líneas y no es criptografía, fechas o un formato complejo, se escribe.**
- **Nunca se escribe criptografía propia.** Ahí siempre gana la librería establecida.
- **GPL/AGPL y sin licencia: no**, salvo decisión explícita registrada.
- **El lockfile se commitea**, y el build instala desde él.
- **`pip-audit` y `npm audit` corren en CI** y bloquean en alta o crítica.
- **Las excepciones a una vulnerabilidad llevan fecha de revisión.**
- **Parches y menores, rutina automatizada; mayores, tarjeta propia.**
- **Lo crítico va detrás de un puerto.**
- **Verificar el nombre exacto del paquete** antes de instalar.

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La pasada de seguridad al diff | `security-diff-review` |
| Secretos del pipeline | `secrets-and-config` |
| Puertos para aislar lo externo | `hexagonal-ports-adapters` |
| Registrar la elección de una librería | `technical-design` |
| Tests de contrato al sustituir | `contract-testing` |
| Peso del bundle | `frontend-quality` |
| CI, lockfiles y Docker | `local-dev-and-ci` |
| Dependencia abandonada como deuda | `tech-debt` |
