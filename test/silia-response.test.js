const {
  formatActualizaRagResult,
  formatPrReview,
  formatCrearPrResult,
  formatCancelarPrResult,
  formatAprobarPrResult,
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
