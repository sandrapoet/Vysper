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
/**
 * Resultado por ticket de una transicion de Jira. Un PR puede cubrir varios
 * (AGE-233, AGE-234, AGE-236) y ahora se mueven TODOS -- antes se movia solo
 * el primero, en silencio.
 *
 * Se listan uno por uno en vez de resumir en "3 tickets movidos" porque cada
 * uno se intenta por separado: si el segundo falla, el primero YA se movio, y
 * un resumen unico haria pasar por completo algo que quedo a medias.
 */
function formatJiraTransitions(transitions, estadoLabel) {
  if (!Array.isArray(transitions) || !transitions.length) return [];
  return transitions.map((t) => {
    if (t.error) return `Jira ${t.key}: ⚠️ no se pudo mover (${t.error})`;
    if (t.skipped) return `Jira ${t.key}: sin cambios (${t.skipped})`;
    if (t.commented) return `Jira ${t.key}: comentado (sin cambio de estado)`;
    return `Jira ${t.key} -> "${t.transition || estadoLabel}"`;
  });
}

function formatCrearPrResult(result) {
  if (result && result.already_exists) {
    const lines = [result.message || `Ya existe un PR abierto para esta rama: ${result.pr_url}`];
    if (result.untracked_files_warning) lines.push(`\n⚠️ ${result.untracked_files_warning}`);
    if (result.other_branch_uncommitted_note) lines.push(`\nℹ️ ${result.other_branch_uncommitted_note}`);
    return lines.join('\n');
  }
  if (!result || !result.pr_url) return 'No se pudo crear el PR.';
  const lines = [`PR ${result.draft ? '(draft) ' : ''}creado: ${result.pr_url}`];
  if (result.title) lines.push(`Titulo: ${result.title}`);
  const jiraLines = formatJiraTransitions(result.jira_transitions, 'In Review');
  if (jiraLines.length) {
    lines.push(...jiraLines);
  } else if (result.jira_ticket_key) {
    lines.push(`Jira: ${result.jira_ticket_key} -> "In Review"`);
  }
  if (result.multi_ticket_note) lines.push(`\n⚠️ ${result.multi_ticket_note}`);
  if (Array.isArray(result.labels) && result.labels.length) lines.push(`Labels: ${result.labels.join(', ')}`);
  if (Array.isArray(result.reviewers) && result.reviewers.length) lines.push(`Reviewers: ${result.reviewers.join(', ')}`);
  if (Array.isArray(result.team_reviewers) && result.team_reviewers.length) lines.push(`Equipos: ${result.team_reviewers.join(', ')}`);
  // Que un PR quede sin reviewers puede ser aceptable; que no se diga, no:
  // quedaba esperando a que alguien lo notara.
  if (result.reviewers_note) lines.push(`\n⚠️ ${result.reviewers_note}`);
  if (result.milestone) lines.push(`Milestone: ${result.milestone}`);
  // Un PR en draft no lo puede revisar nadie: GitHub retiene las
  // notificaciones de review request hasta marcarlo ready. Sin este aviso
  // el dato quedaba en un "draft": true perdido entre veinte campos, y hubo
  // PRs que se quedaron dias esperando una revision que nunca iba a llegar.
  if (result.draft_note) lines.push(`\n⚠️ ${result.draft_note}`);
  if (result.untracked_files_warning) lines.push(`\n⚠️ ${result.untracked_files_warning}`);
  // Puramente informativo -- ver docstring de Orchestrator.run_crear_pr:
  // no afecta el PR, el push, ni ningun otro comentario/mensaje publicado.
  if (result.other_branch_uncommitted_note) lines.push(`\nℹ️ ${result.other_branch_uncommitted_note}`);
  return lines.join('\n');
}

/**
 * /revisar --merge: el merge, y lo que quedo pendiente DESPUES de el.
 *
 * El merge es irreversible, asi que Cerebro nunca lo reporta como error
 * cuando falla un paso posterior (transicion de Jira, comentario de cierre,
 * release): sale con codigo 2 y los lista en `pasos_no_completados`. Aca se
 * renderizan JUNTO al merge, nunca en vez de el -- esconder que el merge si
 * ocurrio empuja a reintentar el comando, que es lo unico que no hay que
 * hacer. Caso real: el PR 272 cerro con el ticket de Jira sin mover y el
 * resultado decia {"merged": true} a secas.
 */
