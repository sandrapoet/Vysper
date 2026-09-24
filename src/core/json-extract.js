/**
 * Extracción del primer objeto JSON de una respuesta de modelo.
 *
 * El clasificador de preguntas de la asesoría en vivo pide JSON, pero un
 * modelo puede devolverlo envuelto en prosa ("Claro, aquí tienes: {...}") o
 * en una valla de código. Y si este parser lanza, rompe el dictado de una
 * reunión EN CURSO — por eso no lanza nunca: un JSON ilegible significa
 * "no es una pregunta", que es el lado seguro del error.
 */

/**
 * @param {string} texto respuesta cruda del modelo
 * @returns {object|null} el primer objeto JSON, o null si no hay ninguno legible
 */
function primerObjetoJson(texto) {
  const limpio = String(texto == null ? '' : texto).replace(/```(?:json)?/gi, '');
  const ini = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (ini === -1 || fin <= ini) return null;

  try {
    const obj = JSON.parse(limpio.slice(ini, fin + 1));
    // Un array no sirve: el contrato es un objeto con esPregunta.
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

module.exports = { primerObjetoJson };
