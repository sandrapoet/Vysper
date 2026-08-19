###
Mapa de atajos actualizado:

Shortcut	Acción
Ctrl+Shift+S	Captura OCR de una región (acumula en programming/dsa/labelling; en otros modos la envía al LLM)
Alt+B	Captura imagen sin OCR (acumula en programming/dsa/labelling y espera !!! / ||| / °°°; en otros modos la envía al LLM)
Ctrl+1	En programming/dsa/labelling: guarda imágenes acumuladas (OCR + sin OCR) y consolida (!!!). En secretaria: pega la transcripción acumulada sin liberarla
Ctrl+|	Fallback de consolidación ||| (programming/dsa/labelling)
Ctrl+3	Secretaria: arma el siguiente envío del chat para convertirlo a MP3 (Edge por defecto; usa ¬|1 para Piper y |1.5 para el ritmo)
Ctrl+4	Secretaria: subir archivo de audio para transcribir
Alt+R	Iniciar / detener grabación; en secretaria graba audio crudo pendiente de transcripción
Alt+S	Secretaria: inicia / detiene una sesión de grabación larga (reunión) en segundo plano; al detenerla genera transcripción completa + minuta (resumen) en minutas/
Ctrl+5	Secretaria: sube un archivo de audio existente, lo transcribe completo en una sola pasada (como Ctrl+4, guardando en transcripciones/) y genera la minuta final a partir del texto, minimizando llamadas al LLM
Ctrl+6	Secretaria: abrir un archivo en la ventana shadow translúcida para ver lo que hay debajo
Ctrl+7	Secretaria: convierte una transcripción de texto existente ("Hablante: texto" por línea, sin timestamps) al formato Microsoft Teams, estimando tiempos por cantidad de palabras
Ctrl+Shift+L	Liberar todo el buffer en cualquier modo (secretaria: buffer de dictado; resto: contexto + imágenes acumuladas, equivale a °°°). También cancela un pegado/copiado en curso
Ctrl+Shift+B	Copiar selección con el mouse, sin teclazos (sigiloso): pulsa, selecciona, y al soltar el mouse copia al portapapeles. Funciona en todos los modos
Ctrl+Shift+V	Pegar el portapapeles en el cursor, tecleado por "cubetazos" (simula escritura humana). Funciona en todos los modos; cancelable con Ctrl+Shift+L
Alt+,	Escribe el símbolo < en el cursor (todos los modos)
Alt+.	Escribe el símbolo > en el cursor (todos los modos)
Ctrl+Shift+Z	Ocultar / mostrar todas las ventanas (incluye ventana gris)
Ctrl+Shift+X	Abrir configuración — solo en modo interactivo
Ctrl+,	Abrir configuración
Ctrl+Shift+C	Ir a la ventana de chat
Ctrl+Shift+H	Mostrar / ocultar la guía de referencia
Ctrl+Shift+T	Forzar "always-on-top" en todas las ventanas
Ctrl+Shift+I / Alt+A	Toggle modo interactivo
Ctrl+↑ / Ctrl+↓	Interactivo: cambiar de skill (anterior/siguiente). No interactivo: mover las ventanas
Ctrl+← / Ctrl+→	No interactivo: mover las ventanas

Indicador "foco" del encabezado (ícono del micrófono):
- Rojo: grabando
- Azul: listo para seleccionar con el mouse (tras Ctrl+Shift+B)
- Amarillo: pegando (tras Ctrl+Shift+V)
- Apagado: inactivo / terminó

Comandos de texto (en el chat o por voz):
- !!!  Consolida el contexto acumulado y genera la respuesta final
- |||  Reintento / fallback de la consolidación
- °°°  Reinicia el contexto acumulado
- /actualizaRag  Ejecuta `./build.sh --actualiza` sobre SandraRagCreAI (solo en secretaria, silia y system-design — ver sección "Modo Silia")
###

<p align="center">
  <img src="https://github.com/user-attachments/assets/186d5458-7e8b-406a-9adc-ce755256298c" 
       alt="Group 14" 
       width="300" 
       style="padding: 10px; border-radius: 8px;"/>
</p>

# Vysper

**Professional Interview Assistant with Invisible Screen Overlay**

