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

/**
 * Formats a /hoy <dominio> final_answer.domain_risk_review payload for
 * chat display. The Cerebro pipeline already renders the exact
 * per-activity template (ordering, tables, emoji headers) in Python — this
 * is a thin passthrough, not a re-templater, so the markdown contract
 * lives in one place (cerebro/orchestrator/domain_risk.py).
 */
function formatDomainRiskReview(review) {
  if (!review || !review.markdown) return 'No se pudo generar el analisis de riesgo.';
  return review.markdown;
}

/**
 * Formats a /revisar <url-pr> result for chat display. `review.report_markdown`
 * (rendered in Python -- ver Orchestrator._render_pr_review_markdown) ya
 * trae el detalle completo (pasos ejecutados, decision final, sugerencias)
 * -- esto es un thin passthrough con un footer de firma si aplica, mismo
 * patron que formatDomainRiskReview.
 */
/**
 * /crear-pr: resumen corto para el chat -- el detalle vive en el PR mismo
 * (titulo/descripcion, comentario, labels, reviewers ya aplicados por
 * Cerebro), asi que aca solo se confirma lo esencial.
 */
function formatCrearPrResult(result) {
  if (result && result.already_exists) {
    return result.message || `Ya existe un PR abierto para esta rama: ${result.pr_url}`;
  }
  if (!result || !result.pr_url) return 'No se pudo crear el PR.';
  const lines = [`PR ${result.draft ? '(draft) ' : ''}creado: ${result.pr_url}`];
  if (result.title) lines.push(`Titulo: ${result.title}`);
  if (result.jira_ticket_key) lines.push(`Jira: ${result.jira_ticket_key} -> "In Review"`);
  if (Array.isArray(result.labels) && result.labels.length) lines.push(`Labels: ${result.labels.join(', ')}`);
  if (Array.isArray(result.reviewers) && result.reviewers.length) lines.push(`Reviewers: ${result.reviewers.join(', ')}`);
  if (result.milestone) lines.push(`Milestone: ${result.milestone}`);
  return lines.join('\n');
}

/**
 * /cancelar-pr: confirma el cierre + la transicion de Jira si aplica.
 */
function formatCancelarPrResult(result) {
  if (!result || !result.closed) return 'No se pudo cancelar el PR.';
  const lines = [`PR cerrado: ${result.pr_url}`];
  if (result.jira_ticket_key) lines.push(`Jira ${result.jira_ticket_key} revertido a su estado anterior.`);
  return lines.join('\n');
}

/**
 * /aprobar-pr: cubre tanto la primera pasada (solo aprobacion, sin
 * merge/tag) como la segunda tras la confirmacion en el chat (merge/tag ya
 * ejecutados) -- `merge`/`tag` indican si esta llamada especifica ya los
 * incluyo, para no mostrar "sin completar" en la primera pasada donde
 * result.merge/result.tag vienen null a proposito.
 */
function formatAprobarPrResult(result, { merge = false, tag = false } = {}) {
  if (!result) return 'No se pudo procesar la aprobacion del PR.';
  const lines = [];
  lines.push(result.is_bot_author
    ? `PR aprobado automaticamente (autor bot): ${result.pr_url}`
    : `PR aprobado: ${result.pr_url}`);

  if (result.review && result.review.status) {
    lines.push(`Revision (--revisar): ${result.review.status}`);
  }

  if (merge) {
    if (result.merge && result.merge.merged) {
      lines.push(`Merge completado (sha ${String(result.merge.sha || '').slice(0, 7)}).`);
    } else {
      lines.push(`Merge no completado${result.merge && result.merge.message ? `: ${result.merge.message}` : '.'}`);
    }
  }

  if (tag) {
    if (result.tag && result.tag.tag_name) {
      lines.push(`Tag anotado creado: ${result.tag.tag_name}`);
    } else {
      lines.push('Tag no creado (el merge no se completo).');
    }
  }

  return lines.join('\n');
}

