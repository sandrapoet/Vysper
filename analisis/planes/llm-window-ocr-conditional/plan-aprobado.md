# Plan de implementacion: Ventana gris (top-left + half-chat + scroll) solo cuando aplique

## Objetivo
Implementar la regla de presentacion de la ventana gris transparente para que:
1. Se ubique en extremo superior izquierdo.
2. Use tamano base mitad del chat (ancho y alto) con scroll en ambos sentidos.
3. Este comportamiento se aplique a:
   - Todos los modos cuando `isOCRPreview = true`.
   - Solo `programming` y `dsa` cuando `isContextAck = true`.
4. El comportamiento ocurra solo cuando sea necesario (no afectar respuestas LLM normales fuera de esos casos).

## Regla funcional exacta (matriz)
- Caso A: `isOCRPreview = true`
  - Modo: cualquiera.
  - Layout inicial: top-left + mitad de chat + scroll X/Y.
  - Ajuste automatico: mantener ancho base; permitir desplazamiento en vez de crecer agresivamente.
- Caso B: `isContextAck = true`
  - Modo: solo `programming` o `dsa`.
  - Layout inicial: top-left + mitad de chat + scroll X/Y.
  - Fuera de `programming`/`dsa`: no aplicar este layout especial.
- Caso C: respuesta LLM normal (sin flags anteriores)
  - Mantener comportamiento actual de render y resize dinamico.
  - No forzar compact layout de OCR/ACK.

## Criterio "ONLY when needed"
Se aplicara layout especial unicamente si:
- `isOCRPreview === true`, o
- `isContextAck === true` y `skill` normalizado pertenece a `["programming", "dsa"]`.

Implementar helper central:
- `shouldUseCompactOcrLayout(metadata)`
  - Retorna `true` con la condicion anterior.
  - Evita duplicar logica en main process y renderer.

## Archivos impactados
1. `main.js`
2. `src/managers/window.manager.js`
3. `src/ui/llm-response-window.js`
4. `llm-response.html` (o estilos asociados de esa vista)

## Cambios por archivo

### 1) main.js
- Asegurar que en todos los puntos donde se llama `windowManager.showLLMResponse(...)` para OCR/ACK se preserve metadata coherente:
  - `isOCRPreview: true` para previsualizacion OCR.
  - `isContextAck: true` para acumulacion de contexto.
  - `skill: this.activeSkill` siempre presente.
- No cambiar el flujo funcional de negocio; solo robustecer metadatos si falta alguno.

### 2) src/managers/window.manager.js
- Agregar helper para decision de layout:
  - `normalizeSkill(skill)`
  - `isCodingAccumulationSkill(skill)`
  - `shouldUseCompactOcrLayout(metadata)`
- En `showLLMResponse(content, metadata)`:
  - Antes de mostrar, decidir layout:
    - Si `shouldUseCompactOcrLayout(metadata)`:
      - `resetLLMWindowToDefaultSize()` (mitad chat).
      - Posicionar en extremo superior izquierdo (x del workArea, y margen superior definido).
    - Si no:
      - Mantener logica actual para respuestas normales.
- Posicion:
  - Introducir metodo dedicado `positionLLMTopLeft()` y usarlo solo en layout especial.
- Resize:
  - Para layout especial: no ampliar ancho automaticamente.
  - Para layout normal: conservar comportamiento dinamico existente.

### 3) src/ui/llm-response-window.js
- Introducir helper paralelo de decision (defensivo en renderer):
  - `shouldUseCompactOcrLayout(metadata)` con mismas reglas.
- En flujo de render (`handleDisplayResponse` / `displayResponseContent`):
  - Si layout especial:
    - No disparar expansión de ventana por contenido largo.
    - Habilitar clase CSS de contenido scrollable dual.
  - Si layout normal:
    - Mantener resize dinamico actual.
- Asegurar que `isOCRPreview` y `isContextAck` no rompan vistas con codigo o markdown.

### 4) llm-response.html / estilos
- Definir clase de contenedor para layout especial, por ejemplo `.compact-ocr-layout`:
  - `overflow: auto;`
  - `white-space: pre;` o `pre-wrap` segun legibilidad esperada.
  - `max-width: 100%;`
  - `max-height: 100%;`
- Confirmar scroll horizontal y vertical disponibles cuando el contenido exceda.

## Secuencia de implementacion
1. Crear helpers de decision de layout (main/manager/renderer).
2. Ajustar posicionamiento top-left solo para layout especial.
3. Ajustar render+scroll en renderer para layout especial.
4. Mantener intacta la ruta de respuestas normales.
5. Validar manualmente matriz completa de casos.

## Validacion manual (obligatoria)

### Pruebas positivas
1. Modo `programming` + OCR corto (`isOCRPreview=true`):
   - Ventana en top-left.
   - Tamano mitad chat.
   - Scroll X/Y activo.
2. Modo `dsa` + ACK (`isContextAck=true`):
   - Ventana en top-left.
   - Tamano mitad chat.
   - Scroll X/Y activo.
3. Modo `presentation` + OCR corto (`isOCRPreview=true`):
   - Aplica layout especial igualmente.

### Pruebas negativas
1. Modo `presentation` + `isContextAck=true` (forzado en test):
   - NO debe aplicar layout especial.
2. Respuesta LLM normal sin flags:
   - Debe mantener comportamiento actual (sin forzar half-chat).

### No regresion
1. Redimensionado manual en modo interactivo sigue disponible.
2. OCR/LLM rendering no pierde formato markdown/codigo.
3. No cambios en shortcuts ni flujo de negocio de OCR.

## Riesgos y mitigacion
- Riesgo: divergencia de reglas entre proceso principal y renderer.
  - Mitigacion: misma condicion y tests de matriz en ambos lados.
- Riesgo: conflictos con logica de ventanas vinculadas (`bindWindows`).
  - Mitigacion: encapsular posicion especial en metodo dedicado para `llmResponse`.
- Riesgo: scroll afecta legibilidad de bloques de codigo.
  - Mitigacion: validar `white-space` y padding en contenido markdown.

## Definicion de listo
- Regla ONLY when needed implementada y verificada.
- Layout especial aplicado exactamente en casos A y B.
- Sin regresiones visibles en respuestas LLM normales.
- Logs de depuracion minimos para confirmar decision de layout por metadata.
