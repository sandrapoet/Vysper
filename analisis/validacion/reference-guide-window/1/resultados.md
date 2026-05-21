# Resultados de validacion

## Validacion automatica
Pasaron:
- `node --check main.js`
- `node --check src/managers/window.manager.js`
- `npx electron-builder --dir -c.directories.output=/tmp/vysper-pack-check`

## Nota sobre `npm run pack`
`npm run pack` fallo inicialmente porque `dist/` contiene archivos `.fuse_hidden...` retenidos por el sistema desde empaquetados AppImage anteriores. Para validar el cambio sin tocar esos artefactos retenidos, se uso salida alternativa en `/tmp`.

## Validacion manual sugerida
1. Iniciar Vysper.
2. Presionar `Ctrl/Cmd+Shift+C` y confirmar que el chat sigue funcionando.
3. Presionar `Ctrl/Cmd+Shift+H`; debe aparecer la guia HTML maximizada al monitor donde esta el cursor.
4. Usar buscador, anchors y `details` dentro de la guia.
5. Presionar `Esc`; la guia debe ocultarse.
6. Presionar `Ctrl/Cmd+Shift+H` de nuevo; la guia debe alternar visible/oculta.
7. Confirmar que chat y STT no pierden estado al abrir/cerrar la guia.