function formatPrReview(review) {
  if (!review || !review.report_markdown) return 'No se pudo generar la revision del PR.';
  const lines = [review.report_markdown];
  if (review.signature) {
    lines.push('', `🔏 Firma: ${review.signature.hash} (${review.signature.timestamp})`);
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

function _stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * build.sh marks each stage with a blank line + ">> Titulo" (see log() in
 * build.sh) — splits the already-ansi-stripped output into
 * [{title, body: [lines]}] on that marker, everything before the first
 * marker discarded.
 */
function _splitBuildShSections(cleanText) {
  const sections = [];
  let current = null;
  for (const line of cleanText.split('\n')) {
    const match = line.match(/^>>\s*(.+)$/);
    if (match) {
      current = { title: match[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections;
}

/**
 * Formats the raw (ansi-colored, very verbose) stdout of
 * `./build.sh --actualiza` into a short synthesized summary — showing that
 * log as-is in chat (as it was before this) reads as a wall of noise
 * (docker compose ps tables, health JSON, per-file "sin cambios" lines for
 * every already-ingested document) instead of an answer to "se actualizo el
 * RAG o no". Degrades gracefully: if a stage isn't found (script changed,
 * ran with different flags, etc.) it's just omitted, never crashes.
 */
function formatActualizaRagResult(stdout) {
  const clean = _stripAnsi(stdout || '');
  const sections = _splitBuildShSections(clean);
  const findSection = (predicate) => sections.find((s) => predicate(s.title));
  const lines = [];

  const testsSection = findSection((t) => t.startsWith('Corriendo suite de tests') || t.startsWith('Tests SALTEADOS'));
  if (testsSection) {
    if (testsSection.title.startsWith('Tests SALTEADOS')) {
      lines.push('- Tests: salteados (--skip-tests)');
    } else {
      const body = testsSection.body.join('\n');
      const passed = body.match(/(\d+) passed/);
      const failed = body.match(/(\d+) failed/);
      if (passed) lines.push(`- Tests: ${passed[1]} passed${failed ? `, ${failed[1]} failed` : ''}`);
    }
  }

  const rebuildSection = findSection((t) => /Rebuild forzado|Cambios detectados en backend|Sin cambios en backend/.test(t));
  if (rebuildSection) {
    lines.push(
      rebuildSection.title.includes('Sin cambios')
        ? '- Backend: sin cambios, stack ya estaba arriba'
        : '- Backend: reconstruido (cambios detectados en el codigo, o --force)'
    );
  }

  const healthSection = findSection((t) => t.startsWith('Health del backend'));
  if (healthSection) {
    const body = healthSection.body.join('\n').trim();
    const jsonLine = body.split('\n').find((l) => l.trim().startsWith('{'));
    try {
      const parsed = JSON.parse(jsonLine || body);
      lines.push(`- Salud del backend: ${parsed.status === 'ok' ? 'OK' : JSON.stringify(parsed)} (lightrag: ${parsed.lightrag})`);
    } catch {
      lines.push(`- Salud del backend: ${body || 'sin datos'}`);
    }
  }

  const normalizeSection = findSection((t) => t.includes('normalize_transcripts'));
  if (normalizeSection) {
    const body = normalizeSection.body;
    const normalized = body.filter((l) => /→\s+.+?:\s+normalizando/.test(l)).length;
    const unchanged = body.filter((l) => /sin cambios, se omite/.test(l)).length;
    const pendingReview = body.reduce((acc, l) => {
      const m = l.match(/⚠\s+(\d+)\s+término/);
      return acc + (m ? parseInt(m[1], 10) : 0);
    }, 0);
    lines.push(`- Normalización de transcripciones: ${normalized} normalizadas, ${unchanged} sin cambios${pendingReview ? `, ${pendingReview} término(s) pendientes de revisión` : ''}`);
  }

  const ingestSection = findSection((t) => t.includes('ingest.ingest'));
  if (ingestSection) {
    const ingested = [];
    let skippedCount = 0;
    for (const line of ingestSection.body) {
      const ingestedMatch = line.match(/✓\s+(.+?):\s+\d+ chunk/);
      if (ingestedMatch) ingested.push(ingestedMatch[1]);
      if (/sin cambios, se omite/.test(line)) skippedCount += 1;
    }
    if (ingested.length) {
      lines.push(`- Archivos nuevos ingeridos al RAG (${ingested.length}): ${ingested.join(', ')}`);
    } else {
      lines.push('- Archivos nuevos ingeridos al RAG: ninguno (todo lo existente ya estaba al dia)');
    }
    if (skippedCount) lines.push(`- Archivos sin cambios (omitidos): ${skippedCount}`);
  }

  const finishedOk = sections.some((s) => s.title.toLowerCase().startsWith('listo'));
  const header = finishedOk
    ? '✅ RAG actualizado correctamente.'
    : '⚠️ El script de actualizacion no llego a la etapa final ("Listo.") — revisa el detalle.';

  if (!lines.length) {
    return `${header}\n\n(No se pudo extraer un resumen detallado del log de esta corrida.)`;
  }
  return `${header}\n\n${lines.join('\n')}`;
}

module.exports = {
  formatCerebroFinalAnswer,
  formatOptimizacionesList,
  formatSprintRetro,
  formatDomainRiskReview,
  formatActualizaRagResult,
  buildIncidenteLogEntry,
  formatPrReview,
  formatCrearPrResult,
  formatCancelarPrResult,
  formatAprobarPrResult,
};