function formatRevisarMergeResult(result) {
  if (!result || !result.merged) return 'No se pudo mergear el PR.';
  const lines = [`PR mergeado: ${result.pr_url}`];
  if (result.comment_url) lines.push(`Comentario: ${result.comment_url}`);
  if (result.release) lines.push(`Release creado: ${result.release.tag_name} (${result.release.url})`);

  // Tickets que este PR entrega sin nombrar. Al mergear el aviso importa
  // MAS, no menos: el PR ya entro y nada va a transicionar ese ticket --
  // AGE-431 se quedo en "En curso" con su codigo ya en develop. Cerebro los
  // trae de la fila APPROVED, no los re-escanea.
  if (result.advertencia_huerfanos) {
    lines.push(`\n⚠️ ${result.advertencia_huerfanos}`);
    lines.push('Transicionalos a mano: este merge no los toca.');
  }

  const pendientes = Array.isArray(result.pasos_no_completados) ? result.pasos_no_completados : [];
  if (pendientes.length) {
    lines.push(
      `\n⚠️ El merge SI se completo, pero ${pendientes.length} paso(s) posterior(es) no. ` +
      'No vuelvas a correr /revisar --merge: el PR ya esta mergeado.'
    );
    for (const paso of pendientes) {
      const detalle = paso.detalle ? `: ${paso.detalle}` : '';
      const remediacion = paso.remediacion ? ` -> ${paso.remediacion}` : '';
      lines.push(`  • ${paso.label || paso.paso}${detalle}${remediacion}`);
    }
  }
  return lines.join('\n');
}

/**
 * La cola de un /revisar asincrono: que hacer ahora y como pedir el resto.
 *
 * Se agrega al reporte de /revisar cuando quedo un trabajo corriendo. El
 * revisor con herramientas tarda entre 6 y 20 minutos contra un techo de
 * 480s que se aplica dos veces en la cadena del tunel, asi que la parte
 * profunda NO viene en esta respuesta -- y decirlo es la mitad del trabajo:
 * un reporte que se lee completo cuando falta lo mas caro es peor que uno
 * que avisa.
 */
function formatRevisarPendiente(result) {
  if (!result || !result.job_id || result.job_estado !== 'en_curso') return '';
  const lines = [
    '',
    `⏳ La revisión profunda sigue corriendo. Job: ${result.job_id}`,
    'Tarda entre 6 y 20 minutos. Cuando termine publica su review en el PR y avisa por Slack.',
    `Para consultarla: /revisar-estado ${result.job_id}`,
  ];
  if (result.revisor_lanzado && result.revisor_lanzado.ok === false) {
    // El proceso desacoplado no arranco: el job quedaria en_curso para
    // siempre y nadie sabria por que. Decirlo aca es la unica oportunidad.
    lines.push(`⚠️ Pero el proceso no se pudo lanzar: ${result.revisor_lanzado.motivo}`);
    lines.push('La revisión profunda NO va a llegar. Corré /revisar de nuevo desde la PC.');
  }
  return lines.join('\n');
}

/**
 * /revisar-estado <job-id>: en que quedo un trabajo asincrono.
 */