An AI-powered desktop tool that helps you excel in technical and professional interviews by providing intelligent, real-time assistance while remaining completely invisible to screen sharing and recording software.

### Demo
https://github.com/user-attachments/assets/c5616482-3652-4686-b87b-e04d06572d2f

## Perfect for Interviews
**Completely Stealth** - Invisible to Zoom, Teams, Meet, and all screen sharing tools
**Real-time AI Assistance** - Instant help with coding problems, system design, and interview questions
**Professional Skills** - Specialized modes for different interview types

### Supported Interview Skills
- **DSA (Data Structures & Algorithms)** - Complete solutions with complexity analysis
- **System Design** - Architecture patterns and scalability approaches  
- **Programming** - Multi-language coding assistance and best practices
- **Behavioral** - STAR method responses and professional scenarios
- **Sales** - Frameworks, objection handling, and closing techniques
- **Negotiation** - Strategic approaches and persuasion tactics
- **Presentation** - Structure, delivery tips, and visual design
- **DevOps** - Infrastructure, CI/CD, and deployment strategies
- **Data Science** - Analytics, ML approaches, and statistical methods
- **Secretaria** - Long dictation/audio-file transcription, then paste the accumulated text at the active cursor
- **Labelling** - Evaluate two model transcripts (Response A vs B) against a user prompt; accumulate the parts (mark them A:/B:) and consolidate with `Ctrl+1` / `!!!` to get strengths, weaknesses (taxonomy), a 0–7 preference, and a rationale

## 🚀 Quick Start

### Installation
```bash
git clone <repository-url>
cd Vysper
brew install tesseract
brew install sox
npm install
npm start
```

### Build Distributable App

#### Step-by-Step Build Process
1. **Clone and Setup** (first time only):
   ```bash
   git clone <repository-url>
   cd Vysper
   npm install
   ```

2. **Create Your Build**:
   ```bash
   # For your current platform (recommended)
   npm run build
   
   # Or specific platforms
   npm run build:mac      # macOS (.dmg + .zip)
   npm run build:win      # Windows (.exe installer + portable)
   npm run build:linux    # Linux (.AppImage + .deb)
   npm run build:all      # All platforms
   ```

3. **Find Your App**: Built files appear in `dist/` folder

#### Build Commands Reference
```bash
# Basic builds
npm run build          # Current platform
npm run build:mac      # macOS (.dmg + .zip)
npm run build:win      # Windows (.exe installer + portable)
npm run build:linux    # Linux (.AppImage + .deb)
npm run build:all      # All platforms

# Development & testing
npm run pack           # Quick build for testing (no compression)
npm run clean          # Clean dist/ folder
npm run rebuild        # Clean + build current platform
npm run release        # Clean + build all platforms
```

**Built apps will be in the `dist/` folder:**
- **macOS**: `Vysper-1.0.0.dmg` (installer) or `Vysper-1.0.0-mac.zip` (portable)
- **Windows**: `Vysper Setup 1.0.0.exe` (installer) or `Vysper 1.0.0.exe` (portable)
- **Linux**: `Vysper-1.0.0.AppImage` (portable) or `Vysper_1.0.0_amd64.deb` (installer)

### Installing Built Apps
- **macOS**: Double-click `.dmg` file → Drag to Applications folder
- **Windows**: Run `.exe` installer or double-click portable version
- **Linux**: Make `.AppImage` executable (`chmod +x`) and run, or install `.deb` with `dpkg`

