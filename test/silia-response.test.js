const {
  formatActualizaRagResult,
  formatPrReview,
  formatCrearPrResult,
  formatRevisarMergeResult,
  formatCancelarPrResult,
  formatAprobarPrResult,
  formatActualizarJiraPreview,
  formatActualizarJiraApplyResult,
} = require('../src/core/silia-response');

const ESC = '\x1b';
const section = (title) => `\n${ESC}[1;34m>> ${title}${ESC}[0m\n`;

describe('formatActualizaRagResult', () => {
  test('synthesizes a short summary instead of the raw build.sh log', () => {
    const stdout =
      section('Verificando .env') +
      '  .env OK\n' +
      section('Corriendo suite de tests de backend/') +
      '........ [100%]\n123 passed in 0.97s\n  tests OK\n' +
      section('Sin cambios en backend/ desde la última corrida — solo asegurando que el stack esté arriba') +
      '\n' +
      section('Health del backend (GET /api/health)') +
      '{"status":"ok","lightrag":true}\n' +
      section('2/2 — ingest.ingest --once') +
      '  = viejo.txt: sin cambios, se omite\n' +
      '  → nuevo.md [Creai/Silia/Tech/Agentes]: ingiriendo...\n' +
      '  ✓ nuevo.md: 1 chunk(s) ingerido(s)\n' +
      '  = otro.txt: sin cambios, se omite\n' +
      section('Listo.');

    const result = formatActualizaRagResult(stdout);

    expect(result).toContain('✅ RAG actualizado correctamente.');
    expect(result).toContain('Tests: 123 passed');
    expect(result).toContain('sin cambios, stack ya estaba arriba');
    expect(result).toContain('Salud del backend: OK (lightrag: true)');
    expect(result).toContain('Archivos nuevos ingeridos al RAG (1): nuevo.md');
    expect(result).toContain('Archivos sin cambios (omitidos): 2');
    // Never leaks raw ANSI escape codes into the chat.
    expect(result).not.toContain(ESC);
  });

  test('reports no new files when everything was already up to date', () => {
    const stdout =
      section('2/2 — ingest.ingest --once') +
      '  = viejo.txt: sin cambios, se omite\n' +
      section('Listo.');

    const result = formatActualizaRagResult(stdout);
    expect(result).toContain('Archivos nuevos ingeridos al RAG: ninguno');
  });

  test('flags when the script did not reach the final "Listo." stage', () => {
    const stdout = section('Corriendo suite de tests de backend/') + '1 failed\n';
    const result = formatActualizaRagResult(stdout);
    expect(result).toContain('⚠️');
  });

  test('degrades gracefully on unrecognized output instead of throwing', () => {
    expect(() => formatActualizaRagResult('texto sin secciones reconocibles')).not.toThrow();
    expect(formatActualizaRagResult('')).toContain('⚠️');
  });
});

describe('formatPrReview', () => {
  test('passes through report_markdown as-is when there is no signature', () => {
    const result = formatPrReview({ report_markdown: '🔍 REVISIÓN PR #42\n...' });
    expect(result).toBe('🔍 REVISIÓN PR #42\n...');
  });

  test('appends the signature footer when present', () => {
    const result = formatPrReview({
      report_markdown: 'reporte',
      signature: { hash: 'abc123', timestamp: '2026-08-25T00:00:00Z' },
    });
    expect(result).toContain('reporte');
    expect(result).toContain('🔏 Firma: abc123 (2026-08-25T00:00:00Z)');
  });

  test('degrades gracefully when there is no report_markdown', () => {
    expect(formatPrReview(null)).toBe('No se pudo generar la revision del PR.');
    expect(formatPrReview({})).toBe('No se pudo generar la revision del PR.');
  });
});

