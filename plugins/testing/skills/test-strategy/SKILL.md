---
name: test-strategy
description: Qué nivel de prueba merece cada cosa en Collie — la pirámide que la arquitectura hexagonal hace posible (ancha en dominio, media en adaptadores, estrecha en e2e), qué se prueba en cada nivel y qué no, cómo se decide el nivel de una prueba, qué no se prueba nunca, organización y nombres, y las señales de una suite mal repartida. Cargar antes de escribir tests, al decidir dónde probar algo, al ver una suite lenta o frágil, al planificar la cobertura de una funcionalidad, o al revisar los tests de un PR.
---

# Skill: test-strategy

Dónde se prueba cada cosa. Es la decisión que determina si la suite es una red de seguridad o un
lastre.

> **La regla:** cada comportamiento se prueba **en el nivel más barato que pueda demostrarlo**.
> Probar en un nivel más alto del necesario cuesta tiempo en cada ejecución y fragilidad en cada
> cambio.

## 1. La pirámide, y por qué aquí es posible

```
        ╱╲          e2e            unos pocos recorridos críticos    minutos
       ╱──╲         contract       fake y real cumplen lo mismo      segundos
      ╱────╲        integration    adaptadores contra lo real       segundos
     ╱──────╲       unit           dominio y casos de uso           milisegundos
    ╱────────╲
```

La base ancha **sólo es posible porque el dominio está detrás de puertos**. Sin hexagonal, probar
una regla de negocio exige levantar base de datos y la pirámide se invierte sola: todo acaba
siendo integración lenta.

Es la razón práctica de `clean-architecture`, y aquí es donde se cobra.

## 2. Qué se prueba en cada nivel

| Nivel | Qué prueba | Con qué | Cuánto tarda |
|---|---|---|---|
| **unit** | Entidades, value objects, servicios de dominio, casos de uso | Fakes en memoria | < 10 ms |
| **integration** | Adaptadores: repositorios, clientes HTTP, migraciones | Postgres real (testcontainers), servidor simulado | 0,1–2 s |
| **contract** | Que fake y adaptador real cumplan el mismo contrato | Ambos, con la misma batería | 0,1–2 s |
| **api** | El borde HTTP: rutas, códigos, forma de la respuesta, permisos | `TestClient` con casos de uso reales o fakes | 10–100 ms |
| **e2e** | Recorridos críticos completos | Navegador real (Playwright) | 5–60 s |

### Lo que NO va en cada nivel

- **unit**: nada que toque red, disco, base de datos, reloj real o azar.
- **integration**: reglas de negocio. Si una regla sólo se puede verificar con base de datos, la
  regla está en la capa equivocada.
- **api**: lógica de negocio exhaustiva. El borde prueba que traduce bien, no todas las reglas.
- **e2e**: casos límite, validaciones, permutaciones. Sólo el recorrido principal.

## 3. Cómo se decide el nivel

Tres preguntas, en orden. La primera que dé "sí" decide:

1. **¿Es una regla de negocio?** → unit, con fakes. Siempre.
2. **¿Es una traducción hacia el mundo exterior?** (SQL, HTTP, formato de archivo) → integration.
3. **¿Es un recorrido de negocio completo que el usuario hace y que si se rompe nos enteramos
   tarde?** → e2e, y sólo si pasa el filtro de `e2e-scope`.

**Si dudas entre dos niveles, elige el más bajo.** Un test unitario que se queda corto se
complementa; uno de e2e de más se paga en cada ejecución durante años.

### El mismo comportamiento, una sola vez

Un comportamiento se prueba **en un nivel**, no en tres. Probar la regla de descuento en unit, en
api y en e2e no da más seguridad: da tres sitios que actualizar cuando la regla cambie, y dos de
ellos se olvidarán.

## 4. Qué no se prueba nunca

| No probar | Por qué |
|---|---|
| Código de terceros | SQLAlchemy y Pydantic ya tienen sus tests |
| Getters, setters, `__repr__` | No hay comportamiento que verificar |
| Detalles de implementación privados | Se rompen en cada refactor sin que nada esté mal |
| Que un mock fue llamado (como única aserción) | Prueba el test, no el sistema |
| Configuración estática | Si no tiene lógica, no tiene fallo posible |
| El framework | Que FastAPI enrute es su problema |
| Combinaciones exhaustivas de datos | Los bordes bastan; el resto es ruido lento |

