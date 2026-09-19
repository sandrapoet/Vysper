###
Mapa de atajos actualizado:

Shortcut	Acción
Ctrl+Shift+S	Captura OCR de una región (acumula en programming/dsa/labelling/system-design/silia/secretaria; en otros modos la envía al LLM)
Alt+B	Captura imagen sin OCR (acumula en programming/dsa/labelling y espera !!! / ||| / °°°; en system-design/secretaria/silia pide una instrucción y la envía junto con la imagen a Cerebro en un solo turno; en otros modos la envía al LLM con un prompt genérico)
Ctrl+1	En programming/dsa/labelling: guarda imágenes acumuladas (OCR + sin OCR) y consolida (!!!). En system-design/silia: guarda solo el OCR acumulado (Alt+B ya no acumula en estos modos, ver arriba) y consolida. En secretaria: si hay contexto OCR acumulado lo consolida igual que los demás modos; si no hay ninguno, pega la transcripción acumulada sin liberarla (comportamiento original)
Ctrl+|	Fallback de consolidación ||| (programming/dsa/labelling/system-design/silia/secretaria)
Ctrl+3	Secretaria: arma el siguiente envío del chat para convertirlo a MP3 (Edge por defecto; usa ¬|1 para Piper y |1.5 para el ritmo)
Ctrl+4	Secretaria: subir archivo de audio para transcribir
Alt+R	Iniciar / detener grabación; en secretaria graba audio crudo pendiente de transcripción
Alt+S	Inicia / detiene una sesión de grabación larga (reunión) en segundo plano, desde cualquier modo; al detenerla genera transcripción completa + minuta (resumen) en minutas/
Alt+O	Arma / desarma el modo optimización para la próxima sesión de Alt+S, desde cualquier modo. Pregunta el modo: Tiempo real (fragmentos cortos + preguntas sugeridas en vivo, sigue bloqueando Alt+S hasta que termina) o Posterior (sin nada en vivo, genera el analisis automaticamente al terminar la sesion, sin bloquear la siguiente)
Ctrl+5	Secretaria: sube un archivo de audio existente, lo transcribe completo en una sola pasada (como Ctrl+4, guardando en transcripciones/) y genera la minuta final a partir del texto, minimizando llamadas al LLM
Ctrl+6	Secretaria: abrir un archivo en la ventana shadow translúcida para ver lo que hay debajo
Ctrl+7	Secretaria: convierte una transcripción de texto existente ("Hablante: texto" por línea, sin timestamps) al formato Microsoft Teams, estimando tiempos por cantidad de palabras
Ctrl+Shift+L	Liberar todo el buffer en cualquier modo (secretaria: buffer de dictado; resto: contexto + imágenes acumuladas, equivale a °°°). También cancela un pegado/copiado en curso
Ctrl+Shift+B	Copiar selección con el mouse, sin teclazos (sigiloso): pulsa, selecciona, y al soltar el mouse copia al portapapeles. Funciona en todos los modos
Ctrl+Shift+V	Pegar el portapapeles en el cursor, tecleado tecla a tecla (la app destino ve teclas reales, no un evento de pegado). Funciona en todos los modos; cancelable con Ctrl+Shift+L. Para pegado normal y instantáneo usa el Ctrl+V del sistema
Alt+,	Escribe el símbolo < en el cursor (todos los modos)
Alt+.	Escribe el símbolo > en el cursor (todos los modos)
Ctrl+Shift+Z	Ocultar / mostrar todas las ventanas (incluye ventana gris)
Ctrl+Shift+X	Abrir configuración — solo en modo interactivo
Ctrl+,	Abrir configuración
Ctrl+Shift+C	Ir a la ventana de chat
Ctrl+Shift+H	Mostrar / ocultar la guía de referencia
Ctrl+Shift+T	Forzar "always-on-top" en todas las ventanas
Ctrl+Shift+I / Alt+A	Toggle modo interactivo
Ctrl+↑ / Ctrl+↓	Interactivo: cambiar de skill (anterior/siguiente) entre programming/dsa/system-design/behavioral/secretaria/silia/labelling/traductor. No interactivo: mover las ventanas. Sales, Presentation, Negotiation, DevOps y Data Science ya no están en este ciclo; se activan solo desde el diálogo de Ctrl+Shift+X
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
- /hoy <dominio>  Análisis de riesgo de Jira para un dominio de equiv.yaml, sintetizado por un LLM en un plan de acción de 3 secciones (secretaria, silia, system-design — ver sección "Modo Silia")
- /detalle [dominio]  Vuelca el análisis de /hoy ya persistido a un .md (secretaria, silia, system-design)
- /contexto <ruta-carpeta>  Carga los archivos de esa carpeta como referencia fija de las respuestas (solo modo dsa)
- /jira, /notion, /github <consulta>  Acota una consulta libre a esa sola fuente (secretaria, silia, system-design)
- /silia daily [identificador]  Actividades del último día hábil (Jira/GitHub/Notion/minutas locales) + checkpoint de riesgo abierto (silia, system-design — ver sección "Modo Silia")
- /silia retro [--dominio <alias>] [sprint_ref], /silia retro [--dominio <alias>] comparar <sprint_a> <sprint_b>  Retrospectiva estructurada de un sprint (Jira Agile API + métricas + Notion/RAG + incidentes del SMC), default "agentes", o diff entre dos retros ya generadas (silia, system-design — ver sección "Modo Silia")
- /revisar <url-pr> [--basico|--profundo|--arq|--security] [--diablo] [--merge] [--release]  Revisión automatizada de PR: conflictos + CI + matriz de cumplimiento ponderada + checklist de 12 dimensiones con severidades + OpenSpec/Jira (silia, system-design — ver sección "Modo Silia")
- /crear-ticket --proyecto AGE --resumen "..." [--padre AGE-147] [--sprint "Sprint 6"] [--link "bloquea:AGE-219"] --descripcion <texto>  Levanta un ticket nuevo en Jira desde un hallazgo (silia)
- /auditar-bump <url-pr>, /estado-llm, /preflight-promocion <ticket>, /hoy-historial <dominio>, /hoy-comparar <dominio>  Comandos de solo lectura, por la ruta genérica (silia)
- /crear-pr <rama> [--draft|--publish] [--labels a,b,c] [--ticket AGE-123, AGE-124], /cancelar-pr <url-pr>, /aprobar-pr <url-pr> [--revisar] [--merge] [--tag] [--ignorar-checks "a,b"]  Creación/cancelación/aprobación de PRs (silia, system-design — ver sección "Modo Silia"). Desde la terminal, `crear-pr --dry-run` ahora **no escribe nada** — antes creaba el PR igual, ver "Flags de Cerebro que cambiaron de significado"
- /merge <numero-pr> --repo <owner/repo> [--merge]  Mergea un PR directo vía la API de GitHub, sin aprobar ni tocar Jira, con confirmación explícita en el chat (silia, system-design — ver sección "Modo Silia")
- /actualizar-jira <texto>  Actualiza descripción/fecha/estado/story points de uno o varios tickets a partir de texto libre, con preview + confirmación antes de escribir (silia, system-design — ver sección "Modo Silia")
- /script  Ejecuta cerebro/scripts/jira_transition.py (ruta fija, sin argumentos) — ver sección "Modo Silia"
- /reconocerVoz <ruta-sesion>  Enrola huellas de voz nuevas desde una sesión ya procesada, uno por uno vía chat (solo secretaria — ver sección "Huellas de voz")
- /reconocerVozPendientes <ruta-sesion>  Retoma solo los hablantes sin identificar de una sesión (marcados UNKNOWN o nunca revisados), sin re-ofrecer los que ya tienen nombre (solo secretaria)
- /actualizarHablantes <ruta-sesion>  Re-matchea una sesión vieja contra el store de huellas de voz actual y regenera sus transcripts + minuta con una pasada de LLM (solo secretaria)
- /reidentificarMinutas --carpeta <ruta> | --sesion <ruta>  Igual que /actualizarHablantes pero en lote y sin LLM: re-matchea y sustituye texto directo en los transcripts/minuta (solo secretaria — ver sección "Huellas de voz")
- /optimiza <ruta-sesion>  Genera el análisis de optimización posterior sobre una sesión ya terminada (solo system-design)
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

> Sales, Negotiation, Presentation, DevOps, and Data Science are no longer reachable via `Ctrl+↑`/`Ctrl+↓` — activate them from the settings dialog (`Ctrl+Shift+X`).

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
   - `PYTHON_PATH` (optional) points at a specific Python executable. Without it,
     the sidecar uses the venv the setup script creates — `stt/venv/bin/python`
     on Unix/Mac, `stt/venv/Scripts/python.exe` on Windows. Only set it if you
     deliberately want an interpreter outside that venv; note that diarization
     reads its torch build from whichever interpreter this resolves to, so
     pointing it elsewhere is also how you lose the CUDA build.
   - Performance knobs for slower CPUs:
     - The STT sidecar starts lazily, not at app startup. Switching to `secretaria` or `traductor` warms up Whisper plus the microphone stream and keeps both ready while you stay in that mode. Set `VYSPER_STT_PRELOAD=1` only if you prefer loading it during app startup.
     - In `secretaria`, `Alt+R` records raw audio first; pending audio is transcribed when `Ctrl+1` is pressed.
     - `VYSPER_STT_MODEL=small` is the default; use `base` for lower CPU/RAM or `medium` for higher accuracy.
     - `VYSPER_STT_LANGUAGE=es` is the default. Whisper's language autodetection only looks at the first 30 s of
       audio, which in a real meeting is usually silence or clipped greetings; when it guesses wrong it decodes the
       whole recording in that language and the transcript comes out unusable. Set `VYSPER_STT_LANGUAGE=auto` to
       restore autodetection (it then samples `VYSPER_STT_LANGUAGE_DETECT_SEGMENTS=6` windows instead of one), or
       any Whisper code such as `en`.
     - `VYSPER_STT_INTERIM_SEC=0` disables repeated interim Whisper passes while recording. This is the default.
     - `VYSPER_STT_CPU_THREADS=2` is the default and limits Whisper CPU threads if it competes with the rest of the desktop.
     - `VYSPER_STT_IDLE_EXIT_MS=120000` unloads the sidecar after two idle minutes once you leave modes that keep speech ready. Set it to `0` to keep models loaded after first use.
     - Optional speaker diarization for long `secretaria` meetings uses `pyannote.audio`. Accept the Hugging Face model terms, then set `VYSPER_PYANNOTE_TOKEN=hf_...`. The default model is `pyannote/speaker-diarization-community-1`.
     - **Diarization runs on the GPU when torch can see one**, and the difference is not marginal: measured on 300 s of
       real meeting audio (i9-14900HX + RTX 5060), **15 s on GPU (0.05x realtime) against 252 s on CPU with 2 threads
       (0.84x)** — a 2-hour meeting goes from ~101 minutes of diarization to ~6. This needs a **CUDA build of torch**
       in `stt/venv`; the default `+cpu` build reports no GPU and **falls back silently**, which is why the numbers
       above are worth checking against your own run:
       ```bash
       stt/venv/bin/pip install --index-url https://download.pytorch.org/whl/cu128 \
         "torch==2.11.0+cu128" "torchaudio==2.11.0+cu128"
       ```
     - `VYSPER_DIARIZE_CPU_THREADS=8` is the measured optimum when there is no GPU (16 is *slower* — contention). It is
       deliberately separate from `VYSPER_STT_CPU_THREADS`, which stays low so live capture is not starved.
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

### LLM provider priority (Claude primary, Gemini fallback)

Every LLM-backed feature in the app — chat/skill responses, code
finalization, image/vision analysis, transcription responses, `/hoy`'s
dumping analysis — tries **Claude (Anthropic) first**, automatically
falling back to **Gemini** if Claude is unavailable, over quota/billing, or
not configured at all (`src/services/llm.service.js`). If neither is
configured, the affected call throws a clear "not configured" error instead
of failing silently.

- **Cooldowns, in both directions**: after a quota/billing-style failure
  from either provider, that provider is skipped for subsequent calls
  during a cooldown window (`ANTHROPIC_QUOTA_COOLDOWN_MS`/
  `GEMINI_QUOTA_COOLDOWN_MS`, default 10 min each) instead of retrying (and
  re-failing) it on every single request — this is what protects you from
  hammering a provider that's already hit its monthly spending cap.
- **Vision/images too**: image analysis (OCR-free screenshot capture,
  finalization with attached images) also tries Claude first — Vysper
  builds the multimodal request directly against Anthropic's Messages API
  (base64 image content blocks), not just for text.
- **Multiple Anthropic accounts**: if `ANTHROPIC_API_KEY` fails, Vysper
  tries `ANTHROPIC_FALLBACK_API_KEY` and `ANTHROPIC_SECONDARY_API_KEY` (in
  that order) before giving up on Claude and moving to Gemini.
- This priority is currently hardcoded (not a config toggle) — swapping it
  back would mean editing `src/services/llm.service.js` directly.

## ⌨️ Essential Shortcuts