describe('formatCrearPrResult', () => {
  test('includes url, title, jira ticket, labels, reviewers and milestone when present', () => {
    const result = formatCrearPrResult({
      pr_url: 'https://github.com/org/repo/pull/9',
      draft: true,
      title: 'AGE-123: agrega X',
      jira_ticket_key: 'AGE-123',
      labels: ['bug-fix', 'backend'],
      reviewers: ['juan', 'maria'],
      milestone: 'Sprint 12',
    });
    expect(result).toContain('PR (draft) creado: https://github.com/org/repo/pull/9');
    expect(result).toContain('Titulo: AGE-123: agrega X');
    expect(result).toContain('Jira: AGE-123 -> "In Review"');
    expect(result).toContain('Labels: bug-fix, backend');
    expect(result).toContain('Reviewers: juan, maria');
    expect(result).toContain('Milestone: Sprint 12');
  });

  test('degrades gracefully without pr_url', () => {
    expect(formatCrearPrResult(null)).toBe('No se pudo crear el PR.');
    expect(formatCrearPrResult({})).toBe('No se pudo crear el PR.');
  });

  test('shows the already-exists message instead of claiming a PR was created', () => {
    const result = formatCrearPrResult({
      already_exists: true,
      pr_url: 'https://github.com/org/repo/pull/133',
      pr_number: 133,
      message: "Ya existe un PR abierto para la rama 'feature/x': https://github.com/org/repo/pull/133",
    });
    expect(result).toBe("Ya existe un PR abierto para la rama 'feature/x': https://github.com/org/repo/pull/133");
    expect(result).not.toContain('PR creado');
  });

  test('appends the untracked-files warning without treating it as an error', () => {
    const result = formatCrearPrResult({
      pr_url: 'https://github.com/org/repo/pull/9',
      draft: true,
      untracked_files_warning: 'Hay 2 archivo(s) sin trackear en /repo que NO se incluyen en este PR: a.log, b.log.',
    });
    expect(result).toContain('PR (draft) creado: https://github.com/org/repo/pull/9');
    expect(result).toContain('⚠️ Hay 2 archivo(s) sin trackear en /repo que NO se incluyen en este PR: a.log, b.log.');
  });

  test('shows the untracked-files warning on the already-exists path too', () => {
    const result = formatCrearPrResult({
      already_exists: true,
      pr_url: 'https://github.com/org/repo/pull/133',
      message: "Ya existe un PR abierto para la rama 'feature/x': https://github.com/org/repo/pull/133",
      untracked_files_warning: 'Hay 1 archivo(s) sin trackear en /repo que NO se incluyen en este PR: a.log.',
    });
    expect(result).toContain("Ya existe un PR abierto para la rama 'feature/x'");
    expect(result).toContain('⚠️ Hay 1 archivo(s) sin trackear en /repo que NO se incluyen en este PR: a.log.');
  });

  test('appends the other-branch-uncommitted note as informational only, not an error', () => {
    const result = formatCrearPrResult({
      pr_url: 'https://github.com/org/repo/pull/9',
      draft: true,
      other_branch_uncommitted_note: "La rama actualmente activa en /repo ('fix/AGE-166', distinta a "
        + "'fix/AGE-164') tiene cambios sin commitear: test_x.py. Es solo informativo, no bloquea este PR.",
    });
    expect(result).toContain('PR (draft) creado: https://github.com/org/repo/pull/9');
    expect(result).toContain("ℹ️ La rama actualmente activa en /repo ('fix/AGE-166', distinta a 'fix/AGE-164')");
    expect(result).not.toContain('No se pudo crear el PR');
  });

  test('shows the other-branch-uncommitted note on the already-exists path too', () => {
    const result = formatCrearPrResult({
      already_exists: true,
      pr_url: 'https://github.com/org/repo/pull/133',
      message: "Ya existe un PR abierto para la rama 'feature/x': https://github.com/org/repo/pull/133",
      other_branch_uncommitted_note: "La rama actualmente activa en /repo ('fix/AGE-166', distinta a "
        + "'feature/x') tiene cambios sin commitear: test_x.py. Es solo informativo, no bloquea este PR.",
    });
    expect(result).toContain("Ya existe un PR abierto para la rama 'feature/x'");
    expect(result).toContain('ℹ️ La rama actualmente activa en /repo');
  });
});

