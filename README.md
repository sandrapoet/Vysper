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
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_FALLBACK_API_KEY=your_second_anthropic_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
ANTHROPIC_MAX_TOKENS=2048
VYSPER_STT_PREROLL_MS=900
```

## ⌨️ Essential Shortcuts

### Core Functions
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + S` | Select Screen Region + OCR Analysis |
| `Alt/Option + B` | Capture image region without OCR |
| `Alt/Option + R` | Voice Recording Toggle |
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
