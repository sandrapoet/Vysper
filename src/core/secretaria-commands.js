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

module.exports = { parseActualizaRagCommand };