function formatRevisarEstado(result) {
  if (!result) return 'Sin respuesta de Cerebro.';
  if (result.error) return `❌ ${result.error}`;

  const revision = result.revision_skill || {};
  if (result.job_estado === 'en_curso') {
    return [
      `⏳ Todavía corriendo. Job: ${result.job_id}`,
      `PR: ${result.pr_url}`,
      'Volvé a preguntar en unos minutos.',
    ].join('\n');
  }
  if (result.job_estado === 'fallido') {
    return [
      `❌ La revisión profunda NO completó. Job: ${result.job_id}`,
      `PR: ${result.pr_url}`,
      `Motivo: ${result.job_detalle || revision.motivo || 'sin detalle'}`,
      // Nunca se presenta como "revisado y sin hallazgos": un verde que no
      // revisó nada es indistinguible de uno limpio, y es el peor resultado
      // que esta herramienta puede producir.
      'El veredicto de arriba NO incluye su análisis.',
    ].join('\n');
  }

  const lines = [
    `✅ Revisión profunda terminada. Job: ${result.job_id}`,
    `PR: ${result.pr_url}`,
    `Publicada como comentario en el PR (${revision.turnos || 0} turnos, ` +
      `${Math.round(revision.duracion_s || 0)}s, facturado contra ${revision.facturacion || 'desconocido'}).`,
  ];
  if (Array.isArray(revision.denegaciones) && revision.denegaciones.length) {
    lines.push(
      `⚠️ Hubo denegaciones de permisos: ${revision.denegaciones.join(', ')} — ` +
      'el veredicto puede ser pobre por falta de herramientas, no por un PR limpio.'
    );
  }
  return lines.join('\n');
}

const READINESS_ICONO = { READY: '✅', 'NEEDS FIXES': '⚠️', BLOCKED: '⛔' };

/**
 * /audit: el arranque. Lo que vuelve en segundos es el PREFLIGHT, no la
 * auditoria -- seis lentes en paralelo no caben en los 480s del túnel.
 *
 * El preflight que corta NO es un error: que estés parado en develop, o que
 * no haya ningún cambio, es una respuesta legítima y la más barata posible.
 * Presentarla como fallo haría creer que algo se rompió.
 */
function formatAuditArranque(result) {
  if (!result) return 'Sin respuesta de Cerebro.';
  if (result.error) return `❌ ${result.error}`;

  if (result.preflight_ok === false) {
    return [
      `ℹ️ No hay nada que auditar: ${result.detalle || result.motivo}`,
      result.rama ? `Rama: ${result.rama}` : '',
    ].filter(Boolean).join('\n');
  }

  const lines = [
    `🔎 Auditando \`${result.rama}\` contra \`${result.base}\` (${result.repo})`,
    `${(result.archivos || []).length} archivo(s) con cambios: sin commitear, en stage y commiteados.`,
  ];
  if (result.job_estado === 'en_curso' && result.job_id) {
    lines.push(
      '',
      `⏳ Los seis lentes corren aparte. Job: ${result.job_id}`,
      'Cuando termine avisa por Slack.',
      `Para consultarla: /audit-estado ${result.job_id}`,
    );
    if (result.auditor_lanzado && result.auditor_lanzado.ok === false) {
      lines.push(`⚠️ Pero el proceso no se pudo lanzar: ${result.auditor_lanzado.motivo}`);
      lines.push('La auditoría NO va a llegar. Corréla de nuevo desde la PC.');
    }
  }
  return lines.join('\n');
}

/**
 * /audit-estado <job-id>: en qué quedó una auditoría.
 */
function formatAuditEstado(result) {
  if (!result) return 'Sin respuesta de Cerebro.';
  if (result.error) return `❌ ${result.error}`;

  if (result.job_estado === 'en_curso') {
    return [
      `⏳ Todavía corriendo. Job: ${result.job_id}`,
      `Rama: ${result.rama} (${result.repo})`,
      'Volvé a preguntar en unos minutos.',
    ].join('\n');
  }
  if (result.job_estado === 'fallido') {
    return [
      `❌ La auditoría NO completó. Job: ${result.job_id}`,
      `Rama: ${result.rama} (${result.repo})`,
      `Motivo: ${result.job_detalle || 'sin detalle'}`,
      // Nunca se presenta como "auditado y limpio": un veredicto ausente es
      // uno que no llegó, no uno favorable.
      'No hay veredicto: no lo leas como que está listo.',
    ].join('\n');
  }

  const conteos = result.conteos || {};
  const readiness = result.readiness || '';
  const lines = [
    `${READINESS_ICONO[readiness] || '❔'} **${readiness || 'SIN VEREDICTO'}** — \`${result.rama}\` (${result.repo})`,
  ];
  lines.push(
    conteos.parseado
      ? `${conteos.blocker || 0} blocker · ${conteos.major || 0} major · ` +
        `${conteos.minor || 0} minor · ${conteos.suggestion || 0} sugerencia(s)`
      : 'Sin desglose de severidades en el reporte.'
  );
  if (result.reporte) lines.push('', result.reporte);
  return lines.join('\n');
}

