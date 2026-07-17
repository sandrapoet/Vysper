@echo off
REM Equivalente Windows de vys.sh: entra a stt\ y corre el setup/arranque.
cd /d "F:\Vysper\stt" || (echo No se pudo acceder al directorio stt & pause & exit /b 1)
call ".\setup.bat"
