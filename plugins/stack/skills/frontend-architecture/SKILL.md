---
name: frontend-architecture
description: Astro con islas React en Collie — qué es estático y qué es isla, las directivas client:* y su coste, estructura de carpetas, dónde vive el estado, el cliente de API con tipos generados desde OpenAPI, sesión y autenticación en el navegador, y los límites entre servidor y cliente. Cargar al crear una página o un componente, al decidir si algo necesita JavaScript, al elegir una directiva client:*, al consumir la API, al montar el estado compartido, o al estructurar el proyecto frontend.
---

# Skill: frontend-architecture

Cómo se estructura el frontend. Astro por defecto, React sólo donde hace falta interactividad.

> **La regla:** **por defecto, cero JavaScript**. Cada isla se justifica por la interactividad que
> aporta. Astro entrega HTML estático salvo que se le pida lo contrario, y esa es toda su ventaja.

## 1. Estático o isla

```
¿Necesita reaccionar a algo en el navegador después de cargar?
  ├── No  → componente .astro (cero JS)
  └── Sí  → isla React con la directiva client:* más barata que sirva
```

| Es estático | Es isla |
|---|---|
| Cabeceras, pies, navegación simple | Formularios con validación en vivo |
| Listados y tablas sin interacción | Tablas con filtros y orden en cliente |
| Contenido, texto, imágenes | Menús desplegables, modales, pestañas |
| Cualquier cosa que sólo se renderiza | Cualquier cosa con estado que cambia |

Un listado paginado por enlaces (`?page=2`) **no necesita JavaScript**: es más rápido, funciona sin
JS y es accesible por defecto. Convertirlo en isla para evitar una recarga suele empeorar la
experiencia real.

## 2. Las directivas y su coste

```astro
<OrderTable client:load />      <!-- hidrata de inmediato: sólo lo crítico y visible -->
<OrderTable client:idle />      <!-- cuando el navegador está ocioso: interacción secundaria -->
<OrderTable client:visible />   <!-- al entrar en viewport: LO NORMAL para lo que está abajo -->
<OrderTable client:media="..." /><!-- según media query: menús sólo móvil -->
<OrderTable client:only="react" /><!-- sin render en servidor: sólo si depende de APIs del navegador -->
```

| Directiva | Cuándo |
|---|---|
| `client:visible` | **La opción por defecto.** Nada se hidrata hasta que se ve |
| `client:idle` | Interactivo pero no inmediato |
| `client:load` | Sólo si el usuario puede interactuar en el primer segundo |
| `client:media` | Componentes específicos de un tamaño de pantalla |
| `client:only` | Último recurso: sin HTML inicial, peor percepción de carga y peor SEO |

**`client:load` en todo es el error más común** al empezar con Astro: se pierde la ventaja entera y
queda una SPA con pasos de más.

## 3. Estructura

```
src/
├── pages/                    rutas (una por archivo)
│   ├── index.astro
│   └── orders/
│       ├── index.astro
│       └── [id].astro
├── layouts/                  plantillas compartidas
├── components/
│   ├── ui/                   estáticos .astro
│   └── islands/              React, interactivos
├── lib/
│   ├── api/
│   │   ├── schema.d.ts       GENERADO desde OpenAPI, no se edita
│   │   └── client.ts         el cliente tipado
│   ├── stores/               estado compartido entre islas
│   └── utils/
├── styles/
└── env.d.ts
```

Convenciones: componentes en `PascalCase.astro` / `PascalCase.tsx`; rutas en minúscula; las islas
viven en `components/islands/` para que **se vea de un vistazo cuánto JavaScript tiene el
proyecto**.

## 4. El cliente de API

Los tipos se generan desde OpenAPI, nunca se escriben a mano (ver `contract-testing` §2):

```bash
npx openapi-typescript ../backend/openapi.json -o src/lib/api/schema.d.ts
```

```typescript
// src/lib/api/client.ts
import type { components } from "./schema";

export type Order = components["schemas"]["OrderResponse"];
export type ApiError = components["schemas"]["ErrorResponse"];

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async getOrder(id: string, init?: RequestInit): Promise<Order> {
    const response = await fetch(`${this.baseUrl}/api/v1/orders/${id}`, {
      ...init,
      credentials: "include",
      headers: { "X-Request-ID": crypto.randomUUID(), ...init?.headers },
    });

    if (!response.ok) {
      throw new ApiRequestError(await response.json() as ApiError, response.status);
    }
    return response.json() as Promise<Order>;
  }
}
```

- **Un solo lugar** habla con la API. Ningún componente hace `fetch` suelto.
- **Los errores se convierten en una excepción tipada**, con el `error` estable del backend para
  ramificar y el `request_id` para soporte.
- **`X-Request-ID` desde el navegador**: cierra la cadena de trazabilidad (ver `observability` §3).
- **Nunca se escribe a mano una interfaz** que ya está en `schema.d.ts`.

