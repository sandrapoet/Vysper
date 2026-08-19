/**
 * Pure helpers for turning a Cerebro final_answer into Vysper chat output
 * and incidentes.log entries. Kept free of Electron/fs so it's testable
 * directly.
 */

function formatCerebroFinalAnswer(result = {}) {
  const lines = [];
  lines.push(result.summary || 'Sin resumen disponible.');

  const citations = Array.isArray(result.citations) ? result.citations : [];
  if (citations.length) {
    lines.push('', '**Fuentes:**');
    citations.forEach((c) => {
      const label = c.file_source || c.url || 'fuente desconocida';
      lines.push(c.url ? `- ${label} (${c.url})` : `- ${label}`);
    });
  }

  const actionItems = Array.isArray(result.action_items) ? result.action_items : [];
  if (actionItems.length) {
    lines.push('', '**Acciones sugeridas:**');
    actionItems.forEach((item) => lines.push(`- ${item}`));
  }

  if (result.rovo_suggested_question) {
    lines.push('', `**Pregunta sugerida para Rovo:** ${result.rovo_suggested_question}`);
  }

  return lines.join('\n');
}

function buildIncidenteLogEntry(descripcion, prompt, now = new Date()) {
  return {
    timestamp: now.toISOString(),
    descripcion,
    prompt
  };
}

module.exports = { formatCerebroFinalAnswer, buildIncidenteLogEntry };
