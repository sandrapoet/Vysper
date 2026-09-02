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
- /jira, /notion, /github <consulta>  Acota una consulta libre a esa sola fuente (secretaria, silia, system-design)
- /silia daily [identificador]  Actividades del último día hábil (Jira/GitHub/Notion/minutas locales) + checkpoint de riesgo abierto (silia, system-design — ver sección "Modo Silia")
- /silia retro [--dominio <alias>] [sprint_ref], /silia retro [--dominio <alias>] comparar <sprint_a> <sprint_b>  Retrospectiva estructurada de un sprint (Jira Agile API + métricas + Notion/RAG + incidentes del SMC), default "agentes", o diff entre dos retros ya generadas (silia, system-design — ver sección "Modo Silia")
- /revisar <url-pr> [--profundo|--arq|--security] [--diablo] [--merge] [--release]  Revisión automatizada de PR: conflictos + matriz de cumplimiento ponderada (silia, system-design — ver sección "Modo Silia")
- /crear-pr <rama> [--draft|--publish] [--labels a,b,c] [--ticket AGE-123], /cancelar-pr <url-pr>, /aprobar-pr <url-pr> [--revisar] [--merge] [--tag]  Creación/cancelación/aprobación de PRs (silia, system-design — ver sección "Modo Silia")
- /merge <numero-pr> --repo <owner/repo> [--merge]  Mergea un PR directo vía la API de GitHub, sin aprobar ni tocar Jira, con confirmación explícita en el chat (silia, system-design — ver sección "Modo Silia")
- /actualizar-jira <texto>  Actualiza descripción/fecha/estado/story points de uno o varios tickets a partir de texto libre, con preview + confirmación antes de escribir (silia, system-design — ver sección "Modo Silia")
- /script  Ejecuta cerebro/scripts/jira_transition.py (ruta fija, sin argumentos) — ver sección "Modo Silia"
- /reconocerVoz <ruta-sesion>  Enrola huellas de voz nuevas desde una sesión ya procesada, uno por uno vía chat (solo secretaria — ver sección "Huellas de voz")
- /reconocerVozPendientes <ruta-sesion>  Retoma solo los hablantes marcados UNKNOWN de una sesión, sin re-ofrecer los ya revisados (solo secretaria)
- /actualizarHablantes <ruta-sesion>  Re-matchea una sesión vieja contra el store de huellas de voz actual y regenera sus transcripts + minuta (solo secretaria)
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
commitea) — un embedding de voz por muestra enrolada, por persona. El
matching (`stt/diarize.py`, similitud coseno contra
`VYSPER_VOICEPRINT_THRESHOLD`) corre automáticamente en **cada** diarización
normal de Alt+S/Ctrl+5 — si ya enrolaste a alguien, sus próximas reuniones
salen con su nombre sin hacer nada más. Un cluster que no matchea nunca se
marca solo como "desconocido" — eso es una decisión explícita de revisión
(ver `/reconocerVoz` abajo), nunca del pipeline automático de cada reunión.

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
secretaria) — mismo flujo, pero acotado a los hablantes que una corrida
anterior ya dejó marcados `UNKNOWN`, sin volver a ofrecer los que nunca se
revisaron ni los que ya tienen nombre. Útil para retomar más tarde (por
ejemplo, después de enrolar a más gente) sin repasar toda la sesión de
nuevo.

**`/actualizarHablantes <ruta a una carpeta de sesion>`** (solo secretaria)
— para sesiones **viejas**: re-corre solo el matching contra el store actual
(sin re-clusterizar, la parte lenta de diarizar) y regenera los transcripts
+ minuta de esa sesión con cualquier nombre que se haya podido resolver
desde que se procesó por primera vez.

```
/actualizarHablantes minutas/reunion-2026-07-20-09-00-00
```

**Configuración** (`.env`):
```bash
VYSPER_VOICEPRINT_MODEL=pyannote/embedding    # requiere aceptar sus terminos en Hugging Face, igual que el modelo de diarizacion
VYSPER_VOICEPRINT_THRESHOLD=0.75              # similitud coseno minima para considerar un match
VYSPER_VOICEPRINTS_PATH=~/.Vysper/voiceprints.json
```

### Modo Optimización (`Alt+O`) — tiempo real vs. posterior

`Alt+O` arma el análisis de optimización para la **próxima** sesión de
`Alt+S` — hay que armarlo antes de empezar a grabar, porque el modo tiempo
real necesita fragmentos cortos desde el arranque (no se puede activar
después). Al presionarlo (sin una sesión ya armada), pregunta el modo:

