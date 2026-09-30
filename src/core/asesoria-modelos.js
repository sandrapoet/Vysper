/**
 * Cadena de modelos de la asesoria en vivo (modo system-design).
 *
 * No se reutiliza processTextWithSkill a proposito: con
 * llm.gemini.fallbackEnabled, si Gemini falla, esa cadena termina en
 * generateFallbackResponse, una respuesta GENERICA sin contexto con pinta de
 * respuesta. En la asesoria eso es peor que no decir nada: preferimos los tres
 * puntitos hasta que llegue la verificada.
 *
 * Cada llamador arma su propia lista de proveedores:
 *   - clasificador: nubes y despues Ollama local (solo decide si/no, y sin el
 *     la pregunta se pierde antes de llegar a Cerebro -- 2026-09-29).
 *   - preliminar: solo nubes. Un 14b local frio tarda y ademas compite por la
 *     GPU con el Ollama que Cerebro usa para la VERIFICADA.
 */

/**
 * Prueba los proveedores en orden y devuelve el primero con texto no vacio.
 * `proveedores`: [{ nombre, llamar: async (prompt) => string }].
 * Si todos fallan, lanza un Error que nombra el fallo de cada uno.
 */
async function primeroQueResponda(proveedores, prompt) {
  const fallos = [];
  for (const { nombre, llamar } of proveedores) {
    try {
      const texto = await llamar(prompt);
      if (typeof texto === 'string' && texto.trim()) return { texto, proveedor: nombre };
      fallos.push(`${nombre}: respuesta vacia`);
    } catch (error) {
      fallos.push(`${nombre}: ${error.message}`);
    }
  }
  throw new Error(fallos.join('; ') || 'no hay proveedores configurados');
}

module.exports = { primeroQueResponda };
