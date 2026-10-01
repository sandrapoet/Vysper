# Memoria de sesión para el modo Silia (y compartida con System Design)

Fecha: 2026-10-01 · Repos: Vysper (`feat/memoria-sesion`), Cerebro (`feat/memoria-proyecto`)

## Problema

El modo Silia es amnésico: cada pregunta va sola a `cerebroService.runDiagnose(text)`,
sin historial. En una sesión larga no se puede decir "¿y el otro ticket?" ni
"con lo que vimos, propón una arquitectura". Y cada pregunta, aunque se responda
con lo ya dicho, paga una corrida completa de Cerebro (de 30 s a varios minutos).

## Decisiones

- **D1. Una sola memoria para toda la sesión**, en Vysper. La comparten Silia y
  System Design, y no se borra al cambiar de modo. Cerebro sigue sin estado (D1 de la
  espec de la asesoría en vivo): la memoria viaja en `--contexto-file`.
- **D2. Tres capas, presupuesto en tokens y no en turnos.** Se estima 1 token por cada
  4 caracteres (`estimarTokens`). Un log pegado cuenta lo que pesa.

  | Capa | Contenido | Presupuesto | Rota cuando |
  |---|---|---|---|
  | L1 | turnos completos (usuario + respuesta) | 10 turnos y 2 500 tokens | se pasa de cualquiera de los dos topes: los más viejos bajan a L2 |
  | L2 | resúmenes al ~30 % (entidades + decisiones) | 3 000 tokens | los más viejos bajan a L3 |
  | L3 | semillas `[min N] tema → conclusión` al ~10 % | 1 500 tokens | se recomprime todo L3 con un ratio decreciente (70 % de su presupuesto) |
  | Expediente | hechos que trajo Cerebro, con su fuente | 1 000 tokens | se descartan los más viejos |

  Tope total: **8 000 tokens**, garantizado por construcción.
- **D3. ⭐ = consultado después de comprimido.** Un ítem de L2 o L3 que
  `contextoRelevante()` devuelve queda marcado y se salta en la siguiente
  recompresión. Si solo quedan ítems ⭐ y el presupuesto sigue excedido, se comprime
  el más viejo de todas formas: el tope gana, y queda en el log.
- **D4. Olvido.** Un ítem de L3 que cubre turnos con más de 200 turnos de antigüedad,
  sin ⭐ y nunca consultado, se elimina.
- **D5. Compresor con dos modos.**
  - **A (LLM):** usa la cadena `primeroQueResponda`: Anthropic → Gemini → Ollama local.
    Nemotron se retiró porque no cabe en la RAM; Ollama es el equivalente local.
  - **B (determinista):** se usa si ningún modelo responde o la salida es inválida.
    Conserva las oraciones con entidades (`AGE-123`, `#445`, `PR`) o con verbos de
    decisión ("decidimos", "acordamos", "se implementó", ...).
  - Cada compresión registra hora, capa de origen y de destino, tokens antes y
    después, ratio, modo y proveedor.
- **D6. Clasificador** `contextual | proyecto | off_topic`. Devuelve JSON con
  `confianza`.
  - Si el modelo falla, devuelve algo inválido o la confianza es menor a 0.6, se
    responde **`proyecto`** (consultar Cerebro).
  - Atajo sin LLM: si la pregunta menciona una entidad (`AGE-123`, `#445`) o una
    fuente (Jira, Notion, GitHub, Slack, staging, ...), es `proyecto`.
