---
name: contract-testing
description: Tests de contrato en Collie — la batería única que fake y adaptador real deben pasar por igual, el contrato del puerto como texto ejecutable, y el contrato entre backend y frontend con OpenAPI como fuente de verdad y tipos generados para el cliente Astro/React. Cargar al escribir un puerto o un fake nuevo, al detectar que un test pasa con el fake y falla en producción, al cambiar el contrato de una API, o al integrar el cliente TypeScript con el backend.
---

# Skill: contract-testing

Dos contratos, el mismo problema: dos implementaciones que deben comportarse igual y que nadie
verifica juntas.

> **La regla:** un contrato que no se ejecuta no es un contrato, es una expectativa. Y las
> expectativas divergen en silencio.

## 1. El contrato del puerto

El problema concreto: el fake y el adaptador real cumplen el mismo `Protocol`, así que `mypy` los
acepta. Pero `Protocol` sólo verifica **firmas**, no comportamiento:

```python
# el fake acepta duplicados en silencio
class FakeOrderRepository:
    def save(self, order: Order) -> None:
        self._items[order.id] = order

# el real revienta
class SqlOrderRepository:
    def save(self, order: Order) -> None:
        ...  # IntegrityError
```

Los tests unitarios pasan con el fake. Producción falla con el real. **El test mintió**, y mintió
con toda la apariencia de estar bien.

### La solución: una batería para ambos

```python
# tests/contract/test_order_repository_contract.py
class OrderRepositoryContract:
    """Every OrderRepository implementation must satisfy these."""

    @pytest.fixture
    def repository(self) -> OrderRepository:
        raise NotImplementedError

    def test_saves_and_reads_back(self, repository: OrderRepository) -> None:
        order = OrderBuilder().build()
        repository.save(order)
        assert repository.get(order.id) == order

    def test_get_raises_when_missing(self, repository: OrderRepository) -> None:
        with pytest.raises(OrderNotFound):
            repository.get(OrderId.generate())

    def test_save_rejects_a_duplicate_id(self, repository: OrderRepository) -> None:
        order = OrderBuilder().build()
        repository.save(order)

        with pytest.raises(DuplicateOrder):
            repository.save(OrderBuilder().with_id(order.id).build())


class TestFakeOrderRepository(OrderRepositoryContract):
    @pytest.fixture
    def repository(self) -> OrderRepository:
        return FakeOrderRepository()


class TestSqlOrderRepository(OrderRepositoryContract):
    @pytest.fixture
    def repository(self, session: Session) -> OrderRepository:
        return SqlOrderRepository(session)
```

Si el fake no lanza `DuplicateOrder`, **el test del fake falla** — y se arregla el fake, que es
donde estaba la mentira.

### Qué entra en el contrato

| Entra | No entra |
|---|---|
| Qué devuelve cuando existe y cuando no | Cuánto tarda |
| Qué excepción lanza y cuándo | Qué SQL genera |
| El orden, si el contrato lo promete | Cómo se conecta |
| Qué pasa con el duplicado | Detalles de la tecnología |
| Si persiste o no sin commit | El tipo de índice usado |

**El contrato es lo que un caso de uso puede asumir.** Nada más, nada menos.

Y el docstring del puerto (ver `hexagonal-ports-adapters` §2) es la versión en prosa del mismo
contrato: si divergen, uno de los dos está mal.

## 2. El contrato entre backend y frontend

El otro contrato que se rompe en silencio: el backend renombra un campo, el frontend sigue leyendo
el viejo, y nadie se entera hasta que un usuario ve `undefined`.

### OpenAPI es la fuente de verdad

FastAPI genera el esquema desde los schemas Pydantic. Ese esquema **es** el contrato, y de ahí se
generan los tipos del cliente:

```bash
# backend: exporta el esquema como artefacto versionado
python -c "import json; from src.main import app; \
  print(json.dumps(app.openapi(), indent=2))" > openapi.json

# frontend: genera los tipos
npx openapi-typescript openapi.json -o src/api/schema.d.ts
```

```typescript
// el cliente usa los tipos generados, nunca tipos escritos a mano
import type { components } from "./schema";

type Order = components["schemas"]["OrderResponse"];
```

Escribir a mano la interfaz en TypeScript es duplicar el contrato: las dos copias divergen y la
divergencia no la detecta nadie.

### El test que detecta el cambio

```yaml
# en CI, tras generar el esquema
- run: python scripts/export_openapi.py > openapi.json
- run: git diff --exit-code openapi.json
```

Si el esquema cambió y nadie regeneró el artefacto, **CI falla**. El autor entonces decide: o es
un cambio esperado y lo commitea (y el frontend regenera sus tipos), o es un cambio accidental que
no debía ocurrir.

Esto convierte un cambio de contrato en una decisión explícita en vez de un efecto colateral.

### Cambios incompatibles

Un cambio que rompe a los clientes exige el commit con `BREAKING CHANGE` (ver `git-discipline`) y
una de estas tres salidas:

1. **Versión nueva del endpoint**, con la vieja funcionando durante la transición.
2. **Campo añadido, viejo mantenido** hasta que todos los clientes migren.
3. **Coordinación explícita**, si el único cliente es interno y se despliega a la vez.

Nunca: cambiar el tipo o el nombre de un campo existente y desplegar.

## 3. Contratos con proveedores externos

Cuando dependemos de una API ajena, el riesgo es que cambie sin avisar. Dos defensas:

- **El adaptador valida la respuesta** contra el modelo esperado y falla ruidoso si no encaja. Una
  respuesta con un campo faltante debe dar un error claro del adaptador, no un `KeyError` tres
  capas más arriba.
- **Un test marcado `external`** que llama al proveedor real, fuera del CI por defecto, ejecutado
  periódicamente. Detecta el cambio antes de que lo haga un usuario.

## 4. Errores frecuentes

| Error | Consecuencia |
|---|---|
| Fake más permisivo que el real | Tests verdes, producción rota |
| Fake más estricto que el real | Tests que fallan sin motivo real |
| Contrato sólo en el docstring | Nadie lo verifica; diverge |
| Tipos del frontend escritos a mano | Divergen sin que nadie lo note |
| `openapi.json` no versionado | Un cambio de contrato pasa inadvertido |
| Contrato que fija detalles de implementación | Impide cambiar el adaptador sin tocar tests |
| Un solo adaptador y aun así contrato | Si nunca habrá dos implementaciones, sobra |

La última tiene matiz: **el fake cuenta como segunda implementación**. Si hay fake, hay dos.

## 5. Reglas duras

- **Toda implementación de un puerto pasa la misma batería de contrato.** El fake incluido.
- **El contrato define comportamiento observable**, no detalles de tecnología.
- **El docstring del puerto y la batería dicen lo mismo.**
- **Los tipos del cliente se generan desde OpenAPI**, nunca se escriben a mano.
- **`openapi.json` se versiona y CI falla si cambió sin regenerarse.**
- **Un cambio incompatible se declara y se transiciona**, jamás se despliega en caliente.
- **El adaptador valida la respuesta del proveedor** y falla ruidoso si no encaja.
- **Los tests contra proveedores reales van marcados y fuera del CI por defecto.**

## 6. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Puertos, adaptadores y fakes | `hexagonal-ports-adapters` |
| LSP: por qué un sustituto no puede sorprender | `solid-principles` |
| Fakes en tests de dominio | `unit-testing-domain` |
| Adaptadores contra infraestructura real | `integration-testing` |
| Versionado y diseño del contrato público | `api-contracts` |
| Tipos compartidos en el frontend | `frontend-architecture` |
| `BREAKING CHANGE` en el commit | `git-discipline` |
