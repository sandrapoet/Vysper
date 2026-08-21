const {
  parseSiliaDailyCommand,
  parseSiliaDailyArgument,
  parseIncidenteCommand,
  parseOptimizacionesCommand,
  parsePropuestaDecidirCommand,
  parseSiliaRetroCommand,
  parseSiliaRetroCompararCommand,
  parseHoyCommand,
  parseDetalleCommand,
  parseToolScopedCommand
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

  test('also matches with a trailing argument', () => {
    expect(parseSiliaDailyCommand('/silia daily sandrareyes@slia.com')).toBe(true);
    expect(parseSiliaDailyCommand('/silia daily LAGE-143')).toBe(true);
    expect(parseSiliaDailyCommand('/silia daily https://github.com/org/repo/pull/123')).toBe(true);
  });
});

describe('parseSiliaDailyArgument', () => {
  test('returns null when no argument was given', () => {
    expect(parseSiliaDailyArgument('/silia daily')).toBeNull();
    expect(parseSiliaDailyArgument('  /SILIA Daily  ')).toBeNull();
  });

  test('extracts the raw trailing text, whatever it looks like', () => {
    expect(parseSiliaDailyArgument('/silia daily sandrareyes@slia.com')).toBe('sandrareyes@slia.com');
    expect(parseSiliaDailyArgument('/silia daily LAGE-143')).toBe('LAGE-143');
    expect(parseSiliaDailyArgument('/silia daily https://github.com/org/repo/pull/123'))
      .toBe('https://github.com/org/repo/pull/123');
    expect(parseSiliaDailyArgument('/silia daily org/repo#123')).toBe('org/repo#123');
  });

  test('returns null for unrelated text', () => {
    expect(parseSiliaDailyArgument('/silia')).toBeNull();
    expect(parseSiliaDailyArgument('')).toBeNull();
    expect(parseSiliaDailyArgument(undefined)).toBeNull();
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

describe('parseHoyCommand', () => {
  test('extracts the dominio', () => {
    expect(parseHoyCommand('/hoy agentes')).toEqual({ dominio: 'agentes' });
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseHoyCommand('  /HOY agentes  ')).toEqual({ dominio: 'agentes' });
  });

  test('allows multi-word dominios', () => {
    expect(parseHoyCommand('/hoy motor de agentes')).toEqual({ dominio: 'motor de agentes' });
  });

  test('returns null when there is no dominio', () => {
    expect(parseHoyCommand('/hoy')).toBeNull();
    expect(parseHoyCommand('/hoy   ')).toBeNull();
  });

  test('returns null for unrelated text', () => {
    expect(parseHoyCommand('hoy agentes')).toBeNull();
    expect(parseHoyCommand('')).toBeNull();
    expect(parseHoyCommand(undefined)).toBeNull();
  });
});

describe('parseDetalleCommand', () => {
  test('extracts the dominio when given', () => {
    expect(parseDetalleCommand('/detalle agentes')).toEqual({ dominio: 'agentes' });
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseDetalleCommand('  /DETALLE agentes  ')).toEqual({ dominio: 'agentes' });
  });

  test('returns dominio: null when no dominio is given (most recent across any domain)', () => {
    expect(parseDetalleCommand('/detalle')).toEqual({ dominio: null });
    expect(parseDetalleCommand('/detalle   ')).toEqual({ dominio: null });
  });

  test('returns null for unrelated text', () => {
    expect(parseDetalleCommand('detalle agentes')).toBeNull();
    expect(parseDetalleCommand('')).toBeNull();
    expect(parseDetalleCommand(undefined)).toBeNull();
  });
});

describe('parseToolScopedCommand', () => {
  test('extracts tool and query for /jira, /notion, /github', () => {
    expect(parseToolScopedCommand('/jira que capacidades faltan')).toEqual({
      tool: 'jira',
      query: 'que capacidades faltan'
    });
    expect(parseToolScopedCommand('/notion busca la runbook de pagos')).toEqual({
      tool: 'notion',
      query: 'busca la runbook de pagos'
    });
    expect(parseToolScopedCommand('/github pull requests abiertos de auth')).toEqual({
      tool: 'github',
      query: 'pull requests abiertos de auth'
    });
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseToolScopedCommand('  /JIRA algo  ')).toEqual({ tool: 'jira', query: 'algo' });
  });

  test('returns null when no query is given', () => {
    expect(parseToolScopedCommand('/jira')).toBeNull();
    expect(parseToolScopedCommand('/jira   ')).toBeNull();
  });

  test('returns null for unsupported tool names', () => {
    expect(parseToolScopedCommand('/confluence algo')).toBeNull();
    expect(parseToolScopedCommand('/hoy agentes')).toBeNull();
    expect(parseToolScopedCommand('/detalle')).toBeNull();
  });

  test('returns null for unrelated text', () => {
    expect(parseToolScopedCommand('jira algo')).toBeNull();
    expect(parseToolScopedCommand('')).toBeNull();
    expect(parseToolScopedCommand(undefined)).toBeNull();
  });
});
