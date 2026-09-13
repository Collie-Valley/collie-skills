---
name: frontend-quality
description: Calidad de la interfaz en Collie — accesibilidad como base y no como añadido, HTML semántico, formularios y foco, Core Web Vitals y presupuesto de bundle, imágenes, los cuatro estados de toda vista (carga, vacío, error, éxito), formularios que no pierden datos, y verificación con herramientas reales. Cargar al escribir un componente o una pantalla, al construir un formulario, al mostrar datos que vienen de la API, al revisar interfaz en un PR, o al arreglar problemas de accesibilidad o de carga.
---

# Skill: frontend-quality

Lo que separa una interfaz que funciona de una que sirve. Se decide al escribir el componente, no
en una pasada final.

> **La regla:** los cuatro estados —cargando, vacío, error, con datos— se diseñan **a la vez**. Una
> pantalla que sólo contempla el caso con datos está a medio hacer, y el usuario vive en los otros
> tres más de lo que parece.

## 1. Accesibilidad: la base

No es un requisito añadido: HTML semántico bien escrito da accesibilidad casi gratis, y además
hace los tests estables (ver `e2e-playwright` §1).

### Semántica

```html
<!-- ✗ no es enfocable, no responde a Enter ni a Espacio, no se anuncia como botón -->
<div class="btn" onclick="submit()">Guardar</div>

<!-- ✓ -->
<button type="submit">Guardar</button>
```

| Usa | No uses |
|---|---|
| `<button>` para acciones | `<div onclick>` |
| `<a href>` para navegar | `<button>` que cambia la URL |
| `<nav>`, `<main>`, `<header>` | `<div>` con clase que lo imite |
| `<h1>`–`<h6>` en orden, sin saltos | Tamaños de fuente como jerarquía |
| `<table>` con `<th scope>` | Rejillas de `<div>` para datos tabulares |
| `<label for>` en cada campo | `placeholder` como etiqueta |

Un `placeholder` no es etiqueta: desaparece al escribir, no lo anuncian los lectores de pantalla
correctamente y su contraste suele ser insuficiente.

### Lo que siempre se comprueba

- **Todo se puede usar con teclado.** Tabular por la pantalla completa: se llega a todo, en orden
  lógico, y **el foco se ve**. Nunca `outline: none` sin sustituto visible.
- **Contraste** mínimo 4.5:1 en texto normal, 3:1 en texto grande y en elementos de interfaz.
- **Las imágenes llevan `alt`**: descriptivo si aporta información, `alt=""` si es decorativa.
- **El estado se anuncia**: `aria-invalid` en un campo con error, `aria-live` para mensajes que
  aparecen sin recargar, `aria-expanded` en desplegables.
- **El foco se gestiona**: al abrir un modal va dentro y queda atrapado; al cerrarlo vuelve al
  elemento que lo abrió.
- **Nada depende sólo del color**: un error en rojo lleva además icono y texto.

## 2. Los cuatro estados

```tsx
if (isLoading) return <OrderTableSkeleton />;
if (error) return <ErrorState error={error} onRetry={refetch} />;
if (orders.length === 0) return <EmptyState action={<CreateOrderButton />} />;
return <OrderTable orders={orders} />;
```

| Estado | Qué debe hacer |
|---|---|
| **Cargando** | Esqueleto con la forma del contenido, no un spinner centrado. Sin saltos de layout al llegar los datos |
| **Vacío** | Explicar por qué está vacío y ofrecer la acción siguiente. Distinguir "no hay nada" de "el filtro no encontró nada" |
| **Error** | Qué pasó en lenguaje humano, qué hacer, y un botón de reintentar. El `request_id` visible para soporte |
| **Con datos** | El caso feliz |

Un error que sólo dice "Algo salió mal" deja al usuario sin salida. Y un spinner eterno es el peor
de todos: no informa y no termina.

## 3. Formularios

Donde más se pierde trabajo del usuario:

- **Etiqueta visible siempre.** El `placeholder` complementa, no sustituye.
- **Validar al salir del campo** (`blur`), no en cada pulsación: validar mientras se escribe marca
  como erróneo lo que aún no se terminó de escribir.
- **El error va junto al campo**, no sólo arriba, y se asocia con `aria-describedby`.
- **Los errores del servidor se mapean a sus campos** usando `fields` de la respuesta (ver
  `api-contracts` §3).
- **Deshabilitar el botón al enviar** y mostrar que se está enviando. Sin esto, doble envío.
- **Nunca se pierde lo escrito.** Si el envío falla, los datos siguen ahí. Es el fallo que más
  enfada y el más fácil de evitar.
- **`autocomplete` correcto** (`email`, `name`, `street-address`): ahorra tiempo y reduce errores.
- **El tipo de campo adecuado** (`type="email"`, `inputmode="numeric"`): cambia el teclado en
  móvil.

## 4. Rendimiento

### Core Web Vitals

