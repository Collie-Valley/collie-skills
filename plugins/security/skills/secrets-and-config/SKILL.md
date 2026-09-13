---
name: secrets-and-config
description: Secretos y configuración en Collie — settings tipadas en un único punto que lee el entorno, qué es secreto y qué es configuración, .env fuera de git y .env.example como documentación, rotación cuando algo se expone, gestor de secretos en producción, y las cabeceras y CORS que se configuran una vez. Cargar al añadir una variable de entorno, al configurar un entorno o un despliegue, al ver una credencial en el código, al montar settings, o al responder qué pasa si se filtró un secreto.
---

# Skill: secrets-and-config

Dónde vive la configuración y cómo no se filtra.

> **La regla:** un único lugar del código lee el entorno. Todo lo demás recibe la configuración ya
> tipada y validada, por inyección. Y **ningún secreto entra jamás en el repositorio**.

## 1. Secreto o configuración

No es lo mismo y no se tratan igual:

| | Configuración | Secreto |
|---|---|---|
| Qué es | Cómo se comporta el sistema | Lo que da acceso |
| Ejemplos | Nivel de log, timeout, URL pública, tamaño de página | Contraseña de BD, clave de API, clave de firma JWT, token de webhook |
| Si se filtra | Poco o nada | Compromiso: hay que rotar |
| Dónde vive | Variables de entorno, valores por defecto en código | Gestor de secretos; en local, `.env` ignorado |
| En `.env.example` | Con su valor real de ejemplo | Sólo el nombre, con un placeholder |

Ante la duda: **si da acceso a algo, es secreto**.

## 2. Settings: un solo punto de entrada

```python
# shared/infrastructure/settings.py
from functools import lru_cache
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", frozen=True)

    environment: Literal["local", "staging", "production"] = "local"
    database_url: SecretStr
    jwt_signing_key: SecretStr = Field(min_length=32)
    access_token_ttl: timedelta = timedelta(minutes=15)
    allowed_origins: list[str] = Field(default_factory=list)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Cinco decisiones:

1. **Tipada y validada.** Una variable mal puesta falla **al arrancar**, no en la primera petición
   de un martes por la noche.
2. **`SecretStr`** para todo secreto: al imprimir o loguear el objeto muestra `**********`. Es la
   defensa contra la fuga accidental más común — un `print(settings)` en un log.
3. **`frozen=True`**: nadie muta la configuración en caliente.
4. **Sin valor por defecto para los secretos.** Si falta, debe fallar; un default de desarrollo
   que llega a producción es una puerta abierta.
5. **`lru_cache`**: se lee una vez por proceso.

**Ningún otro archivo del repositorio llama a `os.getenv`.** Es una regla verificable:

```bash
grep -rn "os.getenv\|os.environ" src/ | grep -v "shared/infrastructure/settings.py"
```

## 3. `.env` y `.env.example`

```bash
# .gitignore
.env
.env.*
!.env.example
```

```bash
# .env.example — se commitea, y es la documentación real de la configuración
ENVIRONMENT=local
DATABASE_URL=postgresql://collie:collie@localhost:5432/collie
JWT_SIGNING_KEY=change-me-with-at-least-32-characters
ACCESS_TOKEN_TTL=PT15M
ALLOWED_ORIGINS=["http://localhost:4321"]
LOG_LEVEL=DEBUG
```

- **Todas** las variables aparecen aquí. Una que falte bloquea a quien clona el repositorio.
- **Los secretos llevan placeholder**, nunca un valor real, ni siquiera de un entorno de pruebas.
- **Se actualiza en el mismo PR** que añade la variable (ver `git-discipline` §5).

## 4. En producción: gestor de secretos

`.env` es para desarrollo local. En staging y producción, los secretos vienen de un gestor
(Secret Manager del proveedor, o el mecanismo de secretos del orquestador) y se inyectan como
variables de entorno en el arranque.

Requisitos:

- **Nunca en la imagen de Docker**, ni en un `ARG`, ni en una capa. Quedan en el historial de la
  imagen.
- **Nunca en el `docker-compose.yml` commiteado**, ni en un manifiesto de despliegue del
  repositorio.
- **Acceso por rol**, no una credencial compartida por el equipo.
- **Rotables sin redesplegar código.**

## 5. Cuando un secreto se expone

Un secreto commiteado, pegado en un chat, impreso en un log o enviado por correo **está
comprometido**. El procedimiento no admite matices:

1. **Rotar el secreto ahora.** Antes de limpiar nada. Mientras el valor siga siendo válido, el
   riesgo sigue vivo.
2. **Revocar lo emitido con él** si aplica (tokens firmados con una clave filtrada).
3. **Revisar accesos** en el periodo de exposición.
4. **Limpiar el rastro** después: borrarlo del código, y del historial si procede.
5. **Registrar qué pasó** y cerrar el hueco que lo permitió.

**Borrar el commit no es el arreglo.** El valor ya estuvo expuesto —en clones, en forks, en logs
de CI, en el caché del proveedor— y sigue en el historial de cualquiera que hiciera `fetch`.

Prevención automática: `gitleaks` en CI y en un hook de pre-commit.

## 6. Configuración por entorno

La variación se resuelve **en el composition root** (ver `dependency-injection` §8), no con
condicionales en la lógica:

```python
def get_notifier(settings: SettingsDep) -> Notifier:
    if settings.environment == "production":
        return EmailNotifier(settings.smtp_url)
    return ConsoleNotifier()