describe('formatCancelarPrResult', () => {
  test('confirms closure and the Jira transition when present', () => {
    const result = formatCancelarPrResult({
      closed: true, pr_url: 'https://github.com/org/repo/pull/9', jira_ticket_key: 'AGE-123',
    });
    expect(result).toContain('PR cerrado: https://github.com/org/repo/pull/9');
    expect(result).toContain('Jira AGE-123 revertido a su estado anterior.');
  });

  test('degrades gracefully when not closed', () => {
    expect(formatCancelarPrResult(null)).toBe('No se pudo cancelar el PR.');
    expect(formatCancelarPrResult({ closed: false })).toBe('No se pudo cancelar el PR.');
  });
});

describe('formatActualizarJiraPreview - advertencias', () => {
  const { formatActualizarJiraPreview } = require('../src/core/silia-response');

  test('muestra el aviso cuando el comentario trae una instruccion a la herramienta', () => {
    // Se publica LITERAL en Jira con el nombre del usuario: el aviso tiene
    // que verse donde se decide confirmar.
    const out = formatActualizarJiraPreview({
      cambios: [{
        issue_key: 'AGE-332', campo: 'comentario',
        valor_propuesto: 'Pendiente de infra. Anotar todo esto como comentario.',
        requiere_revision: false,
        advertencia: 'Este comentario parece incluir instrucciones dirigidas a la herramienta...',
      }],
    });

    expect(out).toContain('⚠️');
    expect(out).toContain('instrucciones dirigidas a la herramienta');
  });

  test('un cambio limpio no muestra ningun aviso', () => {
    const out = formatActualizarJiraPreview({
      cambios: [{
        issue_key: 'AGE-333', campo: 'story_points',
        valor_actual: 3, valor_propuesto: 5, requiere_revision: false,
      }],
    });
    expect(out).not.toContain('⚠️');
  });
});

describe('formatCrearPrResult - draft', () => {
  const { formatCrearPrResult } = require('../src/core/silia-response');

  test('avisa cuando el PR quedo en draft y como destrabarlo', () => {
    const out = formatCrearPrResult({
      pr_url: 'https://github.com/Silia-mx/Agent/pull/214', draft: true,
      draft_note: 'El PR quedo en DRAFT, asi que nadie lo puede revisar todavia: ... gh pr ready 214 --repo Silia-mx/Agent ...',
    });
    expect(out).toContain('⚠️');
    expect(out).toContain('DRAFT');
    expect(out).toContain('gh pr ready 214');
  });

  test('un PR publicado no muestra el aviso', () => {
    const out = formatCrearPrResult({
      pr_url: 'https://github.com/Silia-mx/Agent/pull/214', draft: false,
    });
    expect(out).not.toContain('DRAFT');
  });
});

describe('reviewers', () => {
  const { formatCrearPrResult } = require('../src/core/silia-response');

  test('muestra usuarios y equipos por separado', () => {
    const out = formatCrearPrResult({
      pr_url: 'https://github.com/Silia-mx/Agent/pull/205', draft: true,
      reviewers: ['camilomosquera-silia', 'davidaleman-silia'],
      team_reviewers: ['backend'],
    });
    expect(out).toContain('Reviewers: camilomosquera-silia, davidaleman-silia');
    expect(out).toContain('Equipos: backend');
  });

  test('avisa cuando el PR quedo sin reviewers', () => {
    // Agent no tiene CODEOWNERS: sin este aviso el PR quedaba esperando a
    // que alguien notara que no tenia a quien revisarlo.
    const out = formatCrearPrResult({
      pr_url: 'https://github.com/Silia-mx/Agent/pull/205', draft: true,
      reviewers: [], team_reviewers: [],
      reviewers_note: 'El PR quedo SIN reviewers: Silia-mx/Agent no tiene .github/CODEOWNERS ...',
    });
    expect(out).toContain('⚠️');
    expect(out).toContain('SIN reviewers');
  });
});

