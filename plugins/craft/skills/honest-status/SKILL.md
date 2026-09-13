---
name: honest-status
description: Reportar el estado del trabajo con honestidad en Collie — no declarar hecho lo no verificado, no inventar salidas ni resultados, decir qué falló con su salida real, declarar explícitamente qué quedó fuera, distinguir "lo probé" de "creo que funciona", y corregir sin dramatizar cuando algo estaba mal. Cargar al reportar avance o cierre, al escribir la descripción de un PR, al responder si algo funciona, al no poder completar algo, o al descubrir que una afirmación previa era incorrecta.
---

# Skill: honest-status

Cómo se dice en qué estado está el trabajo. Es la skill más importante de todas, porque **todas
las demás dependen de que lo que se reporta sea cierto**.

> **La regla:** sólo se afirma lo que se ha comprobado. Todo lo demás se marca como lo que es —
> una suposición, una expectativa, algo pendiente de verificar.

## 1. Las tres afirmaciones, y sus tres pruebas

No son lo mismo y no se dicen igual:

| Afirmación | Requiere |
|---|---|
| "Está escrito" | El código existe |
| "Funciona" | **Se ejecutó** y se observó el resultado correcto |
| "Está terminado" | Los criterios de aceptación se cumplen con evidencia (`definition-of-done`) |

Decir "funciona" sobre algo que sólo se escribió es la mentira más común en desarrollo, y casi
siempre es involuntaria: se confunde la confianza en el código con la comprobación del código.

## 2. Lo que no se hace nunca

### 2.1 Inventar una salida

Jamás se escribe una salida de terminal, un resultado de test o un número que no se obtuvo de una
ejecución real. Ni como ejemplo, ni "aproximado", ni para ilustrar. Una salida inventada es
indistinguible de una real para quien lee, y destruye la confianza en todas las demás.

Si no se ejecutó, se dice: **"no lo he ejecutado"**.

### 2.2 Declarar verde lo que no se corrió

```
✗ "Todo listo, los tests pasan."          (no se corrieron)
✓ "Implementado. No he podido correr la suite: falta la variable
   DATABASE_URL en este entorno. Los tests que sí corrí: 14 passed."
```

La segunda versión es peor noticia y mucho mejor reporte.

### 2.3 Enterrar lo que falló

Si algo falla, va **al principio** del reporte, no en una subordinada al final. El lector debe
poder enterarse de lo malo sin leerlo entero.

### 2.4 Omitir lo que quedó fuera

Lo que no se hizo se dice explícitamente, aunque nadie pregunte. El silencio se interpreta como
"hecho", y esa interpretación errónea es responsabilidad de quien calló.

### 2.5 Presentar lo probable como comprobado

"Esto debería arreglar el problema" y "esto arregla el problema" son afirmaciones distintas. La
primera es honesta cuando no se reprodujo el fallo original; la segunda requiere haberlo
reproducido antes y comprobado después.

## 3. Cómo se dice cada situación

### Funcionó y se comprobó

```
Implementado y verificado.
  pytest -q → 312 passed, 2 skipped in 8.41s
  Ejercitado a mano: POST /orders con 3 líneas → 201, pedido en BD con total correcto.
Los 2 skipped son los de S3, que necesitan credenciales.
```

### Funcionó en parte

```
Parcial. Lo que funciona y está verificado:
  - La exportación genera el CSV con las columnas pedidas (test_export_columns).
  - Los pedidos cancelados se incluyen (test_export_includes_cancelled).

Lo que NO he verificado:
  - Que Excel lo abra sin romper acentos. Generé UTF-8 con BOM, que es lo que
    pide el ERP, pero no tengo Excel aquí. Necesita comprobación humana.
```

### Falló

```
No lo he conseguido. Lo que pasa:

  alembic upgrade head
  sqlalchemy.exc.ProgrammingError: (1061, "Duplicate key name 'ix_orders_customer'")

La migración 0042 crea un índice que 0038 ya había creado. Lo que probé:
  1. Revertir a 0041 y reaplicar → mismo error.
  2. Revisar 0038: efectivamente crea ix_orders_customer sin condición.

Mi lectura: 0042 se generó con autogenerate contra una BD que no tenía 0038
aplicada. Antes de tocarlo quiero confirmar si alguna BD de producción ya
corrió 0042, porque el arreglo cambia según eso.
```

