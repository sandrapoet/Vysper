/**
 * Atajos personalizados de GNOME para Vysper bajo Wayland.
 *
 * mutter no entrega los grabs globales de X11 de los clientes XWayland, asi
 * que los atajos de Electron solo disparan con la ventana de Vysper
 * enfocada. GNOME si ejecuta sus propios atajos personalizados desde
 * cualquier ventana: cada accion de Vysper se instala ahi como un comando
 * que llama al servidor HTTP local (ver bin/vysper-accion).
 *
 * Escribir en la configuracion del escritorio del usuario es intrusivo
 * aunque sea reversible: nunca se pisa un combo ocupado, y la desinstalacion
 * quita exactamente lo que lleva nuestro prefijo.
 *
 * Modulo puro: solo describe que hay que hacer. Quien ejecuta gsettings es
 * src/services/gnome-keybindings.service.js.
 */

const PREFIJO = 'vysper-';

function construirAtajos(acciones, rutaEjecutable) {
  // El comando solo lleva la ruta y el nombre de la accion: el token vive
  // en un archivo 0600 que lee el ejecutable, porque los atajos de dconf se
  // ven en Ajustes y en ps.
  return acciones.map((accion) => ({
    id: `${PREFIJO}${accion.nombre}`,
    binding: accion.combo,
    command: `${rutaEjecutable} ${accion.nombre}`
  }));
}

function esNuestro(existente, deseado) {
  return existente.id.startsWith(PREFIJO) && existente.id === deseado.id;
}

// GNOME no distingue mayusculas en los combos: <Alt>s y <alt>S son el mismo.
function mismoCombo(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function detectarChoques(deseados, existentes) {
  const choques = [];
  for (const deseado of deseados) {
    const ocupante = existentes.find((e) => mismoCombo(e.binding, deseado.binding) && !esNuestro(e, deseado));
    if (ocupante) {
      choques.push({ id: deseado.id, binding: deseado.binding, ocupadoPor: ocupante.id });
    }
  }
  return choques;
}

function planInstalacion(deseados, existentes) {
  const choques = detectarChoques(deseados, existentes);
  const chocados = new Set(choques.map((c) => c.id));
  const instalar = deseados.filter((deseado) => {
    if (chocados.has(deseado.id)) return false;
    // Idempotente: lo ya instalado tal cual no se vuelve a escribir.
    const previo = existentes.find((e) => e.id === deseado.id);
    return !(previo && mismoCombo(previo.binding, deseado.binding) && previo.command === deseado.command);
  });
  return { instalar, saltados: choques };
}

function planDesinstalacion(existentes) {
  return { quitar: existentes.filter((e) => e.id.startsWith(PREFIJO)) };
}

module.exports = {
  PREFIJO,
  construirAtajos,
  detectarChoques,
  planInstalacion,
  planDesinstalacion
};
