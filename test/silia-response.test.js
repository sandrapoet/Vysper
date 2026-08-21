const { formatActualizaRagResult } = require('../src/core/silia-response');

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
