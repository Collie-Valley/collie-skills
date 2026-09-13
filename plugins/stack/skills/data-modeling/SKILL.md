---
name: data-modeling
description: La capa de persistencia en Collie — modelos SQLAlchemy como detalle de infraestructura, restricciones e invariantes en la base y no sólo en Python, índices que sirven, migraciones Alembic reversibles y seguras en caliente, N+1 y carga de relaciones, transacciones y concurrencia optimista, y borrado lógico frente a real. Cargar al crear o cambiar una tabla, al escribir una migración, al ver consultas lentas o N+1, al diseñar índices, o al decidir cómo se borra algo.
---

# Skill: data-modeling

El adaptador de persistencia. Las entidades viven en `domain/` (ver `domain-modeling`); aquí están
las tablas.

> **La regla:** la base de datos es la última línea de defensa de la integridad. Una invariante que
> sólo existe en Python se rompe el día que alguien ejecute un script, una migración o una
> importación.

## 1. El modelo es infraestructura

```python
# infrastructure/persistence/models/order_model.py
class OrderModel(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    total_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    lines: Mapped[list["OrderLineModel"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="raise",
    )

    __table_args__ = (
        CheckConstraint("total_minor >= 0", name="ck_orders_total_non_negative"),
        Index("ix_orders_customer_placed", "customer_id", "placed_at"),
    )
```

Decisiones que importan:

- **No es una entidad.** Describe columnas; el mapper traduce (ver `boundary-mapping` §5).
- **`lazy="raise"`**: acceder a una relación no cargada **lanza una excepción** en vez de disparar
  una consulta silenciosa. Es la defensa más efectiva contra el N+1, y convierte un problema de
  producción en un error de test.
- **`DateTime(timezone=True)`** siempre. Guardar en UTC; una fecha sin zona es una ambigüedad que
  aparece con el horario de verano.
- **Dinero como entero en la unidad mínima** más el código de moneda.

## 2. Las invariantes van en la base

| Invariante | En la base |
|---|---|
| No puede ser nulo | `nullable=False` |
| Único | `UniqueConstraint` |
| Rango válido | `CheckConstraint` |
| Referencia existente | `ForeignKey` con `ondelete` explícito |
| Valor de un conjunto | `CheckConstraint` con `IN` |

Comprobarlo sólo en Python falla en tres escenarios reales: dos peticiones concurrentes (el
`if not exists` clásico), un script de importación que se salta el dominio, y una migración de
datos.

**`ondelete` siempre explícito.** El comportamiento por defecto varía y deja huérfanos o borra en
cascada sin que nadie lo haya decidido.

### La restricción única y el duplicado

```python
# ✗ dos peticiones simultáneas pasan ambas por el if
if self._repo.find_by_sku(sku) is not None:
    raise DuplicateSku(sku)
self._repo.save(product)
```

La comprobación previa es para dar un buen mensaje; **la garantía es la restricción única**, y el
adaptador traduce el `IntegrityError` a la excepción de dominio.

## 3. Índices

Se crean para **consultas reales**, no por si acaso: cada índice ralentiza las escrituras y ocupa
espacio.

Qué indexar:

- Claves foráneas usadas en `JOIN` o para filtrar.
- Columnas de los `WHERE` frecuentes.
- Columnas de `ORDER BY` sobre tablas grandes.
- Combinaciones: un índice compuesto `(customer_id, placed_at)` sirve para filtrar por cliente y
  ordenar por fecha **en una sola pasada**.

Lo que hay que saber del compuesto: **el orden de las columnas importa**. `(a, b)` sirve para
filtrar por `a` y por `a+b`, pero **no** para filtrar sólo por `b`.

Verificar antes de dar por bueno:

```sql
EXPLAIN ANALYZE SELECT ... ;   -- ¿Index Scan o Seq Scan?
```

Un índice que el planificador no usa es coste puro. Y sobre tablas grandes en producción,
`CREATE INDEX CONCURRENTLY` para no bloquear escrituras.

## 4. N+1

El problema de rendimiento más común y el más invisible en desarrollo, donde hay diez filas:

```python
# ✗ una consulta + una por cada pedido
orders = session.scalars(select(OrderModel)).all()
for order in orders:
    total = sum(line.amount for line in order.lines)    # consulta por iteración
```

Con `lazy="raise"` esto **revienta en el test** en vez de degradar producción. El arreglo es cargar
explícitamente lo que se va a usar:

```python
orders = session.scalars(
    select(OrderModel).options(selectinload(OrderModel.lines))
).all()
```

| Estrategia | Cuándo |
|---|---|
| `selectinload` | Colecciones. Una consulta extra con `IN`. **La opción por defecto** |
| `joinedload` | Relaciones a-uno. Un `JOIN`; multiplica filas en colecciones |
| `raiseload` / `lazy="raise"` | Por defecto en el modelo: obliga a ser explícito |

