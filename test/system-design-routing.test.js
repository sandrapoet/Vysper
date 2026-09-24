const {
  routeSystemDesignText,
  SYSTEM_DESIGN_PERSONA
} = require('../src/core/cerebro-query-router');

/**
 * Post-mortem 2026-09-23 (application-2026-09-23.log): con el filtro por
 * lista de palabras, 11 consultas seguidas en modo system-design se
 * respondieron con el LLM generico y CERO llegaron a Cerebro. La misma
 * frase, un minuto despues en modo silia, si consulto Jira/GitHub/Notion.
 * Estas pruebas fijan que en system-design toda duda llegue a Cerebro.
 */
describe('routeSystemDesignText: toda consulta llega a Cerebro', () => {
  test('la consulta que fallo en vivo hoy ahora va a Cerebro', () => {
    expect(routeSystemDesignText('como se implementaron los guardrails en el nuevo motor de agente'))
      .toMatchObject({ toCerebro: true, persona: 'arquitecto', requiresConfirmation: false });
  });

  test('una pregunta por un ticket va a Cerebro aunque no tenga palabra clave operativa', () => {
    expect(routeSystemDesignText('que es la age 369 y que deberia lograrse al implementarla?'))
      .toMatchObject({ toCerebro: true, persona: 'arquitecto' });
  });

  test('una propuesta de implementacion va a Cerebro', () => {
    expect(routeSystemDesignText('necesito una propuesta de implementacion para el motor de agentes'))
      .toMatchObject({ toCerebro: true, persona: 'arquitecto' });
  });

  test('una pregunta de diseno puro tambien va a Cerebro, ya no al asistente sin datos', () => {
    expect(routeSystemDesignText('¿Cómo diseñarías un sistema de rate limiting?'))
      .toMatchObject({ toCerebro: true, persona: 'arquitecto' });
  });

  test('la persona es la de arquitecto, no la de silia', () => {
    expect(SYSTEM_DESIGN_PERSONA).toBe('arquitecto');
  });
});

describe('routeSystemDesignText: lo que NO debe llegar a Cerebro', () => {
  test('texto vacio o invalido', () => {
    expect(routeSystemDesignText('')).toMatchObject({ toCerebro: false });
    expect(routeSystemDesignText(undefined)).toMatchObject({ toCerebro: false });
    expect(routeSystemDesignText('   ')).toMatchObject({ toCerebro: false });
  });

  test('un fragmento de dictado demasiado corto para ser una consulta', () => {
    expect(routeSystemDesignText('ok')).toMatchObject({ toCerebro: false, reason: 'too-short' });
  });

  test('un comando con barra que no existe no se disfraza de consulta libre', () => {
    expect(routeSystemDesignText('/comando-que-no-existe'))
      .toMatchObject({ toCerebro: false, reason: 'unknown-command' });
  });

  test('un comando con barra que SI existe no se bloquea como desconocido', () => {
    expect(routeSystemDesignText('/silia daily'))
      .toMatchObject({ toCerebro: true, persona: 'arquitecto' });
  });
});

describe('routeSystemDesignText: acciones siguen pidiendo confirmacion', () => {
  test('un verbo de accion marca requiresConfirmation', () => {
    expect(routeSystemDesignText('Optimiza el proceso de daily-checkpoint'))
      .toMatchObject({ toCerebro: true, requiresConfirmation: true });
  });

  test('una consulta informativa no pide confirmacion', () => {
    expect(routeSystemDesignText('¿Qué incidentes hay hoy?'))
      .toMatchObject({ toCerebro: true, requiresConfirmation: false });
  });
});