/**
 * /cancelar-pr: confirma el cierre + la transicion de Jira si aplica.
 */
function formatCancelarPrResult(result) {
  if (!result || !result.closed) return 'No se pudo cancelar el PR.';
  const lines = [`PR cerrado: ${result.pr_url}`];
  const jiraLines = formatJiraTransitions(result.jira_transitions, 'su estado anterior');
  if (jiraLines.length) {
    lines.push(...jiraLines);
  } else if (result.jira_ticket_key) {
    lines.push(`Jira ${result.jira_ticket_key} revertido a su estado anterior.`);
  }
  if (result.multi_ticket_note) lines.push(`\n⚠️ ${result.multi_ticket_note}`);
  return lines.join('\n');
}

/**
 * /script: confirma que el script corrio y muestra su salida (stdout).
 */
function formatScriptResult(result) {
  if (!result || !result.executed) return 'No se pudo ejecutar el script.';
  const lines = ['Script ejecutado correctamente.'];
  if (result.output) lines.push(result.output);
  return lines.join('\n\n');
}

/**
 * /merge: confirma el merge puro (sin approve/Jira, ver /aprobar-pr para
 * ese flujo completo).
 */
function formatMergeResult(result) {
  if (!result || !result.merged) return 'No se pudo mergear el PR.';
  const lines = [`PR mergeado: ${result.pr_url}`];
  if (result.sha) lines.push(`SHA: ${result.sha}`);
  return lines.join('\n');
}

/**
 * /aprobar-pr: cubre tanto la primera pasada (solo aprobacion, sin
 * merge/tag) como la segunda tras la confirmacion en el chat (merge/tag ya
 * ejecutados) -- `merge`/`tag` indican si esta llamada especifica ya los
 * incluyo, para no mostrar "sin completar" en la primera pasada donde
 * result.merge/result.tag vienen null a proposito.
 */
/**
 * Evidencia del merge gate (las pruebas corridas sobre base+head YA
 * mergeados, no sobre la rama head aislada -- ver merge_gate.py en
 * Cerebro). Se muestra SIEMPRE que Cerebro la devuelva, incluido el caso
 * "no se corrio ninguna": un gate apagado que no se declara es peor que no
 * tenerlo, porque el mensaje suena a que se reviso.
 */
function formatMergeGateEvidence(gate) {
  if (!gate) return [];
  if (!gate.validated) {
    return [`⚠️ Merge gate: ${gate.reason || 'no se corrieron pruebas.'}`];
  }
  const base = String(gate.base_sha || '').slice(0, 7);
  const cached = gate.cached ? ' (resultado ya calculado en el paso anterior)' : '';
  if (gate.ok) {
    const cuantos = (gate.passed || []).length;
    return [`✅ Merge gate: ${cuantos} suite(s) OK sobre base+head mergeados (base ${base})${cached}.`];
  }
  const lines = [`❌ Merge gate: ${gate.reason || 'fallaron las pruebas del merge.'}`];
  if (gate.failed_command) lines.push(`   Comando: ${gate.failed_command}`);
  if (Array.isArray(gate.conflicting_files) && gate.conflicting_files.length) {
    lines.push(`   Archivos en conflicto: ${gate.conflicting_files.join(', ')}`);
  }
  return lines;
}

/**
 * `pendingConfirmation` describe la accion a confirmar ("mergear",
 * "mergear y crear un tag anotado"). Cuando viene, la peticion de
 * confirmacion se arma DENTRO de este mismo mensaje en vez de emitirse
 * aparte.
 *
 * Es un requisito funcional, no cosmetico: por el tunel del celular
 * (POST /comando -> runChatCommandHeadless) la promesa se resuelve con el
 * PRIMER emitSiliaResult y todo lo que venga despues se descarta. Con dos
 * mensajes separados, al telefono llegaba el resultado y NUNCA la pregunta
 * -- habia que contestar "si" a ciegas, sin saber si el gate paso.
 */