Y la comprobación en tests: contar consultas. Un test que verifica "este endpoint hace como mucho
3 consultas" detecta la regresión el día que alguien añada un acceso perezoso.

## 5. Migraciones

```python
def upgrade() -> None:
    op.add_column("orders", sa.Column("channel", sa.String(20), nullable=True))
    op.execute("UPDATE orders SET channel = 'WEB' WHERE channel IS NULL")
    op.alter_column("orders", "channel", nullable=False)


def downgrade() -> None:
    op.drop_column("orders", "channel")
```

Reglas que evitan incidentes:

- **`downgrade` escrito y probado.** Si de verdad no puede revertir (pierde datos), se declara y
  se documenta — se sabe antes, no durante el incidente.
- **Columna nueva: primero `nullable=True`**, se rellena, y luego se endurece. Añadir `NOT NULL`
  de golpe sobre una tabla con filas falla.
- **Compatible con la versión anterior del código** durante el despliegue: mientras dura, conviven
  ambas versiones.
- **Nada de bloqueos largos** sobre tablas grandes: índices concurrentes, actualizaciones por
  lotes.
- **Se revisa lo que genera `--autogenerate`**: no detecta renombrados (los ve como borrar + crear,
  perdiendo los datos) ni cambios de tipo delicados.
- **Una migración de datos grande no va en Alembic**: va en un script idempotente y observable, que
  se puede parar y reanudar.

### Renombrar o eliminar: en varios pasos

Eliminar una columna que el código aún usa rompe el despliegue. La secuencia segura, en varios
releases:

1. Añadir lo nuevo, escribir en ambos.
2. Migrar los datos existentes.
3. Cambiar las lecturas a lo nuevo.
4. Dejar de escribir en lo viejo.
5. Eliminar lo viejo.

## 6. Transacciones y concurrencia

La transacción la decide el caso de uso, por `UnitOfWork` (ver `hexagonal-ports-adapters` §4.2).

Para leer-modificar-escribir concurrente, **bloqueo optimista**:

```python
__mapper_args__ = {"version_id_col": version}
```

SQLAlchemy incrementa `version` en cada `UPDATE` y añade `WHERE version = :leída`. Si otra
transacción modificó la fila, el `UPDATE` no afecta a nada y lanza `StaleDataError`, que el
adaptador traduce a un conflicto de dominio (409 hacia el cliente).

Sin esto, dos peticiones simultáneas sobre el mismo pedido: la segunda pisa a la primera y el
cambio se pierde sin rastro.

El bloqueo pesimista (`SELECT ... FOR UPDATE`) se reserva para contención alta y secciones muy
cortas: bloquea filas y puede producir interbloqueos.

**Nada de operaciones externas dentro de la transacción.** Enviar un correo o llamar a un
proveedor dentro del `with` alarga el bloqueo y, si la transacción revierte, el efecto externo ya
ocurrió. Van después del commit, por evento.

## 7. Borrado

| Tipo | Cuándo |
|---|---|
| **Real** (`DELETE`) | Datos sin valor histórico, o cuando hay obligación de eliminar |
| **Lógico** (`deleted_at`) | Hace falta el histórico, o el borrado debe ser reversible |

Si se usa borrado lógico:

- **Todas las consultas filtran** por `deleted_at IS NULL`. Una que se olvide expone datos
  borrados — es el fallo típico de este patrón.
- **Las restricciones únicas deben contemplarlo**: un índice único parcial
  (`WHERE deleted_at IS NULL`) permite reutilizar un código tras borrar.
- **No sustituye al borrado real** cuando hay obligación legal de eliminar (ver `sensitive-data`).

## 8. Reglas duras

- **El modelo ORM es infraestructura**, nunca una entidad.
- **Las invariantes se declaran en la base**, además de en el dominio.
- **`ondelete` siempre explícito en las claves foráneas.**
- **`lazy="raise"` por defecto**; la carga se pide explícitamente.
- **`DateTime(timezone=True)` y UTC.** Dinero como entero en unidad mínima.
- **Los índices se crean para consultas reales** y se verifican con `EXPLAIN`.
- **Toda migración tiene `downgrade` probado**, o se declara irreversible.
- **Columna nueva: nullable, rellenar, endurecer.**
- **Renombrar y eliminar, en varios releases.**
- **Bloqueo optimista donde haya escritura concurrente.**
- **Ninguna llamada externa dentro de una transacción.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Entidades, agregados e invariantes de negocio | `domain-modeling` |
| Mapper entre modelo y entidad | `boundary-mapping` |
| Repositorios, puertos y Unit of Work | `hexagonal-ports-adapters` |
| `AsyncSession` y bloqueo del loop | `async-discipline` |
| Probar repositorios y migraciones | `integration-testing` |
| Medir consultas lentas | `performance` |
| Retención y borrado de datos personales | `sensitive-data` |
| Inyección SQL | `security-diff-review` |
