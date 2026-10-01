const { MemoriaSesion, formatearContexto, LIMITES_POR_DEFECTO } = require('../src/core/memoria-sesion');
const { crearCompresor, estimarTokens } = require('../src/core/memoria-compresor');

// Sin proveedores: el compresor usa el modo determinista, que es el que
// tiene que garantizar los topes aunque no haya ningun modelo.
const compresorDeterminista = () => crearCompresor({ proveedores: [] });

function turnoLargo(i) {
  // Una conversacion densa: cada oracion trae una entidad, asi que ni el
  // compresor determinista puede tirar nada y las capas se llenan de verdad.
  const relleno = `Revisamos el flujo del orquestador para AGE-${i} con calma y lo discutimos a fondo. `.repeat(6);
  return {
    usuario: `Pregunta ${i}: ¿cómo va AGE-${100 + i}? ${relleno}`,
    respuesta: `Decidimos mover AGE-${100 + i} a staging tras el PR #${400 + i}. ${relleno}`
  };
}

async function simular(memoria, n) {
  let originales = 0;
  for (let i = 0; i < n; i++) {
    const t = turnoLargo(i);
    originales += estimarTokens(`${t.usuario}\n${t.respuesta}`);
    memoria.agregarTurno(t);
    await memoria.mantener();
  }
  return originales;
}