function formatAprobarPrResult(result, { merge = false, tag = false, pendingConfirmation = null } = {}) {
  if (!result) return 'No se pudo procesar la aprobacion del PR.';
  const lines = [];
  lines.push(result.is_bot_author
    ? `PR aprobado automaticamente (autor bot): ${result.pr_url}`
    : `PR aprobado: ${result.pr_url}`);

  if (result.branch_leveled && result.branch_leveled.leveled) {
    lines.push(`Rama nivelada con su base (head ${String(result.branch_leveled.new_head_sha || '').slice(0, 7)}).`);
  }

  if (result.review && result.review.status) {
    lines.push(`Revision (--revisar): ${result.review.status}`);
  }

  lines.push(...formatMergeGateEvidence(result.merge_gate));
  lines.push(...formatJiraTransitions(result.jira_transitions, 'Done'));
  // Que NO se haya movido el ticket es informacion: mergear a develop no
  // es un evento de Jira, y sin decirlo parece que el comando fallo.
  if (result.multi_ticket_note) lines.push(`ℹ️ ${result.multi_ticket_note}`);

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

  // El deploy NO se dispara solo: deploy-app.yml filtra por paths que no
  // incluyen Agent y deploy-service.yml es workflow_dispatch puro. Si esto
  // no se dice, el merge a staging/main parece haber desplegado.
  if (result.deploy_dispatch) {
    const d = result.deploy_dispatch;
    if (d.pendiente) {
      lines.push(`Deploy PENDIENTE: hay que lanzar ${d.workflow} en ${d.repo} con ref=${d.ref} (no se dispara solo).`);
    } else if (d.dispatch) {
      lines.push(`Deploy disparado: ${d.workflow} en ${d.repo} (ref=${d.ref}).`);
    }
    (d.advertencias || []).forEach((a) => lines.push(`⚠️ ${a}`));
    if (d.dispatch_bloqueado) lines.push(`⚠️ ${d.dispatch_bloqueado}`);
  }

  // PRs apilados sobre la rama que se acaba de mergear. Mergear NO borra
  // la rama (delete_branch_on_merge: false), asi que siguen apuntando a
  // una rama muerta: mergearlos asi manda su codigo ahi y el ticket
  // avanza igual. Es accionable y hay que decirlo, no enterrarlo.
  //
  // El ORDEN es parte del aviso, no un detalle: borrar la rama primero NO
  // reapunta los PRs, los CIERRA y los deja en deadlock (verificado en
  // vivo con el #203). Por eso van los comandos concretos y el borrado
  // queda explicitamente despues, nunca como atajo equivalente.
  if (result.cadena_pendiente && Array.isArray(result.cadena_pendiente.prs) && result.cadena_pendiente.prs.length) {
    const cadena = result.cadena_pendiente;
    lines.push(`⚠️ Cadena pendiente de reapuntar: ${cadena.prs.length} PR(s) siguen con base '${cadena.rama_mergeada}' (ya mergeada).`);
    cadena.prs.forEach((pr) => lines.push(`   #${pr.number} ${pr.title} — ${pr.url}`));
    lines.push(`   PRIMERO reapuntalos a '${cadena.destino_real}':`);
    (cadena.comandos_reapuntar || []).forEach((cmd) => lines.push(`     ${cmd}`));
    lines.push('   RECIEN DESPUES borra la rama, si quieres. Borrarla antes CIERRA esos PRs y los deja en deadlock.');
  }

  if (pendingConfirmation) {
    lines.push('');
    lines.push(`¿Confirmas ${pendingConfirmation} el PR ${result.pr_url}? Responde "si" para continuar o "no" para cancelar.`);
  }

  return lines.join('\n');
}

/**
 * /actualizar-jira SIN --confirmar: muestra el preview de `result.cambios`
 * (uno por cambio identificado en el texto libre) antes de que se escriba
 * nada en Jira -- runActualizarJiraCommand en main.js guarda este mismo
 * array como `this.pendingJiraUpdate.plan` y lo reenvia tal cual (sin
 * regenerarlo) cuando el usuario confirma. Las entradas marcadas
 * `requiere_revision` se muestran aparte con su motivo, nunca como si
 * fueran a aplicarse.
 */
