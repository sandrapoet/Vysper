const { puedeSerPregunta, detectarPregunta, Deduplicador } = require('../src/core/pregunta-detector');

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

describe('detectarPregunta (etapa 2)', () => {
  test('no llama al modelo si la etapa 1 ya descarto', async () => {
    const preguntar = jest.fn();
    const r = await detectarPregunta(['ok'], preguntar);
    expect(preguntar).not.toHaveBeenCalled();
    expect(r.esPregunta).toBe(false);
  });

  test('manda el candidato y los 2 fragmentos previos', async () => {
    const preguntar = jest.fn().mockResolvedValue({ esPregunta: true, preguntaNormalizada: 'X' });
    await detectarPregunta(['viejo', 'a', 'b', 'que son los subagentes en el motor'], preguntar);
    const texto = preguntar.mock.calls[0][0];
    expect(texto).toContain('a');
    expect(texto).toContain('b');
    expect(texto).not.toContain('viejo');
  });

  test('devuelve la pregunta normalizada del modelo', async () => {
    const preguntar = async () => ({ esPregunta: true, preguntaNormalizada: '¿Que son los subagentes?' });
    const r = await detectarPregunta(['que son los subagentes en el motor'], preguntar);
    expect(r).toMatchObject({ esPregunta: true, preguntaNormalizada: '¿Que son los subagentes?' });
  });

  test('si el modelo falla, no rompe el dictado', async () => {
    const preguntar = async () => { throw new Error('timeout'); };
    const r = await detectarPregunta(['que son los subagentes en el motor'], preguntar);
    expect(r.esPregunta).toBe(false);
    expect(r.motivo).toMatch(/fallo/i);
  });
});

describe('Deduplicador', () => {
  test('una pregunta ya consultada no vuelve a disparar', () => {
    const d = new Deduplicador();
    d.registrar('¿Que son los subagentes?');
    expect(d.yaConsultada('  ¿QUE SON LOS SUBAGENTES?  ')).toBe(true);
  });

  test('solo recuerda las ultimas 3', () => {
    const d = new Deduplicador();
    ['a', 'b', 'c', 'd'].forEach((p) => d.registrar(p));
    expect(d.yaConsultada('a')).toBe(false);
    expect(d.yaConsultada('d')).toBe(true);
  });
});
