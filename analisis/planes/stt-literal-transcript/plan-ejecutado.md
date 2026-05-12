# Plan ejecutado: transcripcion literal hacia LLM

## Hallazgo
Vysper no resumía el texto en `main.js`: la transcripcion actual se enviaba con `trim()`. La sensacion de recorte podia venir de dos lugares:
- Silero VAD cerraba segmentos con 1500 ms de silencio.
- El prompt del LLM pedia responder con brevedad y no repetir la pregunta, lo que podia hacer parecer que no usaba todo lo dicho.

## Cambios
- `stt/sidecar.py` ahora usa `VYSPER_STT_MIN_SILENCE_MS` con default `2500` para reducir cortes por pausas cortas.
- Whisper usa `condition_on_previous_text=True` para mejorar continuidad dentro de segmentos.
- El LLM recibe la transcripcion dentro de un bloque literal `TRANSCRIPT` con instruccion explicita de no resumirla antes de responder.
