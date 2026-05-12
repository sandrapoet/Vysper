# Resultados de validacion

## Sintaxis
Pasaron sin errores:
- `stt/venv/bin/python -m py_compile stt/sidecar.py`
- `node --check src/services/llm.service.js`

## Prueba de request LLM
Se construyo un request de transcripcion con varias frases y se verifico que el ultimo mensaje enviado al LLM conserva la primera y la ultima frase dentro del bloque literal `TRANSCRIPT`.

## Nota
La exactitud palabra-por-palabra depende de faster-whisper y del audio capturado. Este cambio evita compresion intencional en Vysper y reduce cortes por pausas cortas, pero no puede garantizar transcripcion perfecta si el microfono, VAD o Whisper oyen otra cosa.
