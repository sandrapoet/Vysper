@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "PROJECT_ROOT=%%~fI"

set "AUTO_START=1"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--no-start" (
    set "AUTO_START=0"
    shift
    goto parse_args
)
if /I "%~1"=="--start" (
    set "AUTO_START=1"
    shift
    goto parse_args
)
if /I "%~1"=="--help" goto show_help
if /I "%~1"=="-h" goto show_help
if /I "%~1"=="/?" goto show_help
echo [ERROR] Unknown option: %~1
echo         Use --help to see available options.
exit /b 1

:show_help
echo Usage: %~nx0 [--start^|--no-start]
echo   --start     Run npm start after setup. This is the default.
echo   --no-start  Install everything but do not launch Vysper.
exit /b 0

:args_done
cd /d "%SCRIPT_DIR%" || exit /b 1

echo ============================================================
echo  Vysper STT Setup - Silero VAD + faster-whisper medium
echo  Windows version
echo ============================================================
echo.

REM -- 0. Check / install Windows tooling -----------------------------------
echo [0/7] Checking Windows tooling...

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    echo         Install Python 3.9+ from https://python.org and enable "Add python.exe to PATH".
    echo         Then rerun this script.
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] npm not found.
    where winget >nul 2>&1
    if !errorlevel! neq 0 (
        echo [ERROR] winget is not available, so this script cannot install Node.js automatically.
        echo         Install Node.js LTS from https://nodejs.org, then rerun this script.
        pause
        exit /b 1
    )

    echo [INFO] Installing Node.js LTS with winget...
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo [ERROR] Node.js installation failed.
        pause
        exit /b 1
    )

    echo [INFO] Refreshing PATH for this session...
    set "PATH=%PATH%;%ProgramFiles%\nodejs;%AppData%\npm"

    where npm >nul 2>&1
    if !errorlevel! neq 0 (
        echo [ERROR] npm still was not found. Open a new terminal and rerun this script.
        pause
        exit /b 1
    )
)

where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] ffmpeg not found in PATH. faster-whisper normally uses bundled PyAV wheels, so continuing.
)

where tesseract >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] tesseract not found in PATH. OCR may still work through tesseract.js, but native OCR tools are unavailable.
)

where sox >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] sox not found in PATH. Continuing because local STT does not require it.
)

echo [OK] Windows tooling check complete.
echo.

REM -- 1. Verify Python 3.9+ ------------------------------------------------
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.9+ is required.
    echo         Current version: %PY_VER%
    pause
    exit /b 1
)

echo [OK] Python %PY_VER% found.

REM -- 2. Create virtual environment ----------------------------------------
REM Uses its own folder (venv_windows), separate from venv\ used by
REM setup_vysper_stt.sh. F:\Vysper and the Ubuntu checkout can be the same
REM physical drive on a dual-boot machine, so Windows must never create or
REM touch venv\ - that name is reserved for the Linux-native virtualenv.
if exist "venv_windows" if not exist "venv_windows\Scripts\python.exe" (
    echo [WARN] venv_windows\ exists but has no Scripts\python.exe - it looks
    echo        corrupted or non-Windows. Moving it aside and creating a fresh one...
    if exist "venv_windows_backup" rmdir /s /q "venv_windows_backup"
    ren "venv_windows" "venv_windows_backup"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to move aside the existing venv_windows\ folder.
        pause
        exit /b 1
    )
)

if not exist "venv_windows" (
    echo.
    echo [1/7] Creating virtual environment...
    python -m venv venv_windows
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created.
) else (
    echo [OK] Virtual environment already exists.
)

REM -- 3. Activate venv ------------------------------------------------------
call venv_windows\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)

echo [OK] Virtual environment activated.

REM -- 4. Upgrade pip --------------------------------------------------------
echo.
echo [2/7] Upgrading pip...
python -m pip install --upgrade pip --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to upgrade pip.
    pause
    exit /b 1
)

REM -- 5. Install CPU-only PyTorch audio stack -------------------------------
echo.
echo [3/7] Installing PyTorch audio stack CPU-only...
echo       This may take several minutes on first run.
python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install PyTorch audio stack.
    pause
    exit /b 1
)
echo [OK] PyTorch audio stack installed.

REM -- 6. Install remaining Python dependencies ------------------------------
echo.
echo [4/7] Installing Python dependencies from requirements.txt...
echo       This includes pyannote.audio for optional speaker diarization.
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)
echo [OK] Python dependencies installed.

for /f "usebackq delims=" %%v in (`python -c "import importlib.metadata as m; print(m.version('pyannote.audio'))" 2^>nul`) do set "PYANNOTE_VERSION=%%v"
if not defined PYANNOTE_VERSION (
    echo [ERROR] pyannote.audio was not installed correctly.
    pause
    exit /b 1
)
echo [OK] pyannote.audio %PYANNOTE_VERSION% installed.

