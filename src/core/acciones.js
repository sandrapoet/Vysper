/**
 * Acciones de teclado que se pueden disparar sin que la tecla llegue a
 * Electron: bajo Wayland, GNOME ejecuta bin/vysper-accion <nombre>, que
 * llama a POST /accion/<nombre> en el servidor local.
 *
 * Cada accion apunta al acelerador de Electron que ya tiene su manejador en
 * main.js, en vez de repetir aqui a que metodo llama: asi un atajo y su
 * accion no pueden divergir. `combo` es la misma tecla en el formato de GNOME.
 */

const ACCIONES = {
  grabar: { atajo: 'Alt+R', combo: '<Alt>r' },
  sesion: { atajo: 'Alt+S', combo: '<Alt>s' },
  captura: { atajo: 'Alt+B', combo: '<Alt>b' },
  optimizacion: { atajo: 'Alt+O', combo: '<Alt>o' },
  'optimizacion-retro': { atajo: 'Alt+9', combo: '<Alt>9' },
  pegar: { atajo: 'CommandOrControl+1', combo: '<Control>1' },
  chat: { atajo: 'CommandOrControl+Shift+C', combo: '<Control><Shift>c' },
  'modo-anterior': { atajo: 'CommandOrControl+Up', combo: '<Control>Up' },
  'modo-siguiente': { atajo: 'CommandOrControl+Down', combo: '<Control>Down' }
};

/**
 * Dispara la accion en el controlador. Devuelve {status, body} para que la
 * ruta HTTP solo tenga que responder. Un manejador que lanza se reporta como
 * 500: nunca tumba el servidor.
 */
async function ejecutarAccion(controller, nombre) {
  if (!Object.prototype.hasOwnProperty.call(ACCIONES, nombre)) {
    return { status: 404, body: { ok: false, error: `accion desconocida: ${nombre}. Disponibles: ${Object.keys(ACCIONES).join(', ')}` } };
  }
  try {
    const disparado = await controller.dispararAtajo(ACCIONES[nombre].atajo);
    if (disparado === false) {
      return { status: 409, body: { ok: false, accion: nombre, error: `el atajo ${ACCIONES[nombre].atajo} no tiene manejador` } };
    }
    return { status: 200, body: { ok: true, accion: nombre } };
  } catch (error) {
    return { status: 500, body: { ok: false, accion: nombre, error: error.message } };
  }
}

module.exports = { ACCIONES, ejecutarAccion };
