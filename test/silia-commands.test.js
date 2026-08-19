const { parseSiliaDailyCommand, parseIncidenteCommand } = require('../src/core/silia-commands');

describe('parseSiliaDailyCommand', () => {
  test('matches "/silia daily" exactly', () => {
    expect(parseSiliaDailyCommand('/silia daily')).toBe(true);
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseSiliaDailyCommand('  /SILIA Daily  ')).toBe(true);
  });

  test('rejects unrelated text', () => {
    expect(parseSiliaDailyCommand('/silia')).toBe(false);
    expect(parseSiliaDailyCommand('/silia dailyx')).toBe(false);
    expect(parseSiliaDailyCommand('daily standup')).toBe(false);
    expect(parseSiliaDailyCommand('')).toBe(false);
    expect(parseSiliaDailyCommand(undefined)).toBe(false);
  });
});

describe('parseIncidenteCommand', () => {
  test('extracts the description', () => {
    expect(parseIncidenteCommand('/incidente el servicio de pagos devuelve 500'))
      .toBe('el servicio de pagos devuelve 500');
  });

  test('strips surrounding quotes', () => {
    expect(parseIncidenteCommand('/incidente "el login falla intermitentemente"'))
      .toBe('el login falla intermitentemente');
  });

  test('is case-insensitive', () => {
    expect(parseIncidenteCommand('/INCIDENTE algo se rompio')).toBe('algo se rompio');
  });

  test('returns null when there is no description', () => {
    expect(parseIncidenteCommand('/incidente')).toBeNull();
    expect(parseIncidenteCommand('/incidente    ')).toBeNull();
  });

  test('returns null for unrelated text', () => {
    expect(parseIncidenteCommand('el servicio de pagos devuelve 500')).toBeNull();
    expect(parseIncidenteCommand('')).toBeNull();
  });
});
