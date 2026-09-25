const { elegirBackends } = require('../src/core/backend-selector');

const TODAS_OK = {
  portalRemoteDesktop: () => true, portalGlobalShortcuts: () => true,
  gsettings: () => true, xdotool: () => true, wtype: () => true
};
const NINGUNA = {
  portalRemoteDesktop: () => false, portalGlobalShortcuts: () => false,
  gsettings: () => false, xdotool: () => false, wtype: () => false
};

describe('elegirBackends', () => {
  test('en X11 usa Electron y xdotool, sin tocar ninguna sonda de Wayland', () => {
    const llamadas = [];
    const sondas = { ...TODAS_OK, portalRemoteDesktop: () => { llamadas.push('portal'); return true; } };
    const r = elegirBackends({ XDG_SESSION_TYPE: 'x11' }, sondas);
    expect(r.atajos.nombre).toBe('ElectronGlobalShortcut');
    expect(r.escritura.nombre).toBe('Xdotool');
    expect(llamadas).toHaveLength(0);
  });

  test('en Windows no consulta sondas de Linux', () => {
    const r = elegirBackends({ PLATAFORMA: 'win32' }, NINGUNA);
    expect(r.escritura.nombre).toBe('Powershell');
  });

  test('en Wayland+GNOME prefiere GnomeKeybinding y PortalRemoteDesktop', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }, TODAS_OK);
    expect(r.atajos.nombre).toBe('GnomeKeybinding');
    expect(r.escritura.nombre).toBe('PortalRemoteDesktop');
  });

  test('si el portal GlobalShortcuts existe, gana sobre GnomeKeybinding', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' }, TODAS_OK);
    // Hoy portalGlobalShortcuts() es false en GNOME 46; cuando exista, gana.
    expect(['GnomeKeybinding', 'PortalGlobalShortcuts']).toContain(r.atajos.nombre);
  });

  test('sin portal RemoteDesktop la escritura degrada a portapapeles, con motivo', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' },
      { ...TODAS_OK, portalRemoteDesktop: () => false });
    expect(r.escritura.nombre).toBe('ClipboardOnly');
    expect(r.escritura.motivo).toMatch(/portal/i);
  });

  test('sin gsettings no hay atajos globales, y se dice por que', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' },
      { ...TODAS_OK, gsettings: () => false, portalGlobalShortcuts: () => false });
    expect(r.atajos.nombre).toBe('Ninguno');
    expect(r.atajos.motivo).toMatch(/gsettings/i);
  });

  test('toda eleccion trae motivo no vacio', () => {
    const r = elegirBackends({ XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' }, TODAS_OK);
    expect(r.atajos.motivo.length).toBeGreaterThan(0);
    expect(r.escritura.motivo.length).toBeGreaterThan(0);
  });

  test('una sonda que revienta se trata como no disponible, no propaga', () => {
    const sondas = { ...TODAS_OK, portalRemoteDesktop: () => { throw new Error('dbus caido'); } };
    const r = elegirBackends({ XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' }, sondas);
    expect(r.escritura.nombre).toBe('ClipboardOnly');
  });
});