function formatActualizarJiraPreview(result) {
  if (!result || !Array.isArray(result.cambios)) return 'No se pudo generar el preview de /actualizar-jira.';
  if (!result.cambios.length) return 'No se identifico ningun cambio a partir del texto dado.';

  const lines = [`Se identificaron ${result.cambios.length} cambio(s):`, ''];
  result.cambios.forEach((cambio, i) => {
    lines.push(`${i + 1}. ${cambio.issue_key} — ${cambio.campo}`);
    if (cambio.requiere_revision) {
      lines.push(`   ⚠️ Requiere revisión manual: ${cambio.nota || 'sin detalle'}`);
    } else if (cambio.campo === 'comentario') {
      // Un comentario AGREGA constancia, no reemplaza nada: mostrarlo con
      // el par Actual/Propuesto de los demas campos ("Actual: (vacío)")
      // haria pensar que pisa contenido del ticket.
      lines.push('   Se agregará este comentario (no modifica la descripción):');
      lines.push(`   ${cambio.valor_propuesto}`);
    } else {
      const actual = cambio.valor_actual === null || cambio.valor_actual === undefined || cambio.valor_actual === ''
        ? '(vacío)' : cambio.valor_actual;
      lines.push(`   Actual: ${actual}`);
      lines.push(`   Propuesto: ${cambio.valor_propuesto}`);
    }
    // Un comentario que trae frases dirigidas a la herramienta se publica
    // LITERAL en Jira con el nombre del usuario: el aviso tiene que verse
    // en el chat, que es donde se decide confirmar.
    if (cambio.advertencia) lines.push(`   ⚠️ ${cambio.advertencia}`);
    lines.push('');
  });
  return lines.join('\n').trim();
}

/**
 * Segundo turno de /actualizar-jira (tras la confirmacion explicita del
 * usuario, ver resolvePendingJiraUpdate en main.js): resume que se aplico
 * de verdad, que fallo al escribir, y que se omitio por seguir marcado
 * `requiere_revision` (defensa en profundidad -- nunca deberia llegar
 * ninguno aca, ver Orchestrator._apply_jira_update_plan).
 */
