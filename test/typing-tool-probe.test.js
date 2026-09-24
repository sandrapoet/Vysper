const {
  herramientasWaylandRequeridas,
  evaluarWtype
} = require('../src/core/typing-tool-probe');

/**
 * 2026-09-24: Vysper eligio wtype por estar en Wayland, pidio sudo para
 * instalarlo, y nunca comprobo que el compositor lo soportara. GNOME/mutter
 * no implementa virtual-keyboard-unstable-v1, asi que wtype sale con
 * "Compositor does not support the virtual keyboard protocol" y no escribe
 * nada. El pegado quedo muerto sin un solo aviso.
 */
describe('herramientasWaylandRequeridas', () => {
  test('en GNOME no pide wtype: su compositor no lo soporta y seria sudo en vano', () => {
    const tools = herramientasWaylandRequeridas({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' });
    expect(tools.map((t) => t.bin)).not.toContain('wtype');
  });

  test('en GNOME sigue pidiendo wl-clipboard, que si funciona', () => {
    const tools = herramientasWaylandRequeridas({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' });
    expect(tools.map((t) => t.bin)).toContain('wl-paste');
  });

  test('en un compositor que si lo soporta (sway) sigue pidiendo wtype', () => {
    const tools = herramientasWaylandRequeridas({ XDG_CURRENT_DESKTOP: 'sway' });
    expect(tools.map((t) => t.bin)).toContain('wtype');
  });

  test('sin dato de escritorio no asume GNOME', () => {
    expect(herramientasWaylandRequeridas({}).map((t) => t.bin)).toContain('wtype');
  });

  test('la deteccion de GNOME no depende de mayusculas ni del prefijo', () => {
    expect(herramientasWaylandRequeridas({ XDG_CURRENT_DESKTOP: 'GNOME' }).map((t) => t.bin))
      .not.toContain('wtype');
    expect(herramientasWaylandRequeridas({ XDG_CURRENT_DESKTOP: 'gnome-xorg' }).map((t) => t.bin))
      .not.toContain('wtype');
  });
});

describe('evaluarWtype', () => {
  test('salida 0 significa que el compositor lo acepta', () => {
    const ejecutar = () => ({ status: 0, stderr: '' });
    expect(evaluarWtype(ejecutar)).toMatchObject({ usable: true });
  });

  test('el mensaje real de GNOME lo marca inusable y conserva el motivo', () => {
    const ejecutar = () => ({
      status: 1,
      stderr: 'Compositor does not support the virtual keyboard protocol\n'
    });
    const r = evaluarWtype(ejecutar);
    expect(r.usable).toBe(false);
    expect(r.motivo).toMatch(/virtual keyboard/i);
  });

  test('cualquier otra salida distinta de 0 tambien es inusable', () => {
    expect(evaluarWtype(() => ({ status: 127, stderr: 'not found' })))
      .toMatchObject({ usable: false });
  });

  test('si el propio lanzamiento revienta, no propaga la excepcion', () => {
    const ejecutar = () => { throw new Error('ENOENT'); };
    expect(() => evaluarWtype(ejecutar)).not.toThrow();
    expect(evaluarWtype(ejecutar)).toMatchObject({ usable: false });
  });

  test('nunca escribe texto real: la sonda va con cadena vacia', () => {
    const llamadas = [];
    evaluarWtype((bin, args) => { llamadas.push({ bin, args }); return { status: 0, stderr: '' }; });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].bin).toBe('wtype');
    expect(llamadas[0].args).toEqual(['']);
  });
});
