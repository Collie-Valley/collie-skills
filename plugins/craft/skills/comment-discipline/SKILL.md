---
name: comment-discipline
description: La disciplina de comentarios en Collie — el comentario por defecto es no escribirlo, el código se explica con nombres y funciones cortas, y sólo se comenta el porqué que el código no puede contener (decisión no obvia, workaround con enlace, invariante no evidente, restricción externa). Incluye cuándo sí, cuándo no, los docstrings como contrato público, el estilo de redacción exigido, y la prohibición de código comentado y TODOs huérfanos. Cargar al escribir o revisar cualquier código, al sentir la necesidad de explicar una línea, al escribir docstrings, o al encontrar comentarios obsoletos.
---

# Skill: comment-discipline

Cómo se comenta en Collie. La respuesta corta: **casi nunca**, y cuando sí, muy bien.

> **La regla:** el comentario por defecto es **no escribirlo**. Un nombre correcto y una función
> corta explican mejor que cualquier prosa, y no pueden quedarse desactualizados. Un comentario
> que narra **qué** hace el código miente en cuanto alguien edita la línea de abajo.

## 1. Por qué tan estricto

Un comentario es código que el compilador no verifica y los tests no cubren. Tiene tres defectos
estructurales:

1. **Se desincroniza en silencio.** El código cambia, el comentario se queda. Nadie recibe un
   error: el lector recibe una mentira con aspecto de autoridad, y la mentira es peor que el
   silencio.
2. **Suele ser la curita de un mal nombre.** `# check if user can edit` sobre `if u.p & 4:` no
   arregla nada: el arreglo es `if user.can_edit(document):`.
3. **Añade ruido de lectura.** Con un comentario cada tres líneas, la señal desaparece y se dejan
   de leer todos — incluido el único que importaba.

## 2. Primero, las tres alternativas

Antes de escribir un comentario, estas tres opciones lo eliminan la mayoría de las veces.

### 2.1 Un nombre mejor

```python
# ✗
# check if the order is older than 30 days
if (datetime.now() - o.d).days > 30:

# ✓
if order.is_overdue():
```

### 2.2 Extraer a una función con nombre

El bloque que "necesita" un comentario de encabezado casi siempre es una función esperando a
nacer. El comentario se convierte en el nombre, y entonces el compilador lo verifica y los tests
lo cubren.

```python
# ✗
# calculate the tax for each line and sum them
total = Decimal("0")
for line in lines:
    rate = rates.get(line.country, DEFAULT_RATE)
    total += line.amount * rate

# ✓
total = _total_tax(lines, rates)
```

### 2.3 Un tipo o una constante con nombre

```python
# ✗
timeout = 30          # seconds

# ✓
timeout = timedelta(seconds=30)

# ✗
if status == 3:       # shipped

# ✓
if status is OrderStatus.SHIPPED:
```

**El magic number con comentario es siempre una constante con nombre esperando.**

## 3. Cuándo sí se comenta

Cuatro casos. El código puede expresar el **qué**, nunca el **porqué**.

### 3.1 Una decisión no obvia

Cuando el código hace algo que un lector competente cuestionaría.

```python
# Reading committed rows only: the nightly reconciliation runs in a long
# transaction and would otherwise block exports for minutes.
session.execute(text("SET TRANSACTION ISOLATION LEVEL READ COMMITTED"))
```

Sin él, alguien lo "limpia" en seis meses y el bug vuelve.

### 3.2 Un workaround, con su enlace

```python
# Retrying once on 502: the provider returns it sporadically right after a
# deploy on their side. See https://github.com/<org>/<repo>/issues/412
```

El enlace es obligatorio: convierte el comentario en algo que **caduca** y se puede borrar cuando
el problema se resuelva.

### 3.3 Una invariante no evidente

```python
# Callers hold the aggregate lock; this method must not open its own transaction.
```

Una condición que el código no puede declarar pero que romperla causa un fallo lejano.

### 3.4 Una restricción externa

```python
# The ERP rejects files without a UTF-8 BOM, despite its own spec saying otherwise.
```

Reglas que vienen de fuera y no se pueden deducir leyendo el repositorio.

### El test de las tres preguntas

Antes de escribirlo:

1. **¿Puede un nombre o una función eliminarlo?** → hazlo, no lo escribas.
2. **¿Explica el qué, o el porqué?** → si es el qué, bórralo.
3. **¿Un lector competente se preguntaría "por qué así"?** → si no, sobra.

## 4. Docstrings: el contrato, no la narración

Los docstrings son otra cosa y sí se escriben, **donde hay contrato**:

| Dónde | Docstring |
|---|---|
| Puerto (`Protocol`) | **Sí, obligatorio.** Es lo que garantiza que fake y real se comporten igual |
| Excepción de dominio | Sí, una línea: cuándo se lanza |
| Caso de uso | Sí, si la operación tiene precondiciones o efectos no obvios |
| Entidad, método de negocio | Sólo si hay invariantes o efectos que el nombre no transmite |
| Función privada (`_`) | Casi nunca |
| Adaptador | Casi nunca: implementa un contrato ya documentado en el puerto |

```python
class OrderRepository(Protocol):
    """Persistence boundary for orders.

    Implementations must raise OrderNotFound when the id does not exist,
    and must not commit: transaction control belongs to the use case.
    """

    def get(self, order_id: OrderId) -> Order: ...
```

**Lo que nunca se escribe:**

```python
# ✗ cero información: repite la firma
def get_by_id(self, order_id: OrderId) -> Order:
    """Get an order by id."""
```

Si el docstring es la firma en prosa, se borra. El tipado ya lo dice, y mejor.

## 5. El estilo, cuando toca escribir

Un comentario que existe, existe bien escrito. Es prosa técnica, no una nota al margen.

- **Frases completas**, con mayúscula inicial y punto final.
- **En inglés**, como todo el código.
- **Presente e indicativo**, describiendo el sistema: "Retries once on 502", no "I retry" ni
  "Should retry".
- **Concreto.** Nombres reales, números reales, enlaces reales. "For performance reasons" no
  informa: di cuál era el coste.
- **Encima de lo que explica**, nunca al final de la línea salvo una anotación de una palabra.
- **Sin adornos**: ni banderas de `####`, ni cajas ASCII, ni separadores decorativos.
- **Breve.** Tres líneas explican casi cualquier porqué. Si necesitas quince, eso es un ADR (ver
  `technical-design`) y el comentario lo enlaza.

## 6. Prohibiciones

### 6.1 Código comentado

```python
# ✗
# old_total = sum(line.price for line in lines)
# if old_total > 0:
```

Nunca. Para eso está git, que además dice quién lo quitó y por qué. El código comentado envejece,
confunde, y nadie se atreve a borrarlo porque no sabe si hace falta.

### 6.2 TODO sin dueño ni destino

```python
# ✗
# TODO: handle this properly
```

Un TODO es deuda escondida donde nadie la busca. O se arregla ahora, o **se convierte en tarjeta**
(ver `tech-debt`). Si se deja, lleva el identificador:

```python
# TODO(COL-482): remove once the provider ships the bulk endpoint.
```

### 6.3 Comentarios de registro

```python
# ✗
# Modified by Luis - 2026-03-14
# Fix for bug #231
```

Eso es el historial de git, y el git no miente ni se queda obsoleto.

### 6.4 Comentarios que explican lo evidente

```python
# ✗
# increment the counter
counter += 1

# ✗
# constructor
def __init__(self): ...
```

### 6.5 Comentarios de sección dentro de una función

```python
# ✗
def process_order(order):
    # --- validation ---
    ...
    # --- calculation ---
    ...
```

Cada sección es una función. El comentario es su nombre.

## 7. Qué hacer con los que ya existen

- **Un comentario que contradice el código** se corrige o se borra **en el momento**, aunque no
  sea tu tarea. Es información falsa activa.
- **Un comentario obsoleto pero inofensivo** se borra si estás tocando esa zona; no se abre un PR
  de limpieza para eso.
- **Un comentario que explica un porqué** se conserva aunque no te guste su forma. Contiene
  información que no está en ningún otro sitio, y borrarlo pierde contexto para siempre.
- **Ante la duda de si un comentario sigue siendo cierto**: compruébalo. Si no puedes, no lo
  borres — márcalo como dudoso o pregunta.

## 8. Reglas duras

- **Por defecto, no se comenta.** Primero nombre, luego función extraída, luego tipo.
- **El comentario explica el porqué.** El qué lo dice el código.
- **Cero código comentado.** Para eso está git.
- **Cero TODOs sin identificador de tarjeta.**
- **Cero comentarios de autoría, fecha o registro de cambios.**
- **Los workarounds llevan enlace.**
- **Docstring obligatorio en los puertos**, con su contrato: excepciones y garantías.
- **Sin docstrings que repitan la firma.**
- **Frases completas, en inglés, presente de indicativo, sin adornos.**
- **Un comentario que contradice el código se arregla en el momento.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Cómo se escribe el código que no necesita comentarios | `code-generator` |
| Nombres, tamaño de función, SRP | `solid-principles` |
| Registrar deuda en vez de dejar un TODO | `tech-debt` |
| ADRs para decisiones que no caben en tres líneas | `technical-design` |
| Contratos de los puertos | `hexagonal-ports-adapters` |
| Detectar comentarios obsoletos al revisar | `code-reviewer` |
