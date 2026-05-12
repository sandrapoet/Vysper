# Plan ejecutado: flujo Alt+R STT a chat

## Objetivo
Verificar y corregir el flujo `Alt+R -> STT local -> transcripcion -> respuesta LLM en chat`.

## Hallazgos
- El sidecar STT carga Silero VAD y faster-whisper correctamente en este entorno.
- La prueba local no puede capturar audio porque no hay dispositivo de entrada disponible: `Microphone error: Error querying device -1`.
- El chat no escuchaba directamente `recording-started` ni `recording-stopped`, aunque main si los emitia.
- Al detener con `Alt+R`, main ocultaba la ventana de chat antes de que llegara la transcripcion/respuesta.
- El sidecar solo emitia transcripcion final cuando Silero detectaba fin por silencio; al detener manualmente antes de ese evento, podia perderse la frase activa.

## Cambios
- Chat escucha `recording-started` y `recording-stopped`.
- `Alt+R` al detener ya no oculta la ventana de chat.
- Errores de speech se envian como string legible.
- `stt/sidecar.py` fuerza flush/transcripcion final al recibir `stop` si hay audio de habla acumulado.
