const {
  crearCompresor,
  comprimirDeterminista,
  estimarTokens
} = require('../src/core/memoria-compresor');

const conversacion =
  'Hola, buenos días.\n' +
  'Ok.\n' +
  'Revisamos el tema del login con calma.\n' +
  'Decidimos posponer AGE-210 hasta que se cierre el PR #445.\n' +
  'Luis comentó que el clima está raro.\n' +
  'Se implementó el checkpointer en develop.';

describe('comprimirDeterminista', () => {
  test('conserva entidades y decisiones, descarta saludos', () => {
    const r = comprimirDeterminista(conversacion, 'L2', 200);
    expect(r).toContain('AGE-210');
    expect(r).toContain('#445');
    expect(r).toContain('Se implementó el checkpointer');
    expect(r).not.toMatch(/buenos días/);
    expect(r).not.toMatch(/clima/);
  });

  test('L3 es una semilla con el minuto', () => {
    const r = comprimirDeterminista(conversacion, 'L3', 40, { minuto: 12 });
    expect(r.startsWith('[min 12] ')).toBe(true);
    expect(estimarTokens(r)).toBeLessThanOrEqual(40);
  });

  test('sin nada marcable se queda con la primera oracion', () => {
    expect(comprimirDeterminista('Hablamos del clima. Y del futbol.', 'L2', 50)).toBe('Hablamos del clima.');
  });
});

describe('crearCompresor', () => {
  test('usa el LLM cuando responde', async () => {
    const llamadas = [];
    const c = crearCompresor({
      proveedores: [{ nombre: 'anthropic', llamar: async (p) => { llamadas.push(p); return '- AGE-210 pospuesto'; } }]
    });
    const r = await c.comprimir(conversacion, 'L2', 50);
    expect(r).toEqual({ texto: '- AGE-210 pospuesto', modo: 'llm', proveedor: 'anthropic' });
    expect(llamadas[0]).toContain('Preserva:');
    expect(llamadas[0]).toContain('Máximo 50 tokens');
  });

  test('en L3 garantiza el prefijo [min N] aunque el modelo lo omita', async () => {
    const c = crearCompresor({ proveedores: [{ nombre: 'anthropic', llamar: async () => 'AGE-589 → en develop' }] });
    const r = await c.comprimir(conversacion, 'L3', 30, { minuto: 4 });
    expect(r.texto).toBe('[min 4] AGE-589 → en develop');
    const yaTrae = crearCompresor({ proveedores: [{ nombre: 'a', llamar: async () => '[min 2] x → y' }] });
    expect((await yaTrae.comprimir(conversacion, 'L3', 30, { minuto: 4 })).texto).toBe('[min 2] x → y');
  });

  test('cae al determinista si todos los modelos fallan', async () => {
    const c = crearCompresor({
      proveedores: [{ nombre: 'anthropic', llamar: async () => { throw new Error('503'); } }]
    });
    const r = await c.comprimir(conversacion, 'L2', 200);
    expect(r.modo).toBe('determinista');
    expect(r.error).toContain('503');
    expect(r.texto).toContain('AGE-210');
  });

  test('una salida que no comprime se trata como fallo', async () => {
    const c = crearCompresor({ proveedores: [{ nombre: 'gemini', llamar: async () => 'x'.repeat(4000) }] });
    const r = await c.comprimir(conversacion, 'L2', 20);
    expect(r.modo).toBe('determinista');
  });

  test('los proveedores pueden venir de una funcion (se evalua cada vez)', async () => {
    let disponibles = [];
    const c = crearCompresor({ proveedores: () => disponibles });
    expect((await c.comprimir(conversacion, 'L2', 100)).modo).toBe('determinista');
    disponibles = [{ nombre: 'ollama', llamar: async () => 'resumen' }];
    expect((await c.comprimir(conversacion, 'L2', 100)).modo).toBe('llm');
  });
});