- **Tiempo real**: sugiere preguntas durante la reunión, en fragmentos de
  `VYSPER_OPTIMIZACION_SEGMENT_SEC`s (default `15`) y con
  `VYSPER_OPTIMIZACION_SILENCE_SEC`s de silencio (default `6`) como gatillo —
  igual que siempre. Guarda su resumen/sugerencias en memoria compartida
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
  nada visible (revisa el modo activo en la app antes de mandarlo).
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

**Conflicto con Alt+O**: `/stream/start` responde 409 si hay una entrevista
de Optimización (Alt+O) activa en ese momento en la PC — evita mezclar el
texto de dos sesiones distintas, ya que esa bandera es global a la app, no
por sesión.

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

**`/revisar <url-pr> [--profundo|--arq|--security] [--diablo] [--merge] [--release]`**
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

- **Sin flags** (PRs triviales): solo conflictos + formato superficial
  (título + ticket de Jira referenciado), sin LLM.
- **`--profundo`**: corre la matriz completa de cumplimiento (tests 30%/min
  80%, documentación 20%/min 100%, deuda técnica 20%/min 90%, AC de Jira
  30%/min 100% — cada criterio con score y nivel de confianza del LLM;
  Python decide la aprobación, nunca el LLM), con contexto exhaustivo.
- **`--arq`**: misma matriz, pero la síntesis se enfoca en patrones de
  diseño, acoplamiento y escalabilidad.
- **`--security`**: misma matriz, más una búsqueda explícita de
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
nuevo en vez de mergear a ciegas. La re-evaluación de un PR
`CONDITIONAL_APPROVED` también es así: solo ocurre cuando volvés a correr
`/revisar` sobre la misma URL (no hay polling en segundo plano) — si el sha
no cambió, devuelve el resultado ya guardado sin llamar a nada; si cambió,
re-evalúa únicamente las observaciones pendientes, no la matriz completa.

El reporte completo se guarda en `apoyos/revision-pr-<numero>.md`, y Cerebro
además genera un resumen en texto plano (sintaxis mrkdwn de Slack:
`*negrita*`, bullets `•`) que Vysper copia automáticamente al
portapapeles, listo para pegar directo en un mensaje de Slack — nunca se
envía solo, no hay integración real con Slack. (Deliberadamente texto
plano, no JSON de Block Kit: pegado como texto en un canal normal, el JSON
se ve crudo y feo — Block Kit solo se renderiza vía la API de Slack o el
Workflow Builder.)

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

- **`/crear-pr <rama> [--draft|--publish] [--labels a,b,c] [--ticket AGE-123] [--base <rama>] [--repo-dir <path>]`**
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
- **`/aprobar-pr <url-pr> [--revisar] [--merge] [--tag]`** — un PR de
  Dependabot se aprueba automático; cualquier otro se valida (mergeable +
  checks de CI, aquí cualquier check en rojo bloquea, sin el margen del 90%
  que usa `/revisar`) antes de aprobar. Los tags siempre son anotados con
  mensaje detallado; Jira pasa a la transición equivalente a "Done" (ej.
  "Listo") solo si hubo merge real.
  - **Confirmación de `--merge`/`--tag`**: nunca se ejecutan en la misma
    corrida que la aprobación. Vysper primero corre `/aprobar-pr` **sin**
    esos flags (aprueba el PR y, si pediste `--revisar`, corre la revisión
    profunda) y muestra el resultado. Si tu mensaje original pedía
    `--merge` y/o `--tag`, el chat responde con una pregunta explícita
    (`¿Confirmas mergear el PR <url>? Responde "si" para continuar o "no"
    para cancelar.`) y queda esperando tu próxima respuesta — cualquier
    otra cosa que no se lea como sí/no descarta la confirmación pendiente
    sin ejecutar nada. Solo cuando respondés afirmativo, Vysper vuelve a
    llamar a Cerebro con `--merge`/`--tag` **más** `--confirmar` (una
    bandera nueva del CLI de Cerebro que reemplaza su `typer.confirm()` de
    consola por esta confirmación ya obtenida en el chat).

**Ejemplos:**
```
/crear-pr feature/AGE-123-nuevo-endpoint --labels backend,bug-fix --ticket AGE-123 --base develop --repo-dir /media/san/Miscosas6/Desarrollo/CreAI/Silia/Agent
```
```
/cancelar-pr https://github.com/Silia-mx/silia/pull/2150
```
```
/aprobar-pr https://github.com/Silia-mx/silia/pull/2150 --revisar --merge --tag
si
```

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