Y la trampa: **un test que sólo puede romperse si alguien lo borra a propósito no aporta nada**.
Ocupa tiempo de ejecución y de mantenimiento sin cubrir riesgo.

## 5. Organización

Espejo de `src/`, como define `project-structure`:

```
tests/
├── unit/<module>/domain/          entidades, VOs, servicios
├── unit/<module>/application/     casos de uso con fakes
├── integration/<module>/          repositorios, clientes, migraciones
├── contract/<module>/             fake y real, misma batería
├── api/<module>/                  el borde HTTP
├── e2e/                           recorridos críticos
├── fakes/                         fakes de los puertos, compartidos
└── conftest.py
```

### Nombres

`test_<qué>_<en qué condición>`. El nombre debe leerse como una afirmación sobre el sistema:

```python
✗ def test_order():
✗ def test_confirm_1():
✓ def test_confirm_fails_when_total_exceeds_threshold_without_approval():
✓ def test_export_returns_header_only_when_no_orders_match():
```

Cuando un test falla en CI, **el nombre es lo único que se ve al principio**. Si no dice qué se
rompió, alguien tiene que abrir el código para saberlo.

### La estructura de cada test

```python
def test_confirm_fails_when_approval_is_required() -> None:
    # arrange
    order = OrderBuilder().with_total(Money(15_000, USD)).build()

    # act / assert
    with pytest.raises(ApprovalRequired):
        order.confirm()
```

Un solo comportamiento por test. Si hay dos `act`, son dos tests.

## 6. Ejecución y velocidad

La suite unitaria tiene que ser **instantánea**, porque se corre constantemente. Si tarda, se deja
de correr, y una suite que no se corre no protege nada.

```bash
pytest tests/unit -q                    # lo que se corre a cada rato
pytest tests/unit tests/api -q          # antes de un commit
pytest -q                               # antes de un PR
pytest -m "not slow" -q                 # en CI rápido
```

Marcadores en `pyproject.toml`: `slow`, `external` (necesita un servicio real), `e2e`.

**Si un test unitario tarda más de ~50 ms, no es unitario**: algo está tocando disco, red o
durmiendo.

## 7. Señales de una suite mal repartida

| Señal | Qué significa |
|---|---|
| La suite tarda más de unos minutos | Demasiada integración y e2e |
| Un cambio de una línea rompe treinta tests | Los tests prueban implementación, no comportamiento |
| Hay tests que fallan de vez en cuando | Flaky: dependencias de tiempo, orden o estado compartido |
| Nadie corre los tests en local | Tardan demasiado o piden demasiado entorno |
| Los bugs aparecen en producción con la suite verde | Falta cobertura donde el riesgo está |
| Cada funcionalidad nueva trae un e2e | La pirámide se está invirtiendo |
| Los tests se arreglan cambiando la aserción | Prueban valores concretos en vez de comportamiento |

## 8. Qué merece test, siempre

No es cuestión de porcentaje (ver `coverage-and-risk`), pero estos no se negocian:

- **Toda regla de negocio**, con sus bordes.
- **Todo bug arreglado**, con el test que lo reproduce.
- **Todo puerto**, con su batería de contrato.
- **Todo cálculo de dinero, impuestos, stock o plazos.**
- **Toda comprobación de permisos.**
- **Todo recorrido crítico de negocio**, al menos en un nivel.

## 9. Reglas duras

- **Cada comportamiento se prueba en el nivel más barato que lo demuestre.**
- **Un comportamiento se prueba en un solo nivel**, no en tres.
- **Ningún test unitario toca red, disco, base de datos, reloj o azar.**
- **Ninguna regla de negocio se prueba sólo con base de datos.**
- **Si un test unitario pasa de ~50 ms, no es unitario.**
- **Los tests son espejo de `src/`.**
- **El nombre del test es una afirmación sobre el sistema.**
- **Un solo comportamiento por test.**
- **No se prueba código de terceros, ni detalles privados, ni configuración estática.**
- **Todo bug arreglado deja su test.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Probar dominio y casos de uso con fakes | `unit-testing-domain` |
| Adaptadores contra infraestructura real | `integration-testing` |
| Fake y real cumpliendo lo mismo | `contract-testing` |
| Qué merece navegador | `e2e-scope` · `e2e-playwright` |
| Escenarios de negocio ejecutables | `bdd-automation` |
| Tests que no prueban nada | `test-quality` |
| Builders y fixtures | `test-data` |
| Priorizar por riesgo | `coverage-and-risk` |
| Ejecutar y recoger evidencia | `verify-for-real` |