describe('multi-ticket', () => {
  const { formatCrearPrResult, formatJiraTransitions } = require('../src/core/silia-response');

  test('lista cada ticket por separado, no un resumen', () => {
    // Cada transicion se intenta por su cuenta: si la segunda falla, la
    // primera YA se movio. Un "3 tickets movidos" haria pasar por completo
    // algo que quedo a medias.
    const lines = formatJiraTransitions([
      { key: 'AGE-233', transition: 'In Review' },
      { key: 'AGE-234', error: 'Jira rechazo la transicion' },
      { key: 'AGE-236', skipped: 'ya estaba en el estado destino' },
    ], 'In Review');

    expect(lines).toEqual([
      'Jira AGE-233 -> "In Review"',
      'Jira AGE-234: ⚠️ no se pudo mover (Jira rechazo la transicion)',
      'Jira AGE-236: sin cambios (ya estaba en el estado destino)',
    ]);
  });

  test('/crear-pr muestra los tres tickets y el aviso', () => {
    const out = formatCrearPrResult({
      pr_url: 'https://github.com/Silia-mx/Agent/pull/205',
      draft: true,
      jira_ticket_key: 'AGE-233',
      jira_transitions: [
        { key: 'AGE-233', transition: 'In Review' },
        { key: 'AGE-234', transition: 'In Review' },
      ],
      multi_ticket_note: 'Este PR menciona 2 tickets (AGE-233, AGE-234) y se transicionan los 2. Ojo que el repo padre declara one_concern_per_pr.',
    });

    expect(out).toContain('Jira AGE-233 -> "In Review"');
    expect(out).toContain('Jira AGE-234 -> "In Review"');
    expect(out).toContain('one_concern_per_pr');
  });

  test('un PR de un solo ticket se ve igual que siempre', () => {
    const out = formatCrearPrResult({
      pr_url: 'https://github.com/org/repo/pull/9',
      draft: false,
      jira_ticket_key: 'AGE-233',
      jira_transitions: [{ key: 'AGE-233', transition: 'In Review' }],
      multi_ticket_note: null,
    });

    expect(out).toContain('Jira AGE-233 -> "In Review"');
    expect(out).not.toContain('⚠️');
  });

  test('sin jira_transitions cae al campo viejo (Cerebro desactualizado)', () => {
    const out = formatCrearPrResult({
      pr_url: 'https://github.com/org/repo/pull/9', draft: false, jira_ticket_key: 'AGE-233',
    });
    expect(out).toContain('Jira: AGE-233 -> "In Review"');
  });
});

describe('formatRevisarMergeResult', () => {
  const base = {
    merged: true,
    message: 'Pull Request successfully merged',
    pr_url: 'https://github.com/org/repo/pull/9',
    comment_url: 'https://github.com/org/repo/pull/9#issuecomment-1',
    release: null,
    pasos_no_completados: [],
    advertencia: '',
  };

  test('un ciclo completo se ve como antes', () => {
    const out = formatRevisarMergeResult(base);

    expect(out).toContain('PR mergeado: https://github.com/org/repo/pull/9');
    expect(out).toContain('Comentario: https://github.com/org/repo/pull/9#issuecomment-1');
    expect(out).not.toContain('⚠️');
  });

  test('los pasos pendientes se nombran SIN esconder que el merge si ocurrio', () => {
    // Caso real del PR 272: la transicion de Jira fallo, quedo en una linea
    // de log intermedia, y el resultado decia {"merged": true} a secas. El
    // ticket quedo sin mover y el ciclo se dio por cerrado.
    const out = formatRevisarMergeResult({
      ...base,
      pasos_no_completados: [{
        paso: 'jira_transition_done',
        label: 'transicion del ticket de Jira a "Done"',
        detalle: 'No se pudo mover AGE-335 a "Done"',
        remediacion: 'Transiciona AGE-335 a mano en Jira.',
      }],
      advertencia: 'El merge SI se completo, pero 1 paso(s) posterior(es) no.',
    });

    // El merge no se esconde: reintentarlo es justo lo que no hay que hacer.
    expect(out).toContain('PR mergeado: https://github.com/org/repo/pull/9');
    expect(out).toContain('⚠️');
    expect(out).toContain('transicion del ticket de Jira a "Done"');
    expect(out).toContain('Transiciona AGE-335 a mano en Jira.');
  });

  test('cada paso pendiente aparece, no solo el primero', () => {
    const out = formatRevisarMergeResult({
      ...base,
      pasos_no_completados: [
        { paso: 'github_release', label: 'creacion del release/tag', detalle: '422', remediacion: 'Crea el tag a mano.' },
        { paso: 'jira_transition_done', label: 'transicion de Jira', detalle: 'sin transicion', remediacion: 'Muevelo a mano.' },
      ],
      advertencia: 'El merge SI se completo, pero 2 paso(s) posterior(es) no.',
    });

    expect(out).toContain('creacion del release/tag');
    expect(out).toContain('transicion de Jira');
  });

  test('un resultado sin merge no se anuncia como mergeado', () => {
    expect(formatRevisarMergeResult({ merged: false })).toBe('No se pudo mergear el PR.');
    expect(formatRevisarMergeResult(null)).toBe('No se pudo mergear el PR.');
  });
});

