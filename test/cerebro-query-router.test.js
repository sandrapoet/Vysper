const { classifyOperationalQuery, isExplicitCerebroCommand } = require('../src/core/cerebro-query-router');

describe('classifyOperationalQuery', () => {
  test('detects informational operational questions', () => {
    expect(classifyOperationalQuery('¿Qué incidentes hay hoy?'))
      .toEqual({ isOperational: true, isAction: false, matchedKeyword: 'incidente' });

    expect(classifyOperationalQuery('¿En qué está trabajando Juan?'))
      .toMatchObject({ isOperational: true, isAction: false });

    expect(classifyOperationalQuery('Dame el estado de salud del sistema'))
      .toMatchObject({ isOperational: true, isAction: false });

    expect(classifyOperationalQuery('¿Hay algún pipeline fallando?'))
      .toMatchObject({ isOperational: true, isAction: false });
  });

  test('detects action-style requests as isAction', () => {
    expect(classifyOperationalQuery('Optimiza el proceso de daily-checkpoint'))
      .toMatchObject({ isOperational: true, isAction: true, matchedKeyword: 'optimiza' });

    expect(classifyOperationalQuery('Ejecuta el pipeline de produccion'))
      .toMatchObject({ isOperational: true, isAction: true });
  });

  test('is case-insensitive and accent-insensitive', () => {
    expect(classifyOperationalQuery('  ¿QUÉ INCIDENTES HAY?  '))
      .toMatchObject({ isOperational: true, isAction: false });
  });

  test('does not flag pure design/architecture questions', () => {
    expect(classifyOperationalQuery('¿Cómo diseñarías un sistema de rate limiting?'))
      .toEqual({ isOperational: false, isAction: false, matchedKeyword: null });

    expect(classifyOperationalQuery('Explícame el patrón hexagonal'))
      .toEqual({ isOperational: false, isAction: false, matchedKeyword: null });
  });

  test('handles empty/invalid input', () => {
    expect(classifyOperationalQuery('')).toEqual({ isOperational: false, isAction: false, matchedKeyword: null });
    expect(classifyOperationalQuery(undefined)).toEqual({ isOperational: false, isAction: false, matchedKeyword: null });
  });

  test('detects SMC optimization/proposal questions', () => {
    expect(classifyOperationalQuery('¿Hay propuestas de optimizacion pendientes?'))
      .toMatchObject({ isOperational: true, isAction: false });
  });
});

describe('isExplicitCerebroCommand', () => {
  test('matches Cerebro/Silia slash commands', () => {
    expect(isExplicitCerebroCommand('/silia daily')).toBe(true);
    expect(isExplicitCerebroCommand('/optimizaciones')).toBe(true);
    expect(isExplicitCerebroCommand('/propuestas')).toBe(true);
    expect(isExplicitCerebroCommand('/propuesta 3 aceptar')).toBe(true);
    expect(isExplicitCerebroCommand('/incidente el login falla')).toBe(true);
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(isExplicitCerebroCommand('  /OPTIMIZACIONES  ')).toBe(true);
  });

  test('does not match unrelated text', () => {
    expect(isExplicitCerebroCommand('optimizaciones')).toBe(false);
    expect(isExplicitCerebroCommand('¿cómo diseñarías un cache distribuido?')).toBe(false);
    expect(isExplicitCerebroCommand('')).toBe(false);
    expect(isExplicitCerebroCommand(undefined)).toBe(false);
  });
});
