# Plan ejecutado: ventana de guia tecnica

## Objetivo
Mostrar una guia HTML local como ventana dedicada de Vysper al presionar `Ctrl/Cmd+Shift+H`, con tamaño completo del monitor activo y las protecciones de ventana disponibles en Electron.

## Cambios
- Copiar la guia a `reference-guide.html` dentro del proyecto.
- Agregar atajo global `CommandOrControl+Shift+H`.
- Crear ventana dedicada `guide` para no recargar ni romper la ventana de chat.
- Posicionar la guia en el display donde esta el cursor.
- Aplicar `setContentProtection(true)` cuando el sistema lo soporte.
- Permitir navegacion con mouse/teclado y cerrar con `Esc` o repetir `Ctrl/Cmd+Shift+H`.

## Riesgos
- `setContentProtection` depende del sistema operativo y del capturador; no garantiza invisibilidad universal.
- El archivo indicado `(4)` ya no existia en Downloads durante la implementacion; se uso la variante mas reciente disponible `(3)`.
