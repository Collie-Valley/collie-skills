---
name: integration-testing
description: Probar los adaptadores contra infraestructura real en Collie — Postgres de verdad con testcontainers en vez de SQLite mentiroso, aislamiento transaccional entre tests, migraciones Alembic aplicadas en el test, clientes HTTP contra servidor simulado, tests del borde con httpx.AsyncClient, y qué se prueba aquí y qué no. Cargar al escribir tests de repositorios, clientes externos o migraciones, al probar un endpoint completo, al ver tests que usan SQLite para simular Postgres, o al arreglar tests de integración lentos o inestables.
---

# Skill: integration-testing

Los tests del borde: verifican que la traducción al mundo real funciona.

> **La regla:** un test de integración prueba **la traducción**, no las reglas de negocio. Si aquí
> aparece una regla de negocio, es que la regla está en la capa equivocada.

## 1. Base de datos real, no SQLite

```python
# ✗ SQLite fingiendo ser Postgres
engine = create_engine("sqlite:///:memory:")
```

Miente en todo lo que importa: tipos (`JSONB`, `ARRAY`, `NUMERIC` de precisión alta), restricciones
(`ON DELETE` se comporta distinto), transacciones y bloqueos, funciones de fecha, e índices
parciales. Un test verde en SQLite y roto en Postgres es lo peor de ambos mundos: da confianza
falsa.

```python
# tests/conftest.py
@pytest.fixture(scope="session")
def postgres() -> Iterator[PostgresContainer]:
    with PostgresContainer("postgres:16-alpine") as container:
        yield container


@pytest.fixture(scope="session")
def engine(postgres: PostgresContainer) -> Engine:
    engine = create_engine(postgres.get_connection_url())
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", postgres.get_connection_url())
    command.upgrade(alembic_cfg, "head")
    return engine
```

Dos decisiones: el contenedor es **de sesión** (arrancar uno por test es inviable), y el esquema se
crea **aplicando las migraciones**, no con `Base.metadata.create_all()`. Así los tests verifican
de paso que las migraciones producen el esquema que el código espera — el desajuste entre ambos es
un fallo clásico de despliegue.

## 2. Aislamiento entre tests

Cada test empieza con la base en un estado conocido. La forma barata es una transacción que se
revierte:

```python
@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()
```

Rápido y sin limpieza manual. La limitación: **el código bajo prueba no puede hacer `commit`**, o
la transacción externa se cierra. Por eso el `UnitOfWork` se inyecta y en estos tests se usa uno
que no commitea de verdad.

Cuando sí hace falta probar el commit real (comportamiento transaccional, bloqueos, concurrencia),
se trunca entre tests:

```python
@pytest.fixture
def clean_database(engine: Engine) -> Iterator[None]:
    yield
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE orders, order_lines RESTART IDENTITY CASCADE"))
```

**Nunca se depende del orden de los tests ni del estado que dejó el anterior.**

## 3. Probar un repositorio

```python
class TestSqlOrderRepository:
    def test_saves_and_reads_back_the_entity(self, session: Session) -> None:
        repo = SqlOrderRepository(session)
        order = OrderBuilder().build()

        repo.save(order)
        session.flush()

        loaded = repo.get(order.id)
        assert loaded == order

    def test_get_raises_when_missing(self, session: Session) -> None:
        repo = SqlOrderRepository(session)

        with pytest.raises(OrderNotFound):
            repo.get(OrderId.generate())

    def test_translates_duplicate_into_a_domain_error(self, session: Session) -> None:
        repo = SqlOrderRepository(session)
        order = OrderBuilder().build()
        repo.save(order)
        session.flush()

        with pytest.raises(DuplicateOrder):
            repo.save(OrderBuilder().with_id(order.id).build())
```

Lo que se verifica aquí, y en ningún otro sitio:

- **Ida y vuelta completa**: lo guardado se lee igual, incluidos decimales, fechas con zona y
  colecciones. El mapper es donde se pierden datos en silencio.
- **La traducción de excepciones**: un `IntegrityError` sale como error de dominio.
- **Las consultas de negocio** devuelven lo que dicen (filtros, orden, paginación).

## 4. Probar migraciones