REM -- 7. Pre-download models ------------------------------------------------
echo.
echo [5/7] Pre-downloading models, cached for future use...
echo       Silero VAD model, approximately 2 MB...
python -c "import torch; torch.hub.load('snakers4/silero-vad', 'silero_vad', force_reload=False, verbose=False, trust_repo=True)"
if %errorlevel% neq 0 (
    echo [WARN] Silero VAD download failed - will retry on first use.
)

echo.
echo       faster-whisper medium model, approximately 1.5 GB.
echo       This will take a while...
python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8')"
if %errorlevel% neq 0 (
    echo [WARN] Whisper model download failed - will retry on first use.
) else (
    echo [OK] Models downloaded.
)

echo.
echo       pyannote.audio is installed for optional speaker diarization.
echo       Before using diarization, accept the Hugging Face model terms and set:
echo         VYSPER_PYANNOTE_TOKEN=hf_...
echo       Optional override:
echo         VYSPER_PYANNOTE_MODEL=pyannote/speaker-diarization-community-1

REM -- 8. Install Node dependencies and optionally launch app ----------------
echo.
echo [6/7] Installing Node dependencies...
cd /d "%PROJECT_ROOT%" || exit /b 1

REM node_modules holds native binaries (Electron's platform build, etc.), so
REM it can't be shared as-is between Windows and Linux on a dual-boot machine
REM using the same drive. Park whichever OS's copy isn't active under its own
REM name and restore/rebuild the Windows one, mirroring the venv_windows split.
if exist "node_modules" if not exist "node_modules\electron\dist\electron.exe" (
    echo [INFO] node_modules looks like it was built for a different OS - parking it as node_modules_linux...
    if exist "node_modules_linux" rmdir /s /q "node_modules_linux"
    ren "node_modules" "node_modules_linux"
)
if not exist "node_modules" if exist "node_modules_windows" (
    echo [INFO] Restoring previously-built Windows node_modules...
    ren "node_modules_windows" "node_modules"
)

call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo [OK] Node dependencies installed.

REM npm >=11.16 holds back install scripts for packages it hasn't seen before
REM (e.g. electron's own installer that fetches the platform binary). Approve
REM whatever is pending and rebuild so those scripts actually run instead of
REM silently no-op'ing on a fresh clone.
call npm approve-scripts --all
call npm rebuild
if %errorlevel% neq 0 (
    echo [WARN] npm rebuild reported an error after approving install scripts.
    echo        If Electron fails to start, try running "npm rebuild" manually.
)

REM -- 9. Start LightRAG via Docker Compose ----------------------------------
echo.
echo [7/7] Starting LightRAG service...

set "MIRAG_LIGHTRAG_DIR=F:\Desarrollo\MiRag\LightRAG"
if defined VYSPER_LIGHTRAG_DIR set "MIRAG_LIGHTRAG_DIR=%VYSPER_LIGHTRAG_DIR%"

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] docker not found; skipping LightRAG startup.
    echo        Start it manually with:
    echo        docker compose -f "%MIRAG_LIGHTRAG_DIR%\docker-compose.yml" up -d
    goto lightrag_done
)

curl -s --max-time 2 http://localhost:9621 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] LightRAG already running on port 9621.
    goto lightrag_done
)

docker compose -f "%MIRAG_LIGHTRAG_DIR%\docker-compose.yml" up -d
if %errorlevel% neq 0 (
    echo [WARN] docker compose failed to start LightRAG.
    echo        Start it manually with:
    echo        docker compose -f "%MIRAG_LIGHTRAG_DIR%\docker-compose.yml" up -d
    goto lightrag_done
)

echo [INFO] Waiting for LightRAG to become ready, up to 30s...
set "LIGHTRAG_READY=0"
for /L %%i in (1,1,15) do (
    curl -s --max-time 2 http://localhost:9621 >nul 2>&1
    if !errorlevel! equ 0 (
        set "LIGHTRAG_READY=1"
    )
    if "!LIGHTRAG_READY!"=="1" goto lightrag_wait_done
    ping -n 3 127.0.0.1 >nul
)
:lightrag_wait_done

if "!LIGHTRAG_READY!"=="1" (
    echo [OK] LightRAG is up on port 9621.
) else (
    echo [WARN] LightRAG did not respond within 30 seconds.
    echo        Check container logs with: docker logs lightrag
)

:lightrag_done

echo.
echo ============================================================
echo  Setup complete!
echo ============================================================
echo.

REM Editors/terminals built on Electron (VS Code, Cursor, etc.) set
REM ELECTRON_RUN_AS_NODE=1 for their own child processes. If that leaks into
REM this shell, electron.exe silently runs as plain Node instead of opening
REM any windows - no error, no crash, just an instant, silent exit. Clear it
REM before launching so Vysper starts correctly regardless of which terminal
REM this script was run from.
set "ELECTRON_RUN_AS_NODE="

if "%AUTO_START%"=="1" (
    echo [INFO] Launching Vysper with npm start...
    call npm start
) else (
    echo Run Vysper later with:
    echo   cd /d "%PROJECT_ROOT%" ^&^& npm start
    echo   (if running from VS Code's terminal, first clear ELECTRON_RUN_AS_NODE)
    pause
)