describe('formatAprobarPrResult - merge gate y confirmacion', () => {
  const base = { approved: true, pr_url: 'https://github.com/org/repo/pull/9', is_bot_author: false };

  test('la peticion de confirmacion viaja en el MISMO mensaje que la evidencia del gate', () => {
    // Requisito del tunel del celular: runChatCommandHeadless resuelve con
    // el primer emitSiliaResult y descarta el resto, asi que con dos
    // mensajes la pregunta nunca llegaba al telefono.
    const result = formatAprobarPrResult(
      { ...base, merge_gate: { ok: true, validated: true, passed: ['suite-a', 'suite-b'], base_sha: 'a9b1773aaa' } },
      { merge: false, tag: false, pendingConfirmation: 'mergear' }
    );

    expect(result).toContain('PR aprobado:');
    expect(result).toContain('2 suite(s) OK sobre base+head mergeados (base a9b1773)');
    expect(result).toContain('¿Confirmas mergear el PR https://github.com/org/repo/pull/9?');
  });

  test('declara explicitamente cuando NO se corrio ninguna prueba', () => {
    // Un gate apagado que no se declara es peor que no tenerlo: el mensaje
    // suena a que se reviso.
    const result = formatAprobarPrResult(
      { ...base, merge_gate: { ok: true, validated: false, reason: 'No hay comando de test configurado. El merge NO fue validado automaticamente.' } },
      { merge: true, tag: false }
    );

    expect(result).toContain('⚠️ Merge gate');
    expect(result).toContain('NO fue validado');
  });

  test('muestra el comando que fallo cuando el gate bloquea', () => {
    const result = formatAprobarPrResult(
      {
        ...base,
        merge_gate: {
          ok: false, validated: true, reason: 'Fallaron las pruebas del merge sobre bb2b1d2',
          failed_command: 'env RAG_PG_DSN= .venv/bin/python -m pytest -q pipeline/tests',
        },
      },
      { merge: true }
    );

    expect(result).toContain('❌ Merge gate');
    expect(result).toContain('pipeline/tests');
  });

  test('marca el resultado reusado del turno anterior en vez de volver a correr', () => {
    const result = formatAprobarPrResult(
      { ...base, merge_gate: { ok: true, validated: true, passed: ['suite'], base_sha: 'a9b1773', cached: true } },
      { merge: true }
    );
    expect(result).toContain('ya calculado en el paso anterior');
  });

  test('avisa que el deploy queda pendiente y que falta el arreglo de build', () => {
    // deploy-app.yml filtra por paths sin Agent y deploy-service.yml es
    // workflow_dispatch puro: sin este aviso, el merge parece haber
    // desplegado.
    const result = formatAprobarPrResult(
      {
        ...base,
        merge: { merged: true, sha: 'abcdef1234' },
        deploy_dispatch: {
          pendiente: true, repo: 'Silia-mx/silia', workflow: 'deploy-service.yml', ref: 'staging',
          advertencias: ['El arreglo del contexto de build de engine-poc no esta en staging.'],
        },
      },
      { merge: true }
    );

    expect(result).toContain('Deploy PENDIENTE');
    expect(result).toContain('deploy-service.yml');
    expect(result).toContain('engine-poc');
  });

  test('avisa de los PRs apilados que quedaron apuntando a la rama mergeada', () => {
    // Caso real: tras mergear el #202, el #203 quedo con base
    // feat/AGE-245-... Mergearlo asi manda su codigo a una rama muerta y
    // el ticket avanza igual.
    const result = formatAprobarPrResult(
      {
        ...base,
        merge: { merged: true, sha: 'c1febb9aaa' },
        cadena_pendiente: {
          rama_mergeada: 'feat/AGE-245-router-multi-model-integration',
          destino_real: 'develop',
          prs: [{ number: 203, title: 'AGE-296 router', url: 'https://github.com/Silia-mx/Agent/pull/203' }],
        },
      },
      { merge: true }
    );

    expect(result).toContain('Cadena pendiente de reapuntar');
    expect(result).toContain('#203');
    expect(result).toContain("PRIMERO reapuntalos a 'develop'");
  });

  test('fija el orden: reapuntar antes de borrar, y nunca ofrece el borrado como atajo', () => {
    // Una version anterior decia "o borra la rama (los reapunta solo)".
    // Es falso en estos repos: borrar CIERRA los PRs apilados y los deja
    // en deadlock (verificado en vivo con el #203).
    const result = formatAprobarPrResult(
      {
        ...base,
        merge: { merged: true, sha: 'c1febb9aaa' },
        cadena_pendiente: {
          rama_mergeada: 'feat/AGE-296-fallback-indisponibilidad',
          destino_real: 'develop',
          prs: [{ number: 204, title: 'AGE-242', url: 'https://github.com/Silia-mx/Agent/pull/204' }],
          comandos_reapuntar: ['gh api -X PATCH repos/Silia-mx/Agent/pulls/204 -f base=develop'],
        },
      },
      { merge: true }
    );

    expect(result).toContain('gh api -X PATCH repos/Silia-mx/Agent/pulls/204 -f base=develop');
    expect(result.indexOf('PRIMERO')).toBeLessThan(result.indexOf('RECIEN DESPUES'));
    expect(result).toContain('CIERRA esos PRs');
    expect(result).not.toContain('reapunta solo');
    expect(result).not.toContain('gh pr edit');
  });

  test('no dice nada de la cadena cuando no hay PRs apilados', () => {
    const result = formatAprobarPrResult(
      { ...base, merge: { merged: true, sha: 'abc1234' }, cadena_pendiente: null },
      { merge: true }
    );
    expect(result).not.toContain('Cadena pendiente');
  });

  test('reporta la nivelacion automatica de una rama BEHIND', () => {
    const result = formatAprobarPrResult(
      { ...base, branch_leveled: { leveled: true, new_head_sha: 'fedcba9876543' } },
      { merge: false }
    );
    expect(result).toContain('Rama nivelada con su base (head fedcba9)');
  });
});

