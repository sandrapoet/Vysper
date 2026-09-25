const { PortalRemoteDesktop, keysymDeCaracter, keysymsDeCombo } = require('../src/services/portal-remote-desktop.service');

function dbusFalso({ disponible = true, respuestas = [] } = {}) {
  const cola = [...respuestas];
  return {
    iniciados: [],
    teclas: [],
    disponible: jest.fn(async () => disponible),
    iniciar: jest.fn(async function (token) {
      this.iniciados.push(token);
      return cola.shift() || { ok: true, restore_token: 'nuevo' };
    }),
    keysym: jest.fn(async function (k, pulsada) {
      this.teclas.push([k, pulsada]);
      return { ok: true };
    })
  };
}

function almacenFalso(inicial = null) {
  let valor = inicial;
  return { leer: jest.fn(() => valor), guardar: jest.fn((t) => { valor = t; }), valor: () => valor };
}

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

test('reutiliza el testigo guardado', async () => {
  const dbus = dbusFalso({ respuestas: [{ ok: true, restore_token: 'renovado' }] });
  const almacen = almacenFalso('guardado');
  const p = new PortalRemoteDesktop({ dbus, almacen, logger: logger() });
  expect((await p.asegurarSesion()).ok).toBe(true);
  expect(dbus.iniciados).toEqual(['guardado']);
  // El portal emite un testigo nuevo en cada Start: se guarda el vigente.
  expect(almacen.valor()).toBe('renovado');
});

test('si la restauracion falla lo pide de nuevo una sola vez, y lo registra', async () => {
  const dbus = dbusFalso({ respuestas: [{ ok: false, motivo: 'token caducado' }, { ok: false, motivo: 'otra vez' }] });
  const log = logger();
  const p = new PortalRemoteDesktop({ dbus, almacen: almacenFalso('viejo'), logger: log });
  const r = await p.asegurarSesion();
  expect(r.ok).toBe(false);
  expect(dbus.iniciados).toEqual(['viejo', null]);
  expect(log.warn).toHaveBeenCalled();
});

test('si el usuario deniega, typeText devuelve ok:false con motivo, sin lanzar', async () => {
  const dbus = dbusFalso({ respuestas: [{ ok: false, denegado: true, motivo: 'el usuario denego' }] });
  const p = new PortalRemoteDesktop({ dbus, almacen: almacenFalso(), logger: logger() });
  const r = await p.typeText('hola');
  expect(r).toMatchObject({ ok: false });
  expect(r.motivo).toMatch(/denego/);
  expect(dbus.teclas).toHaveLength(0);
});

test('tras una denegacion no vuelve a abrir el dialogo en cada pegado', async () => {
  const dbus = dbusFalso({ respuestas: [{ ok: false, denegado: true, motivo: 'denegado' }] });
  const p = new PortalRemoteDesktop({ dbus, almacen: almacenFalso(), logger: logger() });
  await p.typeText('a');
  await p.typeText('b');
  expect(dbus.iniciar).toHaveBeenCalledTimes(1);
});

test('un testigo nuevo se guarda', async () => {
  const almacen = almacenFalso();
  const p = new PortalRemoteDesktop({ dbus: dbusFalso(), almacen, logger: logger() });
  await p.asegurarSesion();
  expect(almacen.guardar).toHaveBeenCalledWith('nuevo');
});

test('disponible() es false si la interfaz no esta en el bus', async () => {
  const p = new PortalRemoteDesktop({ dbus: dbusFalso({ disponible: false }), almacen: almacenFalso(), logger: logger() });
  expect(await p.disponible()).toBe(false);
});

test('disponible() es false si el bus revienta', async () => {
  const dbus = dbusFalso();
  dbus.disponible = jest.fn(async () => { throw new Error('sin bus'); });
  const p = new PortalRemoteDesktop({ dbus, almacen: almacenFalso(), logger: logger() });
  expect(await p.disponible()).toBe(false);
});

test('typeText pulsa y suelta cada caracter, con la sesion abierta una sola vez', async () => {
  const dbus = dbusFalso();
  const p = new PortalRemoteDesktop({ dbus, almacen: almacenFalso(), logger: logger() });
  expect((await p.typeText('añ')).ok).toBe(true);
  expect(dbus.teclas).toEqual([[0x61, true], [0x61, false], [0xf1, true], [0xf1, false]]);
  await p.typeText('x');
  expect(dbus.iniciar).toHaveBeenCalledTimes(1);
});

test('sendKeys mantiene los modificadores mientras pulsa la tecla', async () => {
  const dbus = dbusFalso();
  const p = new PortalRemoteDesktop({ dbus, almacen: almacenFalso(), logger: logger() });
  await p.sendKeys('ctrl+v');
  expect(dbus.teclas).toEqual([[0xffe3, true], [0x76, true], [0x76, false], [0xffe3, false]]);
});

describe('keysyms', () => {
  test('ASCII y Latin-1 usan su codigo; lo demas, el rango Unicode', () => {
    expect(keysymDeCaracter('a')).toBe(0x61);
    expect(keysymDeCaracter('é')).toBe(0xe9);
    expect(keysymDeCaracter('€')).toBe(0x010020ac);
    expect(keysymDeCaracter('\n')).toBe(0xff0d);
    expect(keysymDeCaracter('\t')).toBe(0xff09);
  });

  test('un combo desconocido lanza en vez de teclear otra cosa', () => {
    expect(() => keysymsDeCombo('hyper+q')).toThrow();
  });
});