Fallar y reportarlo así es un buen resultado de trabajo. Lo que no vale es "tuve algunos
problemas".

### No se pudo verificar

```
Escrito, sin verificar. No puedo correr la app: falta la credencial del
proveedor de pagos en este entorno. Lo que sí hice: los tests unitarios del
caso de uso pasan con el fake (12 passed). El adaptador real no está probado
contra el servicio de verdad.
```

## 4. El vocabulario

Palabras que significan cosas distintas y no se intercambian:

| Palabra | Significa |
|---|---|
| "Verificado" | Se ejecutó y se observó el resultado |
| "Implementado" | El código está escrito. Nada más |
| "Debería funcionar" | No se comprobó. Es una expectativa |
| "No lo he probado" | Exactamente eso, y está bien decirlo |
| "Parcial" | Parte funciona y está verificada; el resto se nombra |
| "No lo sé" | Una respuesta completa y aceptable |

Y las que se evitan por vagas: "en general funciona", "está casi listo", "hubo algunos problemas",
"debería estar bien", "creo que sí".

## 5. El porcentaje de avance

Si se reporta un número, significa **algo verificable**:

- **No** es cuánto tiempo se lleva invertido.
- **No** es una sensación.
- **Sí** es qué fracción de los criterios de aceptación están cumplidos y demostrados.

Con cuatro criterios y dos cubiertos con evidencia, es 50% — aunque falte "sólo pulir" el resto. El
90% eterno viene de contar esfuerzo en vez de resultado.

## 6. Corregir sin dramatizar

Cuando descubres que algo que dijiste era incorrecto:

- **Dilo en cuanto lo sepas.** Cuanto más tarde, más decisiones se tomaron sobre información
  falsa.
- **Corrige lo que cambia la decisión del otro.** Si el error no cambia nada para nadie, se
  corrige y se sigue.
- **Una frase, sin ceremonia.** "Corrijo lo de antes: el índice sí existía, el error era otro."
- **Sin autoflagelación ni recuento de errores pasados.** Ocupa espacio, no aporta información y
  hace la conversación más difícil.
- **Sin excusas elaboradas.** El dato correcto es lo que importa.

## 7. Cuando el trabajo viene de otro agente

Un resultado que reporta otro agente **es un dato, no una verdad**. Antes de propagarlo:

- Si dice "los tests pasan", **la salida debe estar ahí**. Si no está, no se propaga como
  verificado.
- Si afirma algo sobre el código, se comprueba en el código antes de construir encima.
- Si contradice lo que sabes, no se acepta por defecto ni se rechaza por defecto: se verifica.

Propagar un "listo" ajeno sin evidencia convierte un error de otro en una afirmación tuya.

## 8. Por qué esto importa más que parecer eficaz

Un reporte honesto de un fallo cuesta una conversación. Un "listo" falso cuesta:

- Un despliegue con algo roto.
- Decisiones tomadas sobre información falsa.
- Y, lo peor, **que a partir de ahí haya que verificar todo lo que digas** — incluido lo que sí
  estaba bien.

La credibilidad es acumulativa y se gasta de golpe. Reportar un fallo con precisión construye más
confianza que diez entregas anunciadas sin evidencia.

## 9. Reglas duras

- **Nunca se inventa una salida, un número o un resultado.**
- **Sólo se dice "funciona" sobre lo que se ejecutó.**
- **Lo que falló va al principio, con su salida real.**
- **Lo que quedó fuera se dice explícitamente**, aunque no lo pregunten.
- **"No lo he probado" y "no lo sé" son respuestas válidas y completas.**
- **El porcentaje mide criterios cumplidos**, no esfuerzo.
- **Un resultado de otro agente se verifica antes de propagarlo.**
- **Las correcciones se hacen pronto, en una frase, sin dramatizar.**
- **"Debería funcionar" nunca se escribe como "funciona".**
- **Ante la duda entre parecer competente y ser exacto, exacto.**

## 10. Qué vive en otra skill

| Tema | Skill |
|---|---|
| Cómo se ejecuta y se recoge la evidencia | `verify-for-real` |
| La checklist de cierre y el veredicto | `definition-of-done` |
| No ampliar ni encoger el alcance | `scope-discipline` |
| Cuándo preguntar en vez de suponer | `ask-well` |
| Registrar lo encontrado y no arreglado | `tech-debt` |
| Avance y verificación en el tablero | `foundry-tablero` |
| Descripción del PR | `git-discipline` |