describe('formatAprobarPrResult', () => {
  test('first pass (no merge/tag requested) only shows approval', () => {
    const result = formatAprobarPrResult(
      { approved: true, pr_url: 'https://github.com/org/repo/pull/9', is_bot_author: false },
      { merge: false, tag: false }
    );
    expect(result).toBe('PR aprobado: https://github.com/org/repo/pull/9');
  });

  test('flags the bot-author auto-approval path', () => {
    const result = formatAprobarPrResult(
      { approved: true, pr_url: 'https://github.com/org/repo/pull/9', is_bot_author: true },
      {}
    );
    expect(result).toContain('PR aprobado automaticamente (autor bot)');
  });

  test('shows merge and tag outcomes when requested and successful', () => {
    const result = formatAprobarPrResult(
      {
        approved: true,
        pr_url: 'https://github.com/org/repo/pull/9',
        merge: { merged: true, sha: 'abcdef1234567' },
        tag: { tag_name: 'pr-9-abcdef1' },
      },
      { merge: true, tag: true }
    );
    expect(result).toContain('Merge completado (sha abcdef1).');
    expect(result).toContain('Tag anotado creado: pr-9-abcdef1');
  });

  test('shows failure messages when merge/tag did not complete', () => {
    const result = formatAprobarPrResult(
      {
        approved: true,
        pr_url: 'https://github.com/org/repo/pull/9',
        merge: { merged: false, message: 'no es mergeable' },
        tag: null,
      },
      { merge: true, tag: true }
    );
    expect(result).toContain('Merge no completado: no es mergeable');
    expect(result).toContain('Tag no creado (el merge no se completo).');
  });

  test('degrades gracefully with no result', () => {
    expect(formatAprobarPrResult(null)).toBe('No se pudo procesar la aprobacion del PR.');
  });
});

