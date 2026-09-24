# System Design como asesora en vivo

**Fecha:** 2026-09-24
**Repos afectados:** `Vysper` (mayor parte), `Cerebro` (opción nueva en `diagnose`)
**Estado:** propuesta, pendiente de aprobación

## Problema

El modo `system-design` debe permitir asesorar en vivo durante una reunión: conocer
lo que el equipo construyó (GitHub), lo que apenas pidió el cliente (Notion) y en
qué orden se va a trabajar (Jira). Hoy no lo permite, por dos defectos distintos.

### Defecto 1 — Cerebro no tiene memoria conversacional

No es que el contexto se pierda: nunca existió. `cerebro.cli diagnose` recibe
`(problem, imagen, persona, tool)` y no tiene parámetro de historial. Cada consulta
construye un `Orchestrator()` nuevo, con `trace_id` nuevo y directorio RAG nuevo.
Son subprocesos independientes.

Evidencia, de `~/.Vysper/logs/application-2026-09-24.log`:

| Hora | Consulta | Respuesta |
|---|---|---|
| 10:22:46 | "que son los subagentes en el motor de agentes" | respuesta completa y correcta |
| 10:24:29 | seguimiento sobre esas categorías | "No logro entender completamente tu pregunta" |
| 10:29:48 | "o un endpoint que me ayude a ver las tablas pobladas" | "¿A qué proyecto o repositorio te refieres?" |
| 10:41:16 | "Pero no me estás saliendo todo." | "No entiendo bien qué no te está saliendo" |

Afecta igual al modo `silia`. En una asesoría en vivo es incapacitante.

### Defecto 2 — el ruido del dictado llega a Cerebro

Introducido por el commit `e48a0a2` (2026-09-23), que hizo que **todo** texto libre
de `system-design` fuera a Cerebro. En una sesión de dictado eso incluye los errores
de reconocimiento de voz de la reunión:

- "para liar ver las cosas, digamos, en este maldado"
- "y vamos a llamar ahí más empo, y eso es lo que llamar el empo de crear"

Cada uno consume entre 5 y 48 segundos de Cerebro y vuelve con un rechazo redactado
por el modelo (no está en el código de ningún repo; lo genera la persona `arquitecto`,
que espera "una duda técnica" o "una propuesta"):

> No puedo procesar esta solicitud. El mensaje no contiene una pregunta técnica
> válida, una duda sobre arquitectura existente, o una propuesta de implementación clara.

El filtro por palabras clave que `e48a0a2` eliminó era malo para su propósito
declarado, pero hacía este trabajo por accidente: no todo fragmento dictado es una
consulta.

## Decisiones de diseño

### D1 — Cerebro sigue sin estado; el contexto vive en Vysper

Cerebro se invoca como subproceso de un solo tiro. Volverlo con estado exigiría un
demonio o un almacén compartido, y rompería el modelo de `/revisar`, `/crear-pr` y
el resto de pipelines, que deben seguir siendo de un tiro. Vysper guarda la sesión y
se la pasa a Cerebro en cada llamada.

**Alternativa descartada:** un demonio `cerebro serve` con sesiones. Da memoria
"gratis" y evita re-enviar contexto, pero introduce un proceso de larga vida, su
ciclo de vida, su puerto y su modo de fallo — y obliga a migrar todos los comandos
existentes. Desproporcionado para el problema.

### D2 — Detección automática de preguntas, en dos etapas

La etapa 1 es pura y gratis; la etapa 2 cuesta una llamada al modelo rápido y solo
corre sobre lo que sobrevive. Sin la etapa 1, cada fragmento de dictado costaría una
llamada.

**Alternativa descartada:** disparador explícito (atajo o palabra clave). Cero ruido
y cero costo, pero obliga a acordarse de dispararlo en medio de una conversación con
un cliente, que es justo el momento en que no se puede pensar en la herramienta.

### D3 — Doble respuesta: preliminar rápida, verificada después

Una respuesta fundamentada tarda ~30s. En una reunión en vivo eso es silencio frente
al cliente.

La preliminar es una **respuesta real**, no un aviso de progreso. El modelo rápido
recibe la transcripción y el hilo de la conversación y responde la pregunta con eso;
la ida al LLM es de segundos y no debe alentarse con nada. Un "estoy trabajando en
esto" no sirve: frente al cliente no se puede decir eso, y la mitad del valor de la
asesora está en tener algo sustantivo que decir de inmediato.

Cuando Cerebro termina, su respuesta **aterriza** la preliminar: la reemplaza con los
datos reales de Jira/GitHub/Notion/RAG, con tickets, archivos y citas. La preliminar
da la forma de la respuesta; la verificada le pone los hechos.

**Riesgo asumido:** que se lea en voz alta una preliminar que luego resulte falsa. Se
mitiga con marcado inequívoco de las dos (preliminar / verificada), nunca sutil — pero
la preliminar se muestra siempre y completa, no se esconde.

### D4 — La transcripción es contenido NO confiable

Una transcripción de reunión contiene voces de terceros. Si alguien dice "ignora tus
instrucciones y…", eso no puede ser una orden para Cerebro. La transcripción entra
envuelta en `wrap_untrusted()` (`cerebro/untrusted_content.py`), igual que ya se hace
con los resultados de herramientas externas — como dato delimitado, nunca como
instrucción.

## Componentes