### Core Functions
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + S` | Select Screen Region + OCR Analysis |
| `Alt/Option + B` | Capture image region without OCR. In programming/dsa/labelling it accumulates for later consolidation (`!!!`); in system-design/secretaria/silia it prompts for a typed/dictated instruction and sends both to Cerebro in one turn; other skills send the image with a generic prompt |
| `Alt/Option + R` | Voice Recording Toggle |
| `Alt/Option + S` | Meeting Recording Toggle (any skill) — starts/stops a long background recording and generates a final summary. See [Meeting Recording & Auto-Summary](#meeting-recording--auto-summary-any-skill) |
| `Ctrl/Cmd + 5` | Upload an existing audio file (secretaria mode only): single-pass transcription + diarization, then generate the final minuta from the text, minimizing LLM calls |
| `Ctrl/Cmd + 7` | Convert an existing plain-text transcript (secretaria mode only, `Hablante: texto` per line) to Microsoft-Teams-style format with estimated timestamps |
| `Ctrl/Cmd + 6` | Open a file in the translucent shadow window (secretaria mode only) |
| `Ctrl/Cmd + Shift + Z` | Show/Hide All Windows |
| `Ctrl/Cmd + Shift + I` / `Alt + A` | Toggle Interactive Mode |

### Navigation
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + C` | Chat Window |
| `Ctrl/Cmd + Arrow Up/Down` | Skills Selection (only if Interactive mode is on). Cycles through programming/dsa/system-design/behavioral/secretaria/silia/labelling/traductor only — Sales, Negotiation, Presentation, DevOps, and Data Science are activated from Settings (`Ctrl+Shift+X`) instead |
| `Ctrl/Cmd + ,` | Settings |

