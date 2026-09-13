---
name: tech-debt
description: Cómo se trata la deuda técnica en Collie — nombrarla y registrarla en vez de arreglarla en silencio o dejar un TODO, qué es deuda y qué es simplemente código que no te gusta, cómo se escribe una tarjeta de deuda que alguien pueda tomar, la deuda deliberada y su fecha de vencimiento, y cómo se prioriza por coste real. Cargar al encontrar código problemático que no es tu tarea, al decidir tomar un atajo consciente, al escribir un TODO, al planificar trabajo de mantenimiento, o al justificar tiempo para limpieza.
---

# Skill: tech-debt

Qué se hace con lo que está mal y no toca arreglar ahora.

> **La regla:** la deuda se **nombra y se registra**. Ni se arregla en silencio (ensucia el diff y
> mezcla riesgos), ni se deja como un `TODO` donde nadie la busca, ni se calla (vuelve como
> incidencia con prisa).

## 1. Qué es deuda y qué no

**Deuda** es una decisión de implementación que funciona hoy y **hace más caro el trabajo futuro**.
Tiene tres marcas: funciona, tiene un coste identificable, y ese coste se paga al cambiar.

| Es deuda | No es deuda |
|---|---|
| Regla de negocio duplicada en dos módulos | Código que no está escrito como tú lo escribirías |
| Consulta sin índice que hoy va bien con 10k filas | Una función de 25 líneas que se entiende |
| Módulo sin tests en su lógica de negocio | Una librería vieja que funciona y no tiene CVE |
| Dependencia sin mantenimiento desde hace años | Un patrón distinto al de otro módulo, pero coherente |
| Un `if` de negocio en un router | Algo que **ya está roto**: eso es un bug, no deuda |
| Lógica de dominio atada a la persistencia | Una funcionalidad que falta: eso es trabajo nuevo |

Las tres distinciones de la derecha importan: **un bug es un bug** (se arregla o se prioriza como
bug), **una funcionalidad que falta es trabajo nuevo**, y **preferencia personal no es deuda**.
Meterlo todo en el mismo saco hace que el backlog de deuda deje de significar nada.

## 2. Las tres respuestas posibles

Al encontrar deuda, exactamente tres opciones:

### 2.1 Arreglarla ahora

**Sólo si** está dentro de lo que ya estás tocando y es proporcional al cambio. Renombrar una
variable de la función que estás modificando: sí. Reorganizar el módulo: no.

Y si entra, **se dice en el PR** y va en un commit separado (`git-discipline`).

### 2.2 Registrarla

El caso normal. Tarjeta nueva, con lo que dice el §3. Se tarda dos minutos y es lo que convierte
un hallazgo en algo accionable.

### 2.3 Dejarla pasar

También es válido. Código feo en un módulo estable que nadie toca, deuda cuyo coste nunca se va a
pagar porque el módulo va a morir. **Registrar toda la fealdad del repositorio produce un backlog
que nadie lee.**

El criterio: **¿alguien va a pagar este coste?** Si la respuesta honesta es no, no se registra.

## 3. Cómo se escribe una tarjeta de deuda

Cinco partes. Sin ellas, la tarjeta la borrará alguien en seis meses sin entender qué era.

```
Título: La regla de descuento por volumen está duplicada en billing y en orders

Qué pasa:
  `_volume_discount` existe en billing/domain/services/pricing.py:88 y, con otro
  nombre y los mismos tramos, en orders/application/use_cases/quote_order.py:142.

Por qué importa:
  Los tramos cambian por campaña. En la última se actualizó sólo la de billing,
  y las cotizaciones estuvieron dando precios viejos durante ~3 semanas.

Coste de no arreglarlo:
  Cada cambio de tramos es un riesgo de divergencia silenciosa, y no hay test
  que lo detecte.

Coste de arreglarlo:
  ~medio día: extraer a shared/domain con sus tests y sustituir ambos usos.

Cómo se vería arreglado:
  Una sola implementación con tests, consumida por los dos módulos.
```

- **Qué pasa**, con ubicación exacta.
- **Por qué importa**, preferiblemente con un hecho real, no una hipótesis.
- **Coste de no arreglarlo.** Esto es lo que permite priorizar.
- **Coste de arreglarlo**, aunque sea aproximado.
- **Cómo se ve arreglado**, para que quien la tome sepa cuándo terminó.

## 4. Deuda deliberada

Tomar un atajo a sabiendas es una decisión legítima de ingeniería — hay fechas, hay validaciones
de mercado, hay cosas que quizá se tiren. Lo que la hace legítima es **declararla**.

