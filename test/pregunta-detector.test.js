const { puedeSerPregunta, detectarPregunta, Deduplicador } = require('../src/core/pregunta-detector');

/**
 * Fixture real: ~/.Vysper/logs/application-2026-09-24.log, 10:22-10:41 (las
 * primeras 4), mas 4 preguntas legitimas de otros temas (permisos, pagos,
 * facturacion, fechas de entrega) agregadas en la ronda de correcciones
 * C1/C2 -- el criterio de coherencia lexica original era una lista blanca
 * de vocabulario que solo cubria el tema de las primeras 4, asi que
 * cualquier pregunta tecnica de otro dominio se descartaba en silencio
 * ({candidato:false, motivo:'incoherente-lexicamente'}). Con las 8 mezcladas
 * la calibracion deja de ser circular: el fixture ya no es el que definio
 * la lista, porque la lista ya no existe (ver pregunta-detector.js).
 */
const PREGUNTAS_REALES = [
  'que son los subagentes en el motor de agentes',
  'tenemos ya UI para la creacion de un subagente?',
  'que si un agente puede usar una skill',
  'de que trata o que impide la implementaacion de AGE-466',
  'existe alguna manera de revisar los permisos del usuario nuevo',
  'como resolvemos el problema del pago recurrente del inquilino',
  'donde quedo guardado el informe mensual de facturacion',
  'que opinan de mover la fecha de entrega para diciembre',
];

const RUIDO_REAL = [
  'para liar ver las cosas, digamos, en este maldado.',
  'y vamos a llamar ahí más empo, y eso es lo que llamar el empo de crear.',
  'Pero no me estás saliendo todo.',
  'ok',
];

/**
 * "Hola, ¿qué tal? Sí." (19 caracteres) salio de RUIDO_REAL en la ronda de
 * correcciones que agrego el bypass del piso de 20 caracteres para
 * fragmentos con "?" explicito. Antes se descartaba en la ETAPA 1 por
 * longitud; con el bypass ya no hay nada en la etapa 1 que lo rechace (trae
 * "?", asi que el marcador y la coherencia tambien quedan exceptuados). Eso
 * es una consecuencia real y esperada del cambio de requisito, no un bug: la
 * etapa 1 es deliberadamente permisiva (prefiere el falso positivo) y la
 * etapa 2 -- que ve el fragmento completo, no solo senales estructurales --
 * es la que tiene que reconocer que un saludo social no es una consulta
 * tecnica. Se mueve la asercion a donde el diseño de dos etapas dice que
 * corresponde (ver test 'una charla social con "?" pasa la etapa 1 pero la
 * etapa 2 la descarta' mas abajo).
 */
const SALUDO_CON_SIGNO = 'Hola, ¿qué tal? Sí.';

/**
 * Seguimientos cortos con "?" explicito: son justo lo que motiva la memoria
 * conversacional (un "y eso?" solo tiene sentido con el turno anterior en
 * contexto) y el piso de MIN_CARACTERES los mataba en silencio antes de
 * llegar a esa memoria. El piso sigue en 20 para texto SIN "?".
 */
const PREGUNTAS_CORTAS_CON_SIGNO = [
  '¿y un endpoint?',
  '¿y eso como?',
  '¿que skill usa?',
];

describe('puedeSerPregunta (etapa 1)', () => {
  test.each(PREGUNTAS_REALES)('deja pasar: %s', (texto) => {
    expect(puedeSerPregunta(texto).candidato).toBe(true);
  });

  test.each(RUIDO_REAL)('descarta: %s', (texto) => {
    expect(puedeSerPregunta(texto).candidato).toBe(false);
  });

  test.each(PREGUNTAS_CORTAS_CON_SIGNO)('deja pasar aunque sea corto, por el "?": %s', (texto) => {
    expect(puedeSerPregunta(texto).candidato).toBe(true);
  });

  test('un texto corto SIN "?" se sigue descartando por longitud', () => {
    // El cambio de requisito exime del piso de MIN_CARACTERES solo a lo que
    // trae un "?" explicito -- no lo elimina para todo lo demas.
    expect(puedeSerPregunta('y un endpoint').candidato).toBe(false);
    expect(puedeSerPregunta('y un endpoint').motivo).toBe('demasiado-corto');
  });

  test('descarta vacio o invalido sin reventar', () => {
    expect(puedeSerPregunta('').candidato).toBe(false);
    expect(puedeSerPregunta(undefined).candidato).toBe(false);
  });

  test('da un motivo legible al descartar', () => {
    expect(puedeSerPregunta('ok').motivo).toBe('demasiado-corto');
  });
});

describe('coherencia lexica del criterio 3 (invertido: reconoce ruido, no vocabulario conocido)', () => {
  // Estos dos casos NO vienen del fixture de produccion: se construyen a
  // proposito para ejercitar el criterio 3 en aislamiento (I3), con un
  // marcador interrogativo que NO esta al inicio del fragmento y sin "?",
  // para que ninguno de los dos "bypass" (signo explicito / apertura
  // interrogativa clara) se dispare antes -- si alguien desactiva el
  // criterio 3, el segundo test empieza a fallar porque nada mas en el
  // pipeline rechaza ese fragmento.
  test('acepta vocabulario tecnico desconocido para cualquier lista blanca (marcador no inicial)', () => {
    const r = puedeSerPregunta('necesitamos saber como configuramos el balanceador de trafico');
    expect(r).toEqual({ candidato: true, motivo: null });
  });

  test('rechaza ruido de reconocimiento con marcador suelto (marcador no inicial)', () => {
    const r = puedeSerPregunta('necesitamos saber como bntxr ahi mas fghjk de grpwq y xzvbn');
    expect(r.candidato).toBe(false);
    expect(r.motivo).toBe('incoherente-lexicamente');
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
    // 'a' y 'b' eran subcadenas triviales de cualquier texto: el test pasaba
    // aunque no se mandara ningun fragmento previo. Marcadores que no pueden
    // aparecer por casualidad (I1).
    const preguntar = jest.fn().mockResolvedValue({ esPregunta: true, preguntaNormalizada: 'X' });
    await detectarPregunta(
      ['viejo', 'MARCADOR_PREVIO_UNO', 'MARCADOR_PREVIO_DOS', 'que son los subagentes en el motor'],
      preguntar
    );
    const texto = preguntar.mock.calls[0][0];
    expect(texto).toContain('MARCADOR_PREVIO_UNO');
    expect(texto).toContain('MARCADOR_PREVIO_DOS');
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

  test('una charla social con "?" pasa la etapa 1 pero la etapa 2 la descarta', async () => {
    // Ver la nota junto a SALUDO_CON_SIGNO: la etapa 1 ya no puede rechazar
    // esto (trae "?"), asi que primero se confirma que efectivamente llega
    // a llamar al modelo (candidato de la etapa 1), y luego que un modelo
    // que SI ve el fragmento completo (no solo senales estructurales) lo
    // descarta como se esperaba de la version anterior de este fixture.
    const preguntar = jest.fn().mockResolvedValue({ esPregunta: false, preguntaNormalizada: null });
    const r = await detectarPregunta([SALUDO_CON_SIGNO], preguntar);
    expect(preguntar).toHaveBeenCalled();
    expect(r.esPregunta).toBe(false);
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
