const { parseActualizaRagCommand } = require('../src/core/secretaria-commands');

describe('parseActualizaRagCommand', () => {
  test('matches "/actualizaRag" exactly', () => {
    expect(parseActualizaRagCommand('/actualizaRag')).toBe(true);
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseActualizaRagCommand('  /ACTUALIZARAG  ')).toBe(true);
  });

  test('rejects unrelated text', () => {
    expect(parseActualizaRagCommand('/actualizaRag algo')).toBe(false);
    expect(parseActualizaRagCommand('actualizaRag')).toBe(false);
    expect(parseActualizaRagCommand('')).toBe(false);
    expect(parseActualizaRagCommand(undefined)).toBe(false);
  });
});
