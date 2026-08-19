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

const PRIORITY_ICON = { Alta: '🔴', Media: '🟡', Baja: '🟢' };

/**
 * Formats the SMC's `optimizaciones`/`propuestas` list for chat display.
 * Each proposal shows its id (needed for "/propuesta <id> aceptar|..."),
 * priority, problem and proposed solution.
 */
function formatOptimizacionesList(proposals = []) {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return 'No hay propuestas de optimizacion pendientes. El analisis diario corre automaticamente; usa "/analizar" para forzarlo ahora.';
  }

  const lines = ['**Propuestas de optimizacion:**', ''];
  proposals.forEach((p) => {
    const icon = PRIORITY_ICON[p.priority] || '';
    lines.push(`${icon} **#${p.id} — ${p.title}** (${p.priority}, ${p.status})`);
    lines.push(`Problema: ${p.problem}`);
    lines.push(`Propuesta: ${p.proposal}`);
    lines.push(`Impacto estimado: ${p.impact_estimate}`);
    lines.push('');
  });
  lines.push('Responde con "/propuesta <id> aceptar|rechazar|posponer [motivo]" para decidir.');
  return lines.join('\n');
}

const SEVERITY_ICON = { Alto: '🚨', Medio: '⚠️', Bajo: 'ℹ️' };

/**
 * Formats a /silia retro final_answer.retro payload for chat display.
 * Every number (metrics, completed/pending counts) comes straight from
 * the pipeline's computed data, never re-derived here — this function
 * only lays it out.
 */
function formatSprintRetro(retro) {
  if (!retro) return 'No se pudo generar la retrospectiva.';

  const { sprint, metrics, completed, pending, risks, recommendations, applied_optimizations: applied } = retro;
  const lines = [];
  const range = sprint.start && sprint.end ? ` (${sprint.start.slice(0, 10)} - ${sprint.end.slice(0, 10)})` : '';
  lines.push(`=== RETROSPECTIVA ${sprint.name}${range} ===`, '');

  lines.push('📊 METRICAS CLAVE:', '');
  lines.push(`- Tickets: ${metrics.completed_count}/${metrics.total_issues} completados (${metrics.pct_completed}%)`);
  lines.push(`- Bloqueados: ${metrics.blocked_count} (${metrics.pct_blocked}%)`);
  if (metrics.avg_resolution_days !== null && metrics.avg_resolution_days !== undefined) {
    lines.push(`- Tiempo promedio de resolucion: ${metrics.avg_resolution_days} dias`);
  }
  lines.push(
    metrics.story_points_tracked
      ? `- Story points: ${metrics.story_points_completed}/${metrics.story_points_total} completados`
      : '- Story points: no configurados en este proyecto'
  );
  lines.push('');

  lines.push(`✅ COMPLETADOS (${completed.length}):`, '');
  completed.forEach((i) => lines.push(`- ${i.key}: ${i.summary}`));
  lines.push('');

  lines.push(`⏳ PENDIENTES/BLOQUEADOS (${pending.length}):`, '');
  pending.forEach((i) => lines.push(`- ${i.key}: ${i.summary} - ${i.status}${i.blocked ? ' (BLOQUEADO)' : ''}`));
  lines.push('');

  if (risks && risks.length) {
    lines.push('🚨 RIESGOS IDENTIFICADOS:', '');
    risks.forEach((r) => lines.push(`- ${SEVERITY_ICON[r.severity] || ''} ${r.description} (${r.severity})`));
    lines.push('');
  }

  if (recommendations && recommendations.length) {
    lines.push('💡 RECOMENDACIONES:', '');
    recommendations.forEach((r) => lines.push(`- [${r.priority}] ${r.text}`));
    lines.push('');
  }

  if (applied && applied.length) {
    lines.push('🔄 OPTIMIZACIONES APLICADAS (de retros/analisis anteriores):', '');
    applied.forEach((o) => lines.push(`- ${o.title} → ${o.measured_impact || 'impacto aun sin medir'}`));
    lines.push('');
  }

  lines.push(retro.summary);
  if (retro.created_optimization_ids && retro.created_optimization_ids.length) {
    lines.push(
      '',
      `Se crearon ${retro.created_optimization_ids.length} propuesta(s) pendientes en el sistema de mejora ` +
        `continua a partir de las recomendaciones (ids: ${retro.created_optimization_ids.join(', ')}). ` +
        'Usa "/propuesta <id> aceptar|rechazar|posponer" para decidir.'
    );
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

module.exports = {
  formatCerebroFinalAnswer,
  formatOptimizacionesList,
  formatSprintRetro,
  buildIncidenteLogEntry,
};