```

**Ninguna clase de negocio pregunta en qué entorno corre.** Si lo hace, además de estar en la capa
equivocada, es imposible de probar.

Y lo que nunca varía por entorno: la lógica de autorización. Un "en local no hace falta
autenticación" acaba, tarde o temprano, activo donde no debía.

## 7. Configuración del borde que se olvida

Se configura una vez, y se revisa cuando cambia el despliegue:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,      # nunca ["*"] con credenciales
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

| Ajuste | Qué evita |
|---|---|
| CORS con orígenes explícitos | Que cualquier sitio llame a la API con las credenciales del usuario |
| `HSTS` | Degradación a HTTP |
| `X-Content-Type-Options: nosniff` | Interpretación errónea de un archivo subido |
| `Content-Security-Policy` | Ejecución de scripts inyectados |
| Tamaño máximo de petición | Agotamiento de memoria |
| `debug=False` y sin trazas al cliente | Filtración de rutas, versiones y estructura |

`allow_origins=["*"]` junto a `allow_credentials=True` es una combinación que los navegadores
rechazan, y el intento de "arreglarla" reflejando el origen del cliente es peor: acepta a
cualquiera.

## 8. Errores frecuentes

| Error | Consecuencia |
|---|---|
| `os.getenv` repartido por el código | Nadie sabe qué configuración existe; falla en runtime |
| Default de desarrollo en un secreto | Llega a producción sin que nadie lo note |
| `.env` commiteado | Compromiso inmediato |
| Valores reales en `.env.example` | Lo mismo, con disfraz |
| Secreto en el `Dockerfile` | Queda en la imagen para siempre |
| Configuración leída en el dominio | Imposible de probar, capa equivocada |
| `print(settings)` sin `SecretStr` | Secretos en los logs |
| CORS abierto "temporalmente" | Se queda |
| Secreto en la URL (query string) | Queda en logs de servidores y proxies |

## 9. Reglas duras

- **Un solo archivo lee el entorno**: `shared/infrastructure/settings.py`.
- **Settings tipadas, validadas y `frozen`.** Fallan al arrancar, no en caliente.
- **Todo secreto es `SecretStr` y no tiene valor por defecto.**
- **`.env` nunca se commitea; `.env.example` siempre**, con placeholders en los secretos.
- **`.env.example` se actualiza en el mismo PR que añade la variable.**
- **Cero secretos en imágenes, manifiestos, logs, URLs o tests.**
- **Un secreto expuesto se rota antes de limpiar nada.**
- **La variación por entorno vive en el cableado**, nunca en la lógica.
- **La autorización no varía por entorno.**
- **CORS con orígenes explícitos**, nunca `*` con credenciales.

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| La pasada de seguridad al diff | `security-diff-review` |
| Tokens, sesiones y su ciclo de vida | `authn-authz` |
| Qué no puede aparecer en un log | `sensitive-data` · `observability` |
| El composition root y la variación por entorno | `dependency-injection` |
| `.env.example` y archivos de raíz | `project-structure` |
| Secretos en CI y despliegue | `local-dev-and-ci` |
| Qué nunca se commitea | `git-discipline` |
