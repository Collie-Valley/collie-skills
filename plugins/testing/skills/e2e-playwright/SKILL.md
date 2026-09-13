---
name: e2e-playwright
description: Escribir tests end-to-end con Playwright en Collie — locators por rol y texto accesible en vez de selectores CSS frágiles, auto-waiting en lugar de sleep, aislamiento y datos propios por test, autenticación por estado guardado, fixtures y page objects, traces y capturas en fallo, y la ejecución en CI. Cargar al escribir o arreglar un test e2e, al ver tests inestables o lentos, al configurar Playwright en el proyecto o en CI, o al automatizar un recorrido por navegador.
---

# Skill: e2e-playwright

Cómo se escriben los pocos tests que merecen navegador. **Qué merece** uno vive en `e2e-scope`;
aquí está cómo se escribe sin que se vuelva un lastre.

> **La regla:** un e2e frágil es peor que ningún e2e. Un test que falla una de cada diez veces sin
> motivo entrena al equipo a ignorar los fallos rojos — incluidos los reales.

## 1. Locators: por rol y texto accesible

La decisión que más determina la fragilidad.

```typescript
// ✗ frágil: se rompe con cualquier cambio de estructura o de estilos
await page.click('.btn-primary > span:nth-child(2)');
await page.click('#submit-form-button-v2');
await page.fill('div.form > input[name="q"]', 'widget');

// ✓ estable: describe lo que el usuario ve y usa
await page.getByRole('button', { name: 'Place order' }).click();
await page.getByLabel('Quantity').fill('200');
await page.getByRole('link', { name: 'Orders' }).click();
```

Por qué gana: sobrevive a rediseños y a cambios de clases, se lee como el recorrido del usuario, y
**falla cuando la accesibilidad se rompe** — si el botón deja de ser alcanzable por rol y nombre,
un lector de pantalla tampoco lo encuentra. El test protege dos cosas a la vez.

### El orden de preferencia

1. `getByRole(role, { name })` — lo primero siempre.
2. `getByLabel` — campos de formulario.
3. `getByText` — contenido no interactivo.
4. `getByTestId` — **sólo** cuando no hay nada semántico: una celda de tabla sin encabezado, un
   contenedor de estado. Marcado explícito con `data-testid`, nunca reutilizando una clase de CSS.

Nunca: selectores CSS estructurales, XPath, índices posicionales (`.nth(3)`).

## 2. Esperas: nunca `sleep`

```typescript
// ✗ lento cuando sobra, inestable cuando falta
await page.waitForTimeout(2000);

// ✓ espera por la condición real, con su propio timeout
await expect(page.getByText('Order placed')).toBeVisible();
await expect(page.getByRole('row')).toHaveCount(50);
await page.waitForResponse(r => r.url().includes('/api/v1/orders') && r.ok());
```

Playwright ya espera automáticamente a que el elemento exista, sea visible y sea accionable antes
de cada acción. Un `waitForTimeout` es a la vez una ralentización garantizada y una carrera no
resuelta: en una máquina de CI cargada, dos segundos pueden no bastar.

**Si un test necesita `waitForTimeout` para pasar, hay una condición que no se está expresando.**

## 3. Aislamiento: cada test crea lo suyo

```typescript
test('a wholesale order above the threshold shows the discount', async ({ page, api }) => {
  const customer = await api.createCustomer({ segment: 'wholesale' });

  await page.goto(`/orders/new?customer=${customer.id}`);
  await page.getByLabel('Product').selectOption('WIDGET');
  await page.getByLabel('Quantity').fill('200');
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByText('Volume discount')).toBeVisible();
  await expect(page.getByTestId('order-total')).toHaveText('1,800.00 USD');
});
```

- **Los datos se crean por API**, no navegando por la interfaz. Crear un cliente a través de tres
  pantallas para probar otra cosa hace el test lento y lo rompe cuando cambia cualquiera de esas
  tres.
- **Cada test crea lo suyo**, con identificadores únicos. Nada de datos compartidos entre tests.
- **Ningún test depende del orden** ni de lo que dejó otro.
- **Se limpia después** si el entorno persiste entre ejecuciones.

## 4. Autenticación: una vez, reutilizada

