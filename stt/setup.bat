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
echo [0/6] Checking Windows tooling...

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
if not exist "venv" (
    echo.
    echo [1/6] Creating virtual environment...
    python -m venv venv
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
call venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)

echo [OK] Virtual environment activated.

REM -- 4. Upgrade pip --------------------------------------------------------
echo.
echo [2/6] Upgrading pip...
python -m pip install --upgrade pip --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to upgrade pip.
    pause
    exit /b 1
)

REM -- 5. Install CPU-only PyTorch audio stack -------------------------------
echo.
echo [3/6] Installing PyTorch audio stack CPU-only...
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
echo [4/6] Installing faster-whisper, sounddevice, numpy...
python -m pip install faster-whisper sounddevice numpy --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)
echo [OK] Python dependencies installed.

REM -- 7. Pre-download models ------------------------------------------------
echo.
echo [5/6] Pre-downloading models, cached for future use...
echo       Silero VAD model, approximately 2 MB...
python -c "import torch; torch.hub.load('snakers4/silero-vad', 'silero_vad', force_reload=False, verbose=False)"
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

REM -- 8. Install Node dependencies and optionally launch app ----------------
echo.
echo [6/6] Installing Node dependencies...
cd /d "%PROJECT_ROOT%" || exit /b 1

npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo [OK] Node dependencies installed.
echo.
echo ============================================================
echo  Setup complete!
echo ============================================================
echo.

if "%AUTO_START%"=="1" (
    echo [INFO] Launching Vysper with npm start...
    npm start
) else (
    echo Run Vysper later with:
    echo   cd /d "%PROJECT_ROOT%" ^&^& npm start
    pause
)