describe('MemoriaSesion', () => {
  test('L1 guarda los turnos completos mientras caben', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    m.agregarTurno({ usuario: 'hola', respuesta: 'qué tal' });
    await m.mantener();
    expect(m.l1).toHaveLength(1);
    expect(m.l2).toHaveLength(0);
  });

  test('al pasar de 10 turnos los mas viejos bajan a L2 en bloque', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    for (let i = 0; i < 11; i++) m.agregarTurno({ usuario: `p${i} sobre AGE-${i}`, respuesta: `r${i}` });
    await m.mantener();
    expect(m.l1.length).toBeLessThanOrEqual(LIMITES_POR_DEFECTO.L1_TURNOS);
    expect(m.l2.length).toBeGreaterThan(0);
    expect(m.l2[0].desde).toBe(1);
    expect(m.l1[m.l1.length - 1].usuario).toContain('p10');
  });

  test('rota por tokens aunque haya pocos turnos (un log pegado)', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    const log = 'log: ' + 'ERROR timeout en AGE-5 '.repeat(400);
    m.agregarTurno({ usuario: log, respuesta: 'se ve un timeout' });
    // Un turno solo nunca se come L1: se recorta principio + final.
    expect(m.tokens().l1).toBeLessThan(LIMITES_POR_DEFECTO.L1_TOKENS);
    expect(m.l1[0].usuario).toContain('…[recortado]…');
    m.agregarTurno({ usuario: log, respuesta: 'otra vez' });
    m.agregarTurno({ usuario: log, respuesta: 'y otra' });
    await m.mantener();
    expect(m.l1.length).toBeLessThan(3);
    expect(m.tokens().l1).toBeLessThanOrEqual(LIMITES_POR_DEFECTO.L1_TOKENS);
    expect(m.l2.length).toBeGreaterThan(0);
  });

  test('50 turnos: L3 ocupa menos del 10% de lo que resume', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    await simular(m, 50);
    expect(m.l3.length).toBeGreaterThan(0);
    const cubierto = m.l3.reduce((s, i) => s + i.tokensOriginales, 0);
    expect(m.tokens().l3 / cubierto).toBeLessThan(0.1);
  });

  test('100 turnos: la memoria total no pasa de 8000 tokens', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    const originales = await simular(m, 100);
    expect(originales).toBeGreaterThan(20000);
    expect(m.tokens().total).toBeLessThanOrEqual(8000);
    expect(m.tokens().l2).toBeLessThanOrEqual(LIMITES_POR_DEFECTO.L2_TOKENS);
    expect(m.tokens().l3).toBeLessThanOrEqual(LIMITES_POR_DEFECTO.L3_TOKENS);
  });

  test('cada compresion queda en el registro con su ratio', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    await simular(m, 15);
    expect(m.registro.length).toBeGreaterThan(0);
    const r = m.registro[0];
    expect(r).toMatchObject({ de: 'L1', a: 'L2', modo: 'determinista' });
    expect(r.ratio).toBeGreaterThan(0);
    expect(r.ratio).toBeLessThan(1);
  });

  test('contextoRelevante marca con ⭐ lo de L2 que se consulta y cuenta el uso', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    await simular(m, 15);
    const ctx = m.contextoRelevante('¿qué pasó con AGE-100?');
    expect(ctx.l2.length).toBeGreaterThan(0);
    expect(ctx.l2[0].estrella).toBe(true);
    expect(m.usos.l2).toBe(1);
    expect(m.usos.l1).toBe(1);
  });

  test('lo marcado con ⭐ se salta al bajar de L2 a L3 mientras haya otros', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    await simular(m, 15);
    m.contextoRelevante('AGE-100');
    const marcado = m.l2.find((i) => i.estrella);
    await simular(m, 40);
    expect(m.l2).toContain(marcado);
  });

  test('olvida semillas de L3 viejas que nadie consulto', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista(), limites: { OLVIDO_TURNOS: 30 } });
    await simular(m, 80);
    expect(m.l3.every((i) => m.contador - i.hasta <= 30 || i.estrella || i.consultas > 0)).toBe(true);
    expect(m.registro.some((r) => r.a === 'olvido')).toBe(true);
  });

  test('forzarCompresion deja solo los 2 ultimos turnos en L1', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    for (let i = 0; i < 6; i++) m.agregarTurno({ usuario: `p${i}`, respuesta: `r${i}` });
    await m.forzarCompresion();
    expect(m.l1.map((t) => t.usuario)).toEqual(['p4', 'p5']);
    expect(m.l2.length).toBe(1);
  });

  test('el expediente reemplaza una fuente repetida y respeta su tope', () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    m.agregarHechos([{ fuente: 'jira:AGE-1', texto: 'En curso' }]);
    m.agregarHechos([{ fuente: 'jira:AGE-1', texto: 'Done' }]);
    expect(m.expediente).toHaveLength(1);
    expect(m.expediente[0].texto).toBe('Done');
    for (let i = 0; i < 50; i++) m.agregarHechos([{ fuente: `jira:AGE-${i + 10}`, texto: 'x'.repeat(400) }]);
    expect(m.tokens().expediente).toBeLessThanOrEqual(LIMITES_POR_DEFECTO.EXPEDIENTE_TOKENS);
  });

  test('serializar no incluye L1 y restaurar recupera L2/L3/expediente/usos', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    await simular(m, 15);
    m.agregarHechos([{ fuente: 'github:Silia-mx/Agent#1', texto: 'mergeado a develop' }]);
    m.registrarUso('cerebro');
    const datos = JSON.parse(JSON.stringify(m.serializar()));
    expect(datos.l1).toBeUndefined();

    const otra = new MemoriaSesion({ compresor: compresorDeterminista() });
    expect(otra.restaurar(datos)).toBe(true);
    expect(otra.l2).toHaveLength(m.l2.length);
    expect(otra.expediente[0].fuente).toBe('github:Silia-mx/Agent#1');
    expect(otra.usos.cerebro).toBe(1);
    expect(otra.restauradaDe).toBe(m.id);
    expect(otra.l1).toHaveLength(0);
  });

  test('restaurar ignora datos invalidos', () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista() });
    expect(m.restaurar(null)).toBe(false);
    expect(m.restaurar({ version: 99 })).toBe(false);
    expect(m.restaurar({ version: 1, l2: 'basura', l3: [{ sin: 'texto' }] })).toBe(true);
    expect(m.l2).toEqual([]);
    expect(m.l3).toEqual([]);
  });

  test('reset borra todo y avisa', () => {
    const eventos = [];
    const m = new MemoriaSesion({ compresor: compresorDeterminista(), onCambio: (e) => eventos.push(e) });
    m.agregarTurno({ usuario: 'a', respuesta: 'b' });
    const idPrevio = m.id;
    m.reset('atajo');
    expect(m.tieneContenido()).toBe(false);
    expect(m.id).not.toBe(idPrevio);
    expect(eventos).toEqual([{ tipo: 'reset', motivo: 'atajo' }]);
  });

  test('un onCambio que lanza no rompe la compresion', async () => {
    const m = new MemoriaSesion({ compresor: compresorDeterminista(), onCambio: () => { throw new Error('disco'); } });
    await expect(simular(m, 12)).resolves.toBeGreaterThan(0);
  });

  test('formatearContexto arma las secciones con ⭐', () => {
    const texto = formatearContexto({
      turnos: [{ usuario: 'u', respuesta: 'r', modo: 'silia' }],
      l2: [{ texto: 'resumen', estrella: true }],
      l3: [{ texto: '[min 1] x → y', estrella: false }],
      expediente: [{ fuente: 'jira:AGE-1', texto: 'Done' }]
    });
    expect(texto).toContain('⭐ resumen');
    expect(texto).toContain('[jira:AGE-1] Done');
    expect(texto).toContain('Turnos recientes');
  });
});