**Clean Build Process:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Essential Setup
1. **Local Speech Recognition** (for voice commands)
   - Uses the local `stt/sidecar.py` service with Silero VAD + faster-whisper.
   - Run the STT setup script for your platform before using voice recording.
   - Performance knobs for slower CPUs:
     - The STT sidecar starts lazily, not at app startup. Switching to `secretaria` or `traductor` warms up Whisper plus the microphone stream and keeps both ready while you stay in that mode. Set `VYSPER_STT_PRELOAD=1` only if you prefer loading it during app startup.
     - In `secretaria`, `Alt+R` records raw audio first; pending audio is transcribed when `Ctrl+1` is pressed.
     - `VYSPER_STT_MODEL=small` is the default; use `base` for lower CPU/RAM or `medium` for higher accuracy.
     - `VYSPER_STT_INTERIM_SEC=0` disables repeated interim Whisper passes while recording. This is the default.
     - `VYSPER_STT_CPU_THREADS=2` is the default and limits Whisper CPU threads if it competes with the rest of the desktop.
     - `VYSPER_STT_IDLE_EXIT_MS=120000` unloads the sidecar after two idle minutes once you leave modes that keep speech ready. Set it to `0` to keep models loaded after first use.
     - Optional speaker diarization for long `secretaria` meetings uses `pyannote.audio`. Accept the Hugging Face model terms, then set `VYSPER_PYANNOTE_TOKEN=hf_...`. The default model is `pyannote/speaker-diarization-community-1`.
     - Long `secretaria` meetings use `Alt+S`, with `VYSPER_MEETING_SEGMENT_SEC=300`, `VYSPER_MEETING_OVERLAP_SEC=3`, and per-fragment summaries enabled unless `VYSPER_MEETING_SEGMENT_SUMMARY=0`.
     - `VYSPER_ALWAYS_ON_TOP_ENFORCE_MS=0` keeps periodic window enforcement disabled; set a value like `10000` only if your desktop stops keeping the overlay on top.
     - `VYSPER_SCREEN_SHARING_WATCH=1` re-enables screen-sharing polling; it is disabled by default to reduce idle CPU/GPU wakeups.

2. **Google Gemini AI** (for intelligent responses)
   - Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Configure it in the `.env` file (see below) or in the app's Settings window (`Ctrl/Cmd + Shift + X` or `Ctrl/Cmd + ,`)

### Environment File
Create `.env`:
```bash
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_QUOTA_COOLDOWN_MS=600000
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_FALLBACK_API_KEY=your_second_anthropic_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
ANTHROPIC_MAX_TOKENS=2048
ANTHROPIC_BEHAVIORAL_MAX_TOKENS=900
ANTHROPIC_TRANSCRIPTION_MAX_TOKENS=1400
VYSPER_STT_PREROLL_MS=900
VYSPER_STT_WARM_PREROLL_MS=1500
```

## ⌨️ Essential Shortcuts

### Core Functions
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + S` | Select Screen Region + OCR Analysis |
| `Alt/Option + B` | Capture image region without OCR |
| `Alt/Option + R` | Voice Recording Toggle |
| `Alt/Option + S` | Meeting Recording Toggle (secretaria mode only) — starts/stops a long background recording and generates a final summary. See [Meeting Recording & Auto-Summary](#meeting-recording--auto-summary-secretaria-mode) |
| `Ctrl/Cmd + 5` | Upload an existing audio file (secretaria mode only): single-pass transcription + diarization, then generate the final minuta from the text, minimizing LLM calls |
| `Ctrl/Cmd + 7` | Convert an existing plain-text transcript (secretaria mode only, `Hablante: texto` per line) to Microsoft-Teams-style format with estimated timestamps |
| `Ctrl/Cmd + 6` | Open a file in the translucent shadow window (secretaria mode only) |
| `Ctrl/Cmd + Shift + Z` | Show/Hide All Windows |
| `Ctrl/Cmd + Shift + I` / `Alt + A` | Toggle Interactive Mode |

### Navigation
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + C` | Chat Window |
| `Ctrl/Cmd + Arrow Up/Down` | Skills Selection (only if Interactive mode is on) |
| `Ctrl/Cmd + ,` | Settings |

### Clipboard (stealth, no Ctrl+C/Ctrl+V keystrokes)
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + B` | Arm copy: select with the mouse; on release it copies the selection |
| `Ctrl/Cmd + Shift + V` | Paste clipboard at cursor, typed in chunks (human-like); cancel with `Ctrl+Shift+L` |

### Session Management
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + L` | Release all buffers / reset accumulated context (same as `°°°`); also cancels an in-progress paste/copy |

### Important Interaction Usage Tip 
* Enable **Interaction Mode** to scroll, click, or select inside windows.
* Use `Cmd+Up/Down` (in Interaction Mode) to switch skills quickly.
* Click thorugh screen works only when interaction mode is disabled
* In **Stealth Mode**, windows are invisible to screen share & mouse.

## 🔧 Key Features