- **D7. Enrutado en Silia.**
  - **contextual:** modelo rápido con la memoria relevante y el system prompt del
    motor de memoria ("nunca inventes; si no alcanza, dilo y ofrece consultar
    Cerebro"). Si ningún modelo responde, cae a `proyecto`.
  - **proyecto:** `runDiagnose(texto, {persona: 'silia', contextoFile})`. El archivo
    lleva los turnos de L1, L2/L3, el expediente y el proyecto. Las citas y el
    resumen de la respuesta entran al expediente.
  - **off_topic:** modelo rápido sin contexto.
  - Toda respuesta (las tres ramas, y la verificada de System Design) entra a L1 como
    turno.
- **D8. Proyecto y fuentes** (`identificarProyecto`).
  - El proyecto por defecto es el motor de agentes: `agentes`, AGE, `Silia-mx/Agent`,
    AGE-133. Sale de un registro configurable (`memoria.proyectos`).
  - Fuentes sugeridas por palabras clave:

    | Palabras clave | Fuente |
    |---|---|
    | documentación, diseño | notion |
    | estado, sprint, asignado | jira |
    | dev, staging, main, producción, PR | github |
    | "se dijo", "acordamos", Slack | slack + rag |
  - Cerebro recibe el proyecto como guía: `project_key` para las herramientas de Jira,
    `repo` para las de GitHub y las fuentes sugeridas. Lo valida con regex estrictas,
    porque el archivo se trata como no confiable.
- **D9. Herramientas nuevas en Cerebro.**
  - `github_estado_de_pr(repo, number)`: dice en qué rama vive el merge de un PR
    (`develop` = dev, `staging`, `main` = listo para producción) comparando el
    `merge_commit_sha` con la cabeza de cada rama.
  - `slack_buscar(query)`: busca por palabras en el historial reciente de los canales
    `SLACK_CONTEXTO_CANALES`. El bot no puede usar `search.messages`, que requiere un
    token de usuario. Si falla, falla con un error legible.
- **D10. Reutilización entre modos.** System Design (persona `arquitecto`) recibe en
  su `contextoFile` la misma memoria y el mismo expediente que Silia, y su
  preliminar ve el resumen de memoria. Esto es lo que permite pasar de "pregunté en
  Silia" a "propón la arquitectura" sin perder nada.
- **D11. Persistencia.**
  - Se guardan L2, L3, el expediente, las métricas y el registro de compresiones en
    `~/.Vysper/memoria/session_<id>.json` (0600) al salir y después de cada
    compresión, para no perderlos si Vysper se cae. L1 no se guarda, porque es la
    conversación cruda.
  - Al iniciar se carga el archivo más reciente si `memoria.continuidad` es true (el
    valor por defecto) y tiene menos de `memoria.continuidadMaxDias` (7).
- **D12. Comandos.**
  - `/memoria status`: capas, tokens, ⭐, compresiones, usos por capa.
  - `/memoria comprimir`: deja en L1 solo los 2 últimos turnos y rota.
  - Funcionan en todos los modos.
  - Ctrl+Shift+L y `°°°` (`handleCodingContextReset`) ahora también borran la memoria
    de sesión y la asesoría, y guardan la sesión vacía para que un reinicio no
    resucite lo borrado. En modo secretaria Ctrl+Shift+L sigue limpiando solo el
    buffer de secretaria, sin cambios.
- **D13. Métricas** de uso por capa: `l1`, `l2`, `l3`, `expediente`, `cerebro`,
  `directo`. Se muestran en `/memoria status` y se persisten.

## Fuera de alcance

Los modos genéricos (secretaria, dsa, traductor...) ni escriben ni leen esta
memoria. Si se quiere después, el punto de enganche es `emitCommandResult`.

## Pruebas

En Jest (Vysper):
- 50 turnos → L3 < 10 % de los tokens originales.
- 100 turnos → memoria total ≤ 8 000 tokens.
- Las tres categorías del clasificador, y el respaldo a `proyecto` ante un fallo o
  una confianza baja.
- Una pregunta `proyecto` invoca a Cerebro con un `contextoFile` que trae la memoria.
- ⭐ y olvido, persistencia de ida y vuelta, `/memoria`.

En pytest (Cerebro):
- `cargar_contexto` y `construir_bloque_contexto` con memoria, expediente y proyecto,
  incluido el saneo.
- `github_estado_de_pr`.
- `slack_buscar`.
