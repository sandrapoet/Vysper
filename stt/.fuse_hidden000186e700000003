#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AUTO_START=1
for arg in "$@"; do
    case "$arg" in
        --no-start)
            AUTO_START=0
            ;;
        --start)
            AUTO_START=1
            ;;
        --help|-h)
            echo "Usage: $0 [--start|--no-start]"
            echo "  --start     Run npm start after setup. This is the default."
            echo "  --no-start  Install everything but do not launch Vysper."
            exit 0
            ;;
        *)
            echo "[ERROR] Unknown option: $arg"
            echo "        Use --help to see available options."
            exit 1
            ;;
    esac
done

cd "$SCRIPT_DIR" || exit 1

echo "============================================================"
echo " Vysper STT Setup - Silero VAD + faster-whisper medium"
echo " Ubuntu/Linux version"
echo "============================================================"
echo

# ── 0. Install Ubuntu system dependencies ───────────────────

install_system_dependencies() {
    if ! command -v apt-get >/dev/null 2>&1; then
        echo "[INFO] apt-get not found; skipping Ubuntu system package setup."
        return
    fi

    local packages=(
        python3
        python3-venv
        python3-pip
        ffmpeg
        libportaudio2
        portaudio19-dev
        tesseract-ocr
        sox
        xdotool
        xclip
        wl-clipboard
    )

    local missing=()
    for package in "${packages[@]}"; do
        if ! dpkg -s "$package" >/dev/null 2>&1; then
            missing+=("$package")
        fi
    done

    if [ ${#missing[@]} -eq 0 ]; then
        echo "[OK] Ubuntu system dependencies already installed."
        return
    fi

    echo "[INFO] Missing Ubuntu packages: ${missing[*]}"
    echo "       sudo will ask for your password once if needed."

    sudo -v || {
        echo "[ERROR] sudo authentication failed."
        exit 1
    }

    # Keep sudo fresh while apt/pip/model downloads run.
    while true; do
        sudo -n true
        sleep 60
        kill -0 "$$" 2>/dev/null || exit
    done 2>/dev/null &
    SUDO_KEEPALIVE_PID=$!
    trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true' EXIT

    echo
    echo "[0/7] Installing Ubuntu system dependencies..."
    sudo apt-get update
    if [ $? -ne 0 ]; then
        echo "[ERROR] apt-get update failed."
        exit 1
    fi

    sudo apt-get install -y "${missing[@]}"
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install Ubuntu system dependencies."
        exit 1
    fi

    echo "[OK] Ubuntu system dependencies installed."
}

install_system_dependencies

echo

# ── 1. Verify Python 3.9+ ──────────────────────────────────

PYTHON_BIN=""

if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
else
    echo "[ERROR] Python not found."
    echo "        Install Python 3.9+ with:"
    echo "        sudo apt update && sudo apt install python3 python3-venv python3-pip"
    exit 1
fi

PY_VER="$($PYTHON_BIN --version 2>&1 | awk '{print \$2}')"

$PYTHON_BIN - <<'PY'
import sys
if sys.version_info < (3, 9):
    print("[ERROR] Python 3.9+ is required.")
    print(f"        Current version: {sys.version}")
    sys.exit(1)
PY

if [ $? -ne 0 ]; then
    exit 1
fi

echo "[OK] Python $PY_VER found."

# ── 2. Create virtual environment ───────────────────────────

if [ ! -d "venv" ]; then
    echo
    echo "[1/7] Creating virtual environment..."

    $PYTHON_BIN -m venv venv

    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to create virtual environment."
        echo "        On Ubuntu, install venv support with:"
        echo "        sudo apt update && sudo apt install python3-venv"
        exit 1
    fi

    echo "[OK] Virtual environment created."
else
    echo "[OK] Virtual environment already exists."
fi

# ── 3. Activate venv ────────────────────────────────────────

# shellcheck disable=SC1091
source venv/bin/activate

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to activate virtual environment."
    exit 1
fi

echo "[OK] Virtual environment activated."

# ── 4. Upgrade pip silently ─────────────────────────────────

echo
echo "[2/7] Upgrading pip..."

python -m pip install --upgrade pip --quiet

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to upgrade pip."
    exit 1
fi

# ── 5. Install CPU-only PyTorch audio stack ─────────────────

echo
echo "[3/7] Installing PyTorch CPU-only audio stack..."
echo "      This may take several minutes on first run."

pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install PyTorch audio stack."
    exit 1
fi

echo "[OK] PyTorch audio stack installed."

# ── 6. Install remaining dependencies ───────────────────────

echo
echo "[4/7] Installing Python dependencies from requirements.txt..."
echo "      This includes pyannote.audio for optional speaker diarization."

pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install dependencies."
    echo "        If sounddevice failed, try:"
    echo "        sudo apt update && sudo apt install -y libportaudio2 portaudio19-dev"
    exit 1
fi

echo "[OK] Dependencies installed."

PYANNOTE_VERSION="$(python - <<'PY'
import importlib.metadata as metadata
try:
    print(metadata.version("pyannote.audio"))
except metadata.PackageNotFoundError:
    raise SystemExit(1)
PY
)"

if [ $? -ne 0 ]; then
    echo "[ERROR] pyannote.audio was not installed correctly."
    exit 1
fi

echo "[OK] pyannote.audio ${PYANNOTE_VERSION} installed."

# ── 7. Pre-download models ──────────────────────────────────

echo
echo "[5/7] Pre-downloading models, cached for future use..."
echo "      Silero VAD model, approximately 2 MB..."

python -c "import torch; torch.hub.load('snakers4/silero-vad', 'silero_vad', force_reload=True, verbose=True, trust_repo=True)"

if [ $? -ne 0 ]; then
    echo "[WARN] Silero VAD download failed - will retry on first use."
fi

echo
echo "      faster-whisper medium model, approximately 1.5 GB."
echo "      This will take a while..."

python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8')"

if [ $? -ne 0 ]; then
    echo "[WARN] Whisper model download failed - will retry on first use."
else
    echo "[OK] Models downloaded."
fi

echo
echo "      pyannote.audio is installed for optional speaker diarization."
echo "      Before using diarization, accept the Hugging Face model terms and set:"
echo "        VYSPER_PYANNOTE_TOKEN=hf_..."
echo "      Optional override:"
echo "        VYSPER_PYANNOTE_MODEL=pyannote/speaker-diarization-community-1"

# ── 8. Install Node dependencies and optionally launch app ──

echo
echo "[6/7] Installing Node dependencies..."

cd "$PROJECT_ROOT" || exit 1

if ! command -v npm >/dev/null 2>&1; then
    echo "[ERROR] npm not found."
    echo "        Install Node.js/npm, then rerun this script."
    exit 1
fi

# node_modules holds native binaries (Electron's platform build, etc.), so it
# can't be shared as-is between Linux and Windows on a dual-boot machine using
# the same drive. Park whichever OS's copy isn't active under its own name and
# restore/rebuild the Linux one, mirroring the venv_windows split.
if [ -d "node_modules" ] && [ ! -f "node_modules/electron/dist/electron" ]; then
    echo "[INFO] node_modules looks like it was built for a different OS - parking it as node_modules_windows..."
    rm -rf "node_modules_windows"
    mv "node_modules" "node_modules_windows"
fi
if [ ! -d "node_modules" ] && [ -d "node_modules_linux" ]; then
    echo "[INFO] Restoring previously-built Linux node_modules..."
    mv "node_modules_linux" "node_modules"
fi

npm install

if [ $? -ne 0 ]; then
    echo "[ERROR] npm install failed."
    exit 1
fi

echo "[OK] Node dependencies installed."

# npm >=11.16 holds back install scripts for packages it hasn't seen before
# (e.g. electron's own installer that fetches the platform binary). Approve
# whatever is pending and rebuild so those scripts actually run instead of
# silently no-op'ing on a fresh clone.
npm approve-scripts --all
npm rebuild
if [ $? -ne 0 ]; then
    echo "[WARN] npm rebuild reported an error after approving install scripts."
    echo "       If Electron fails to start, try running 'npm rebuild' manually."
fi

# ── 9. Start LightRAG via Docker Compose ────────────────────

echo
echo "[7/7] Starting LightRAG service..."

MIRAG_LIGHTRAG_DIR="/media/san/Miscosas6/Desarrollo/MiRag/LightRAG"

if ! command -v docker >/dev/null 2>&1; then
    echo "[WARN] docker not found; skipping LightRAG startup."
    echo "       Start it manually with:"
    echo "       docker compose -f \"$MIRAG_LIGHTRAG_DIR/docker-compose.yml\" up -d"
else
    if curl -s --max-time 2 http://localhost:9621 >/dev/null 2>&1; then
        echo "[OK] LightRAG already running on port 9621."
    else
        docker compose -f "$MIRAG_LIGHTRAG_DIR/docker-compose.yml" up -d

        if [ $? -ne 0 ]; then
            echo "[WARN] docker compose failed to start LightRAG."
            echo "       Start it manually with:"
            echo "       docker compose -f \"$MIRAG_LIGHTRAG_DIR/docker-compose.yml\" up -d"
        else
            echo "[INFO] Waiting for LightRAG to become ready (up to 30s)..."
            LIGHTRAG_READY=0
            for i in $(seq 1 15); do
                if curl -s --max-time 2 http://localhost:9621 >/dev/null 2>&1; then
                    LIGHTRAG_READY=1
                    break
                fi
                sleep 2
            done

            if [ "$LIGHTRAG_READY" -eq 1 ]; then
                echo "[OK] LightRAG is up on port 9621."
            else
                echo "[WARN] LightRAG did not respond within 30 seconds."
                echo "       Check container logs with: docker logs lightrag"
            fi
        fi
    fi
fi

echo
echo "============================================================"
echo " Setup complete!"
echo "============================================================"
echo

# Editors/terminals built on Electron (VS Code, Cursor, etc.) set
# ELECTRON_RUN_AS_NODE=1 for their own child processes. If that leaks into
# this shell, electron silently runs as plain Node instead of opening any
# windows - no error, no crash, just an instant, silent exit. Clear it before
# launching so Vysper starts correctly regardless of which terminal this
# script was run from.
unset ELECTRON_RUN_AS_NODE

if [ "$AUTO_START" -eq 1 ]; then
    echo "[INFO] Launching Vysper with npm run dev..."
    npm run dev
else
    echo "Run Vysper later with:"
    echo "  cd \"$PROJECT_ROOT\" && npm run dev"
    echo "  (if running from VS Code's terminal, first: unset ELECTRON_RUN_AS_NODE)"
fi
