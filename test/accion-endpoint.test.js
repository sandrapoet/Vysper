const { ACCIONES, ejecutarAccion } = require('../src/core/acciones');
const { ACCION_VALIDA } = require('../src/core/accion-http');

function controladorFalso(comportamiento = () => true) {
  const disparados = [];
  return {
    disparados,
    dispararAtajo: jest.fn(async (atajo) => {
      disparados.push(atajo);
      return comportamiento(atajo);
    })
  };
}

test('cada accion dispara su atajo', async () => {
  for (const [nombre, { atajo }] of Object.entries(ACCIONES)) {
    const c = controladorFalso();
    const r = await ejecutarAccion(c, nombre);
    expect(r).toEqual({ status: 200, body: { ok: true, accion: nombre } });
    expect(c.disparados).toEqual([atajo]);
  }
});

test('las acciones del plan existen, con Alt+S en sesion', () => {
  ['grabar', 'sesion', 'captura', 'pegar', 'chat', 'modo-siguiente', 'modo-anterior']
    .forEach((n) => expect(ACCIONES).toHaveProperty(n));
  expect(ACCIONES.sesion.atajo).toBe('Alt+S');
});

test('una accion inexistente es 404 y no llama a nada', async () => {
  const c = controladorFalso();
  const r = await ejecutarAccion(c, 'borrar-todo');
  expect(r.status).toBe(404);
  expect(c.dispararAtajo).not.toHaveBeenCalled();
});

test('no se cuela un nombre heredado de Object.prototype', async () => {
  const c = controladorFalso();
  expect((await ejecutarAccion(c, 'constructor')).status).toBe(404);
  expect(c.dispararAtajo).not.toHaveBeenCalled();
});

test('un manejador que lanza devuelve 500, no revienta', async () => {
  const c = controladorFalso(() => { throw new Error('sidecar caido'); });
  const r = await ejecutarAccion(c, 'sesion');
  expect(r.status).toBe(500);
  expect(r.body.error).toMatch(/sidecar caido/);
});

test('un atajo sin manejador se reporta, no se da por hecho', async () => {
  const c = controladorFalso(() => false);
  expect((await ejecutarAccion(c, 'grabar')).status).toBe(409);
});

test('todo nombre de accion pasa la validacion de vysper-accion', () => {
  Object.keys(ACCIONES).forEach((n) => expect(n).toMatch(ACCION_VALIDA));
});

describe('POST /accion/:nombre en el servidor real', () => {
  const os = require('os');
  const path = require('path');
  const http = require('http');
  const { construirPeticion } = require('../src/core/accion-http');
  let server;
  let puerto;
  const controlador = controladorFalso();

  beforeAll((done) => {
    Object.assign(process.env, {
      VYSPER_HTTP_SERVER: '1', VYSPER_HTTP_PORT: '0', VYSPER_HTTP_USER: 'u', VYSPER_HTTP_PASSWORD: 'p',
      VYSPER_HTTP_LOG: path.join(os.tmpdir(), `vysper-accion-test-${process.pid}.log`),
      VYSPER_HTTP_UPLOAD_DIR: path.join(os.tmpdir(), `vysper-accion-test-${process.pid}`)
    });
    const { startRemoteAudioServer } = require('../stt/http_server');
    server = startRemoteAudioServer(controlador, {});
    server.on('listening', () => { puerto = server.address().port; done(); });
  });

  afterAll((done) => { server.close(done); });

  function pedir(accion, token) {
    const p = construirPeticion(accion, { puerto, token });
    return new Promise((resolve, reject) => {
      const req = http.request(p.url, { method: p.method, headers: p.headers }, (res) => {
        let cuerpo = '';
        res.on('data', (t) => { cuerpo += t; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(cuerpo) }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  test('con la credencial correcta dispara la accion', async () => {
    const r = await pedir('sesion', 'u:p');
    expect(r).toEqual({ status: 200, body: { ok: true, accion: 'sesion' } });
    expect(controlador.disparados).toContain('Alt+S');
  });

  test('sin la credencial correcta es 401 y no dispara', async () => {
    controlador.dispararAtajo.mockClear();
    expect((await pedir('sesion', 'u:mala')).status).toBe(401);
    expect(controlador.dispararAtajo).not.toHaveBeenCalled();
  });

  test('una accion desconocida es 404', async () => {
    expect((await pedir('nada', 'u:p')).status).toBe(404);
  });
});