### Stealth Technology
- **Invisible to Screen Sharing** - Completely hidden from Zoom, Teams, Meet
- **Process Disguise** - Appears as "Vysper" in system monitors
- **Click-through Mode** - Windows become transparent to mouse clicks
- **No Screen Recording Detection** - Undetectable by recording software

### AI-Powered Analysis
- **Region OCR** - Select, extract, and analyze text from a specific screen area
- **Voice Commands** - Speak questions and get instant AI responses
- **Context-Aware** - Remembers conversation history for better responses
- **Multi-Format Output** - Clean text and code blocks with syntax highlighting

### Interview-Specific Intelligence
- **Problem Recognition** - Automatically detects interview question types
- **Step-by-Step Solutions** - Detailed explanations with best practices
- **Code Examples** - Multi-language implementations with optimizations

## 💡 Pro Tips

### During Technical Interviews
1. **Position Windows**: Place Vysper windows in screen corners before sharing
2. **Use Voice Mode**: Whisper questions during "thinking time"
3. **Screenshot Problems**: Capture coding challenges for instant solutions
4. **Check Solutions**: Verify your approach with AI before implementing

### For System Design
1. **Capture Requirements**: Screenshot or voice record the problem statement
2. **Get Frameworks**: Ask for architectural patterns and trade-offs
3. **Verify Scalability**: Double-check your design decisions

### Behavioral Questions
1. **STAR Method**: Get structured response frameworks
2. **Industry Examples**: Request relevant scenarios for your field
3. **Follow-up Prep**: Prepare for common follow-up questions

## Important Technical Requirements (MUST INSTALL Before Running)
- **Node.js** 16+
- **Tesseract OCR** (`brew install tesseract`)
- **Audio Tool** (`brew install sox`)
- **Local faster-whisper STT** with Silero VAD
- **Google Gemini API** (Free quota included)
- **Edge TTS + Piper TTS** (`pip install edge-tts piper-tts`) for `secretaria` text-to-speech audio generation

## 🚀 Advanced Usage

### Session Memory
The app remembers your interview context across multiple questions:

### Meeting Recording & Auto-Summary (`secretaria` mode)
Long-form recording with automatic transcription and a final summary ("minuta"), independent from the normal `Alt+R` voice-command flow. Useful for recording a full meeting/call and getting a written summary afterward instead of a live AI answer per question.

**1. Switch to the `secretaria` skill first.** Cycle skills with `Ctrl/Cmd + Up/Down` while Interactive Mode is on, or pick it from Settings. `Alt+S` only *starts* a new session in `secretaria` mode — in any other skill, starting one is ignored (you'll see an "IGNORADO" notice). *Stopping* an already-running session with `Alt+S` works from any skill (including `silia`) — you don't need to switch back to `secretaria` first, though you still can if you prefer.

**2. Press `Alt+S` to start.** This creates `minutas/reunion-<YYYY-MM-DD-HH-MM-SS>/` (with subfolders `audio/`, `transcripts/`, `speakers/`, `summaries/`, `final/`) and starts recording from the microphone in the background.
- Recording keeps going even if you switch to another skill or use `Alt+R` for a normal voice command at the same time — the microphone stream is shared, so the meeting capture is never interrupted by anything else you do.
- Every `VYSPER_MEETING_SEGMENT_SEC` seconds (default `300` = 5 min, with `VYSPER_MEETING_OVERLAP_SEC` = `3`s of overlap for continuity) a segment closes and is saved as `audio/0001.wav`, `audio/0002.wav`, etc. Each finished segment is automatically transcribed (`transcripts/000N.txt`), diarized if configured (`speakers/000N.json`), and summarized (`summaries/000N.md`) *while the meeting keeps recording* — so you get partial progress before you even stop.
- Speaker diarization ("who said what") is optional and best-effort: set `VYSPER_PYANNOTE_TOKEN` (a Hugging Face token with access to `pyannote/speaker-diarization-community-1`) to enable it. If it's missing, or diarization fails for a segment, transcription and summaries still work — you just don't get speaker labels for that segment.
- Status updates are broadcast to the app windows as it progresses (e.g. "GRABANDO", "FRAGMENTO N: guardado; transcribiendo...").

**3. Press `Alt+S` again to stop and generate the summary.** This closes the last segment, waits for any pending transcription/diarization/segment-summary jobs to finish, then writes:
- `final/transcript-full.txt` — the full meeting transcript (all segments concatenated).
- `final/transcript-hablantes.txt` — the transcript labeled by speaker (`Hablante: lo que dijo`), one paragraph per turn. Because per-segment diarization isn't consistent across segments (`SPEAKER_00` in segment 1 isn't necessarily the same person as `SPEAKER_00` in segment 2), this file comes from a separate one-time pass: all segment audio is concatenated into `final/full-audio.wav` and re-transcribed + re-diarized once over the full timeline (`final/speakers-full.json`), then a single LLM call tries to resolve generic labels (`SPEAKER_00`) into real names when they're clearly stated in the dialogue (self-introductions, being addressed by name) — otherwise it keeps the generic label. Skipped if diarization isn't configured/fails.
- `final/transcript-teams.txt` — the same speaker-labeled transcript, reformatted Microsoft-Teams-style: `HH:MM:SS  **NOMBRE**  texto`, one blank line between turns, real timestamps (not estimated), names in caps/bold, and turns split whenever there's a pause longer than 5s even if it's the same speaker. Reuses the same name resolution as `transcript-hablantes.txt` — no extra LLM call.
- `final/minuta.md` — the AI-generated summary (Resumen ejecutivo, Temas tratados, Decisiones, Tareas, Riesgos, Próximos pasos). If the LLM call fails, this falls back to pointing at the raw transcript instead of losing the session.
- `session.json` — a manifest with timestamps and status history for the session.