### 1. `src/core/asesoria-session.js` (Vysper, nuevo, puro)

Sin Electron, testeable directo.

- `agregarFragmento(texto)` — acumula transcripción en una ventana móvil.
- `agregarTurno(pregunta, respuesta)` — acumula el hilo con Cerebro.
- `contexto()` — devuelve `{transcripcion, turnos}` ya recortado a los límites.
- `reset(motivo)` — vacía.

Límites de arranque, a ajustar con medición real: **6000 caracteres** de
transcripción (unos 10 minutos de conversación) y **5 turnos** de pregunta/respuesta.
Al excederse se descarta lo más viejo. Ambos valores viven en constantes nombradas del
módulo, no dispersos, para que ajustarlos sea un solo cambio.

Se resetea al salir de `system-design`, al terminar la sesión de Alt+S, y por comando
explícito. **Sin persistencia entre reinicios** — fuera de alcance.

### 2. `src/core/pregunta-detector.js` (Vysper, nuevo, puro + una llamada)

**Etapa 1 (pura, gratis):** descarta lo que no puede ser una pregunta dirigida al
equipo. Tres criterios, todos verificables sin modelo:

1. **Longitud:** menos de 20 caracteres útiles no es una consulta.
2. **Marcador interrogativo:** signo de interrogación, o pronombre/adverbio
   interrogativo ("qué", "cómo", "cuál", "dónde", "por qué", "existe", "tenemos",
   "se puede", "hay"), con y sin acento.
3. **Coherencia léxica:** proporción de palabras que no existen en un diccionario
   español/inglés mínimo embebido. Por encima de un umbral, el fragmento es basura de
   reconocimiento ("empo", "agir", "maldado") y se descarta aunque tenga marcador.

El criterio 3 es el que más ruido mata y el que más riesgo de falso negativo tiene;
el umbral se calibra contra el fixture del log real antes de fijarlo.

**Etapa 2 (modelo rápido):** solo para los que sobreviven. Recibe el fragmento
candidato más los **2 fragmentos anteriores**, porque una pregunta puede partirse
entre dos. Devuelve `{esPregunta: boolean, preguntaNormalizada: string|null}`.

`preguntaNormalizada` es la pieza que resuelve el Defecto 2: a Cerebro le llega una
pregunta bien formada, no el fragmento crudo. El rechazo desaparece por construcción.

Deduplicación: una pregunta normalizada que coincida con alguna de las **3 últimas**
ya consultadas no vuelve a disparar. Evita que un mismo tema, repetido al partirse el
dictado, lance tres consultas de 30 segundos.

### 3. Orquestación en `main.js`

`processTranscriptionWithLLM()` (main.js:6018) es el punto de entrada de cada
fragmento. En `system-design`:

1. Todo fragmento alimenta la sesión (siempre).
2. El detector decide si además es una consulta.
3. Si lo es: respuesta preliminar (~3s, `processTextWithSecondaryTextModel`, con la
   transcripción y el hilo como contexto — una respuesta sustantiva, no un aviso) y,
   en paralelo, `runDiagnose` con el mismo contexto. La verificada reemplaza a la
   preliminar cuando llega.

El texto escrito a mano (no dictado) sigue yendo siempre a Cerebro: escribir es un
acto deliberado, y ahí no hay ruido que filtrar.

### 4. Cerebro: `diagnose --contexto-file <ruta>`

Un archivo, no un argumento: una transcripción no cabe en la línea de comandos.
Contiene JSON con `transcripcion` y `turnos`.

`build_system_prompt` recibe un bloque de contexto con la transcripción envuelta en
`wrap_untrusted()` y los turnos previos.

### 5. La persona `arquitecto` se ablanda

Hoy rechaza lo que no parece una pregunta limpia. Pasa a usar el contexto para
desambiguar antes de rendirse, y a rechazar solo cuando de verdad no hay nada que
responder.

## Pruebas

Los módulos nuevos son puros: jest en Vysper, pytest en Cerebro.

La prueba que decide si esto sirve usa **los fragmentos reales del log del
2026-09-24** como fixture. El detector debe:

- **dejar pasar:** "que son los subagentes en el motor de agentes", "tenemos ya UI
  para la creacion de un subagente?", "que si un agente puede usar una skill"
- **descartar:** "para liar ver las cosas, digamos, en este maldado", "y vamos a
  llamar ahí más empo…", "Puedes dejarlo en su cargo, cargo de andos…"

En Cerebro, además: que el contexto viaje al prompt, que la transcripción llegue
envuelta como no confiable, y que una instrucción inyectada en la transcripción no
altere el comportamiento.

## Fuera de alcance

- Memoria conversacional para el modo `silia` (le serviría igual; alcance aparte).
- Persistencia entre reinicios de Vysper.
- Respuestas proactivas sin pregunta detectada.

## Riesgos abiertos

- **Costo por reunión.** El detector corre sobre cada fragmento que pase la etapa 1.
  Hay que medirlo con una reunión real antes de darlo por bueno.
- **Falsos negativos.** Una pregunta que el detector no reconozca queda sin
  respuesta y sin aviso. Mitigación mínima: un atajo para forzar la consulta sobre
  el último fragmento.
- **Falsos positivos.** Consultas que nadie pidió. Cuestan tiempo y dinero, pero no
  interrumpen: la respuesta aparece y se ignora.