```
Deuda deliberada: el cálculo de impuestos está cableado para Perú.

Por qué: la campaña sale en dos semanas y sólo opera aquí.
Vence: cuando entre el segundo país (COL-512 ya lo prevé para Q3).
Coste entonces: ~2 días para extraer a TaxPolicy con tarifas por país.
```

Tres requisitos:

1. **Escrita**, en la tarjeta y en un ADR si es estructural.
2. **Con condición de vencimiento**: una fecha o un evento concreto ("cuando entre el segundo
   país"). Sin esto, es deuda indefinida disfrazada.
3. **Con el coste estimado** de pagarla.

La deuda deliberada sin declarar no es una decisión: es un descuido con buena intención.

## 5. Por qué no un TODO

```python
# ✗ nadie va a encontrar esto
# TODO: this duplicates the logic in billing
```

Un `TODO` en el código es deuda escondida donde nadie la busca: no aparece en la planificación, no
tiene dueño, no se prioriza, y sobrevive años. El estándar (ver `comment-discipline`):

- **Se registra como tarjeta.**
- Si además ayuda dejar la marca en el código, **lleva el identificador**:
  `# TODO(COL-482): remove once the shared policy lands.`
- Un `TODO` sin identificador se borra o se convierte en tarjeta. No hay tercera opción.

## 6. Priorizar

La deuda no se paga por antigüedad ni por cuánto molesta. Se paga por **coste real**, que es la
combinación de tres factores:

| Factor | Pregunta |
|---|---|
| **Frecuencia** | ¿Cuántas veces al mes alguien tropieza con esto? |
| **Gravedad** | ¿Qué pasa cuando tropieza — un rato perdido o un bug en producción? |
| **Propagación** | ¿Está creciendo? ¿Cada mes hay una copia más? |

Prioridad alta: frecuente y grave. Deuda **que se propaga** sube de prioridad aunque hoy sea
barata: un patrón malo copiado tres veces cuesta cuatro veces más arreglarlo después.

Prioridad baja, o no se paga: infrecuente, leve y estable.

### Cuándo se paga

- **Dentro de la tarjeta que toca esa zona**, cuando es proporcional. Es la forma más barata y la
  que no requiere justificar tiempo aparte.
- **Como tarjeta propia** cuando es grande, o cuando bloquea trabajo que viene.
- **Antes de construir encima.** Añadir una funcionalidad sobre deuda conocida multiplica el
  coste: es el momento más caro para ignorarla y el más fácil de justificar.

## 7. Lo que no se hace

- **Arreglarla en silencio dentro de otro PR.** Ver `scope-discipline`.
- **Un "sprint de limpieza" genérico** sin tarjetas concretas: se convierte en refactor sin
  criterio de terminación.
- **Registrar cada cosa que no te gusta.** Diluye la señal.
- **Usar "deuda técnica" para justificar reescribir algo que funciona** porque no te gusta su
  estilo.
- **Dejar que se acumule sin nombrar.** Cuando todo el mundo sabe que "ese módulo es un desastre"
  pero no hay una sola tarjeta, la deuda es invisible para quien planifica.

## 8. Reglas duras

- **La deuda se registra como tarjeta**, no como `TODO` ni en la cabeza de nadie.
- **Un `TODO` sin identificador de tarjeta no existe**: se borra o se convierte.
- **No se arregla deuda ajena dentro de otro PR.**
- **Lo que sí entra en el diff se nombra en la descripción**, en commit aparte.
- **Un bug no es deuda.** Una funcionalidad ausente tampoco. Preferencia personal, menos.
- **La deuda deliberada se declara con condición de vencimiento y coste.**
- **Toda tarjeta de deuda lleva coste de no arreglarla.** Sin eso no se puede priorizar.
- **La deuda que se propaga sube de prioridad.**
- **Antes de construir encima de deuda conocida, se evalúa pagarla.**
- **Si nadie va a pagar el coste, no se registra.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| No arreglar de paso lo que no toca | `scope-discipline` |
| Nada de TODOs ni código comentado | `comment-discipline` |
| Detectar el coste futuro al revisar | `engineer-reviewer` |
| Registrar la decisión de tomar el atajo | `technical-design` |
| Promover un módulo de nivel | `architecture-hybrid` |
| Commits separados para el arreglo | `git-discipline` |
| Registrar deuda al entregar | `definition-of-done` |
| Crear la tarjeta en el tablero | `foundry-tablero` |