function formatActualizarJiraApplyResult(result) {
  if (!result) return 'No se pudo aplicar los cambios de /actualizar-jira.';
  const aplicados = result.aplicados || [];
  const fallidos = result.fallidos || [];
  const omitidos = result.omitidos || [];
  const lines = [];

  if (aplicados.length) {
    lines.push(`✅ Aplicados (${aplicados.length}):`);
    aplicados.forEach((a) => lines.push(`- ${a.issue_key} (${a.campo})`));
  }
  if (fallidos.length) {
    if (lines.length) lines.push('');
    lines.push(`❌ Fallidos (${fallidos.length}):`);
    fallidos.forEach((f) => lines.push(`- ${f.issue_key} (${f.campo}): ${f.error}`));
  }
  if (omitidos.length) {
    if (lines.length) lines.push('');
    lines.push(`⏭️ Omitidos por requerir revisión (${omitidos.length}):`);
    omitidos.forEach((o) => lines.push(`- ${o.issue_key} (${o.campo}): ${o.nota}`));
  }
  return lines.length ? lines.join('\n') : 'No se aplico ningun cambio.';
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

/**
 * /crear-ticket SIN --confirmar: muestra lo que se va a crear, ANTES de
 * escribir nada. Se detalla cada link con su tipo resuelto porque ahi esta
 * el error caro: poner "bloquea" donde iba "relacionado con" deja varado el
 * PR del otro afirmando algo que nadie dijo.
 *
 * El tipo del PADRE se muestra siempre que haya uno: es lo que deja ver, de
 * un vistazo y antes de confirmar, que el ticket no va a quedar colgando del
 * Epic en vez de la Feature.
 */
function formatCrearTicketPreview(result) {
  const t = (result || {}).ticket_propuesto;
  if (!t) return 'No se pudo generar el preview de /crear-ticket.';

  const lines = ['Se va a crear este ticket:', ''];
  lines.push(`${t.proyecto || '(sin proyecto)'} — ${t.tipo || '(sin tipo)'}`);
  lines.push(`Resumen: ${t.resumen || '(sin resumen)'}`);
  if (t.padre) lines.push(`Padre: ${t.padre.key} (tipo ${t.padre.tipo || '?'})`);
  if (t.sprint) lines.push(`Sprint: ${t.sprint.name} (id ${t.sprint.id})`);
  if (t.asignado_a) lines.push(`Asignado a: ${t.asignado_a.display_name || t.asignado_a.account_id}`);
  if (t.fecha_limite) lines.push(`Fecha límite: ${t.fecha_limite}`);
  if (t.story_points !== null && t.story_points !== undefined) lines.push(`Story points: ${t.story_points}`);

  if ((t.links || []).length) {
    lines.push('');
    lines.push('Relaciones:');
    t.links.forEach((l) => {
      if (l.requiere_revision) {
        lines.push(`- ⚠️ ${l.relacion_pedida || '?'} → ${l.clave || '?'}: sin resolver`);
        return;
      }
      // "el ticket nuevo bloquea a X" vs "X bloquea al ticket nuevo": la
      // direccion se dice en palabras porque invertirla afirma lo contrario.
      const frase = l.invertido
        ? `${l.clave} ${l.tipo} → el ticket nuevo`
        : `el ticket nuevo ${l.tipo} → ${l.clave}`;
      lines.push(`- ${l.relacion_pedida}: ${frase}`);
    });
  }

  const descripcion = t.descripcion || '';
  lines.push('');
  lines.push(`Descripción (${descripcion.split('\n').length} línea(s), va verbatim):`);
  lines.push(descripcion.length > 600 ? `${descripcion.slice(0, 600)}\n[...]` : descripcion);

  if ((result.notas || []).length) {
    lines.push('');
    lines.push('⚠️ Requiere revisión manual antes de poder crearlo:');
    result.notas.forEach((n) => lines.push(`- ${n}`));
  }
  return lines.join('\n').trim();
}

/**
 * Segundo turno de /crear-ticket: que se creo de verdad.
 *
 * La verificacion de links se muestra SIEMPRE, no solo cuando falla:
 * create_issue_link devuelve un eco (Jira no da id de link), asi que "se
 * crearon 3 relaciones" sin el contraste de la relectura seria una
 * afirmacion sin respaldo -- y es justo la afirmacion que importa.
 */
function formatCrearTicketResult(result) {
  if (!result || !result.key) return 'No se pudo crear el ticket.';

  const lines = [`✅ Ticket creado: ${result.key}`];
  if (result.url) lines.push(result.url);
  if (result.sprint_aplicado === true) lines.push('Agregado al sprint.');

  const verificacion = result.verificacion_links || [];
  if (verificacion.length) {
    lines.push('');
    lines.push(result.verificado
      ? 'Relaciones verificadas releyendo el ticket:'
      : '⚠️ Relaciones — al releer el ticket NO coinciden todas:');
    verificacion.forEach((v) => {
      if (v.coincide) {
        lines.push(`- ✅ ${v.clave}: ${v.tipo_esperado}`);
      } else if (v.encontrado) {
        lines.push(`- ❌ ${v.clave}: se pidió ${v.tipo_esperado}, figura ${v.tipo_real}`);
      } else {
        lines.push(`- ❌ ${v.clave}: no aparece`);
      }
    });
  }
  if (result.padre_verificado === false) {
    lines.push('');
    lines.push('⚠️ El ticket no figura colgando del padre pedido -- verifícalo.');
  }
  if ((result.advertencias || []).length) {
    lines.push('');
    result.advertencias.forEach((a) => lines.push(`⚠️ ${a}`));
  }
  if (result.advertencia) {
    lines.push('');
    lines.push(`⚠️ ${result.advertencia}`);
  }
  return lines.join('\n').trim();
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
  formatRevisarMergeResult,
  formatRevisarPendiente,
  formatRevisarEstado,
  formatAuditArranque,
  formatAuditEstado,
  formatJiraTransitions,
  formatCancelarPrResult,
  formatScriptResult,
  formatMergeResult,
  formatAprobarPrResult,
  formatMergeGateEvidence,
  formatActualizarJiraPreview,
  formatActualizarJiraApplyResult,
  formatCrearTicketPreview,
  formatCrearTicketResult,
};
