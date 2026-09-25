/**
 * Elección de backends de atajos globales y de escritura de teclas.
 *
 * Suponer por XDG_SESSION_TYPE fue lo que hizo elegir wtype en un compositor
 * que no lo soporta (ver typing-tool-probe.js). Aquí cada backend de Wayland
 * se elige solo si su sonda confirma que funciona, y cada elección trae su
 * motivo en español para dejarlo en el log.
 *
 * Módulo puro: las sondas se inyectan. Ninguna se llama si la plataforma ya
 * decide (Windows, macOS, X11 conservan sus backends de siempre).
 *
 * PortalGlobalShortcuts se declara pero no se implementa: la interfaz no
 * existe en GNOME 46. Cuando GNOME la publique, su sonda dirá que sí y gana.
 */

// Elegir un backend que no existe dejaria a Vysper sin atajos: hasta que se
// implemente, el portal solo se menciona en el motivo.
const PORTAL_GLOBAL_SHORTCUTS_IMPLEMENTADO = false;

// Una sonda que revienta (p.ej. D-Bus caído) cuenta como no disponible.
function probar(sondas, nombre) {
  const sonda = sondas && sondas[nombre];
  if (typeof sonda !== 'function') return false;
  try {
    return Boolean(sonda());
  } catch (_error) {
    return false;
  }
}

function elegirAtajos(entorno, sondas, plataforma) {
  if (plataforma !== 'linux') {
    return { nombre: 'ElectronGlobalShortcut', motivo: `plataforma ${plataforma}: los atajos globales de Electron funcionan` };
  }
  if (!esWayland(entorno)) {
    return { nombre: 'ElectronGlobalShortcut', motivo: 'sesion X11: los atajos globales de Electron funcionan' };
  }
  const hayPortal = probar(sondas, 'portalGlobalShortcuts');
  if (hayPortal && PORTAL_GLOBAL_SHORTCUTS_IMPLEMENTADO) {
    return { nombre: 'PortalGlobalShortcuts', motivo: 'Wayland con el portal GlobalShortcuts disponible' };
  }
  if (probar(sondas, 'gsettings')) {
    return {
      nombre: 'GnomeKeybinding',
      motivo: hayPortal
        ? 'Wayland: el portal GlobalShortcuts existe pero Vysper aun no lo implementa; los atajos se instalan en GNOME con gsettings'
        : 'Wayland sin portal GlobalShortcuts: los atajos se instalan en GNOME con gsettings'
    };
  }
  return {
    nombre: 'Ninguno',
    motivo: 'Wayland sin portal GlobalShortcuts y sin gsettings: no hay forma de recibir atajos globales; solo funcionan con la ventana de Vysper enfocada'
  };
}

function elegirEscritura(entorno, sondas, plataforma) {
  if (plataforma === 'win32') {
    return { nombre: 'Powershell', motivo: 'Windows: se escribe con PowerShell' };
  }
  if (plataforma === 'darwin') {
    return { nombre: 'Osascript', motivo: 'macOS: se escribe con osascript' };
  }
  if (!esWayland(entorno)) {
    return { nombre: 'Xdotool', motivo: 'sesion X11: se escribe con xdotool' };
  }
  if (probar(sondas, 'portalRemoteDesktop')) {
    return { nombre: 'PortalRemoteDesktop', motivo: 'Wayland con el portal RemoteDesktop disponible' };
  }
  return {
    nombre: 'ClipboardOnly',
    motivo: 'Wayland sin portal RemoteDesktop: el texto solo se deja en el portapapeles'
  };
}

function esWayland(entorno = {}) {
  return String(entorno.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland';
}

function elegirBackends(entorno = {}, sondas = {}) {
  const plataforma = entorno.PLATAFORMA || process.platform;
  return {
    atajos: elegirAtajos(entorno, sondas, plataforma),
    escritura: elegirEscritura(entorno, sondas, plataforma)
  };
}

module.exports = { elegirBackends };
