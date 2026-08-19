const {
  parseSiliaDailyCommand,
  parseIncidenteCommand,
  parseOptimizacionesCommand,
  parsePropuestaDecidirCommand,
  parseSiliaRetroCommand,
  parseSiliaRetroCompararCommand
} = require('../src/core/silia-commands');

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

describe('parseOptimizacionesCommand', () => {
  test('matches "/optimizaciones" and its alias "/propuestas"', () => {
    expect(parseOptimizacionesCommand('/optimizaciones')).toBe(true);
    expect(parseOptimizacionesCommand('/propuestas')).toBe(true);
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseOptimizacionesCommand('  /PROPUESTAS  ')).toBe(true);
  });

  test('rejects unrelated text', () => {
    expect(parseOptimizacionesCommand('/optimizaciones extra')).toBe(false);
    expect(parseOptimizacionesCommand('propuestas')).toBe(false);
    expect(parseOptimizacionesCommand('')).toBe(false);
    expect(parseOptimizacionesCommand(undefined)).toBe(false);
  });
});

describe('parsePropuestaDecidirCommand', () => {
  test('parses aceptar/rechazar/posponer with a numeric id', () => {
    expect(parsePropuestaDecidirCommand('/propuesta 3 aceptar')).toEqual({
      id: 3,
      estado: 'aceptada',
      motivo: ''
    });
    expect(parsePropuestaDecidirCommand('/propuesta 7 rechazar no aplica ahora')).toEqual({
      id: 7,
      estado: 'rechazada',
      motivo: 'no aplica ahora'
    });
    expect(parsePropuestaDecidirCommand('/propuesta 1 posponer')).toEqual({
      id: 1,
      estado: 'pospuesta',
      motivo: ''
    });
  });

  test('is case-insensitive', () => {
    expect(parsePropuestaDecidirCommand('/PROPUESTA 2 ACEPTAR')).toEqual({
      id: 2,
      estado: 'aceptada',
      motivo: ''
    });
  });

  test('returns null for unrelated or malformed text', () => {
    expect(parsePropuestaDecidirCommand('/propuesta aceptar')).toBeNull();
    expect(parsePropuestaDecidirCommand('/propuesta 3 aprobar')).toBeNull();
    expect(parsePropuestaDecidirCommand('')).toBeNull();
  });
});

describe('parseSiliaRetroCommand', () => {
  test('matches "/silia retro" with no sprint ref (uses active sprint)', () => {
    expect(parseSiliaRetroCommand('/silia retro')).toEqual({ sprintRef: null });
  });

  test('matches "/silia retro <ref>" and captures the ref', () => {
    expect(parseSiliaRetroCommand('/silia retro 5')).toEqual({ sprintRef: '5' });
    expect(parseSiliaRetroCommand('/silia retro AGE Sprint 5')).toEqual({ sprintRef: 'AGE Sprint 5' });
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseSiliaRetroCommand('  /SILIA RETRO  ')).toEqual({ sprintRef: null });
  });

  test('does not swallow "/silia retro comparar ..." (handled separately)', () => {
    expect(parseSiliaRetroCommand('/silia retro comparar 5 6')).toBeNull();
  });

  test('rejects unrelated text', () => {
    expect(parseSiliaRetroCommand('/silia daily')).toBeNull();
    expect(parseSiliaRetroCommand('retro')).toBeNull();
    expect(parseSiliaRetroCommand('')).toBeNull();
    expect(parseSiliaRetroCommand(undefined)).toBeNull();
  });
});

describe('parseSiliaRetroCompararCommand', () => {
  test('parses two sprint refs', () => {
    expect(parseSiliaRetroCompararCommand('/silia retro comparar 11 12')).toEqual({
      sprintA: '11',
      sprintB: '12'
    });
  });

  test('is case-insensitive', () => {
    expect(parseSiliaRetroCompararCommand('/SILIA RETRO COMPARAR 11 12')).toEqual({
      sprintA: '11',
      sprintB: '12'
    });
  });

  test('returns null for unrelated or malformed text', () => {
    expect(parseSiliaRetroCompararCommand('/silia retro comparar 11')).toBeNull();
    expect(parseSiliaRetroCompararCommand('/silia retro')).toBeNull();
    expect(parseSiliaRetroCompararCommand('')).toBeNull();
  });
});
