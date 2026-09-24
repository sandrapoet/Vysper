/**
 * Elección de las herramientas de escritura/portapapeles bajo Wayland.
 *
 * El 2026-09-24 Vysper eligió `wtype` por el simple hecho de estar en
 * Wayland, pidió la contraseña de sudo para instalarlo, y nunca comprobó que
 * el compositor lo soportara. GNOME/mutter no implementa
 * `virtual-keyboard-unstable-v1` y no piensa hacerlo, así que `wtype` sale
 * con "Compositor does not support the virtual keyboard protocol" y no
 * escribe una sola tecla. El pegado (Ctrl+1) quedó muerto sin un aviso.
 *
 * La regla que corrige eso: PROBAR, NO SUPONER. Y cuando ya se sabe de
 * antemano que no va a servir, ni siquiera pedir sudo para instalarlo.
 *
 * Módulo puro: sin Electron y sin ejecutar nada por su cuenta (el lanzador
 * se inyecta), para poder probarlo de verdad.
 */

const WL_CLIPBOARD = { bin: 'wl-paste', pkg: 'wl-clipboard' };
const WTYPE = { bin: 'wtype', pkg: 'wtype' };

/**
 * GNOME es el único caso conocido y estable de "no lo soporta y no lo va a
 * soportar", así que se excluye por nombre. Cualquier otro compositor
 * (sway, Hyprland, river…) sí implementa el protocolo, y los que no, caen
 * igualmente en la sonda de abajo — la lista negra ahorra el sudo, no
 * reemplaza la comprobación.
 */
function esGnome(entorno = {}) {
  const escritorio = String(entorno.XDG_CURRENT_DESKTOP || '').toLowerCase();
  return escritorio.includes('gnome');
}

/**
 * Herramientas a exigir (e instalar) en una sesión Wayland.
 * `wl-clipboard` se pide siempre: funciona en GNOME sin reservas.
 *
 * @param {Record<string,string>} entorno normalmente process.env
 * @returns {{bin: string, pkg: string}[]}
 */
function herramientasWaylandRequeridas(entorno = {}) {
  return esGnome(entorno) ? [WL_CLIPBOARD] : [WTYPE, WL_CLIPBOARD];
}

/**
 * Comprueba si `wtype` sirve DE VERDAD en este compositor, lanzándolo con
 * una cadena vacía: no escribe nada, pero obliga a negociar el protocolo.
 * Sale 0 si lo consiguió; si no, el motivo viene por stderr.
 *
 * @param {(bin: string, args: string[]) => {status: number, stderr: string}} ejecutar
 * @returns {{usable: boolean, motivo: string|null}}
 */
function evaluarWtype(ejecutar) {
  let salida;
  try {
    salida = ejecutar('wtype', ['']);
  } catch (error) {
    return { usable: false, motivo: `no se pudo ejecutar wtype: ${error.message}` };
  }

  const stderr = String(salida?.stderr || '').trim();

  if (salida?.status === 0) {
    return { usable: true, motivo: null };
  }

  return { usable: false, motivo: stderr || `wtype salio con codigo ${salida?.status}` };
}

module.exports = { herramientasWaylandRequeridas, evaluarWtype, esGnome };
