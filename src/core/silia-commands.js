/**
 * Pure text-command parsing for the "Silia" mode (/silia daily, /incidente).
 * Kept free of Electron so it can be unit-tested directly.
 */

function normalize(text) {
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Returns true if the text is the "/silia daily" checkpoint command.
 */
function parseSiliaDailyCommand(text) {
  const normalized = normalize(text);
  return /^\/silia\s+daily$/i.test(normalized);
}

/**
 * Returns the incident description if text is an "/incidente <description>"
 * command, otherwise null.
 */
function parseIncidenteCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/incidente\s+([\s\S]+)$/i);
  if (!match) return null;

  let description = match[1].trim();
  if (description.length >= 2 &&
      ((description.startsWith('"') && description.endsWith('"')) ||
       (description.startsWith('\'') && description.endsWith('\'')))) {
    description = description.slice(1, -1).trim();
  }

  return description.length > 0 ? description : null;
}

module.exports = { parseSiliaDailyCommand, parseIncidenteCommand };