### Clipboard (stealth, no Ctrl+C/Ctrl+V keystrokes)
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + B` | Arm copy: select with the mouse; on release it copies the selection |
| `Ctrl/Cmd + Shift + V` | Paste clipboard at cursor, typed key by key (the target app sees real key events, not a `paste`); cancel with `Ctrl+Shift+L` |

On Linux/X11 the typed paste sends **keysyms that already exist in your active
keymap** (`xdotool key`), reaching accented letters through the layout's own
dead keys (`dead_acute` + `a` = `á`). This matters: `xdotool type` can only
type a character whose keysym is in the keymap, and otherwise **remaps a free
keycode on the fly** — which makes the X server broadcast `MappingNotify` to
every connected client and makes GNOME reapply the layout. On a `latam` layout
`aacute`, `eacute`, etc. are *not* in the keymap, so Spanish text used to
trigger one desktop-wide keymap reload per accent, freezing the whole desktop.
It also mistyped accented capitals (typing `ÁN` produced `áN`).

Measured on a 600-character Spanish text: **91 ms and exact text** with
keysyms, vs **3570 ms** with the old per-chunk `xdotool type`.

A character reached through a dead key is **two tokens for one character**
(`dead_acute` + `a`), and the paste is split into batches so it can report
progress and be cancelled between them. Those batches must never split such a
pair: sending the accent and its letter in two separate `xdotool` invocations
leaves the pending accent crossing from one process to the next, and
cancelling exactly there leaves it dangling, ready to combine with whatever
the user types next. Measured before the fix: pasting this README split 4
pairs, and a paste of `Áéíóú` at a small batch size produced a loose accent
followed by an unaccented letter. `batchRuns` now carries the base letter into
the same batch, and `test/paste-keysyms.test.js` locks it down by decoding the
plan back to text and comparing it against the input — including the real
`scripts/termux/*.sh` as corpus, since a single lost character there yields a
script that fails in bewildering ways.

The remaining limit is not Vysper: XTEST injects into the global input stream,
so the keyboard belongs to the paste while it runs, and the target app
translates keycode→character *when it processes the event*. Send keys faster
than the app consumes them and it drops or duplicates characters. Against a
slow sink, 4 ms/key is the floor for byte-exact text; 1-2 ms fails
occasionally. So a long paste still takes time — expect roughly 5 ms per
character — and `Ctrl+Shift+L` cancels it.

```bash
VYSPER_PASTE_KEY_DELAY_MS=4     # ms per key. Lower = faster but may drop characters
VYSPER_PASTE_BATCH_TOKENS=200   # keys per xdotool call: cancel/progress granularity
VYSPER_PASTE_TRANSLITERATE=1    # 0 keeps — … “ ” verbatim (slower, may drop them)
VYSPER_PASTE_MODE=keys          # `type` forces the old xdotool type path (diagnostics)
```

Typographic characters with no keysym in the keymap (`—` `–` `…` `“` `”` `•`,
non-breaking and zero-width spaces) are transliterated to their ASCII
equivalent so they never need a remap. Anything genuinely unrepresentable
(emoji, CJK) still goes through `xdotool type` — now a rare exception instead
of once per accent.

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

### Meeting Recording & Auto-Summary (any skill)
Long-form recording with automatic transcription and a final summary ("minuta"), independent from the normal `Alt+R` voice-command flow. Useful for recording a full meeting/call and getting a written summary afterward instead of a live AI answer per question.

**1. Press `Alt+S` from any skill.** Both *starting* and *stopping* a session work from any active skill — you don't need to switch to `secretaria` first. The recording/transcription/minuta pipeline never checks the active skill once it's running, so switching skills mid-recording (or using `Alt+R` for a normal voice command at the same time) doesn't interrupt it.

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

Consolidation time depends on meeting length and segment count (a few seconds to a couple of minutes) — the status moves through "PROCESANDO" → "FINALIZADO". **You don't have to wait for it**: as soon as the recording itself stops, `Alt+S` is free again to start a brand-new session right away — transcription/diarization/minuta for the previous one keeps running in the background. The only exception is a session armed with the **real-time** Optimización mode (see below): that one still reports "OCUPADO" until its own strategy document finishes, exactly like before — it's the one case that still shares in-memory state that a second concurrent Optimización session could step on.

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
- The minuta is generated from the **full transcript in a single LLM call** whenever it fits under `VYSPER_MEETING_FINAL_TRANSCRIPT_CHARS` (the common case) — matching what you'd get pasting the whole transcript into Claude yourself. Only if the transcript is longer than that limit does it fall back to summarizing a handful of large text blocks in sequence (each one aware of the previous block's summary) and consolidating them into one minuta — still far fewer LLM calls than one-per-5-minutes.
- Claude (Anthropic) is the primary LLM for the minuta; if it's unavailable or over quota/billing, Vysper falls back to Gemini automatically (see [LLM provider priority](#llm-provider-priority-claude-primary-gemini-fallback) below) — no separate config needed for this specific flow.
- The uploaded file is copied into the session's own `audio/` folder as soon as processing starts, instead of only remembering its original path — so if you later move, rename, or delete the original file, the session (and any later `/actualizarHablantes`/`/reconocerVozPendientes`/`/reidentificarMinutas` on it) keeps working.

Same non-blocking behavior as `Alt+S`: once a `Ctrl+5` run has read the file and kicked off processing, `Ctrl+5`/`Alt+S` are free again immediately — you don't need to wait for that file's transcription/diarization/minuta to finish before starting or uploading another one. "OCUPADO" only shows up while a session is still *actively recording* (or, for `Ctrl+5`, in the brief instant of reading the file) — never while it's just finishing up in the background.

**Resuming after a failure.** If a `Ctrl+5` run gets interrupted (app closed, diarization dependency missing, etc.), the transcription and diarization stages are checkpointed to disk (`transcripts/0001.txt` + `0001.segments.json`, `speakers/0001.json`) so they don't need to be redone. Pick the same audio file again with `Ctrl+5` and, if an unfinished session for that exact file is found under `minutas/`, you'll get a prompt to resume it instead of starting over — transcription and diarization are reused if they already succeeded (diarization is always retried if it was the one that failed, since it's cheap compared to re-transcribing), and the minuta is only regenerated if it wasn't produced yet.

**Already have a plain-text transcript from somewhere else?** `Ctrl/Cmd + 7` (secretaria mode only) opens a file picker for an existing `.txt` transcript in `Hablante: texto` format (one line per turn, no timestamps — e.g. one you already had lying around, not necessarily produced by Vysper) and converts it to the same Microsoft-Teams-style format as `transcript-teams.txt`, saved next to the original as `<archivo>-teams.txt`. Since there's no real audio to time against, timestamps are **estimated** from a ~150-words-per-minute reading pace, accumulated turn by turn from `00:00:00` — treat them as approximate, not exact. Consecutive same-speaker lines are merged into one turn (adding a period between sentences if one is missing); any label that isn't a generic `SPEAKER_NN`/`Hablante desconocido` pattern is treated as an already-identified real name and kept as-is (uppercased).

### Huellas de voz (reconocimiento de hablantes entre sesiones)

Por defecto, la diarización solo distingue *quién habló* dentro de **una**
sesión (`SPEAKER_00`, `SPEAKER_01`...) — no sabe que el `SPEAKER_00` de la
reunión de hoy es la misma persona que el `SPEAKER_01` de la de ayer. Las
huellas de voz cierran esa brecha: una vez que enrolás a alguien, cualquier
sesión futura (o pasada, con `/actualizarHablantes`) que reconozca su voz le
pone el nombre real automáticamente, sin volver a depender de que se
presente en el audio.

El store vive en `~/.Vysper/voiceprints.json` (fuera del repo, nunca se
commitea) — uno o más embeddings de voz por persona (re-enrolar a alguien ya
existente le suma otra muestra, en vez de crear una entrada nueva). El
matching (`stt/diarize.py`, similitud coseno contra
`VYSPER_VOICEPRINT_THRESHOLD`) corre automáticamente en **cada** diarización
normal de Alt+S/Ctrl+5 — si ya enrolaste a alguien, sus próximas reuniones
salen con su nombre sin hacer nada más. Un cluster que no matchea nunca se
marca solo como "desconocido" — eso es una decisión explícita de revisión
(ver `/reconocerVoz` abajo), nunca del pipeline automático de cada reunión.

Enrolar un nombre que ya existe en el store (con distinta capitalización o
acentos) se fusiona automáticamente en esa misma entrada. Un nombre que se
parece pero no es idéntico (típicamente un typo, p.ej. "Bryan" vs "Brayan"
Camilo Mosquera Mateus) **no** se fusiona solo — el chat pregunta
explícitamente "¿es la misma persona? (si/no)" antes de fusionar las huellas
(`stt/merge_voiceprints.py`, con respaldo automático del store antes de
escribir), para no arriesgarse a mezclar a dos personas distintas por una
coincidencia de nombre.

**`/reconocerVoz <ruta a una carpeta de sesion>`** (solo secretaria) — el
enrollment en sí: toma una sesión ya procesada por Alt+S/Ctrl+5 (con
`final/full-audio.wav` y su diarización), y por cada hablante sin huella
conocida, abre un clip de audio suyo con el reproductor del sistema y
pregunta su nombre en el chat, uno a la vez:

```
/reconocerVoz minutas/reunion-2026-08-13-14-01-41
```
```
Hablante SPEAKER_01 (1835.2s, 587 segmentos). Se abrio el clip en tu reproductor: ...
¿Nombre de esta persona? (responde "omitir" para saltarla)
```

Responder con un nombre lo enrola (guarda su huella y actualiza esa sesión
con el nombre real); responder "omitir" lo marca `UNKNOWN_NN` — revisado,
pero no identificado, con el mejor score encontrado guardado para
referencia — en vez de dejarlo como un `SPEAKER_NN` genérico sin rastro. Al
terminar toda la cola, la sesión se refresca automáticamente
(`transcript-hablantes.txt`/`transcript-teams.txt` regenerados, `minuta.md`
actualizado si existía) y, si quedó algún `UNKNOWN`, el chat pregunta si
querés intentar con ellos ya mismo — respondé "si" y continúa directo sin
tener que escribir otro comando.

**`/reconocerVozPendientes <ruta a una carpeta de sesion>`** (solo
secretaria) — mismo flujo, pero acotado a los hablantes sin identificar: los
que una corrida anterior ya dejó marcados `UNKNOWN_NN` **y** los que nunca
pasaron por ninguna revisión (siguen como `SPEAKER_NN` crudo, típico de una
sesión recién grabada que todavía no pasó por `/actualizarHablantes` ni por
este mismo comando) — sin volver a ofrecer los que ya tienen nombre. Útil
para retomar más tarde (por ejemplo, después de enrolar a más gente) sin
repasar toda la sesión de nuevo.

**`/actualizarHablantes <ruta a una carpeta de sesion>`** (solo secretaria)
— para sesiones **viejas**: re-corre solo el matching contra el store actual
(sin re-clusterizar, la parte lenta de diarizar) y regenera los transcripts
+ minuta de esa sesión con cualquier nombre que se haya podido resolver
desde que se procesó por primera vez. Regenerar `minuta.md` pasa por una
llamada a LLM (sustituye nombres en la minuta ya generada, no la reescribe
de cero) — si el proveedor principal falla, cae a Gemini como respaldo (ver
sección de LLM más abajo); no rompe el resto del comando si igual falla, solo
deja `minuta.md` como estaba.

```
/actualizarHablantes minutas/reunion-2026-07-20-09-00-00
```

**`/reidentificarMinutas --carpeta <ruta> | --sesion <ruta>`** (solo
secretaria) — la versión en lote y **sin LLM** de lo anterior
(`stt/reidentify_minutas.py`), para reprocesar muchas sesiones ya
identificadas a mano sin gastar cuota de LLM en algo que ya se sabe: re-matchea
cada sesión contra el store actual (igual que `/actualizarHablantes`) y
sustituye el texto de las etiquetas genéricas por el nombre real directo en
`transcript-hablantes.txt`/`transcript-teams.txt` (reemplazo exacto, anclado
a inicio de línea) y, en `minuta.md`, con un reemplazo de texto best-effort
(sin garantía de cobertura total, porque ahí los nombres los escribió un LLM
al generar la minuta original — puede haber redacciones que no calcen).
`--carpeta` recorre recursivamente (puede tardar, hasta 30 min de timeout);
`--sesion` apunta a una sola carpeta.

```
/reidentificarMinutas --carpeta /media/san/Miscosas6/Creai/minutas
/reidentificarMinutas --sesion "minutas/reunion-2026-07-20-09-00-00"
```

**Configuración** (`.env`):
```bash
VYSPER_VOICEPRINT_MODEL=pyannote/embedding    # requiere aceptar sus terminos en Hugging Face, igual que el modelo de diarizacion
VYSPER_VOICEPRINT_THRESHOLD=0.60              # similitud coseno minima para considerar un match -- ver nota abajo
VYSPER_VOICEPRINTS_PATH=~/.Vysper/voiceprints.json
```

`VYSPER_VOICEPRINT_THRESHOLD=0.60` (default) viene de auditar coincidencias
reales en decenas de sesiones: un match genuino cae consistentemente entre
0.60 y 0.79 (la misma persona puede scorear 0.62 en una sesión y 0.74 en
otra), mientras que los emparejamientos espurios se concentran debajo de
~0.55. Con 0.75 quedaban afuera identificaciones correctas sistemáticamente.
Bajarlo mucho más (por debajo de ~0.55) empieza a traer falsos positivos —
en pruebas, una sola persona llegó a "matchear" 3 clusters distintos de la
misma reunión al mismo tiempo, algo imposible.

### Modo Optimización (`Alt+O`) — tiempo real vs. posterior

`Alt+O` arma el análisis de optimización para la **próxima** sesión de
`Alt+S` — hay que armarlo antes de empezar a grabar, porque el modo tiempo
real necesita fragmentos cortos desde el arranque (no se puede activar
después). Al presionarlo (sin una sesión ya armada), pregunta el modo:

- **Tiempo real**: sugiere preguntas durante la reunión, en fragmentos de
  `VYSPER_OPTIMIZACION_SEGMENT_SEC`s (default `15`) y con
  `VYSPER_OPTIMIZACION_SILENCE_SEC`s de silencio (default `6`) como gatillo —
  igual que siempre. `VYSPER_OPTIMIZACION_CONTEXT_CHARS` (default `8000`)
  limita cuánto de la conversación acumulada viaja en cada sugerencia: subirlo
  da más contexto por sugerencia y cuesta más tokens en cada fragmento, que en
  tiempo real se pagan cada 15 s. Guarda su resumen/sugerencias en memoria compartida
  (no por sesión), así que esta es la única sesión que **sigue bloqueando**
  `Alt+S` hasta que termina de generar su documento final — ver la nota en
  [Meeting Recording & Auto-Summary](#meeting-recording--auto-summary-any-skill).
- **Posterior**: no interviene en vivo — usa el fragmento normal, y al
  terminar la sesión genera automáticamente `final/optimizacion-estrategia.md`
  a partir de la transcripción ya terminada, sin pedir nada más y sin
  bloquear la siguiente sesión.

**`/optimiza <ruta a una carpeta de sesion>`** (solo **system-design**) —
corre manualmente el mismo análisis "posterior" sobre cualquier sesión ya
terminada (con o sin Optimización armada en su momento):

```
/optimiza minutas/reunion-2026-08-13-14-01-41
```

## Acceso remoto por Tailscale (audio desde el celular)

`vys.sh --server` habilita un servidor HTTP embebido en la propia app
Electron (`stt/http_server.js`) para subir audio desde el celular (por
ejemplo notas de voz de WhatsApp en formato `.opus`) y procesarlo con el
mismo pipeline que usan Ctrl+4 (transcribir), Ctrl+5 (minuta) y Alt+9
(síntesis de optimización) — no hay un servicio Python separado ni se corre
`setup_vysper_stt.sh` por archivo: la lógica de transcripción/diarización/
LLM ya vive dentro de la app y este servidor la llama directamente.

Solo escucha en `0.0.0.0:8080`, pensado para ser alcanzado exclusivamente a
través de la IP de Tailscale del equipo (nunca expuesto a internet).

### Configuración

En `Vysper/.env`:

```bash
VYSPER_HTTP_USER=tu_usuario
VYSPER_HTTP_PASSWORD=una_contrasena_fuerte
# Opcionales (tienen default):
# VYSPER_HTTP_PORT=8080
# VYSPER_HTTP_UPLOAD_DIR=/tmp/vysper_audio
# VYSPER_HTTP_LOG=/media/san/Miscosas6/log/vysper_http.log
# VYSPER_HTTP_MAX_MB=200
```

Requisitos previos (una sola vez):

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up          # abre el link que imprime y autentica desde el navegador
tailscale ip -4             # esta es la IP fija del equipo dentro del tailnet
```

Instala Tailscale también en el celular (misma cuenta) para poder alcanzar
esa IP desde la red móvil sin abrir nada a internet. Para que la IP nunca
cambie, desactiva "key expiry" para este equipo en
https://login.tailscale.com/admin/machines.

### Arrancar

```bash
/home/san/vys.sh --server
```

Si Tailscale no está instalado o no está activo, se muestra una advertencia
y Vysper arranca igual en modo local (sin el servidor HTTP). Si el puerto
8080 ya está ocupado, la app sigue funcionando normalmente y el error queda
en el log (`VYSPER_HTTP_LOG`).

### Uso (ejemplos con curl)

Subir un archivo de audio (solo se aceptan `.opus`, `.ogg`, `.m4a`, `.wav`;
límite 200MB por defecto):

```bash
curl -u tu_usuario:una_contrasena_fuerte \
  -F "archivo=@nota-de-voz.opus" \
  http://100.x.y.z:8080/upload
# {"ok":true,"archivo":"1735599999999-nota-de-voz.opus","size":48213}
```

Usa el `archivo` que devuelve `/upload` (el servidor le agrega un prefijo
para evitar colisiones) para pedir que se procese:

```bash
# Transcripción simple
curl -u tu_usuario:una_contrasena_fuerte \
  -H "Content-Type: application/json" \
  -d '{"comando": "transcribir", "archivo": "1735599999999-nota-de-voz.opus"}' \
  http://100.x.y.z:8080/process

# Minuta (transcribe + diariza + genera minuta.md, igual que Ctrl+5)
curl -u tu_usuario:una_contrasena_fuerte \
  -H "Content-Type: application/json" \
  -d '{"comando": "minuta", "archivo": "1735599999999-nota-de-voz.opus"}' \
  http://100.x.y.z:8080/process

# Optimizacion (sintesis de estrategia sobre el audio completo, igual que Alt+9)
curl -u tu_usuario:una_contrasena_fuerte \
  -H "Content-Type: application/json" \
  -d '{"comando": "optimizar", "archivo": "1735599999999-nota-de-voz.opus"}' \
  http://100.x.y.z:8080/process
```

La respuesta es JSON: `{"ok": true, "resultado": "<texto>", ...}` en éxito,
o `{"ok": false, "error": "..."}` con status 400/401/413/500 según el caso
(archivo/comando inválido, credenciales inválidas, archivo demasiado grande,
o fallo durante la transcripción/generación).

### Notas

- El comando `optimizar` no corresponde 1:1 a la entrevista en vivo de Alt+O
  (que vigila silencios en tiempo real): sobre un audio ya grabado corre la
  misma síntesis retroactiva de Alt+9 (áreas de oportunidad + estrategia)
  tratando el audio completo como una sesión ya terminada.
- Cada archivo procesado crea una sesión nueva en `minutas/` (mismo formato
  que Ctrl+5), con `final/transcript-full.txt`, `final/minuta.md` y, si el
  comando fue `optimizar`, `final/optimizacion-estrategia.md`.
- La conversión de formato (a WAV 16kHz mono 16-bit) se hace con `ffmpeg`
  antes de transcribir; requiere tenerlo instalado (`sudo apt install
  ffmpeg`, ya lo instala `setup_vysper_stt.sh`).

### Comandos de chat desde el celular (`/comando`)

Además del pipeline de audio, `POST /comando` manda un mensaje de texto por
el mismo camino que la caja de chat de la app — sirve para disparar
comandos como `/actualizaRag`, `/hoy`, `/optimiza <ruta>`, `/silia daily`,
etc. sin escribirlos en la PC:

```bash
curl -u TU_USUARIO:TU_PASSWORD \
  -H "Content-Type: application/json" \
  -d '{"comando": "/actualizaRag"}' \
  http://100.83.125.94:8080/comando
# {"ok":true,"comando":"/actualizaRag","resultado":"<texto de la respuesta>"}
```

Importante:

- El comando se ejecuta con el **modo/skill activo en ese momento en la PC**
  (`secretaria`, `silia`, `system-design`, etc.) — igual que si lo hubieras
  escrito ahí mismo. Comandos como `/actualizaRag` o `/hoy` solo responden
  si la app ya está en uno de los modos que los habilita; si no, no pasa
  nada visible.
- Para no depender de revisar manualmente el modo activo en la PC, usa
  `/modo <skill>` para cambiarlo primero por control remoto — a diferencia
  de los demás comandos, `/modo` se reconoce sin importar el skill activo:

  ```bash
  curl -u TU_USUARIO:TU_PASSWORD \
    -H "Content-Type: application/json" \
    -d '{"comando": "/modo silia"}' \
    http://100.83.125.94:8080/comando
  # {"ok":true,"comando":"/modo silia","resultado":"Modo cambiado: system-design -> silia"}
  ```

  Skills válidos: `programming`, `dsa`, `system-design`, `behavioral`,
  `secretaria`, `silia`, `labelling`, `traductor`. Un skill desconocido
  responde con `{"ok":false,"error":"Skill desconocido: ..."}` en vez de
  fallar en silencio.
- **Script de referencia para Termux**: [scripts/termux/revisar-pr.sh](scripts/termux/revisar-pr.sh)
  corre `/modo silia` y después `/revisar` sin escribir nada del comando a
  mano — pensado para usarse manejando: sin argumentos muestra un menú de
  elección rápida (repo, número de PR, profundidad, `--diablo`) donde cada
  paso es un solo tap de número (ENTER solo toma la opción marcada con
  `*`; el número de PR es el único que sí necesita Enter). La opción por
  defecto de profundidad es la **auditoría completa** (matriz + checklist de
  12 dimensiones + OpenSpec/Jira); `basico` sigue en el menú, pero hay que
  elegirlo — tenerlo como default hacía que la revisión más fácil de
  disparar desde el celular fuera también la más débil. También admite
  modo no interactivo con argumentos (`./revisar-pr.sh agent:42 --profundo`)
  para un widget/atajo de Termux con el texto ya armado. Requiere `python3`
  (Termux no lo trae por defecto — `pkg install python -y`) para armar y
  parsear el JSON de forma segura.
- **Aprobar desde el celular**: [scripts/termux/aprobar-pr.sh](scripts/termux/aprobar-pr.sh)
  hace lo mismo para `/aprobar-pr`. Si el gate bloquea por checks no
  requeridos en rojo, ofrece **un solo tap** para reintentar ignorando
  exactamente esos (nunca el flag en bloque), y el reintento es uno solo:
  si vuelve a bloquear, sale. También resuelve los **dos envíos** que exige
  el flujo: el primero aprueba y corre el merge gate (las pruebas sobre
  `base + head` mergeados, que tardan de verdad), muestra la evidencia, y
  recién entonces pregunta; el segundo manda el `si`. Nunca manda la
  confirmación solo, ni siquiera en modo no interactivo.
- Es seguro usarlo aunque haya una grabación en vivo (Alt+S/Alt+O) corriendo
  al mismo tiempo en la PC: la respuesta se correlaciona con el comando que
  la originó (via `AsyncLocalStorage`, ver `runChatCommandHeadless` en
  `main.js`), así que una notificación incremental de esa sesión nunca se
  confunde con la respuesta real de tu comando.
- Un comando que deja una confirmación pendiente (sí/no) se puede resolver
  mandando un segundo `/comando` con `"sí"` o `"no"` como texto — es la
  misma conversación, solo que por HTTP en vez del chat local.

### Reunión en vivo desde el celular por segmentos (`/stream/*`)

Para capturar una reunión **mientras ocurre** (en vez de grabarla entera y
subirla al final), el celular graba clips cortos (~30s) y los va subiendo a
medida que se generan. No es streaming de audio en vivo por WebSocket — cada
segmento es un archivo completo que sube por HTTP, con reintento si falla —
pero permite empezar a transcribir sin esperar a que termine la reunión, y
reutiliza el mismo pipeline que usa Alt+S para sesiones largas (transcribe
cada fragmento al vuelo; al cerrar, concatena todo el audio, diariza **una
sola vez** sobre la reunión completa —no por fragmento, para no perder
consistencia de hablantes— y genera la minuta).

**Flujo:**

```bash
# 1. Iniciar el stream
curl -u TU_USUARIO:TU_PASSWORD -X POST \
  -H "Content-Type: application/json" -d '{"segmentSec": 30}' \
  http://100.83.125.94:8080/stream/start
# {"ok":true,"streamId":"a1b2c3d4","sessionDir":"minutas/reunion-..."}

# 2. Subir cada segmento (con su numero de secuencia; el orden de llegada
#    no importa, se ensambla siempre por "seq")
curl -u TU_USUARIO:TU_PASSWORD -X POST \
  -F "archivo=@segmento-0001.m4a" -F "seq=1" -F "durationSec=30.1" \
  http://100.83.125.94:8080/stream/a1b2c3d4/segmento
# {"ok":true,"seq":1,"status":"transcrito"}

# 3. (Opcional) consultar progreso sin esperar a que termine la reunion
curl -u TU_USUARIO:TU_PASSWORD http://100.83.125.94:8080/stream/a1b2c3d4/estado

# 4. Cerrar la reunion: concatena, diariza una vez y genera la minuta
curl -u TU_USUARIO:TU_PASSWORD -X POST \
  -H "Content-Type: application/json" -d '{"graceMs": 20000}' \
  http://100.83.125.94:8080/stream/a1b2c3d4/finish
# {"ok":true,"resultado":"<minuta.md>","sessionDir":"...","segmentosPerdidos":[]}
```

**Script de referencia para Termux**: [scripts/termux/stream-meeting.sh](scripts/termux/stream-meeting.sh)
graba en loop con `termux-microphone-record`, sube cada segmento con
reintento, mantiene `termux-wake-lock` activo, y muestra una notificación
persistente con un botón "Terminar reunión" — tocarlo (o Ctrl+C en la
terminal) dispara el mismo cierre: para la grabación, llama `/finish`, guarda
la minuta en `~/vysper-stream/` y te notifica cuando está lista. Requiere el
paquete `termux-api` (`pkg install termux-api`, más la app Termux:API) y
`ffmpeg` (`pkg install ffmpeg`, para medir la duración de cada segmento).
Antes de correrlo, exportá `VYSPER_HTTP_USER`/`VYSPER_HTTP_PASSWORD` (o
editá el script) y ajustá `VYSPER_HOST` a tu IP de Tailscale.

**Qué pasa si un segmento se pierde**: el cliente reintenta el mismo `seq`
hasta 5 veces (configurable). Si de verdad no llega, `/finish` lo marca como
hueco en la minuta final (`[HUECO: segmento N no disponible...]`) en vez de
omitirlo en silencio — es una nota de que ese tramo de audio no se pudo
recuperar, no que el sistema haya "arreglado" la pérdida.

**Pasar los scripts al celular** (`GET /scripts`): `GET /scripts` lista los
scripts de [scripts/termux/](scripts/termux/) con su tamaño y su md5, y
`GET /scripts/<nombre>` baja uno, detrás del mismo Basic Auth que el resto.

La instalación va por [scripts/termux/act.sh](scripts/termux/act.sh), que se
instala como el comando `act` y deja los scripts en `$PREFIX/bin` con nombres
de **una sola palabra** — el celular se usa manejando, así que el comando tiene
que poder escribirse de un tirón y sin rutas:

| Comando | Script | Qué hace |
|---------|--------|----------|
| `sube` | `upload-audio.sh` | Sube un audio ya grabado y genera la minuta |
| `pr` | `revisar-pr.sh` | `/modo silia` + `/revisar` sobre un PR |
| `apr` | `aprobar-pr.sh` | `/modo silia` + `/aprobar-pr`: corre el merge gate y **después** pide confirmación |
| `act` | `act.sh` | Actualiza todos (se actualiza solo) |

```bash
# Una sola vez, para instalarlos todos. `act` se instala a si mismo, asi que
# basta con bajarlo a cualquier parte y correrlo con bash: no hace falta
# chmod, ni $PREFIX en la linea, ni que el shebang resuelva.
curl -fsS -u sanVysper:tu_clave http://100.83.125.94:8080/scripts/act.sh -o act && bash act
```

Ojo: `act` no existe hasta correr eso una vez — antes de eso Termux responde
`No command act found, did you mean: ...`, que se lee como un fallo del atajo
cuando en realidad es que nunca se instaló.

`act` baja cada script a un temporal y lo instala **solo** si su md5 coincide
con el que publica `GET /scripts`; si no, conserva la versión anterior. Esa
verificación es la que importa: comprobar shebang y `bash -n` no alcanza,
porque un script cortado por abajo en una frontera limpia (los primeros KB son
comentarios y asignaciones) pasa las dos cosas y se instalaría como bueno.
El `-f` de curl es igual de necesario — sin él, el cuerpo de un 401 se guarda
como si fuera el script.

Existe para no pegar el script a mano: un pegado truncado deja un archivo que
falla de formas desconcertantes (se vio uno que arrancaba a mitad de
`curl_with_retries`, con `local: can only be used in a function`,
`$CONNECT_TIMEOUT` vacío y `sleep: missing operand`) y el script **no puede
detectarlo por sí mismo**, porque lo que falta es justamente el encabezado
donde iría cualquier chequeo. El nombre pedido se valida por igualdad exacta
contra el contenido real del directorio, así que no sirve para leer nada
fuera de `scripts/termux/`.

**Para un archivo de audio ya grabado** (no una reunión en vivo), el script
[scripts/termux/upload-audio.sh](scripts/termux/upload-audio.sh) usa el mismo
pipeline de `/stream/*` como un solo segmento: te pide copiar el archivo a
`/sdcard/Download/vysper_temp/`, lo sube, y hace exactamente lo mismo que
Alt+S en la PC (transcribe + diariza + genera la minuta) sin preguntar nada
más — el servidor no distingue "transcribir" de "minuta" para este endpoint.

Si la duración supera los 20 minutos (`CONVERT_THRESHOLD_SEC`) **o** el
archivo pesa más de 100MB (`CONVERT_THRESHOLD_BYTES`), **comprime
automáticamente a Opus 16kHz mono 32kbps antes de subir** — de sobra para
voz, y el servidor igual reconvierte todo a 16kHz mono para transcribir
(`convertToWav`), así que no se pierde nada que Whisper fuera a usar de
todos modos. El criterio de tamaño existe para el caso en que `ffprobe` no
está instalado y la duración se lee como `0`: sin él, un `.wav` crudo de
horas pasaba derecho a la subida. Opus a 32kbps son ~22MB por hora, así
que una sesión de 8h queda en ~180MB, muy por debajo del límite del
servidor (`VYSPER_HTTP_MAX_MB`, 1000MB por defecto en `.env`); la misma
sesión sin comprimir serían varios GB. La compresión en sí es muy rápida
(~350x tiempo real con `libopus`: una sesión de 2h tarda ~20s). Requiere
`ffmpeg` (`pkg install ffmpeg -y`, trae también `ffprobe` para medir la
duración). También requiere `python3` (`pkg install python -y`).

Si la compresión falla, el script sube el original **sólo si es menor a
500MB** (`MAX_UNCOMPRESSED_BYTES`); por encima de eso aborta de inmediato
con el error de `ffmpeg` y el comando para convertir a mano, en vez de
gastar más de una hora de subida móvil en un archivo que el servidor va a
rechazar con 413 igual. En ese aborto **no borra** el archivo copiado, para
no obligarte a pasar otra vez GB al celular: al reintentar, el script te
avisa que ya hay un archivo ahí y basta con ENTER para reusarlo.

**El POST del segmento no responde hasta haber transcrito**: el handler de
`/stream/:id/segmento` corre `ingestSecretariaStreamSegment` *dentro* de la
request, así que la respuesta llega recién cuando el audio está transcrito.
Medido en esta instalación: 625 s de audio → 327 s de proceso, y 4433 s →
1944 s, o sea ~0,5× tiempo real. El timeout del cliente tiene que cubrir
**subida + transcripción**; modelar solo la transferencia daba 120 s para esos
dos casos y el cliente abandonaba con `000` mucho antes de que el servidor
contestara.

Peor que abandonar: reintentaba. Y como un `000` no distingue "la subida se
cortó" de "el servidor está transcribiendo", el reintento le hacía repetir el
trabajo desde cero — se vio el mismo `seq=1` transcrito dos y tres veces
(`attempts: 3` en el `stream-manifest.json` de la sesión), con 32 minutos
duplicados. `upload-audio.sh` ya no adivina: ante un `000` consulta
`/stream/:id/estado`, que es quien sabe si el segmento llegó. Si el servidor lo
tiene, espera sondeando hasta que quede `transcrito` y sigue al `/finish`
normal; si no lo tiene, ahí sí resube. (`%{size_upload}` de curl **no** sirve
para distinguirlos: cuenta lo que curl volcó al socket, no lo que el servidor
leyó, y el cuerpo multipart es mayor que el archivo, así que reporta "subida
completa" incluso cuando la conexión se cortó a mitad.)

**Timeout de subida en el servidor**: Node fija `requestTimeout` en 5 minutos
por defecto — el tope para recibir el *cuerpo* completo de una request. Subir
una reunión desde el celular tarda más que eso, y al vencerse Node responde
**408** y corta el socket (en el log del servidor aparece como `Segmento
rechazado {"error":"Request aborted"}`, que parece un problema de red pero no
lo es). El servidor lo sube a 2h vía `VYSPER_HTTP_REQUEST_TIMEOUT_MS`. El
valor va en `http.createServer({ requestTimeout })`: asignarlo después de
construir el servidor (`server.requestTimeout = ...` sobre lo que devuelve
`app.listen()`) **no tiene ningún efecto**, Node lo lee al crearlo.

**Conflicto con Alt+O**: `/stream/start` responde 409 si hay una entrevista
de Optimización (Alt+O) activa en ese momento en la PC — evita mezclar el
texto de dos sesiones distintas, ya que esa bandera es global a la app, no
por sesión.

## `/contexto` (modo dsa)

```
/contexto /ruta/a/la/carpeta
```

Carga el contenido de los archivos de esa carpeta y lo usa como **referencia
en cada respuesta final del modo `dsa`**, hasta que cierres la app o vuelvas a
correr `/contexto` con otra ruta. Responde con la lista de archivos que
efectivamente cargó.

Si la carpeta no entra en el límite de contexto, **lo dice** (`⚠️ Se truncó:
hay más archivos de los que caben`) en vez de recortar en silencio — lo que
importa aquí es saber sobre qué está respondiendo, no que la carga "funcione".

Solo se reconoce en modo `dsa`: en cualquier otro modo el texto sigue su
camino normal.

## Modo Silia (líder de proyecto interino)

El modo **Silia** delega el razonamiento a [Cerebro](/media/san/Miscosas6/Desarrollo/Cerebro),
un orquestador Python que combina Claude (Anthropic) con Jira, Notion, GitHub y
un RAG de transcripciones (LightRAG + Sandra RAG). A diferencia de los demás
modos de Vysper, no llama a Gemini/Anthropic directamente desde acá: cada
mensaje se pasa a `python -m cerebro.cli` como subproceso
(`src/services/cerebro.service.js`) y la respuesta JSON (`summary`,
`citations`, `action_items`) se muestra en el chat. Cerebro tiene su propia
cadena de fallback de LLM independiente de la de Vysper (Claude/DeepSeek →
OpenRouter → un modelo local via Ollama como último recurso sin costo) —
ver [`LLMRouter` en el README de Cerebro](/media/san/Miscosas6/Desarrollo/Cerebro/README.md#motor-de-razonamiento-claude--anthropic)
si algún comando de Silia falla con "No se pudo generar una respuesta
final: fallo la llamada al modelo" (típicamente ambas cuentas sin
crédito).

**Activación:** Settings → Active Skill → `Silia (Lider de Proyecto)`.

**Uso normal (preguntas libres):** cualquier duda de un stakeholder o del
equipo — "¿cómo va el sprint?", "¿por qué se decidió usar X en el módulo Y?" —
se responde consultando Jira/GitHub (estado, cronograma) o Notion/RAG
(decisiones, contexto histórico), con riesgos de cronograma señalados
proactivamente cuando aplica.

**`/silia daily [identificador]`** — resumen diario en dos partes: (1) las
actividades reales que `[identificador]` realizó el **último día hábil**
(ayer, o el viernes si hoy es lunes), sintetizadas en bullets de
logro/descripción/siguientes pasos a partir de Jira (tickets
creados/actualizados ese día), GitHub (PRs mergeados ese día), Notion
(búsqueda por nombre) y las minutas locales de sesiones Alt+S de Vysper de
ese mismo día (la única fuente disponible para "actividad de Claude/Vysper" —
no hay integración con el historial de conversaciones de Claude.ai/Claude
Code); y (2) el checkpoint de riesgo original sobre el estado *abierto*
actual (tickets vencidos, PRs bloqueados) — ninguna de las dos partes
reemplaza a la otra. `[identificador]` es opcional; Cerebro
(`identifier_resolver.py`) decide qué es:

- **Sin argumento** → usa `VYSPER_SILIA_ASSIGNEE`.
- **Un alias de equipo/célula** configurado en `equiv.yaml` (raíz de
  Cerebro) → se expande a la lista de emails de todos los miembros, y el
  checkpoint consulta a los tickets de *todo el equipo* (`assignee in
  (...)` en Jira). Ver `equiv.yaml` para el formato — cada clave es un
  alias (p. ej. `agentes`) y su valor la lista de identificadores.
- **Un email** → se usa tal cual como assignee.
- **Un nombre de persona** (p. ej. `Sandy Reyes`) → se busca en Jira
  (`user/search`) y se resuelve a su accountId real. Si la búsqueda
  encuentra más de una coincidencia (Jira busca por substring: "Sandy
  Reyes" también puede traer a alguien más con apellido "Reyes"), Silia
  prefiere automáticamente un match exacto de nombre; si sigue habiendo
  ambigüedad, devuelve un error listando los candidatos en vez de adivinar.
- **Una clave de Jira** (p. ej. `LAGE-143`) → se resuelve consultando ese
  ticket y usando su assignee.
- **Un PR de GitHub** (URL completa o `owner/repo#123`; un número
  desnudo también funciona si está configurado `GITHUB_DEFAULT_REPO` en
  Cerebro) → se busca una clave de Jira mencionada en el título/descripción
  del PR y se usa el assignee de ese ticket.
- **Un commit de GitHub** (URL completa o `owner/repo@sha`) → mismo
  mecanismo, buscando la clave de Jira en el mensaje del commit
  (convención "smart commit": `LAGE-143 arregla timeout`).
- Si un PR/commit no menciona ningún ticket, o un ticket de Jira no tiene
  assignee, Silia responde con un error claro en vez de adivinar.
- **Cualquier otro texto** (un username) se pasa literal, igual que antes
  de que existiera esta resolución.

**Ejemplos:**
```
/silia daily
```
```
/silia daily agentes
```
```
/silia daily sandrareyes@slia.com
```
```
/silia daily Sandy Reyes
```
```
/silia daily LAGE-143
```
```
/silia daily https://github.com/org/repo/pull/123
```

**`/silia retro [--dominio <alias>] [sprint_ref]`** — retrospectiva
estructurada de un sprint: trae el sprint via la Agile API de Jira
(nunca con JQL libre), calcula las métricas en Python (nunca las inventa
el LLM), suma notas de reunión relevantes de Notion/RAG e incidentes del
SMC correlacionados por fecha, y cierra con una síntesis del LLM sólo
para la parte narrativa (resumen/riesgos/recomendaciones). Las
recomendaciones quedan como propuestas pendientes en el sistema de mejora
continua — revisalas después con `/optimizaciones`.

- **`--dominio <alias>`** (opcional) — elige el equipo/proyecto para esta
  corrida, resolviendo el alias contra `equiv.yaml` (sección `dominios:`,
  raíz de Cerebro), igual que `/hoy <dominio>`. Si se omite, usa el
  proyecto default configurado en `VYSPER_SILIA_DEFAULT_PROJECT` (por
  default, si no está seteada, el equipo "agentes"/`AGE`).
- **`sprint_ref`** (opcional) — un id de sprint, un número simple, o un
  nombre/substring (p. ej. `"Sprint 7"`); si se omite, usa el sprint
  activo (o el cerrado más reciente si no hay ninguno activo). ⚠️ Un
  número suelto como `7` también se compara como substring contra el
  nombre del sprint — si tu proyecto tiene sprints como `"Sprint 7"` y
  `"Sprint 17"` a la vez, escribí el nombre completo para evitar
  ambigüedad.
- **`/silia retro [--dominio <alias>] comparar <sprint_a> <sprint_b>`** —
  diff aritmético (sin LLM) entre dos retrospectivas ya generadas para ese
  proyecto; ambos sprints deben haberse corrido antes con `/silia retro`.

**Ejemplos:**
```
/silia retro 7
```
```
/silia retro --dominio agentes 7
```
```
/silia retro
```
```
/silia retro comparar 5 6
```
```
/silia retro --dominio ventas comparar 5 6
```

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

**`/optimizaciones`** (alias **`/propuestas`**) — lista las propuestas de
optimización generadas por el Sistema de Mejora Continua (SMC) de Cerebro
(`cerebro/smc/`), que analiza automáticamente incidentes recurrentes,
bloqueos repetidos y pasos lentos del pipeline. Cada propuesta se muestra
con su id, prioridad, problema detectado, propuesta y el impacto estimado.

**`/propuesta <id> aceptar|rechazar|posponer [motivo]`** — registra la
decisión del equipo sobre una propuesta puntual (`<id>` es el número que
muestra `/optimizaciones`). El motivo es opcional salvo que quieras dejar
constancia de por qué se rechazó o pospuso.

**Ejemplos:**
```
/optimizaciones
```
```
/propuesta 3 aceptar
```
```
/propuesta 5 rechazar no aplica a nuestro stack actual
```
```
/propuesta 2 posponer revisar despues del sprint
```

**`/revisar <url-pr> [--basico|--profundo|--arq|--security] [--diablo] [--merge] [--release]`**
— pipeline fijo de revisión de PR: clona el repo por SSH en aislado
(`git@<PR_REVIEW_GIT_SSH_HOST>:owner/repo.git`, nunca ejecuta código del
PR) y verifica conflictos de merge contra el branch base real del PR
(normalmente `develop`) **y** contra tu propia rama
(`PR_REVIEW_REFERENCE_BRANCH`, default `main`) — un conflicto contra
cualquiera de los dos bloquea la aprobación sin importar el resto. También
trae los checks de CI del commit (GitHub Checks API) y exige que **más del
90%** de los ya terminados estén en verde (`success`/`neutral`/`skipped`);
uno todavía en `queued`/`in_progress` no cuenta ni a favor ni en contra, y
si no hay ningún check terminado bloquea por falta de evidencia
(fail-closed). El reporte del chat siempre muestra el % de checks pasando,
haya bloqueado o no.

- **Sin flags** (modo `silia`, el default): la **auditoría completa**, que es
  el algoritmo de la skill `silia-review-pr` del marketplace
  (`Silia-mx/silia-claude-marketplace`) adaptado a este pipeline. Corre
  tres "lentes", igual que la skill despacha tres subagentes en paralelo:
  1. **Matriz de cumplimiento** (tests 30%/min 80%, documentación 20%/min
     100%, deuda técnica 20%/min 90%, AC de Jira 30%/min 100% — cada
     criterio con score y nivel de confianza del LLM; Python decide la
     aprobación, nunca el LLM).
  2. **Checklist de calidad de 12 dimensiones** (estilo, funciones, datos e
     inmutabilidad, clases, manejo de errores, arquitectura, testing,
     imports, documentación y antipatterns), del que salen **hallazgos con
     severidad** `blocker` / `major` / `minor` / `suggestion`.
  3. **OpenSpec + trazabilidad a Jira**, resuelto en Python sobre el clon
     que ya se hizo para el merge-check (nada que un LLM pueda alucinar):
     un change activo con tareas sin cerrar es `blocker`; un change
     archivado antes del merge, `major`; un PR sin ticket referenciado,
     `major`. Los `tasks*.md` marcados con `<!-- openspec:non-gating -->`
     no cuentan.

  **Las rutas que cita un hallazgo se verifican contra el PR.** Un `major`
  real citó `pipeline/tests/test_engine_secrets.py`: el archivo no existe, el
  cambio no estaba en el delta del PR y el test que pedía ya existía. Un
  `major` con severidad y arreglo sugerido hace que alguien abra ticket, lo
  estime y lo trabaje — eso no es ruido, es trabajo **fabricado**. Ahora hay
  dos niveles: una ruta que **no existe** en el árbol baja a `suggestion` y
  sale marcada con `⚠️ [ruta no encontrada en el PR]`; una que **existe pero
  el PR no toca** se **topa en `minor`** (la variante frecuente: archivo
  real, PR equivocado). Se topa y no se descarta porque "cambiaste A y
  olvidaste B" es legítimo y B por definición no está en el diff — `minor`
  conserva la señal y le quita el poder de condicionar el veredicto solo.
  Sin snapshot del árbol no se degrada nada: no se puede *probar* una
  ausencia.

  **En el reporte, `❌` quedó reservado a lo que de verdad bloquea.** El paso
  "Merge con tu rama (main)" nunca bloquea —solo el merge contra la rama base
  lo hace— y aparecía con `❌` y 43 rutas detrás en *todos* los PRs del repo,
  seguido de "no afecta la evaluación". Un ❌ decorativo en un reporte de
  auditoría entrena justo el reflejo de ignorarlos: ahora es `⚠️`, y las
  listas de archivos se colapsan a tres rutas + "y N mas".

  Los dos lentes de LLM van en **paralelo**. El veredicto se deriva
  mecánicamente de la severidad más alta (el mapa `graduated` de la skill):
  un `blocker` bloquea, un `major` condiciona, `minor`/`suggestion` se
  reportan pero no retienen la aprobación. Y se combina con el veredicto de
  la matriz tomando siempre **el peor de los dos**, así que un hallazgo solo
  puede empeorar el resultado, nunca rescatar un PR que la matriz ya
  condicionó. A partir de la segunda corrida el reporte abre con una tabla
  de **ronda anterior**: ningún hallazgo `blocker`/`major`/`minor` de la
  ronda previa desaparece sin decir si se resolvió.
- **`--basico`** (PRs triviales): solo conflictos + CI + formato superficial
  (título + ticket de Jira referenciado), **sin LLM**. Era el
  comportamiento por defecto hasta 2026-09-15; hoy hay que pedirlo
  explícitamente, porque tenerlo como default convertía la forma más usada
  del comando en la más débil de todas.
- **`--profundo`**: la auditoría completa con contexto exhaustivo y foco en
  edge cases.
- **`--arq`**: la auditoría completa, pero la síntesis se enfoca en patrones
  de diseño, acoplamiento y escalabilidad.
- **`--security`**: la auditoría completa, más una búsqueda explícita de
  secretos/credenciales/PII expuestos en el diff — es lectura de un LLM,
  **no** un escaneo automatizado de CVEs, y el reporte lo aclara.
- **`--diablo`** ("abogado del diablo"): segunda pasada adversarial que
  intenta refutar el veredicto de la primera — solo puede bajar scores u
  agregar observaciones, nunca subirlos.

**El comentario se publica en GitHub siempre** (`APROBADO`,
`APROBACIÓN CONDICIONADA` o `BLOQUEADO*`), no solo en el caso condicionado —
así el equipo ve la leyenda de la decisión en el PR aunque no esté siguiendo
el chat de Vysper. Es un markdown limpio y profesional
(`## Revisión Ejecutiva del PR #N`, decisión, resumen de validación con el %
de checks de CI, próximos pasos), **deliberadamente distinto del reporte
que ves en el chat de Vysper**: nunca lleva los separadores ASCII ni los
recordatorios de comandos internos ("corre /revisar --merge", etc.) que sí
tiene el reporte de Vysper. Lo mismo aplica al comentario que se publica al
mergear con `--merge`. Si el resultado es `APROBACIÓN CONDICIONADA`, además
crea automáticamente una sub-tarea de Jira ("Atender observaciones PR #N",
con vencimiento a +24h) bajo el ticket referenciado — esto sí es automático,
no requiere confirmación. Si el resultado es `APROBADO`, `/revisar` también
envía el **GitHub Review real** (`POST /pulls/{n}/reviews`, `event=APPROVE`
— el mismo que un click en "Approve" desde la UI de GitHub), no solo el
comentario de texto: eso es lo que cuenta para el gate de "reviews
requeridos" del repo. Si `GITHUB_RW_TOKEN` no está configurado o GitHub
rechaza el approve (por ejemplo, el autor del PR es la misma cuenta del
token — GitHub no permite auto-aprobarse), el reporte del chat lo avisa
explícitamente y sugiere correr `/aprobar-pr` para intentarlo de nuevo; el
análisis y el comentario ya publicados no se pierden por esto. Si el PR es
tuyo (`PR_REVIEW_OWNER_GITHUB_LOGIN`), el reporte del chat (no el comentario
del PR) incluye además una firma (`sha256(reporte + sha + timestamp)`) como
evidencia de integridad.

**Nada mergea/taggea solo.** Si el resultado es `APROBADO` y el PR es tuyo,
correr `/revisar <url> --merge` (agregando `--release` si además querés un
tag/release) es la única forma de ejecutar el merge real — Cerebro primero
confirma que sigue habiendo una revisión `APROBADO` vigente sobre el mismo
commit; si subiste algo nuevo mientras tanto, pide que corras `/revisar` de
nuevo en vez de mergear a ciegas.

**Los pasos posteriores al merge se reportan, no se pierden.** El merge es
irreversible, así que un fallo posterior (transición de Jira, comentario de
cierre, release) nunca se convierte en `error` — eso invitaría a reintentar
un merge que ya ocurrió. Cerebro lo devuelve en `pasos_no_completados` +
`advertencia` y **sale con código 2**: `0` = ciclo completo, `1` = no se
mergeó nada (reintentar tiene sentido), `2` = se mergeó con algo pendiente.

Vysper lo entiende por dos piezas:

- **`CerebroService._runCli` acepta una lista blanca `okExitCodes` por
  comando**, y `runRevisarMerge` pasa `[2]`. Es por comando y no una regla
  global a propósito: un código ≠ 0 sigue siendo un fallo para todos los
  demás. Si el stdout de un código permitido no es JSON válido, se rechaza
  igual — aceptar el 2 no puede degradar en "resuelve con basura".
- **`formatRevisarMergeResult`** renderiza los pasos pendientes **junto al**
  `PR mergeado: <url>`, nunca en vez de él, con el detalle y la remediación
  de cada uno y un aviso explícito de no volver a correr el comando.

Sin esto, `_runCli` rechazaba con cualquier código ≠ 0, el chat mostraba
«Cerebro falló (código 2)» y se perdía el payload entero — el link del PR,
el `comment_url` y el del release. El texto de la advertencia llegaba solo de
rebote, por la cola de stderr, y enmarcado como un fallo del comando.
Encontrado en vivo en el PR 272: la transición a `Done` falló, quedó solo en
una línea de log intermedia, y el JSON decía `{"merged": true}`.

La re-evaluación de un PR
`CONDITIONAL_APPROVED` también es así: solo ocurre cuando volvés a correr
`/revisar` sobre la misma URL (no hay polling en segundo plano). Si el sha
cambió, re-evalúa únicamente las observaciones pendientes, no la matriz
completa.

**Si el sha no cambió, el caché ya no te devuelve el veredicto entero.**
Cubre solo la capa cara —los hallazgos del LLM, que dependen del *diff*— y
los gates de **CI y conflictos se reevalúan siempre**, porque su evidencia
depende del *tiempo*: el mismo commit pasa de "cero checks" a "seis en
verde", y un PR bloqueado por conflictos se vuelve mergeable cuando alguien
más mergea — sin que cambie un byte. Antes quedaban pegados al sha: correr
`/revisar` justo después de pushear (lo natural) dejaba un `BLOQUEADO` que
solo se destrababa con `--force`, y el mensaje te empujaba a subir un commit
vacío. Hoy no hace falta `--force` para eso; el campo `cached` del payload
significa "se reusó la capa LLM", no "no se evaluó nada", y un veredicto que
**cambió** sí se vuelve a comentar en el PR.

El reporte completo se guarda en `apoyos/revision-pr-<numero>.md`, y Cerebro
además genera un resumen en texto plano (sintaxis mrkdwn de Slack:
`*negrita*`, bullets `•`) que Vysper copia automáticamente al portapapeles.
(Deliberadamente texto plano, no JSON de Block Kit: pegado como texto en un
canal normal, el JSON se ve crudo y feo — Block Kit solo se renderiza vía la
API de Slack o el Workflow Builder.)

Si el resultado es `APPROVED` ese resumen se queda solo en el portapapeles
(no hay nada que explicarle a nadie). Si es `CONDITIONAL_APPROVED` o
`BLOCKED_CONFLICTS`, Cerebro además lo **publica automáticamente** en el
canal de Slack `SLACK_DEFAULT_CHANNEL` (`.env` de Cerebro) — necesario
porque copiar al portapapeles solo sirve si corriste `/revisar` en la PC:
corriéndolo desde el celular por `/comando` (ver más abajo), el
portapapeles al que escribe Vysper es el de la PC, no el del celular, así
que sin esto no habría forma de llevar el motivo del rechazo hasta un
comentario en el PR del compañero. La publicación es *fail-soft*: si
`SLACK_BOT_TOKEN` no está configurado o falla, no tumba `/revisar` — el
reporte y el comentario en GitHub ya se generaron; el motivo del fallo de
Slack queda anotado en el reporte (`⚠️ No se pudo publicar el resumen en
Slack: ...`).

**Ejemplos:**
```
/revisar https://github.com/Silia-mx/silia/pull/2142
```
```
/revisar https://github.com/Silia-mx/silia/pull/2142 --profundo
```
```
/revisar https://github.com/Silia-mx/silia/pull/2142 --security --diablo
```
```
/revisar https://github.com/Silia-mx/silia/pull/2142 --merge --release
```

### `/crear-pr`, `/cancelar-pr`, `/aprobar-pr`

Complementan a `/revisar`: mientras `/revisar` solo audita un PR ya
existente, estos cubren el lado de creación/aprobación. A diferencia de
Cerebro corrido directo en terminal (donde estos comandos pueden pedir
cosas por consola — selección de labels, si crear un milestone, la
confirmación de `--merge`/`--tag`), **el chat de Vysper no tiene un stdin
interactivo real que un subprocess pueda leer** — un `input()`/
`typer.confirm()` esperando ahí se quedaría colgado hasta el timeout. Por
eso la integración a Vysper resuelve cada uno de esos tres puntos *sin*
tocar stdin del proceso de Cerebro:

- **`/crear-pr <rama> [--draft|--publish] [--labels a,b,c] [--ticket AGE-123, AGE-124] [--base <rama>] [--repo-dir <path>]`**
  — nunca commitea por vos: si hay cambios sin commitear en archivos **ya
  trackeados**, se detiene pidiendo que commitees primero (esos sí podrían
  faltar en el PR sin que te des cuenta). Archivos **sin trackear** ya NO
  bloquean — nunca pueden colarse en el PR de todas formas (el push solo
  manda lo commiteado) — Vysper solo te avisa con una advertencia (⚠️) al
  final del mensaje, listando cuáles son, para que decidas si igual querés
  seguir. Hace push de la rama, sintetiza título y
  descripción del PR usando los mensajes de commit como fuente principal
  (no el diff), asigna reviewers desde `.github/CODEOWNERS` y comenta un
  resumen para el equipo (nunca el reporte interno de Vysper — mismo
  cuidado que `/revisar`). Crea el PR **en draft por defecto** (`--publish`
  para saltarlo) y, si hay ticket de Jira asociado, lo transiciona a la
  transición equivalente a "In Review" que el workflow real del proyecto
  tenga disponible (nombre resuelto contra `get_available_transitions`, no
  asumido — el nombre exacto varía por proyecto/idioma, ej. "En revisión").
  - **`--ticket` acepta varios**, separados por coma:
    `--ticket AGE-233, AGE-234, AGE-236`. Un PR puede cubrir más de un
    ticket y se transicionan **todos** (el chat lista uno por uno el
    resultado de cada uno, porque cada transición se intenta por separado:
    si la segunda falla, la primera ya se movió). Los espacios después de
    la coma no necesitan comillas. Sin el flag, se detectan todos los
    tickets que mencione el nombre de la rama. `--labels` acepta la misma
    forma.
  - Los reviewers salen de `.github/CODEOWNERS`; para repos que no lo
    tienen (`Silia-mx/Agent`), del `DEFAULT_REVIEWERS` de Cerebro. Si no
    hay ninguno de los dos, el chat lo dice en vez de dejar el PR sin
    reviewers en silencio.
  - **`--repo-dir <path>` es OBLIGATORIO en la práctica** — Cerebro corre
    como subproceso con `cwd` fijo en `CEREBRO_PATH` (el propio directorio
    de Cerebro), nunca en el repo sobre el que querés el PR. Sin
    `--repo-dir`, `/crear-pr` operaría (por error) sobre el repo de Cerebro
    en vez del tuyo. Pasá el path absoluto real, ej.
    `--repo-dir /media/san/Miscosas6/Desarrollo/CreAI/Silia/Agent`.
  - **`--base <rama>`**: rama base para el PR y para calcular qué commits
    van en la descripción (default: `PR_REVIEW_REFERENCE_BRANCH`, `main`).
    Usalo cuando el repo integra features contra otra rama (ej. `develop`)
    en vez de `main` — es el caso de la mayoría de los repos de Silia-mx.
  - **Labels**: a diferencia del CLI de Cerebro (que sin `--labels` cae en
    un flujo interactivo de consola — el LLM propone, vos elegís por
    stdin), en Vysper **las labels son parte de la sintaxis del comando**:
    `--labels a,b,c` en el mismo mensaje (las comillas alrededor del valor,
    ej. `--labels "age-309"`, son opcionales — Vysper las quita solas). Sin
    `--labels`, el PR se crea sin labels (nunca dispara el flujo
    interactivo de Cerebro, que Vysper siempre evita pasándole `--labels`
    explícito internamente).
  - **Milestone**: Vysper nunca crea un milestone nuevo automáticamente
    (le pasa `--no-milestone` a Cerebro) — si el sprint activo de Jira
    necesita uno, créalo a mano en GitHub. Evita el `input()` de consola
    que Cerebro usaría para preguntar si crear uno.
  - **Si ya existe un PR abierto para esa rama**: Cerebro lo detecta antes
    de gastar una llamada al LLM en título/descripción/labels que no se
    van a usar, y responde con un mensaje claro (`Ya existe un PR abierto
    para la rama '...': <url> -- tus commits nuevos ya se subieron a esa
    rama...`) en vez de un error crudo de la API de GitHub. El push sí se
    hace igual — GitHub actualiza el PR existente solo con eso, no hace
    falta crear uno duplicado.
  - **Resumen para Slack**: igual que `/revisar`, si Cerebro devuelve
    `slack_message` (siempre que se creó o ya existía un PR), Vysper lo
    copia automáticamente al portapapeles y lo avisa en el chat — nunca se
    envía solo. El texto sigue el estilo natural con el que ya se pide
    revisión en Slack ("Hola team, me ayudan con este PR por favor: -
    github.com/.../pull/N" + "Contexto: \<ticket\> - \<título\>."), no un
    formato de bullets/emojis.
  - **Ningún texto publicado en GitHub/Jira menciona "Vysper" ni
    "Cerebro"** — ni el comentario del PR, ni el mensaje de Slack, ni la
    identidad del tagger de los tags que crea `/aprobar-pr --tag` (usa la
    identidad real configurada en `PR_REVIEW_OWNER_GITHUB_LOGIN`, nunca un
    nombre que revele la herramienta).
- **`/cancelar-pr <url-pr>`** — cierra un PR de `/crear-pr` que sigue en
  draft y revierte la transición de Jira a un estado anterior ("Back to To
  Do"/"To Do"/"Reopen"/"Por hacer", el primero que el ticket realmente
  tenga disponible — resuelto contra `get_available_transitions`, nunca
  asumido). No es un revert de git/Jira: nunca toca commits, releases/tags
  ni contenido de Jira más allá de esa transición. Sin interactividad de
  ningún tipo.
- **`/aprobar-pr <url-pr> [--revisar] [--merge] [--tag] [--ignorar-checks "a,b"]`**
  — un PR de Dependabot se aprueba automático; cualquier otro se valida
  (mergeable + checks de CI) antes de aprobar. Cualquier check en rojo
  bloquea por defecto, sin el margen del 90% que usa `/revisar`; los rojos
  se clasifican en requeridos y no requeridos por la protección de la rama
  base (ver el bullet de `--ignorar-checks`). Los tags siempre son anotados con
  mensaje detallado; Jira pasa a la transición equivalente a "Done" (ej.
  "Listo") solo si hubo merge real. Si el PR es de la misma cuenta de
  GitHub que usa Cerebro para escribir, no intenta auto-aprobarse (GitHub
  no lo permite) — mergea igual si ya hay una aprobación humana real en
  GitHub, o corta con un error claro si no hay ninguna.
  - **`Silia-mx/Agent`**: mergear a `staging` o `main` dispara además,
    automáticamente, una PR de bump del puntero del submódulo Agent en
    `Silia-mx/silia` (independiente para cada rama — no es una promoción
    en cadena) y un pedido de revisión en Slack para esa PR. Ver el detalle
    completo en el README de Cerebro, sección
    "Release de `Silia-mx/Agent` en 3 etapas".
  - **Merge gate**: antes de mergear, Cerebro corre las pruebas del repo
    sobre `base + head` **ya mergeados** en un worktree descartable (nunca
    sobre tu working tree). Es otra pregunta que la del CI del PR: un PR
    verde contra una base de hace tres días puede romper la base de hoy.
    Si el gate falla, no hay merge, ni comentario en el PR, ni bump, ni
    Jira — y el chat muestra qué comando falló. Si el repo no tiene
    comandos configurados, el resultado lo **declara** ("no se corrió
    ninguna prueba") en vez de dejarlo pasar por validado. Se configura en
    Cerebro con `CREAR_PR_TEST_COMMANDS` (acepta lista de comandos y clave
    `owner/repo@rama`) y `MERGE_GATE_REPO_DIRS`.
  - **Rama desnivelada**: si el PR está `BEHIND` respecto a su base (pasa
    solo cuando la base avanza mientras el PR espera aprobación, y las
    ramas protegidas exigen estar al día), Vysper la nivela sola con el
    equivalente al botón "Update branch" y sigue con el head nuevo. Si
    nivelar da conflicto, lo reporta y no insiste.
  - **Confirmación de `--merge`/`--tag`**: nunca se ejecutan en la misma
    corrida que la aprobación. Vysper primero corre `/aprobar-pr` con
    `--evaluar`: aprueba, corre el **merge gate** y devuelve su evidencia
    sin mergear ni pedir nada por stdin. El chat responde con **un solo
    mensaje** que trae el resultado, la evidencia del gate y la pregunta
    explícita (`¿Confirmas mergear el PR <url>? Responde "si" para
    continuar o "no" para cancelar.`), y queda esperando tu próxima
    respuesta — cualquier otra cosa que no se lea como sí/no descarta la
    confirmación pendiente sin ejecutar nada. Que sea un solo mensaje no
    es cosmético: por el túnel del celular (`POST /comando`) solo llega el
    **primero**, así que con dos mensajes la pregunta nunca llegaba y
    había que contestar "si" a ciegas. Solo cuando respondés afirmativo,
    Vysper vuelve a llamar a Cerebro con `--merge`/`--tag` **más**
    `--confirmar`; el resultado del gate queda cacheado por
    `(base_sha, head_sha)`, así que ese turno no vuelve a pagar la suite
    — salvo que la base se haya movido mientras tanto, en cuyo caso se
    corre de nuevo, que es justamente lo correcto.
  - **`--ignorar-checks "Nombre,Otro"`**: descuenta **por nombre** los
    checks NO requeridos que ya miraste uno por uno. Cualquier otro rojo
    — incluido uno que aparezca mañana y no esté en la lista — sigue
    bloqueando. Cuando el gate bloquea, el mensaje del chat ya trae la
    línea armada con los nombres exactos, lista para pegar. Un check
    **requerido** no se ablanda nombrándolo, y `check-branch-name` en una
    rama `chore/bump-agent-*` se descuenta solo (no puede pasar ahí por
    diseño). El flag EN BLOQUE de Cerebro
    (`--ignorar-checks-no-requeridos`) **no se expone desde el chat** a
    propósito: aquí no se ve la lista de rojos de un vistazo como en la web
    de GitHub, así que un "ignóralos todos" desde el celular es aún más
    ciego que desde la terminal. Desde Termux, `aprobar-pr.sh` ofrece el
    reintento acotado con un solo tap cuando detecta ese bloqueo.
  - **Deploy**: mergear (y hasta bumpear el submódulo) **no despliega
    nada** — `deploy-app.yml` filtra por paths que no incluyen Agent y
    `deploy-service.yml` es `workflow_dispatch` puro. El resultado siempre
    dice que el dispatch queda pendiente; se puede disparar con
    `--disparar-deploy --confirmar-deploy` desde el CLI de Cerebro.

#### Flags de Cerebro que cambiaron de significado

Estos flags **no cruzan el túnel** — el chat nunca los manda, y los comandos
que escriben no están en el registro de solo lectura. Se documentan acá
porque son los mismos comandos que corrés desde la terminal o desde Termux,
y porque uno de ellos era una trampa seria.

- **`crear-pr --dry-run` ahora no escribe nada.** Antes el flag solo se
  saltaba la publicación en Slack: el PR se creaba igual, los reviewers se
  asignaban igual y los tickets de Jira se movían igual. Alguien lo corrió
  para mirar antes de decidir y terminó con el PR creado, los reviewers
  asignados y **nueve tickets movidos** — lo único *fake* fue el mensaje de
  Slack. Hoy corre lecturas, git local y la síntesis del título/descripción,
  y devuelve el plan con `escrituras_que_haria`: el inventario de lo que
  haría una corrida real, incluido a qué estado movería cada ticket.
- **`crear-pr --sin-slack`** es el comportamiento viejo, con el nombre que
  siempre le correspondió: crea el PR normalmente y solo calla el canal.
- **`aprobar-pr --dry-run` se renombró a `--preview-bump`.** Cubría solo el
  preview del bump de submódulo mientras el comando **aprobaba el PR en
  GitHub igual** — el approve no lo protege ningún flag (`--confirmar` solo
  cubre merge y tag).

Ninguno de los tres afecta a Vysper: el chat no expone `/crear-pr --dry-run`
ni `/aprobar-pr --preview-bump`.

**Ejemplos:**
```
/crear-pr feature/AGE-123-nuevo-endpoint --labels backend,bug-fix --ticket AGE-123, AGE-124 --base develop --repo-dir /media/san/Miscosas6/Desarrollo/CreAI/Silia/Agent
```
```
/cancelar-pr https://github.com/Silia-mx/silia/pull/2150
```
```
/aprobar-pr https://github.com/Silia-mx/silia/pull/2150 --revisar --merge --tag
si
```

### `/crear-ticket`

```
/crear-ticket --proyecto AGE --tipo Story --resumen "Validar agentId contra el token"
  --padre AGE-147 --sprint "Sprint 6"
  --link "bloquea:AGE-219" --link "relacionado con:AGE-246"
  --descripcion ## Contexto

`agentId` llega en el cuerpo y es parte de la PK, así que un id ajeno
SOBREESCRIBE el voto en vez de falsificarlo.
- [ ] Validar contra el token
```
```
si
```

Levanta un ticket nuevo en Jira **sin salir de Vysper**, porque el ticket es
el entregable de una revisión: sacarlo a la UI de Jira rompe la traza justo
donde el hallazgo tiene evidencia medida, y al copiarla a mano se resume.

- **`--descripcion` va ÚLTIMO y se lleva todo lo que sigue**, verbatim y
  multilínea. Es a propósito: una descripción de hallazgo trae bloques de
  código y checklists, y cortar en el próximo `--` partiría cualquier lista
  de markdown. **Ningún LLM la toca**, ni para redactar ni para resumir.
  (`--descripcion-archivo <ruta>` también existe, pero la ruta es de la PC
  donde corre Cerebro, no del teléfono.)
- **`--link "relación:CLAVE"`, repetible, y sin default.** Cada relación
  lleva su tipo; una que no se reconoce marca el preview para revisión en vez
  de asumir `Relates`. Poner "bloquea" donde iba "relacionado con" deja
  varado el PR del otro afirmando algo que nadie dijo.
- **Dos turnos, como `/actualizar-jira`.** El primero devuelve **un solo
  mensaje** con el preview y la pregunta —por el túnel del celular solo llega
  el primero, así que separarlos obligaría a contestar "si" a ciegas— y el
  ticket recién se crea al confirmar. El `plan_hash` viaja con el plan: si
  cambió un carácter entre lo que viste y lo que se manda, Cerebro rechaza la
  escritura.
- **El preview muestra de qué TIPO es el padre** (`AGE-147, tipo Feature`),
  que es lo que deja ver antes de confirmar que el ticket no va a quedar
  colgando del Epic.
- **Al crear, se relee el ticket y se verifican los links** por clave *y* por
  tipo. `create_issue_link` devuelve un eco, así que sin releer "se crearon 3
  relaciones" no tendría respaldo. El detalle completo está en el README de
  Cerebro, sección "Creación de tickets de Jira".

Un preview marcado para revisión **no ofrece confirmar**: es un solo ticket,
y crearlo a medias no es media victoria.

### Comandos de solo lectura (ruta genérica)

```
/auditar-bump https://github.com/Silia-mx/silia/pull/2420
/estado-llm
/preflight-promocion AGE-245 AGE-296
/hoy-historial agentes
/hoy-comparar agentes
```

Estos **no tienen un parser propio**: viven en un registro declarativo
(`PASSTHROUGH_COMMANDS` en `src/core/silia-commands.js`) y se agregan con una
línea. Los flags viajan **tal cual a la CLI de Cerebro, incluidos los que
Vysper no conoce** — la CLI es la única que los valida, así que un flag nuevo
allá queda disponible aquí el mismo día.

**`/preflight-promocion` ya no ofrece `--estado-final` ante cualquier
conflicto.** Ese atajo promueve el contenido final en un solo commit y
verifica paridad de árbol contra la rama de origen — y en una promoción por
rama **curada** esa paridad es la señal de *contaminación*, no el éxito: el
árbol correcto queda distinto de `develop`, porque `develop` trae trabajo de
otros tickets. Ahora el criterio mira el **destino**, archivo por archivo: si
el archivo en conflicto ya existe allá y lo tocan los commits del ticket, el
choque es contra un estado intermedio y el atajo aplica (con la advertencia
de que la paridad hay que revisarla, no celebrarla). Si **no existe** en el
destino es un prerequisito faltante, y en vez del atajo se nombra el commit
que lo crea y su ticket: *«`redaction.py` no existe en `origin/staging`; lo
crea `7b55a6a` (AGE-327). Ese ticket tiene que promoverse primero.»* El caso
real que lo motivó: `redaction.py` **sí** lo tocaba un commit de AGE-335, así
que preguntar "¿es del ticket?" habría ofrecido el atajo y arrastrado AGE-327
a staging bajo la etiqueta de AGE-335.

**Por qué existe esto:** `auditar-bump` se agregó a la CLI y nació fuera del
alcance del teléfono, porque cada comando costaba un parser, un método del
servicio y una rama del dispatch. Y no fallaba: caía en `diagnose` y volvía
**una respuesta del modelo con pinta de resultado**. Un comando que existe en
Cerebro y no en Vysper es un comando que no se tiene la mitad del tiempo.

**Solo lectura, y no es una formalidad.** Un comando que escribe
(`/revisar-merge`, `/aprobar-pr`, `/actualizar-jira`, `/crear-ticket`) nunca
entra al registro: necesita el flujo de confirmación de dos turnos, que vive
en Vysper y no en la CLI. Además, un subcomando que caiga en `typer.confirm()`
cuelga el subproceso —que no tiene stdin real— hasta el timeout.

**Flags que nunca cruzan el túnel**, venga como venga el comando:
`--confirmar`, `--confirmar-deploy`, `--disparar-deploy`, `--plan`,
`--plan-hash` y `--ignorar-checks-no-requeridos`. El registro ya acota qué se
puede correr; esta lista es la red por si mañana entra ahí algo que resulta
no ser tan de lectura.

**Un comando con `/` que nadie reconoce ahora se dice.** Antes iba a
`diagnose` con la barra incluida y volvía una síntesis inventada; ahora
responde que no lo reconoce y no consulta a Cerebro. Texto libre sin barra
sigue yendo al loop de diagnóstico como siempre.

### `/merge`

Equivalente a `gh pr merge <numero> --repo <owner/repo> --merge`, pero
**puro** — a diferencia de `/aprobar-pr --merge`, que siempre aprueba el PR
y transiciona el ticket de Jira asociado además de mergear, `/merge` no
hace nada de eso: solo el merge (`PUT /pulls/{numero}/merge` vía la API de
GitHub). Pensado para cuando el PR ya se aprobó por otro medio y lo único
que falta es el merge en sí. Usá `/aprobar-pr --merge` en cualquier otro
caso — es el flujo con las validaciones (mergeable, checks de CI) y la
integración con Jira.

`--repo` es obligatorio (`owner/repo`, ej. `Silia-mx/Agent`); el `--merge`
final es opcional, solo calca la sintaxis de `gh pr merge`. Mismo patrón de
confirmación explícita en el chat que `/aprobar-pr --merge`: Vysper nunca
mergea en el mismo turno que el comando, siempre pregunta primero
(`¿Confirmas mergear el PR #<numero> en <owner/repo>? Responde "si" para
continuar o "no" para cancelar.`) y solo ejecuta el merge real cuando
respondés afirmativo.

**Ejemplo:**
```
/merge 149 --repo Silia-mx/Agent --merge
si
```

### `/actualizar-jira`

Automatiza actualizar Jira (descripción, fecha límite, estado, story
points) a partir de un texto libre de correcciones que puede mencionar
varios tickets a la vez — el caso real es pegar una nota de "esto hay que
corregir en Jira" (varias decisiones de diseño que se traducen en cambios
a distintos campos de distintos tickets) y dejar que el LLM identifique
qué tocar en cada uno. Mismo principio que `/aprobar-pr --merge/--tag`:
**nunca escribe nada en Jira en la misma corrida que lo propone** — dos
turnos separados, con confirmación explícita en el medio:

- **`/actualizar-jira <texto>`** — primer turno: Cerebro identifica los
  cambios que el texto pide (uno por ticket/campo mencionado) y los
  resuelve contra el estado **real** de cada ticket ahora mismo (para
  descripción, redacta el valor nuevo preservando lo no relacionado; para
  estado, valida que la transición realmente esté disponible; para fecha/
  story points, valida formato). Vysper muestra el preview completo
  (*actual → propuesto* por cada cambio) — **nada se escribe todavía**.
  Cualquier cambio ambiguo (ticket que no existe, transición no
  disponible, campo no reconocido) se muestra aparte marcado como
  "requiere revisión manual", con el motivo — nunca se adivina ni se
  aplica solo.
  - Si hay al menos un cambio aplicable, el chat pregunta explícitamente
    (`¿Confirmas aplicar N cambio(s) en Jira? Responde "si" para continuar
    o "no" para cancelar.`) y queda esperando tu próxima respuesta —
    cualquier cosa que no se lea como sí/no descarta el plan pendiente sin
    aplicar nada.
  - Solo cuando respondés afirmativo, Vysper reenvía **el mismo plan que
    ya viste** (nunca uno regenerado — Cerebro no vuelve a llamar al LLM
    en este segundo turno) para que se escriba de verdad. El resultado
    final distingue qué se aplicó, qué falló al escribir, y qué se omitió
    por seguir marcado como "requiere revisión".

**Ejemplo:**
```
/actualizar-jira AGE-143: aclarar que el Planner es autonomo y clasifica sin depender de L1-L3.
AGE-159: aclarar que el nodo Planner no tiene dependencia de L1-L3 en su descripcion.
si
```

**Configuración adicional en Cerebro** (`.env` de Cerebro, ver su
`.env.example`): `GITHUB_RW_TOKEN` (token **separado** del
`GITHUB_TOKEN` de solo lectura — nunca reusar este último — con permisos de
escritura solo para comentar/mergear/crear releases, usado únicamente por
`--merge`), `PR_REVIEW_REFERENCE_BRANCH` (default `main`),
`PR_REVIEW_GIT_SSH_HOST` (alias de host en tu `~/.ssh/config`, default
`github-silia`), `PR_REVIEW_OWNER_GITHUB_LOGIN` (tu username de GitHub,
para la firma y el gate de `--merge`).

**Configuración** (`.env`, ver `env.example`): `CEREBRO_PATH`,
`CEREBRO_PYTHON`, `CEREBRO_TIMEOUT_MS`, `VYSPER_SILIA_ASSIGNEE`. Cerebro debe
estar configurado por separado (Ollama, MCP, credenciales de Jira/Notion/
GitHub, y opcionalmente `GITHUB_DEFAULT_REPO` para que `/silia daily
<numero de PR>` sin URL funcione — ver su `.env.example`) — ver su propio
`README.md`. `stt/setup_vysper_stt.sh` prepara el
venv de Cerebro (`.venv` + `requirements.txt`) y verifica/levanta Ollama y el
stack de Sandra RAG (`SandraRagCreAI`, puerto 8000 por defecto) al arrancar,
igual que ya hace con LightRAG.

Si Cerebro no responde (timeout, proceso caído, token inválido), Silia
muestra un mensaje de error claro en el chat en vez de fallar silenciosamente.

### `/script`

Ejecuta `cerebro/scripts/jira_transition.py` — **sin argumentos, sin
excepciones**: a diferencia de todo lo demás en esta sección, `/script` no
acepta ningún parámetro (`/script jira_transition`, por ejemplo, se
rechaza como comando desconocido en vez de ejecutarse). La ruta del script
está hardcodeada del lado de Cerebro para que este comando nunca pueda
convertirse en una forma de correr un `.py` arbitrario desde el chat. No
pide confirmación en el chat como `/merge` o `/aprobar-pr --merge`: el
contenido del script ya está fijo en su propio código (no es generado
dinámicamente a partir de tu mensaje, como sí pasa en `/actualizar-jira`),
así que no hay nada que confirmar en el momento — correrlo escribe en Jira
de inmediato.

⚠️ **El script en sí no interpreta argumentos** — corre de punta a punta
apenas se invoca el archivo, sea como sea que se invoque. Si necesitás
correrlo manualmente fuera de Vysper (ej. desde una sesión de Claude Code
en el repo de Cerebro), tené cuidado con pasarle flags "inofensivos" como
`--help` pensando que va a mostrar la ayuda — el script los ignora
por completo y ejecuta igual todas las escrituras reales en Jira.

Si el script termina con un error, el chat muestra el código de salida y
el traceback completo (stdout + stderr), no un mensaje genérico — útil
para diagnosticar sin tener que ir a buscar logs aparte.

**Ejemplo:**
```
/script
```

### ¿`/incidente`, `/silia daily`, `/optimizaciones`, `/propuesta` o `/revisar` no responden?

Antes de sospechar de Cerebro, revisá esto en orden — cubre el motivo más
común de "nunca recibí respuesta":

1. **Confirmá que el skill activo es `silia` o `system-design`.** Estos
   comandos se reconocen en el modo `silia` (`processTextWithSilia` en
   `main.js`) y también en `system-design`, donde una capa adicional
   (`processTextWithSystemDesignCerebro` + `cerebro-query-router.js`)
   detecta tanto los comandos explícitos como preguntas operativas en
   lenguaje natural ("¿qué incidentes hay hoy?", "¿hay propuestas
   pendientes?") y las enruta a Cerebro sin salir del modo de diseño. En
   cualquier otro modo el texto se descarta **sin ningún aviso en el
   chat** — no hay error, no hay respuesta, nada. `silia` se activa desde
   Settings → Active Skill → `Silia (Lider de Proyecto)`, o ciclando con
   `Ctrl/Cmd + ↑/↓` en modo interactivo (ya incluido en el ciclo de skills
   junto al resto).
2. **Verificá que las dependencias de Cerebro estén corriendo:** Ollama, el
   stack Docker de Sandra RAG (puerto 8000) y las credenciales/MCP de
   Jira/Notion/GitHub. `stt/setup_vysper_stt.sh` levanta Ollama y Sandra RAG
   automáticamente; si algo de eso está caído, la consulta a Cerebro puede
   demorar mucho o fallar.
3. **Esperá hasta 90 segundos** (`CEREBRO_TIMEOUT_MS`, default `90000`): si
   Cerebro está vivo pero una llamada externa (Jira/GitHub/RAG) se cuelga,
   Vysper espera ese tiempo antes de mostrar el error — no hay indicador de
   progreso intermedio en el chat. Excepción: `/revisar` usa un timeout
   propio de 5 minutos (`CerebroService.runRevisar`), porque clonar el
   historial completo de un repo real por SSH puede tardar bastante más
   que una consulta normal a Jira/Notion.

### `/actualizaRag` (secretaria, silia, system-design)

Ejecuta `./build.sh --actualiza` en el proyecto `SandraRagCreAI` (reindexa
el contenido del RAG) como subproceso, y muestra el resultado (o el error)
en el chat — no requiere describir nada, es un comando sin argumentos.
Disponible en los modos `secretaria`, `silia` y `system-design`; en
cualquier otro modo se ignora igual que el resto del texto libre en esos
modos que no lo soportan.

El pipeline corre tres pasos en orden: `ingest.sync_from_minutas` (copia
transcripts nuevos desde `SYNC_SOURCE_DIR`), `ingest.normalize_transcripts`
(dedupe de tartamudeo y corrección de glosario sobre copias espejo, sin
tocar el original) e `ingest.ingest` (sube lo nuevo a LightRAG).

**Dónde vive LightRAG** (los tres son opcionales; sin ellos se usa el
checkout por defecto de la plataforma que arma `stt/setup`):

| Variable | Para qué | Default |
|---|---|---|
| `VYSPER_RAG_URL` | Endpoint del servidor LightRAG que se consulta. | `http://localhost:9621` |
| `VYSPER_RAG_ENV_FILE` | `.env` del checkout de LightRAG, de donde se leen sus credenciales. | el `.env` del checkout por defecto |
| `VYSPER_LIGHTRAG_DIR` | Raíz del checkout de LightRAG. | el checkout por defecto |

Se configuran por separado porque no siempre apuntan al mismo sitio: se puede
consultar un LightRAG remoto (`VYSPER_RAG_URL`) mientras el checkout local
sigue haciendo falta para reindexar.

**Ejemplo:**
```
/actualizaRag
```
Para esta consulta específica te conviene silia, no system-design.

Motivo concreto: en modo silia, todo texto libre pasa sin condición por cerebroService.runDiagnose(text) (processTextWithSilia en main.js), que dispara el ReAct loop de Cerebro con acceso real a Jira/GitHub/RAG — así que "¿AGE-212 va en agent o silia-mx/skills?" se respondería consultando el ticket AGE-212 real en Jira, buscando module.manifest.yaml en los repos, y trayendo contexto de decisiones pasadas del RAG. Es literalmente el caso de uso que describe el README para silia: "¿por qué se decidió usar X en el módulo Y?".

En system-design, en cambio, tu pregunta solo se enruta a Cerebro si classifyOperationalQuery() la detecta como operativa (palabras como "incidente", "pipeline", "sprint", "propuesta"...) o si usás un comando explícito (/silia daily, /optimizaciones, /propuesta, /incidente). Tu pregunta no contiene ninguna de esas — así que hoy caería en el asistente de arquitectura genérico, sin grounding real en el ticket ni en los repos, y probablemente te daría una opinión razonada pero no verificada contra el AC real de AGE-212.

Recomendación: pegá el mensaje tal cual en silia.

**Configuración** (`.env`): `VYSPER_SANDRA_RAG_DIR` (default
`/media/san/Miscosas6/Desarrollo/SandraRagCreAI`) y
`VYSPER_SANDRA_RAG_ACTUALIZA_TIMEOUT_MS` (default `900000`, 15 minutos —
el build puede tardar).

### `/hoy`, `/detalle`, `/jira`, `/notion`, `/github` (secretaria, silia, system-design)

Igual que `/actualizaRag`, estos cinco comandos están disponibles en los
tres modos `secretaria`, `silia` y `system-design` — no son exclusivos de
Silia. En cualquier otro modo (o si el texto no calza con la sintaxis
exacta de ninguno) se ignoran igual que el resto del texto libre no
soportado en esos modos.

**`/hoy <dominio>`** — pipeline fijo de análisis de riesgo: trae, con
detalle completo, todos los issues de los sprints activos/próximos del
proyecto Jira mapeado a `<dominio>` en `equiv.yaml` (`dominios:` en la raíz
de Cerebro), calcula orden de prioridad/bloqueo en Python (nunca lo decide
el LLM), une los riesgos curados sin ticket del dominio, y le pide al LLM
una síntesis narrada (riesgos/probabilidad/impacto/mitigación) para las
actividades de mayor prioridad. Puede tardar varios minutos en dominios
con muchas actividades — ver `CEREBRO_TIMEOUT_MS` más abajo.

Antes de mostrar la respuesta en el chat, Vysper hace un paso intermedio
propio (no en Cerebro): guarda el markdown crudo de Cerebro (el "dumping de
cerebro", que en dominios grandes puede traer 50+ tickets sin priorizar) en
`apoyos/dumping de cerebro.txt`, y se lo pasa a un LLM con un prompt fijo de
Jefe de Proyecto Técnico (`llmService.analyzeDumpingDeCerebro`, en
`src/services/llm.service.js`) que lo convierte en un plan de acción de 3
secciones: **Tablero de Acción Inmediata** (qué hacer hoy, priorizado),
**Plan de Desbloqueo Semanal** (cómo resolver los bloqueadores
estructurales) y **Preguntas Pendientes** (para la próxima daily). Ese plan
—no el markdown crudo— es lo que se muestra en el chat. Usa Claude con
fallback automático a Gemini si Claude falla por cuota/billing/disponibilidad
(mismo mecanismo que el resto de Vysper — ver [LLM provider priority](#llm-provider-priority-claude-primary-gemini-fallback)
más abajo); si el paso de análisis falla por completo, se muestra el
dumping crudo con una advertencia en vez de perder la corrida.

**Ejemplos:**
```
/hoy agentes
```
```
/hoy core
```

**`/detalle [dominio]`** — vacía a un `.md` en `SandraRagCreAI/documentos`
el análisis de riesgo de `/hoy` ya persistido en SQLite (nunca vuelve a
llamar a Jira/LLM) — útil cuando la respuesta de `/hoy` es demasiado larga
para mostrarla completa en el chat. `[dominio]` es opcional: sin él, usa el
análisis más reciente de cualquier dominio.

**Ejemplos:**
```
/detalle agentes
```
```
/detalle
```

**`/jira <consulta>`**, **`/notion <consulta>`**, **`/github <consulta>`**
— acotan una consulta libre a Cerebro para que solo use las herramientas de
esa fuente (`tool_filter` en `Orchestrator.run`), en vez de dejar que el
LLM elija libremente qué herramienta y qué alcance usar. Útil cuando ya
sabés dónde está la respuesta y querés evitar que el LLM busque en el
lugar equivocado (o adivine sin encontrar nada).

**Ejemplos:**
```
/jira estatus del bug AGE-285
```
```
/jira cuáles son los tickets asignados a Sandy Reyes
```
```
/notion hay algún runbook de rollback para el servicio de pagos
```
```
/github repo:silia-mx/Agent is:pr checkpointer durable
```

**Limitación conocida de `/jira`:** no puede filtrar por assignee en texto
libre — la herramienta que el LLM usa para buscar (`jira_search`) es
búsqueda de texto plano, nunca JQL, así que "tickets asignados a X" en
general no encuentra nada aunque X tenga tickets reales (si preguntás por
un ticket puntual como en el primer ejemplo, sí funciona, incluyendo quién
es el responsable). Para un checkpoint real por persona/equipo, usá
`/silia daily <identificador>` en modo silia — ese sí construye una
consulta JQL real (`assignee in (...)`) en código de confianza, no vía el
LLM. Importante: el identificador debe ser el nombre exacto que Jira tiene
registrado (o mejor, el email/accountId) — un nombre parecido pero no
exacto (p. ej. un apodo) no matchea con nada y no da ningún aviso de que
el nombre no existe.

**Grabaciones (`Alt+S`) y modo optimización (`Alt+O`) en cualquier módulo:**
tanto iniciar como detener una grabación larga con `Alt+S`, y armar/desarmar
el modo optimización con `Alt+O`, funcionan sin importar el skill activo —
`handleSecretariaMeetingShortcut()` y `handleOptimizacionToggleShortcut()`
(`main.js`) ya no exigen modo `secretaria` para arrancar. Cambiar de skill
(a `silia`, `programming`, cualquiera) tampoco interrumpe una grabación en
curso — el sidecar de audio la mantiene viva independientemente del skill
activo, y el pipeline de transcripción/diarización/minuta no vuelve a
consultar el skill una vez que la sesión arrancó.

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
