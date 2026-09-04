const {
  formatActualizaRagResult,
  formatPrReview,
  formatCrearPrResult,
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