| Métrica | Objetivo | Causa habitual de fallo |
|---|---|---|
| **LCP** (carga) | < 2,5 s | Imagen grande sin optimizar, fuente bloqueante |
| **INP** (interacción) | < 200 ms | Demasiado JavaScript hidratando a la vez |
| **CLS** (estabilidad) | < 0,1 | Imágenes sin dimensiones, contenido que se inserta arriba |

**CLS** es el más fácil de arreglar y el más ignorado: basta con reservar el espacio.

### Presupuesto de bundle

Un objetivo escrito, verificado en CI:

```
JS inicial:  < 100 KB comprimido
CSS:         < 30 KB comprimido
LCP:         < 2,5 s en 4G simulado
```

Cada dependencia se mide antes de añadirla (ver `dependency-hygiene` §6). En Astro, el presupuesto
se cumple sobre todo **no hidratando de más**: `client:visible` por defecto y ninguna isla sin
justificar.

### Imágenes

```astro
---
import { Image } from "astro:assets";
import hero from "../assets/hero.jpg";
---
<Image src={hero} alt="Vista del almacén" width={1200} height={630} loading="lazy" />
```

Formato moderno (WebP/AVIF), tamaños adecuados al viewport, `width` y `height` siempre para
reservar espacio, `loading="lazy"` salvo en la imagen principal — que debe cargar cuanto antes
porque suele ser el LCP.

### Fuentes

`font-display: swap` para que el texto se vea mientras carga la fuente, precarga de la principal, y
un stack de respaldo métricamente parecido para que el cambio no mueva el layout.

## 5. Datos que vienen de la API

- **El dinero llega como cadena decimal** (ver `api-contracts` §6): se formatea con `Intl.NumberFormat`
  y su moneda, nunca con `parseFloat` y concatenación.
- **Las fechas llegan en UTC**: se muestran en la zona del usuario con `Intl.DateTimeFormat`.
- **Los números y fechas se formatean con `Intl`**, nunca a mano: separadores y orden cambian por
  idioma.
- **Todo lo que venga del backend o del usuario se escapa.** React lo hace por defecto;
  `dangerouslySetInnerHTML` requiere sanear antes, siempre.
- **Los listados largos paginan o virtualizan.** Diez mil filas en el DOM congelan el navegador.

## 6. Verificar

Lo que no se comprueba con una herramienta no se sostiene:

```bash
npx @axe-core/cli http://localhost:4321          # accesibilidad
npx lighthouse http://localhost:4321 --view      # rendimiento y buenas prácticas
npx astro build                                   # ver el tamaño real del bundle
```

Y en CI: `eslint-plugin-jsx-a11y`, `axe` sobre las páginas principales, y el presupuesto de bundle
fallando el build si se supera.

La comprobación manual que más encuentra, y que no da ninguna herramienta: **recorrer la pantalla
entera con el teclado**, sin ratón. En dos minutos aparecen los problemas reales.

## 7. Errores frecuentes

| Error | Consecuencia |
|---|---|
| `<div onclick>` como botón | Inaccesible por teclado y por lector de pantalla |
| `placeholder` como etiqueta | Desaparece al escribir; no se anuncia |
| `outline: none` | Nadie sabe dónde está el foco |
| Sólo el estado con datos | Spinners eternos y pantallas en blanco |
| "Algo salió mal" | El usuario no sabe qué hacer |
| Formulario que pierde lo escrito | El fallo que más enfada |
| Imágenes sin dimensiones | Saltos de layout (CLS) |
| Formatear dinero a mano | Errores de redondeo y de separadores |
| `dangerouslySetInnerHTML` sin sanear | XSS |
| Listado sin paginar | El navegador se congela |

## 8. Reglas duras

- **HTML semántico**: `<button>` para acciones, `<a>` para navegar.
- **Todo usable con teclado, con el foco visible.** Nunca `outline: none` sin sustituto.
- **Etiqueta visible en cada campo**; el `placeholder` no cuenta.
- **Contraste mínimo 4.5:1**, y nada depende sólo del color.
- **Las imágenes llevan `alt` y dimensiones.**
- **Los cuatro estados se implementan siempre.**
- **Un formulario nunca pierde lo escrito**, y su botón se deshabilita al enviar.
- **Dinero, fechas y números con `Intl`**, nunca a mano.
- **`dangerouslySetInnerHTML` sólo con contenido saneado.**
- **El presupuesto de bundle se verifica en CI.**

## 9. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Islas, directivas y estructura | `frontend-architecture` |
| Formato de dinero y fechas en el contrato | `api-contracts` |
| Forma del error y `request_id` | `error-handling` |
| Locators accesibles en tests | `e2e-playwright` |
| Peso de las dependencias | `dependency-hygiene` |
| Medir y presupuestos | `performance` |
| Datos personales en pantalla | `sensitive-data` |
| Presupuesto y linters en el pipeline | `local-dev-and-ci` |
