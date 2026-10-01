const fs = require('fs');
const os = require('os');
const path = require('path');

const { MemoriaSesion } = require('../src/core/memoria-sesion');
const { crearCompresor } = require('../src/core/memoria-compresor');
const {
  responderConMemoria,
  contextoParaSystemDesign,
  formatearStatus,
  MARCA_MEMORIA
} = require('../src/core/memoria-silia');
const { identificarProyecto } = require('../src/core/memoria-proyecto');
const { guardarSesion, cargarUltimaSesion } = require('../src/core/memoria-persistencia');
const { parseMemoriaCommand, isUnknownSlashCommand } = require('../src/core/silia-commands');

function nuevaMemoria() {
  return new MemoriaSesion({ compresor: crearCompresor({ proveedores: [] }) });
}

function deps(memoria, { clasificacion, rapido = 'respuesta rápida', cerebro } = {}) {
  const escritos = [];
  const runDiagnose = jest.fn(async () => cerebro || {
    summary: 'AGE-321 está en revisión, asignado a Ana.',
    citations: [{ file_source: 'jira:AGE-321' }]
  });
  return {
    escritos,
    runDiagnose,
    deps: {
      memoria,
      proveedoresClasificador: [{ nombre: 'anthropic', llamar: async () => clasificacion }],
      proveedoresRapidos: [{ nombre: 'anthropic', llamar: async () => rapido }],
      runDiagnose,
      escribirContexto: (obj) => { escritos.push(obj); return '/tmp/ctx.json'; },
      borrarContexto: jest.fn(),
      formatear: (r) => r.summary
    }
  };
}

describe('responderConMemoria', () => {
  test('pregunta de proyecto: invoca a Cerebro con la memoria y el proyecto, y guarda el hecho', async () => {
    const memoria = nuevaMemoria();
    memoria.agregarTurno({ usuario: 'hablemos del motor', respuesta: 'va' });
    const { deps: d, runDiagnose, escritos } = deps(memoria);

    const r = await responderConMemoria('¿cómo va AGE-321?', d);
    await r.mantenimiento;

    expect(r.categoria).toBe('proyecto');
    expect(runDiagnose).toHaveBeenCalledWith('¿cómo va AGE-321?', { persona: 'silia', contextoFile: '/tmp/ctx.json' });
    expect(d.borrarContexto).toHaveBeenCalledWith('/tmp/ctx.json');
    const ctx = escritos[0];
    expect(ctx.turnos[0]).toEqual({ pregunta: 'hablemos del motor', respuesta: 'va' });
    expect(ctx.proyecto).toMatchObject({ project_key: 'AGE', repo: 'Silia-mx/Agent' });
    expect(ctx.proyecto.fuentes).toContain('jira');
    expect(memoria.expediente[0]).toMatchObject({ fuente: 'jira:AGE-321' });
    expect(memoria.l1[memoria.l1.length - 1]).toMatchObject({ categoria: 'proyecto' });
    expect(memoria.usos.cerebro).toBe(1);
  });

  test('pregunta contextual: responde con la memoria, sin Cerebro', async () => {
    const memoria = nuevaMemoria();
    memoria.agregarTurno({ usuario: 'el orquestador usa colas', respuesta: 'anotado: colas en el orquestador' });
    const { deps: d, runDiagnose } = deps(memoria, {
      clasificacion: '{"categoria":"contextual","confianza":0.9}',
      rapido: 'Dijimos que el orquestador usa colas.'
    });

    const r = await responderConMemoria('¿qué dijimos del orquestador?', d);

    expect(r.categoria).toBe('contextual');
    expect(r.texto).toContain(MARCA_MEMORIA);
    expect(r.texto).toContain('usa colas');
    expect(runDiagnose).not.toHaveBeenCalled();
  });

  test('contextual sin nada en memoria: consulta Cerebro', async () => {
    const memoria = nuevaMemoria();
    const { deps: d, runDiagnose } = deps(memoria, { clasificacion: '{"categoria":"contextual","confianza":0.9}' });
    const r = await responderConMemoria('¿qué dijimos?', d);
    expect(r.categoria).toBe('proyecto');
    expect(runDiagnose).toHaveBeenCalled();
  });

  test('off_topic: responde directo y lo cuenta', async () => {
    const memoria = nuevaMemoria();
    const { deps: d, runDiagnose } = deps(memoria, {
      clasificacion: '{"categoria":"off_topic","confianza":0.95}',
      rapido: 'Una cola FIFO saca primero lo que entró primero.'
    });
    const r = await responderConMemoria('¿qué es una cola FIFO?', d);
    expect(r.categoria).toBe('off_topic');
    expect(r.texto).toContain('FIFO');
    expect(runDiagnose).not.toHaveBeenCalled();
    expect(memoria.usos.directo).toBe(1);
  });

  test('si el modelo rapido no responde, cae a Cerebro', async () => {
    const memoria = nuevaMemoria();
    const { deps: d, runDiagnose } = deps(memoria, { clasificacion: '{"categoria":"off_topic","confianza":0.95}' });
    d.proveedoresRapidos = [{ nombre: 'anthropic', llamar: async () => { throw new Error('503'); } }];
    const r = await responderConMemoria('¿qué es una cola FIFO?', d);
    expect(r.categoria).toBe('proyecto');
    expect(runDiagnose).toHaveBeenCalled();
  });

  test('si Cerebro falla, el error se propaga y se borra el temporal', async () => {
    const memoria = nuevaMemoria();
    const { deps: d } = deps(memoria);
    d.runDiagnose = async () => { throw new Error('timeout'); };
    await expect(responderConMemoria('¿cómo va AGE-1?', d)).rejects.toThrow('timeout');
    expect(d.borrarContexto).toHaveBeenCalled();
  });
});

