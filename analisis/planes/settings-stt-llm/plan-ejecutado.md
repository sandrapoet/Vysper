# Plan ejecutado: Settings STT/LLM real

## Objetivo
Alinear Settings con los servicios realmente usados por Vysper: STT local con Silero VAD + faster-whisper y LLM Gemini mediante `GEMINI_API_KEY`.

## Cambios
- Remover UI de Azure de Settings.
- Mostrar estado local de STT: servicio, grabacion, backend, modelo, VAD y device/compute.
- Exponer `isReady` desde `speech.service.js` cuando el sidecar envie `ready`.
- Mostrar estado seguro de Gemini: listo/no listo, fuente de key y modelo sin exponer la key completa.
- Permitir reemplazar la Gemini key para la sesion si se escribe una nueva en Settings.
