const { GnomeKeybindingsService } = require('../src/services/gnome-keybindings.service');

function servicio(respuestas) {
  const llamadas = [];
  const ejecutar = (bin, args) => {
    llamadas.push([bin, ...args].join(' '));
    const clave = args.join(' ');
    return respuestas[clave] || { status: 0, stdout: '', stderr: '' };
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { svc: new GnomeKeybindingsService({ ejecutar, logger }), llamadas, logger };
}

test('leerExistentes devuelve lista vacia cuando no hay ninguno', () => {
  const { svc } = servicio({ "get org.gnome.settings-daemon.plugins.media-keys custom-keybindings": { status: 0, stdout: "@as []\n", stderr: '' } });
  expect(svc.leerExistentes()).toEqual([]);
});

test('instalar no escribe nada si todo choca, y avisa', () => {
  const { svc, llamadas, logger } = servicio({});
  jest.spyOn(svc, 'leerExistentes').mockReturnValue([{ id: 'x', binding: '<Alt>r', command: 'otra' }]);
  const r = svc.instalar([{ nombre: 'grabar', combo: '<Alt>r' }], '/bin/va');
  expect(r.instalados).toHaveLength(0);
  expect(r.saltados).toHaveLength(1);
  expect(logger.warn).toHaveBeenCalled();
  expect(llamadas.filter((c) => c.includes(' set '))).toHaveLength(0);
});

test('un fallo de gsettings no revienta: se reporta', () => {
  const { svc, logger } = servicio({});
  jest.spyOn(svc, 'leerExistentes').mockReturnValue([]);
  const svcFallo = new GnomeKeybindingsService({
    ejecutar: () => ({ status: 1, stdout: '', stderr: 'no such schema' }),
    logger
  });
  jest.spyOn(svcFallo, 'leerExistentes').mockReturnValue([]);
  expect(() => svcFallo.instalar([{ nombre: 'grabar', combo: '<Alt>r' }], '/bin/va')).not.toThrow();
});

test('desinstalar solo toca lo del prefijo', () => {
  const { svc, llamadas } = servicio({});
  jest.spyOn(svc, 'leerExistentes').mockReturnValue([
    { id: 'vysper-grabar', binding: '<Alt>r', command: '/bin/va grabar', path: '/p/vysper-grabar/' },
    { id: 'ajeno', binding: '<Alt>k', command: 'otra', path: '/p/ajeno/' },
  ]);
  svc.desinstalar();
  expect(llamadas.join('\n')).toContain('vysper-grabar');
  expect(llamadas.join('\n')).not.toContain('/p/ajeno/');
});

// dconf falso con estado: responde get/set/reset como gsettings.
function dconfFalso(inicial) {
  const datos = new Map(Object.entries(inicial));
  const ejecutar = (bin, [op, esquema, clave, valor]) => {
    const k = `${esquema} ${clave}`;
    if (op === 'get') return { status: 0, stdout: `${datos.get(k) ?? (clave === 'custom-keybindings' ? '@as []' : "''")}\n`, stderr: '' };
    if (op === 'set') { datos.set(k, valor); return { status: 0, stdout: '', stderr: '' }; }
    if (op === 'reset') { datos.delete(k); return { status: 0, stdout: '', stderr: '' }; }
    return { status: 1, stdout: '', stderr: 'op desconocida' };
  };
  return { ejecutar, datos };
}

test('instalar y desinstalar deja la lista de GNOME exactamente como estaba', () => {
  const S = 'org.gnome.settings-daemon.plugins.media-keys';
  const ajena = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/';
  const listaOriginal = `['${ajena}']`;
  const { ejecutar, datos } = dconfFalso({
    [`${S} custom-keybindings`]: listaOriginal,
    [`${S}.custom-keybinding:${ajena} name`]: "'Terminal'",
    [`${S}.custom-keybinding:${ajena} binding`]: "'<Alt>t'",
    [`${S}.custom-keybinding:${ajena} command`]: "'gnome-terminal'",
  });
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const svc = new GnomeKeybindingsService({ ejecutar, logger });

  const r = svc.instalar([{ nombre: 'sesion', combo: '<Alt>s' }, { nombre: 'terminal', combo: '<Alt>t' }], '/bin/va');
  expect(r.instalados.map((a) => a.id)).toEqual(['vysper-sesion']);
  expect(r.saltados).toMatchObject([{ binding: '<Alt>t', ocupadoPor: 'custom0' }]);
  expect(svc.leerExistentes().map((e) => e.id)).toEqual(['custom0', 'vysper-sesion']);
  expect(svc.leerExistentes()[1]).toMatchObject({ binding: '<Alt>s', command: '/bin/va sesion' });

  // Reinstalar no duplica la ruta.
  svc.instalar([{ nombre: 'sesion', combo: '<Alt>s' }], '/bin/va');
  expect(svc.leerExistentes()).toHaveLength(2);

  svc.desinstalar();
  expect(`[${svc.leerRutas().map((r) => `'${r}'`).join(', ')}]`).toBe(listaOriginal);
  expect(datos.get(`${S}.custom-keybinding:${ajena} command`)).toBe("'gnome-terminal'");
});