describe('formatActualizarJiraPreview', () => {
  test('a comentario is shown as an addition, never as overwriting the ticket', () => {
    // Un comentario AGREGA constancia fechada; con el par Actual/Propuesto
    // de los demas campos se leia "Actual: (vacío)", que hace pensar que
    // pisa contenido de la descripcion.
    const result = formatActualizarJiraPreview({
      pending: true,
      cambios: [
        { issue_key: 'AGE-322', campo: 'comentario', requiere_revision: false, valor_actual: null, valor_propuesto: 'Se decidio bumpear staging.' },
      ],
    });

    expect(result).toContain('AGE-322 — comentario');
    expect(result).toContain('Se agregará este comentario (no modifica la descripción):');
    expect(result).toContain('Se decidio bumpear staging.');
    expect(result).not.toContain('(vacío)');
  });

  test('lists resolved changes with actual/proposed values', () => {
    const result = formatActualizarJiraPreview({
      pending: true,
      cambios: [
        { issue_key: 'AGE-143', campo: 'descripcion', requiere_revision: false, valor_actual: 'vieja', valor_propuesto: 'nueva' },
      ],
    });
    expect(result).toContain('Se identificaron 1 cambio(s):');
    expect(result).toContain('AGE-143 — descripcion');
    expect(result).toContain('Actual: vieja');
    expect(result).toContain('Propuesto: nueva');
  });

  test('shows requiere_revision entries with their reason instead of actual/proposed', () => {
    const result = formatActualizarJiraPreview({
      pending: true,
      cambios: [{ issue_key: 'AGE-159', campo: 'estado', requiere_revision: true, nota: "'Hecho' no es una transicion disponible" }],
    });
    expect(result).toContain('⚠️ Requiere revisión manual');
    expect(result).toContain("'Hecho' no es una transicion disponible");
    expect(result).not.toContain('Propuesto:');
  });

  test('reports no changes found instead of an empty list', () => {
    expect(formatActualizarJiraPreview({ pending: true, cambios: [] })).toBe('No se identifico ningun cambio a partir del texto dado.');
  });

  test('degrades gracefully without a cambios array', () => {
    expect(formatActualizarJiraPreview(null)).toBe('No se pudo generar el preview de /actualizar-jira.');
  });
});

describe('formatActualizarJiraApplyResult', () => {
  test('shows applied, failed, and skipped entries together', () => {
    const result = formatActualizarJiraApplyResult({
      aplicados: [{ issue_key: 'AGE-143', campo: 'descripcion' }],
      fallidos: [{ issue_key: 'AGE-159', campo: 'estado', error: 'transicion rechazada' }],
      omitidos: [{ issue_key: 'AGE-160', campo: 'otro', nota: 'no reconocido' }],
    });
    expect(result).toContain('✅ Aplicados (1):');
    expect(result).toContain('AGE-143 (descripcion)');
    expect(result).toContain('❌ Fallidos (1):');
    expect(result).toContain('transicion rechazada');
    expect(result).toContain('⏭️ Omitidos por requerir revisión (1):');
  });

  test('degrades gracefully with no result', () => {
    expect(formatActualizarJiraApplyResult(null)).toBe('No se pudo aplicar los cambios de /actualizar-jira.');
  });

  test('reports nothing applied when all lists are empty', () => {
    expect(formatActualizarJiraApplyResult({ aplicados: [], fallidos: [], omitidos: [] })).toBe('No se aplico ningun cambio.');
  });
});