Iniciar sesión por la interfaz en cada test multiplica el tiempo y añade un punto de fallo ajeno a
lo que se prueba.

```typescript
// auth.setup.ts
setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.context().storageState({ path: 'playwright/.auth/admin.json' });
});
```

```typescript
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/admin.json' },
    dependencies: ['setup'],
  },
]
```

El recorrido de login **sí** tiene su propio test, una vez. Los demás parten de sesión iniciada.

Las credenciales vienen del entorno; `playwright/.auth/` va en `.gitignore`.

## 5. Fixtures antes que page objects

Para lo que se repite, una fixture tipada se compone mejor que una jerarquía de clases:

```typescript
// fixtures.ts
export const test = base.extend<{ api: ApiClient; ordersPage: OrdersPage }>({
  api: async ({ request }, use) => {
    await use(new ApiClient(request));
  },
  ordersPage: async ({ page }, use) => {
    await use(new OrdersPage(page));
  },
});
```

Un page object es útil cuando una pantalla se usa en varios tests y tiene interacciones complejas.
Lo que **no** debe hacer: contener aserciones. El page object expone acciones y locators; las
aserciones viven en el test, donde se lee qué se está verificando.

## 6. Diagnóstico cuando falla

Un e2e que falla en CI sin dejar rastro cuesta horas. La configuración no es opcional:

```typescript
// playwright.config.ts
use: {
  baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4321',
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
},
retries: process.env.CI ? 2 : 0,
reporter: process.env.CI ? [['html'], ['github']] : [['list']],
```

El **trace** es lo más valioso: `npx playwright show-trace trace.zip` reproduce el test paso a
paso con el DOM, la red y la consola de cada momento.

Sobre los `retries`: dos en CI absorben la inestabilidad de infraestructura, pero **un test que
sólo pasa al reintentar está roto**. El reintento es una red de seguridad para no bloquear el
despliegue, no una solución. Los tests que reintentan se revisan.

## 7. Ejecución

```bash
npx playwright test                      # todo
npx playwright test --ui                 # modo interactivo para desarrollar
npx playwright test --headed --debug     # paso a paso
npx playwright test orders.spec.ts       # un archivo
npx playwright show-report               # el informe del último run
```

En CI: contra la aplicación real levantada (`webServer` en la config), en paralelo, y **sólo los
recorridos que pasan el filtro de `e2e-scope`**. Una suite de e2e que tarda más que el resto del
pipeline acabará desactivada.

## 8. Anti-patrones

| Anti-patrón | Consecuencia |
|---|---|
| Selectores CSS o XPath | Se rompe con cada cambio de estilo |
| `waitForTimeout` | Lento y a la vez inestable |
| Datos compartidos entre tests | Fallos en cascada y por orden |
| Crear datos navegando la interfaz | Lento y frágil por partida doble |
| Login por interfaz en cada test | Multiplica el tiempo total |
| Un e2e por cada validación de formulario | Eso es un test de unidad o de api |
| Aserciones dentro del page object | No se lee qué verifica el test |
| Reintentos como solución a la inestabilidad | Esconde tests rotos |
| `test.only` commiteado | El resto de la suite deja de correr en CI |

## 9. Reglas duras

- **Locators por rol, etiqueta o texto accesible.** `data-testid` sólo como último recurso.
- **Cero selectores CSS estructurales y cero XPath.**
- **Cero `waitForTimeout`.** Se espera por condición.
- **Cada test crea sus datos por API** y es independiente del orden.
- **La sesión se reutiliza desde `storageState`**; el login tiene un test propio.
- **Trace, screenshot y vídeo activados en fallo.**
- **Un test que sólo pasa al reintentar se considera roto** y se revisa.
- **Las aserciones viven en el test**, no en el page object.
- **Credenciales desde el entorno**, nunca en el código.
- **`test.only` nunca se commitea.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Qué recorridos merecen e2e | `e2e-scope` |
| El reparto entre niveles de prueba | `test-strategy` |
| Escenarios de negocio y su ejecución | `bdd-behavior` · `bdd-automation` |
| Tests inestables y sus causas | `test-quality` |
| Crear datos de prueba | `test-data` |
| Accesibilidad del frontend | `frontend-quality` |
| Pipeline y paralelismo | `local-dev-and-ci` |
