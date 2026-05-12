# Resultados de validacion

## Sintaxis
Pasaron sin errores:
- `node --check main.js`
- `node --check src/ui/chat-window.js`
- `stt/venv/bin/python -m py_compile stt/sidecar.py`

## STT local
- `faster_whisper` importa correctamente.
- `sounddevice` importa correctamente.
- `torch` importa correctamente.
- `stt/sidecar.py` emite `{"type": "ready"}` despues de cargar Silero VAD y faster-whisper.

## Limitacion de la prueba local
Al enviar `{"cmd":"start"}` al sidecar en este entorno, devuelve:
`Microphone error: Error querying device -1`.

Esto indica que el entorno de prueba no tiene dispositivo de entrada disponible. La captura real debe validarse en la sesion grafica/local con microfono.

## Validacion manual sugerida
1. Abrir Vysper.
2. Presionar `Alt+R`; el chat debe abrirse y mostrar estado de grabacion.
3. Hablar 2-4 segundos.
4. Presionar `Alt+R` para detener; el chat debe permanecer visible.
5. Confirmar que aparece la transcripcion y luego la respuesta LLM.
6. Si no aparece transcripcion, revisar Settings: STT debe estar `Ready`, no `Loading models` ni `Not ready`.
