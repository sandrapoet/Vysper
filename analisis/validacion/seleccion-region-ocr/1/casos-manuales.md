# Validacion manual: seleccion de region OCR

## Casos principales
1. Presionar `Cmd+Shift+S` / `Ctrl+Shift+S`: debe aparecer overlay fullscreen en el monitor donde esta el cursor.
2. Arrastrar una region mayor a 10x10: el overlay debe cerrarse, mostrar loading y procesar OCR + LLM solo de esa region.
3. Presionar Escape con overlay abierto: debe cerrarse sin OCR, sin loading y sin respuesta LLM.
4. Arrastrar una region menor a 10x10: debe cancelar sin OCR.
5. En multi-monitor, mover el cursor a otro display antes del atajo: el overlay debe abrir en ese display.
6. Con Vysper en modo no interactivo/click-through, el overlay debe poder recibir mouse y seleccionar.

## Casos de borde
1. Ejecutar una seleccion mientras OCR ya esta procesando: debe reportar `OCR operation already in progress`.
2. Seleccionar cerca del borde inferior/derecho: el crop debe ajustarse sin fallar por limites.
3. Linux/PipeWire: si Electron devuelve una sola fuente global, debe usarse fallback, offset de escritorio virtual y recorte por ratios reales del thumbnail.

## Resultado esperado
Los eventos `ocr-completed`, `ocr-error`, `llm-response` y la ventana de respuesta deben comportarse igual que antes, pero con metadata `source: screenshot-region`.