Consolidation time depends on meeting length and segment count (a few seconds to a couple of minutes) — the status moves through "PROCESANDO" → "FINALIZADO". While it's mid-stop (status `stopping`/`processing`/`finalizing`), pressing `Alt+S` again does nothing but report "OCUPADO" — wait for "FINALIZADO" instead of pressing repeatedly.

**Related environment variables** (add to `.env`, see [Environment File](#environment-file) above):
```bash
VYSPER_MEETING_SEGMENT_SEC=300        # segment length in seconds
VYSPER_MEETING_OVERLAP_SEC=3          # overlap between segments, for continuity
VYSPER_MEETING_SEGMENT_SUMMARY=1      # set to 0 to skip per-segment LLM summaries (still transcribes)
VYSPER_MEETING_FINAL_TRANSCRIPT_CHARS=60000  # above this length, the final prompt references the file instead of inlining it
VYSPER_PYANNOTE_TOKEN=hf_...          # Hugging Face token to enable speaker diarization (optional)
VYSPER_PYANNOTE_DEVICE=auto           # cpu / cuda / auto
VYSPER_PYANNOTE_MODEL=pyannote/speaker-diarization-community-1
```

**Already have a recording?** `Ctrl/Cmd + 5` (secretaria mode only) opens the same file picker as `Ctrl+4` and accepts the same formats (wav, mp3, m4a, aac, flac, ogg, opus, webm, mp4, mpeg), but instead of leaving you to generate the summary by hand, it produces the same `final/transcript-full.txt`, `final/transcript-hablantes.txt`, `final/transcript-teams.txt`, `final/minuta.md`, and `session.json` as `Alt+S`, under a new `minutas/reunion-<timestamp>/` folder — with a cheaper pipeline built specifically for a file that already exists in full (unlike `Alt+S`, which must process incrementally because it's still recording):
- The whole file is transcribed in **one local Whisper pass** (same as `Ctrl+4` — no LLM cost at all) and also saved to `transcripciones/`, exactly like `Ctrl+4` does.
- Speaker diarization (if `VYSPER_PYANNOTE_TOKEN` is configured) also runs **once** on the full file instead of per-chunk, which is both cheaper and more accurate since it has the whole conversation for context — and, unlike `Alt+S`'s per-segment diarization, speaker labels stay consistent across the whole file since there's only one diarization pass.
- The minuta is generated from the **full transcript in a single LLM call** whenever it fits under `VYSPER_MEETING_FINAL_TRANSCRIPT_CHARS` (the common case) — matching what you'd get pasting the whole transcript into Gemini yourself. Only if the transcript is longer than that limit does it fall back to summarizing a handful of large text blocks in sequence (each one aware of the previous block's summary) and consolidating them into one minuta — still far fewer LLM calls than one-per-5-minutes.
- If Gemini's quota/billing limit is hit, the app now remembers that for a cooldown period (`llm.gemini.quotaCooldownMs`, default 10 min) and skips straight to the Anthropic fallback on subsequent calls instead of re-trying (and re-failing) Gemini every time.

The same "OCUPADO" busy-guard applies: if a meeting session (live via `Alt+S`, or from a previous `Ctrl+5` upload) is already running, pressing `Ctrl+5` again just reports it's busy instead of starting a second one.

**Resuming after a failure.** If a `Ctrl+5` run gets interrupted (app closed, diarization dependency missing, etc.), the transcription and diarization stages are checkpointed to disk (`transcripts/0001.txt` + `0001.segments.json`, `speakers/0001.json`) so they don't need to be redone. Pick the same audio file again with `Ctrl+5` and, if an unfinished session for that exact file is found under `minutas/`, you'll get a prompt to resume it instead of starting over — transcription and diarization are reused if they already succeeded (diarization is always retried if it was the one that failed, since it's cheap compared to re-transcribing), and the minuta is only regenerated if it wasn't produced yet.

**Already have a plain-text transcript from somewhere else?** `Ctrl/Cmd + 7` (secretaria mode only) opens a file picker for an existing `.txt` transcript in `Hablante: texto` format (one line per turn, no timestamps — e.g. one you already had lying around, not necessarily produced by Vysper) and converts it to the same Microsoft-Teams-style format as `transcript-teams.txt`, saved next to the original as `<archivo>-teams.txt`. Since there's no real audio to time against, timestamps are **estimated** from a ~150-words-per-minute reading pace, accumulated turn by turn from `00:00:00` — treat them as approximate, not exact. Consecutive same-speaker lines are merged into one turn (adding a period between sentences if one is missing); any label that isn't a generic `SPEAKER_NN`/`Hablante desconocido` pattern is treated as an already-identified real name and kept as-is (uppercased).

## Modo Silia (líder de proyecto interino)

El modo **Silia** delega el razonamiento a [Cerebro](/media/san/Miscosas6/Desarrollo/Cerebro),
un orquestador Python que combina Ollama/Nemotron con Jira, Notion, GitHub y
un RAG de transcripciones (LightRAG + Sandra RAG). A diferencia de los demás
modos, no llama a Gemini/Anthropic directamente: cada mensaje se pasa a
`python -m cerebro.cli` como subproceso (`src/services/cerebro.service.js`) y
la respuesta JSON (`summary`, `citations`, `action_items`) se muestra en el
chat.

**Activación:** Settings → Active Skill → `Silia (Lider de Proyecto)`.

**Uso normal (preguntas libres):** cualquier duda de un stakeholder o del
equipo — "¿cómo va el sprint?", "¿por qué se decidió usar X en el módulo Y?" —
se responde consultando Jira/GitHub (estado, cronograma) o Notion/RAG
(decisiones, contexto histórico), con riesgos de cronograma señalados
proactivamente cuando aplica.

**`/silia daily`** — checkpoint diario: consulta tickets asignados en
progreso/pendientes (Jira), PRs abiertos (GitHub) y menciones recientes
(RAG) para el usuario configurado en `VYSPER_SILIA_ASSIGNEE`, y devuelve un
resumen ejecutivo con tickets vencidos, PRs bloqueados y riesgos.

**`/incidente <descripción>`** — pipeline de diagnóstico de incidentes,
más agresivo recolectando contexto (5 pasos forzados en Cerebro: GitHub →
Jira → RAG → Notion → síntesis). Genera un prompt en markdown listo para
pegar en Claude Code (contexto del error, hipótesis, archivos sospechosos,
pasos para reproducir, prácticas CI/CD, runbooks, acción inmediata), lo
copia automáticamente al portapapeles y registra `{timestamp, descripcion,
prompt}` en `~/.Vysper/incidentes.log`.

**Ejemplo:**
```
/incidente el servicio de pagos devuelve 500 intermitentemente desde el deploy de ayer
```

**Configuración** (`.env`, ver `env.example`): `CEREBRO_PATH`,
`CEREBRO_PYTHON`, `CEREBRO_TIMEOUT_MS`, `VYSPER_SILIA_ASSIGNEE`. Cerebro debe
estar configurado por separado (Ollama, MCP, credenciales de Jira/Notion/
GitHub) — ver su propio `README.md`. `stt/setup_vysper_stt.sh` prepara el
venv de Cerebro (`.venv` + `requirements.txt`) y verifica/levanta Ollama y el
stack de Sandra RAG (`SandraRagCreAI`, puerto 8000 por defecto) al arrancar,
igual que ya hace con LightRAG.

Si Cerebro no responde (timeout, proceso caído, token inválido), Silia
muestra un mensaje de error claro en el chat en vez de fallar silenciosamente.

### ¿`/incidente` o `/silia daily` no responden?

Antes de sospechar de Cerebro, revisá esto en orden — cubre el motivo más
común de "nunca recibí respuesta":

1. **Confirmá que el skill activo es `silia`.** `/incidente` y `/silia daily`
   solo se reconocen dentro del modo `silia` (`processTextWithSilia` en
   `main.js`); en cualquier otro modo el texto se descarta **sin ningún
   aviso en el chat** — no hay error, no hay respuesta, nada. `silia` se
   activa desde Settings → Active Skill → `Silia (Lider de Proyecto)`, o
   ciclando con `Ctrl/Cmd + ↑/↓` en modo interactivo (ya incluido en el
   ciclo de skills junto al resto).
2. **Verificá que las dependencias de Cerebro estén corriendo:** Ollama, el
   stack Docker de Sandra RAG (puerto 8000) y las credenciales/MCP de
   Jira/Notion/GitHub. `stt/setup_vysper_stt.sh` levanta Ollama y Sandra RAG
   automáticamente; si algo de eso está caído, la consulta a Cerebro puede
   demorar mucho o fallar.
3. **Esperá hasta 90 segundos** (`CEREBRO_TIMEOUT_MS`, default `90000`): si
   Cerebro está vivo pero una llamada externa (Jira/GitHub/RAG) se cuelga,
   Vysper espera ese tiempo antes de mostrar el error — no hay indicador de
   progreso intermedio en el chat.

### `/actualizaRag` (secretaria, silia, system-design)

Ejecuta `./build.sh --actualiza` en el proyecto `SandraRagCreAI` (reindexa
el contenido del RAG) como subproceso, y muestra el resultado (o el error)
en el chat — no requiere describir nada, es un comando sin argumentos.
Disponible en los modos `secretaria`, `silia` y `system-design`; en
cualquier otro modo se ignora igual que el resto del texto libre en esos
modos que no lo soportan.

**Ejemplo:**
```
/actualizaRag
```

**Configuración** (`.env`): `VYSPER_SANDRA_RAG_DIR` (default
`/media/san/Miscosas6/Desarrollo/SandraRagCreAI`) y
`VYSPER_SANDRA_RAG_ACTUALIZA_TIMEOUT_MS` (default `900000`, 15 minutos —
el build puede tardar).

**Grabaciones de `secretaria` (Alt+S) y modo Silia:** cambiar a `silia` no
interrumpe una grabación larga en curso — el sidecar de audio la mantiene
viva independientemente del skill activo. Podés terminarla presionando
`Alt+S` directamente desde `silia` (no hace falta volver a `secretaria`), o
volver a `secretaria` y presionar `Alt+S` ahí — ambas opciones cierran la
misma sesión y generan la minuta igual.

## 🤝 Contributing

**Contribute to make Vysper the ultimate interview companion, not a cheating tool!**

### Priority Areas
- **New Interview Skills** - Add specialized domains (Finance, Marketing, etc.)
- **Language Support** - Expand beyond English for global users
- **Platform Extensions** - Windows and Linux compatibility
- **LLM Improvements** - Multiple LLM Model selections for the response
- **UI/UX Improvements** - Enhanced interface and user experience

### How to Contribute
1. **Fork the repository**
2. **Star the project** if you find it useful
3. **Report issues** for bugs or feature requests
4. **Submit pull requests** for improvements
5. **Improve documentation** and add examples
6. **Share your success stories**

⭐ **Star this repo** if Vysper helped you ace your interviews or you vibed with it!