describe('contextoParaSystemDesign', () => {
  test('suma la memoria de Silia a la asesoria sin duplicar turnos', () => {
    const memoria = nuevaMemoria();
    memoria.agregarTurno({ usuario: '¿cómo va AGE-1?', respuesta: 'en revisión' });
    memoria.agregarTurno({ usuario: 'misma', respuesta: 'x' });
    memoria.agregarHechos([{ fuente: 'jira:AGE-1', texto: 'En revisión' }]);
    const ctx = contextoParaSystemDesign(
      { transcripcion: 'reunión', turnos: [{ pregunta: 'misma', respuesta: 'x' }] },
      memoria,
      'propón una arquitectura para el checkpointer'
    );
    expect(ctx.transcripcion).toBe('reunión');
    expect(ctx.turnos.filter((t) => t.pregunta === 'misma')).toHaveLength(1);
    expect(ctx.turnos[0].pregunta).toBe('¿cómo va AGE-1?');
    expect(ctx.expediente[0].fuente).toBe('jira:AGE-1');
    expect(ctx.proyecto.project_key).toBe('AGE');
    expect(ctx.proyecto.fuentes).toContain('notion');
  });
});

describe('identificarProyecto', () => {
  test('por defecto es el motor de agentes', () => {
    expect(identificarProyecto('¿cómo vamos?')).toMatchObject({ dominio: 'agentes', origen: 'default' });
  });

  test('sugiere fuentes segun la pregunta', () => {
    expect(identificarProyecto('¿ya está en staging el PR #12?').fuentes).toEqual(['github']);
    expect(identificarProyecto('¿dónde está la documentación de la épica?').fuentes).toEqual(
      expect.arrayContaining(['notion', 'jira'])
    );
    expect(identificarProyecto('¿qué acordamos en el canal?').fuentes).toEqual(
      expect.arrayContaining(['slack', 'rag'])
    );
  });

  test('reconoce otro proyecto del registro por su clave', () => {
    const registro = [
      { dominio: 'agentes', projectKey: 'AGE', repo: 'Silia-mx/Agent', alias: ['agentes'] },
      { dominio: 'almacen', projectKey: 'ALM', repo: 'Silia-mx/almacen', alias: ['almacén'] }
    ];
    expect(identificarProyecto('¿y ALM-648?', '', registro)).toMatchObject({ dominio: 'almacen', origen: 'pregunta' });
    expect(identificarProyecto('¿y eso?', 'hablando del almacén', registro)).toMatchObject({ dominio: 'almacen', origen: 'sesion' });
  });
});

describe('persistencia', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vysper-memoria-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('guarda y carga la ultima sesion', () => {
    const m = nuevaMemoria();
    m.agregarHechos([{ fuente: 'jira:AGE-1', texto: 'Done' }]);
    const ruta = guardarSesion(dir, m);
    expect(path.basename(ruta)).toBe(`session_${m.id}.json`);
    // exFAT/vfat (un TMPDIR en una USB) no guarda permisos: ahi no hay nada que verificar.
    const probe = path.join(dir, 'probe');
    fs.writeFileSync(probe, '', { mode: 0o600 });
    if ((fs.statSync(probe).mode & 0o777) === 0o600) {
      expect(fs.statSync(ruta).mode & 0o777).toBe(0o600);
    }
    const cargada = cargarUltimaSesion(dir);
    expect(cargada.datos.expediente[0].fuente).toBe('jira:AGE-1');
  });

  test('no carga sesiones mas viejas que maxDias, ni corruptas', () => {
    const m = nuevaMemoria();
    guardarSesion(dir, m);
    expect(cargarUltimaSesion(dir, { maxDias: 7, ahora: Date.now() + 8 * 86400000 })).toBeNull();
    fs.writeFileSync(path.join(dir, 'session_zzz.json'), '{roto');
    expect(cargarUltimaSesion(dir).datos.id).toBe(m.id);
  });

  test('sin directorio devuelve null', () => {
    expect(cargarUltimaSesion(path.join(dir, 'no-existe'))).toBeNull();
  });
});

describe('/memoria', () => {
  test('parsea status, comprimir y rechaza lo demas', () => {
    expect(parseMemoriaCommand('/memoria')).toEqual({ accion: 'status' });
    expect(parseMemoriaCommand('/memoria status')).toEqual({ accion: 'status' });
    expect(parseMemoriaCommand('/memoria comprimir')).toEqual({ accion: 'comprimir' });
    expect(parseMemoriaCommand('/memoria borrar').error).toContain('Ctrl+Shift+L');
    expect(parseMemoriaCommand('/memorias')).toBeNull();
    expect(isUnknownSlashCommand('/memoria status')).toBe(false);
  });

  test('formatearStatus muestra capas, tokens y usos', () => {
    const m = nuevaMemoria();
    m.agregarTurno({ usuario: 'a', respuesta: 'b' });
    const texto = formatearStatus(m.status());
    expect(texto).toContain('**L1**');
    expect(texto).toContain('**L3**');
    expect(texto).toContain('Usos:');
    expect(texto).toContain('% del tope');
  });
});
