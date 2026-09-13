---
name: architecture-hybrid
description: Cuánta arquitectura merece cada módulo en Collie — los tres niveles permitidos (CRUD simple, capas, hexágono completo), las señales que hacen subir o bajar de nivel, cómo conviven en el mismo repositorio sin incoherencia, cómo se promueve un módulo sin big-bang, y las mezclas prohibidas que producen lo peor de ambos mundos. Cargar al crear un módulo nuevo, al decidir cuánta estructura darle, al sentir que la arquitectura estorba o se queda corta, al revisar un módulo que no encaja, o al discutir si algo está sobre-diseñado.
---

# Skill: architecture-hybrid

`clean-architecture` define el estándar completo. Esta skill define **cuándo aplicarlo entero y
cuándo no**, para que el estándar no muera de ceremonia.

> **La regla:** la arquitectura se **gana**, no se impone. Un módulo recibe la estructura que sus
> reglas de negocio justifican, y la decisión se registra por escrito al crearlo.

## 1. Por qué existe esta skill

Dos formas de fracasar, simétricas y ambas caras:

- **Sobre-diseñar.** Cuatro capas, puertos y mappers para una tabla de países que nadie va a
  tocar. Doce archivos para lo que cabía en dos. El equipo concluye que la arquitectura es
  burocracia y deja de aplicarla **también donde sí hacía falta**.
- **Sub-diseñar.** La lógica de facturación dentro de un router, con reglas fiscales entre
  `if`s y consultas SQL. Funciona seis meses; después cada cambio rompe algo lejano y nadie se
  atreve a tocarlo.

El criterio uniforme —"todo igual"— garantiza uno de los dos. El criterio correcto es
**proporcionalidad deliberada**.

## 2. Los tres niveles

Sólo estos tres. No se inventan variantes.

### Nivel 1 — CRUD simple

```
modules/<module>/
├── infrastructure/
│   └── persistence/
│       ├── models/
│       └── repositories/
└── interfaces/
    └── http/
        ├── routers/
        ├── schemas/
        └── dependencies.py
```

Sin `domain/` ni `application/`. El router llama al repositorio y devuelve. **Es una decisión
legítima**, no una deuda, mientras se cumplan las condiciones del §3.

Incluso aquí: el schema declara sus campos explícitamente y **nunca se devuelve el modelo ORM**
(ver `boundary-mapping` §7.1). Esa regla no depende del nivel.

### Nivel 2 — Capas con servicio

```
modules/<module>/
├── application/
│   └── services/          lógica de negocio, recibe repositorios concretos
├── infrastructure/
└── interfaces/
```

Hay reglas de negocio y merecen salir del router, pero no hay suficiente complejidad para
justificar puertos, entidades separadas del ORM y mappers. El servicio depende del repositorio
concreto; se prueba con base de datos de test.

**Es el nivel más peligroso**: cómodo, y fácil de quedarse ahí cuando el módulo ya pedía el
hexágono. Ver §5.

### Nivel 3 — Hexágono completo

Las cuatro capas de `clean-architecture`: entidades con invariantes, puertos, casos de uso,
adaptadores y mappers. El dominio se prueba sin infraestructura.

Es el estándar para el núcleo del negocio.

## 3. Qué nivel le toca a cada módulo

Se responde **al crear el módulo**, con estas señales:

| Señal | Nivel |
|---|---|
| Es una tabla de apoyo, catálogo o parámetros | 1 |
| No hay validación más allá de la forma del dato | 1 |
| Sólo lo mantiene quien lo creó, cambia una vez al año | 1 |
| Hay reglas de negocio, pero simples y estables | 2 |
| Una sola fuente de datos y ninguna integración externa | 2 |
| Invariantes que deben cumplirse pase lo que pase | 3 |
| Estados con transiciones legales e ilegales | 3 |
| Cálculos de dinero, impuestos, stock o plazos | 3 |
| Más de una fuente de datos o integraciones externas | 3 |
| Reglas que cambian a menudo, o fallar sale caro | 3 |
| Varias personas lo tocan a la vez | 3 |

**Una sola señal de nivel 3 basta** para aplicar nivel 3. Las señales de nivel 3 son riesgos, y el
riesgo no se promedia.

**En la duda, nivel 2.** Subir de 2 a 3 es mecánico; bajar de 3 a 1 es tirar trabajo.

## 4. La decisión se registra

Al crear el módulo, en su `README.md`:

```markdown
# billing

**Architecture level: 3 (full hexagon)**

Tax rules change per country and per fiscal year, and an error has direct financial
impact. The domain must be testable without a database.
```

Sin esto, seis meses después nadie sabe si el nivel 1 fue una decisión o un descuido, y la
discusión se repite en cada PR. **Dos líneas ahorran esa discusión para siempre.**

## 5. Promover un módulo

Las señales de que un módulo se quedó corto:

- Un `if` de negocio apareció en un router o en un schema Pydantic.
- Un test necesita base de datos para verificar una regla que no habla de persistencia.
- Un servicio pasa de ~300 líneas, o su nombre ya no describe lo que hace.
- Un bug se produjo porque alguien cambió un estado saltándose una validación.
- Entró una segunda fuente de datos o un servicio externo.
- La misma regla aparece copiada en dos sitios.

Cuando aparezcan **dos** de esas, el módulo sube de nivel. Y se hace así:

1. **Tarjeta propia**, con la promoción como alcance. No de tapadillo dentro de otra tarea.
2. **Primero las entidades y sus invariantes**, con tests que no tocan infraestructura.
3. **Después los puertos**, extraídos de lo que el servicio ya usaba.
4. **Los mappers y los adaptadores** al final: es lo mecánico.
5. **`import-linter` recibe el módulo** en sus contratos, en el mismo PR.
6. **Los endpoints no cambian de contrato.** Si cambian, es otra tarjeta.

Y el camino inverso existe: un módulo de nivel 3 cuyas reglas desaparecieron puede bajar. Es raro,
pero mantener capas vacías también cuesta.

## 6. Convivir sin incoherencia

Niveles distintos en el mismo repositorio es lo normal y no es desorden, **siempre que**:

- **La estructura de carpetas sea la misma en lo que exista.** Un módulo de nivel 1 no inventa
  `controllers/` ni `helpers/`: usa `interfaces/` e `infrastructure/` tal como están definidas.
- **Las reglas transversales se cumplan en todos los niveles**: nombres en inglés, no devolver
  modelos ORM, un solo handler de errores, `Session` fuera de las firmas de los routers, secretos
  sólo en `config/`.
- **Nadie importe hacia dentro de otro módulo.** Un módulo de nivel 1 tampoco. Se hablan por
  puertos o por casos de uso, nunca tocando tablas ajenas.
- **El nivel esté escrito** en el `README.md` del módulo.

## 7. Mezclas prohibidas

Combinaciones que producen lo peor de los dos mundos.

### 7.1 Puertos sin entidades

Un `OrderRepository` que devuelve modelos SQLAlchemy. Hay ceremonia de interfaz, pero la
infraestructura sigue atravesando el sistema: no se puede probar sin base de datos. **La interfaz
sin la traducción no compra nada.** O entidades y mappers, o nada.

### 7.2 Entidades sin puertos

Entidades limpias que el servicio construye llamando a SQLAlchemy directamente. La lógica está
bien colocada pero sigue atada a la persistencia. Falta el puerto para cerrar el círculo.

### 7.3 Dominio a medias

Tres entidades ricas y cinco modelos ORM usados como entidades, en el mismo módulo. Nadie sabe de
qué lado está cada cosa y las reglas aparecen en ambos. **Dentro de un módulo, el nivel es uno
solo.**

### 7.4 Casos de uso que son pasos a través

Nivel 3 aplicado a un CRUD: casos de uso de tres líneas que llaman al repositorio y devuelven. Es
sobre-diseño puro, y es la causa número uno de que un equipo rechace la arquitectura limpia. Eso
era nivel 1.

### 7.5 El nivel como excusa

"Es nivel 1" para meter lógica de negocio en un router. Si hay lógica de negocio, **ya no es nivel
1**: el nivel describe lo que el módulo es, no un permiso para hacerlo mal.

## 8. Cómo se revisa esto en un PR

Tres preguntas, en este orden:

1. **¿El nivel declarado corresponde a lo que hace el módulo?** Si hay reglas de negocio en un
   módulo declarado nivel 1, el nivel está mal, no el código.
2. **¿Hay ceremonia que no compra nada?** Casos de uso que sólo reenvían, puertos con un solo
   implementador que nunca se sustituye, mappers entre clases idénticas.
3. **¿Hay reglas de negocio fuera del sitio que el nivel permite?** Un `if` de negocio en un
   router es un problema en cualquier nivel.

## 9. Reglas duras

- **Tres niveles, sin variantes inventadas.**
- **Una sola señal de nivel 3 obliga a nivel 3.**
- **El nivel se declara en el `README.md` del módulo** al crearlo.
- **Dentro de un módulo, el nivel es uno solo.** Sin dominios a medias.
- **Puertos sin entidades, o entidades sin puertos, están prohibidos.** El hexágono se aplica
  entero o no se aplica.
- **Un caso de uso que sólo reenvía es sobre-diseño**, y se elimina.
- **Promover es una tarjeta propia**, nunca un refactor escondido en otra tarea.
- **Las reglas transversales se cumplen en los tres niveles.**
- **El nivel nunca justifica lógica de negocio en un router.**
- **En la duda, nivel 2.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| El estándar completo y la regla de dependencias | `clean-architecture` |
| Puertos y adaptadores | `hexagonal-ports-adapters` |
| Entidades, value objects, agregados | `domain-modeling` |
| Carpetas exactas y `import-linter` | `project-structure` |
| Detectar sobre-diseño y abstracción prematura | `solid-principles` |
| Registrar la decisión de nivel | `technical-design` |
| Deuda detectada al promover | `tech-debt` |