## 5. Dónde se piden los datos

| Dónde | Cuándo | Cómo |
|---|---|---|
| **En el frontmatter `.astro`** | Datos necesarios para pintar la página | Se ejecuta en el servidor; el HTML llega completo |
| **En la isla** | Datos que dependen de la interacción | `fetch` tras un evento |
| **Al montar la isla** | Lo que no se pudo obtener en servidor | Con estado de carga y de error visibles |

Por defecto, **en el servidor**: mejor primera carga, mejor SEO, y el token no viaja al cliente.
Pedir en el cliente algo que ya se podía pedir en el servidor produce un parpadeo de carga
innecesario.

## 6. Estado

Por orden de preferencia — el primero que sirva:

1. **La URL.** Filtros, página, pestaña activa, orden. Es compartible, permite volver atrás y no
   necesita librería.
2. **Estado local del componente** (`useState`). La mayoría de los casos.
3. **Estado compartido entre islas** (`nanostores`). Cada isla es un árbol React independiente:
   **no comparten contexto**. Un `Context` no cruza islas.
4. **`localStorage`** sólo para preferencias no críticas. Nunca tokens (ver `authn-authz` §2).

```typescript
// src/lib/stores/cart.ts
import { atom } from "nanostores";
export const cartItems = atom<CartItem[]>([]);
```

```tsx
import { useStore } from "@nanostores/react";
const items = useStore(cartItems);
```

**Si dos islas necesitan compartir mucho estado, probablemente eran una sola isla.** Antes de
montar un store global, revisar si el límite está bien trazado.

## 7. Sesión

- **Cookie `HttpOnly` + `Secure` + `SameSite`**: el token no es accesible desde JavaScript, así que
  un XSS no se lleva la sesión.
- **`credentials: "include"`** en las peticiones, y CORS con orígenes explícitos en el backend (ver
  `secrets-and-config` §7).
- **La comprobación de sesión en el servidor**, en el middleware de Astro o en el frontmatter de la
  página. Redirigir desde el cliente muestra por un instante contenido que no debía verse.
- **Ocultar un botón no es seguridad.** El permiso lo decide el backend, siempre.

## 8. Servidor y cliente

Lo que se ejecuta en el frontmatter de `.astro` corre **en el servidor**. De ahí:

- **Las variables de entorno privadas no llegan al navegador** — salvo las prefijadas con
  `PUBLIC_`, que sí. Una clave de API en una variable `PUBLIC_` es una clave publicada.
- **Todo lo que pase como props a una isla viaja al cliente serializado.** Pasar un objeto de
  usuario completo publica sus campos en el HTML.
- **Las APIs del navegador** (`window`, `document`, `localStorage`) no existen en el servidor: en
  una isla se usan dentro de `useEffect`, o el componente va `client:only`.

## 9. Errores frecuentes

| Error | Consecuencia |
|---|---|
| `client:load` en todo | Se pierde la ventaja de Astro |
| Isla para algo sin interactividad | JavaScript innecesario |
| `fetch` repartido por los componentes | Sin manejo uniforme de errores ni de sesión |
| Tipos de API escritos a mano | Divergen del backend en silencio |
| `Context` de React entre islas | No funciona: son árboles separados |
| Token en `localStorage` | Un XSS se lleva la sesión |
| Datos sensibles como props de una isla | Acaban en el HTML |
| `PUBLIC_` en una clave privada | Clave publicada |
| Pedir en cliente lo que se podía pedir en servidor | Parpadeo y peor SEO |

## 10. Reglas duras

- **Por defecto, cero JavaScript.** Cada isla se justifica.
- **`client:visible` es la directiva por defecto**; `client:load` sólo para lo crítico y visible.
- **Un solo cliente de API**; ningún `fetch` suelto en componentes.
- **Los tipos se generan desde OpenAPI**, nunca se escriben a mano.
- **`X-Request-ID` en cada petición.**
- **Los datos se piden en el servidor** salvo que dependan de la interacción.
- **El estado vive en la URL** siempre que se pueda.
- **Entre islas, `nanostores`**; `Context` no cruza islas.
- **El token en cookie `HttpOnly`**, nunca en `localStorage`.
- **Nada sensible como props de una isla**, ni en variables `PUBLIC_`.

## 11. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Accesibilidad, rendimiento y estados de la interfaz | `frontend-quality` |
| Tipos generados y detección de cambios de contrato | `contract-testing` |
| Forma del error y códigos | `api-contracts` · `error-handling` |
| Sesión, cookies y permisos | `authn-authz` |
| CORS y cabeceras | `secrets-and-config` |
| `request_id` de extremo a extremo | `observability` |
| Tests de navegador | `e2e-playwright` |
| Dependencias y peso | `dependency-hygiene` |
