const { clasificarPregunta, normalizarCategoria } = require('../src/core/memoria-clasificador');

const responde = (texto) => [{ nombre: 'anthropic', llamar: async () => texto }];

describe('clasificarPregunta', () => {
  test('contextual: algo ya hablado en la sesion', async () => {
    const r = await clasificarPregunta(
      '¿qué habíamos dicho del orquestador?',
      'Reciente:\n- hablamos del orquestador',
      responde('{"categoria": "contextual", "confianza": 0.9}')
    );
    expect(r).toMatchObject({ categoria: 'contextual', origen: 'modelo' });
  });

  test('proyecto: una entidad decide sin llamar al modelo', async () => {
    const llamar = jest.fn();
    const r = await clasificarPregunta('¿en qué estado está AGE-321?', '', [{ nombre: 'x', llamar }]);
    expect(r).toMatchObject({ categoria: 'proyecto', origen: 'regla' });
    expect(llamar).not.toHaveBeenCalled();
  });

  test('proyecto: lo decide el modelo cuando no hay señal obvia', async () => {
    const r = await clasificarPregunta('¿quién lleva lo de autenticación?', '', responde('{"categoria":"proyecto","confianza":0.8}'));
    expect(r).toMatchObject({ categoria: 'proyecto', origen: 'modelo' });
  });

  test('off_topic: una pregunta general', async () => {
    const r = await clasificarPregunta('¿qué es una cola FIFO?', '', responde('{"categoria":"off_topic","confianza":0.95}'));
    expect(r).toMatchObject({ categoria: 'off_topic', origen: 'modelo' });
  });

  test('si el modelo falla, consulta Cerebro', async () => {
    const r = await clasificarPregunta('algo', '', [{ nombre: 'a', llamar: async () => { throw new Error('503'); } }]);
    expect(r).toMatchObject({ categoria: 'proyecto', origen: 'respaldo' });
    expect(r.error).toContain('503');
  });

  test('con baja confianza, consulta Cerebro', async () => {
    const r = await clasificarPregunta('algo', '', responde('{"categoria":"off_topic","confianza":0.3}'));
    expect(r).toMatchObject({ categoria: 'proyecto', origen: 'respaldo', sugerida: 'off_topic' });
  });

  test('salida ilegible, consulta Cerebro', async () => {
    const r = await clasificarPregunta('algo', '', responde('no sé'));
    expect(r).toMatchObject({ categoria: 'proyecto', origen: 'respaldo' });
  });

  test('sin modelos, consulta Cerebro', async () => {
    expect((await clasificarPregunta('algo', '', [])).categoria).toBe('proyecto');
  });

  test('acepta una palabra suelta', async () => {
    const r = await clasificarPregunta('algo', '', responde('contextual'));
    expect(r.categoria).toBe('contextual');
  });
});

describe('normalizarCategoria', () => {
  test.each([
    ['off-topic', 'off_topic'],
    ['Off topic', 'off_topic'],
    ['PROYECTO.', 'proyecto'],
    ['otra', null]
  ])('%s -> %s', (entrada, salida) => {
    expect(normalizarCategoria(entrada)).toBe(salida);
  });
});
