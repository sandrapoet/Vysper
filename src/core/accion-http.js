/**
 * Peticion que manda bin/vysper-accion al servidor HTTP local de Vysper.
 *
 * Los atajos personalizados de GNOME se ven en Ajustes y en ps, asi que el
 * comando instalado solo lleva la ruta del ejecutable y el nombre de la
 * accion. La credencial del Basic Auth (usuario:contrasena) vive en un
 * archivo 0600 que escribe Vysper al arrancar, y el ejecutable se niega a
 * usarlo si alguien mas puede leerlo.
 *
 * Modulo puro: la lectura del archivo y su stat se inyectan.
 */

const path = require('path');

const ACCION_VALIDA = /^[a-z][a-z0-9-]*$/;

// Mismo directorio que los logs y las huellas de voz. El puerto no es
// secreto y va aparte, para que el archivo de la credencial sea solo eso.
function rutasAccion(home) {
  const dir = path.join(home, '.Vysper');
  return { token: path.join(dir, 'accion-token'), puerto: path.join(dir, 'accion-puerto') };
}

function construirPeticion(accion, { puerto, token }) {
  if (typeof accion !== 'string' || !ACCION_VALIDA.test(accion)) {
    throw new Error(`accion invalida: ${JSON.stringify(accion)}`);
  }
  return {
    url: `http://127.0.0.1:${puerto}/accion/${accion}`,
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(String(token)).toString('base64')}` }
  };
}

function leerToken(ruta, leerArchivo, statArchivo) {
  let stat;
  try {
    stat = statArchivo(ruta);
  } catch (error) {
    return { token: null, error: `no se pudo leer ${ruta}: ${error.message}` };
  }
  if ((stat.mode & 0o077) !== 0) {
    return {
      token: null,
      error: `permisos abiertos en ${ruta} (${(stat.mode & 0o777).toString(8)}): se exige 600`
    };
  }
  try {
    const token = String(leerArchivo(ruta)).trim();
    if (!token) return { token: null, error: `${ruta} esta vacio` };
    return { token, error: null };
  } catch (error) {
    return { token: null, error: `no se pudo leer ${ruta}: ${error.message}` };
  }
}

module.exports = { construirPeticion, leerToken, rutasAccion, ACCION_VALIDA };
