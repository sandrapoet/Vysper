const { puedeSerPregunta } = require('../src/core/pregunta-detector');

/** Fixture real: ~/.Vysper/logs/application-2026-09-24.log, 10:22-10:41. */
const PREGUNTAS_REALES = [
  'que son los subagentes en el motor de agentes',
  'tenemos ya UI para la creacion de un subagente?',
  'que si un agente puede usar una skill',
  'de que trata o que impide la implementaacion de AGE-466',
];

const RUIDO_REAL = [
  'para liar ver las cosas, digamos, en este maldado.',
  'y vamos a llamar ahí más empo, y eso es lo que llamar el empo de crear.',
  'Pero no me estás saliendo todo.',
  'Hola, ¿qué tal? Sí.',
  'ok',
];

describe('puedeSerPregunta (etapa 1)', () => {
  test.each(PREGUNTAS_REALES)('deja pasar: %s', (texto) => {
    expect(puedeSerPregunta(texto).candidato).toBe(true);
  });

  test.each(RUIDO_REAL)('descarta: %s', (texto) => {
    expect(puedeSerPregunta(texto).candidato).toBe(false);
  });

  test('descarta vacio o invalido sin reventar', () => {
    expect(puedeSerPregunta('').candidato).toBe(false);
    expect(puedeSerPregunta(undefined).candidato).toBe(false);
  });

  test('da un motivo legible al descartar', () => {
    expect(puedeSerPregunta('ok').motivo).toBe('demasiado-corto');
  });
});
