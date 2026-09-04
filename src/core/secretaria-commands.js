/**
 * Pure text-command parsing shared by the "Secretaria" mode and any other
 * skill that also exposes it (silia, system-design). Kept free of Electron
 * so it can be unit-tested directly.
 */

function normalize(text) {
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Returns true if the text is the "/actualizaRag" command.
 */
function parseActualizaRagCommand(text) {
  return /^\/actualizaRag$/i.test(normalize(text));
}

/**
 * Parses "/reconocerVoz <ruta a una carpeta de sesion>", returning the raw
 * path (quotes stripped) or null if the text doesn't match.
 */
function parseReconocerVozCommand(text) {
  const match = normalize(text).match(/^\/reconocerVoz\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Parses "/optimiza <ruta a una carpeta de sesion>", returning the raw path
 * (quotes stripped) or null if the text doesn't match.
 */
function parseOptimizaCommand(text) {
  const match = normalize(text).match(/^\/optimiza\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Parses "/reconocerVozPendientes <ruta a una carpeta de sesion>", returning
 * the raw path (quotes stripped) or null if the text doesn't match.
 */
function parseReconocerVozPendientesCommand(text) {
  const match = normalize(text).match(/^\/reconocerVozPendientes\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Parses "/actualizarHablantes <ruta a una carpeta de sesion>", returning the
 * raw path (quotes stripped) or null if the text doesn't match.
 */
function parseActualizarHablantesCommand(text) {
  const match = normalize(text).match(/^\/actualizarHablantes\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Parses "/reidentificarMinutas --carpeta <ruta>" or
 * "/reidentificarMinutas --sesion <ruta>" (re-matchea contra el store de
 * huellas actual y sustituye texto en los transcripts/minuta sin LLM, ver
 * stt/reidentify_minutas.py). Returns { mode: 'carpeta' | 'sesion', path }
 * (quotes stripped) or null if the text doesn't match either form.
 */
function parseReidentificarMinutasCommand(text) {
  const match = normalize(text).match(/^\/reidentificarMinutas\s+--(carpeta|sesion)\s+(.+)$/i);
  if (!match) return null;
  return {
    mode: match[1].toLowerCase(),
    path: match[2].trim().replace(/^["']|["']$/g, '')
  };
}

module.exports = {
  parseActualizaRagCommand,
  parseReconocerVozCommand,
  parseOptimizaCommand,
  parseReconocerVozPendientesCommand,
  parseActualizarHablantesCommand,
  parseReidentificarMinutasCommand
};
