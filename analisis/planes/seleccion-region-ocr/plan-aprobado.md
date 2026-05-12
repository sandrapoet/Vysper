# Plan aprobado: seleccion de region para OCR

## Objetivo
Cambiar `Cmd+Shift+S` para abrir un overlay fullscreen en el display donde este el cursor, permitir seleccionar una region con mouse y procesar solo esa region con OCR + LLM.

## Checkpoints
1. Crear `selection-overlay.html` con drag, Escape y validacion minima 10x10.
2. Exponer canales IPC `region-selected` y `selection-cancelled` en `preload.js`.
3. Agregar `showSelectionOverlay()` y `hideSelectionOverlay()` en `src/managers/window.manager.js`, usando el display bajo el cursor.
4. Agregar captura regional robusta en `src/services/ocr.service.js`, con seleccion de fuente por display, ratios reales, clamp y retries para PipeWire.
5. Conectar `main.js`: `Cmd+Shift+S` muestra overlay, `region-selected` llama `triggerRegionOCR(bounds)`, cancelacion cierra overlay.
6. Ajustar metadata de sesion para permitir `source: screenshot-region` y actualizar `README.md`.
7. Validar con `node --check`, build/regresion disponible y documentar casos manuales.

## Riesgos tratados
- Multi-monitor: se usa `screen.getDisplayNearestPoint(screen.getCursorScreenPoint())`.
- PipeWire/Linux: se recorta sobre el `NativeImage` capturado con ratios reales del thumbnail, no se asume `scaleFactor`.
- Fuente global de escritorio virtual: si PipeWire devuelve una sola fuente, el crop suma el offset de `display.bounds` dentro del frame virtual multi-monitor.
- Thumbnails inconsistentes: se calcula `thumbnailSize` optimo, se limita a 4096 px y se hace clamp del crop.
- IPC: solo se agregan canales permitidos especificos.
- Overlay: no usa `setIgnoreMouseEvents(true)` para que el drag funcione aunque Vysper este en modo no interactivo.