```python
def test_migrations_apply_and_revert(postgres: PostgresContainer) -> None:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", postgres.get_connection_url())

    command.upgrade(cfg, "head")
    command.downgrade(cfg, "-1")
    command.upgrade(cfg, "head")
```

Una migración que no revierte es un despliegue sin vuelta atrás. Si de verdad no puede revertir
(borra datos), se declara y se documenta en el ADR — pero se sabe antes, no durante el incidente.

## 5. Probar un cliente HTTP

Contra un servidor simulado, no contra el proveedor real: sus tests no pueden depender de la red
ni de una cuenta ajena.

```python
def test_gateway_translates_a_declined_payment(respx_mock) -> None:
    respx_mock.post("https://api.provider.test/charges").respond(
        402, json={"error": "card_declined"}
    )
    gateway = HttpPaymentGateway(base_url="https://api.provider.test", client=httpx.Client())

    with pytest.raises(PaymentDeclined):
        gateway.charge(Money(Decimal("100"), USD), token="tok_123")
```

Se prueban sobre todo **los caminos malos**, que son los que nunca se ven en desarrollo: 4xx, 5xx,
timeout, respuesta con forma inesperada, cuerpo vacío.

Un test contra el proveedor real se marca `@pytest.mark.external` y **no corre en CI por defecto**:
es útil para verificar credenciales y contratos, pero no puede bloquear un despliegue por una caída
ajena.

## 6. Probar el borde HTTP

```python
@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_place_order_returns_201_with_the_new_id(client: TestClient) -> None:
    response = client.post("/api/v1/orders", json={
        "customer_id": str(uuid4()),
        "lines": [{"sku": "WIDGET", "quantity": 10}],
    })

    assert response.status_code == 201
    assert response.json()["id"]


def test_place_order_rejects_an_empty_line_list(client: TestClient) -> None:
    response = client.post("/api/v1/orders", json={"customer_id": str(uuid4()), "lines": []})

    assert response.status_code == 422


def test_delete_requires_admin_role(client: TestClient, viewer_token: str) -> None:
    response = client.delete(f"/api/v1/orders/{uuid4()}",
                             headers={"Authorization": f"Bearer {viewer_token}"})

    assert response.status_code == 403
```

Aquí se prueba el **contrato**: código de estado, forma de la respuesta, validación de entrada,
permisos y forma del error. **No** todas las reglas de negocio: ésas ya están probadas en unit, y
repetirlas aquí las duplica sin añadir seguridad.

Para una app async, `httpx.AsyncClient` con `ASGITransport` en vez de `TestClient`.

## 7. Velocidad

Los tests de integración son inevitablemente más lentos, pero no tienen por qué ser insufribles:

- **Contenedor de sesión**, nunca por test.
- **Migraciones una vez** por sesión.
- **Transacción revertida** en vez de truncar, cuando se puede.
- **Paralelizar** con `pytest-xdist` y una base por worker.
- **Lo que no necesita base de datos, no la pide.** Un test que sólo verifica un mapper es
  unitario.

Si la suite de integración pasa de unos minutos, la causa casi siempre es que hay tests ahí que
eran unitarios.

## 8. Reglas duras

- **Base de datos real (testcontainers), nunca SQLite simulando otra cosa.**
- **El esquema se crea aplicando las migraciones**, no con `create_all`.
- **Cada test es independiente del orden y limpia lo suyo.**
- **Ninguna regla de negocio se prueba aquí.**
- **Se verifica la ida y vuelta completa del mapper**, con decimales, fechas y colecciones.
- **Se verifica que las excepciones de librería se traducen** a errores de dominio.
- **Las migraciones se prueban aplicando y revirtiendo.**
- **Los clientes HTTP se prueban contra un servidor simulado**, con los caminos malos.
- **Lo que llama a un servicio externo real va marcado y fuera del CI por defecto.**
- **El contenedor es de sesión.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué nivel merece cada prueba | `test-strategy` |
| Dominio y casos de uso con fakes | `unit-testing-domain` |
| Fake y real contra la misma batería | `contract-testing` |
| Builders y datos | `test-data` |
| Migraciones, índices y N+1 | `data-modeling` |
| El cableado y `dependency_overrides` | `dependency-injection` |
| Contrato público y versionado | `api-contracts` |
| Docker, CI y paralelismo | `local-dev-and-ci` |
