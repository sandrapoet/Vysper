/**
 * Persistencia de la memoria de sesion (D11): L2, L3, el expediente, el
 * registro de compresiones y las metricas, en
 * ~/.Vysper/memoria/session_<id>.json. L1 no se guarda: es la conversacion
 * cruda, y lo que importa de ella ya bajo a L2.
 *
 * Nada de esto puede tumbar Vysper: un disco lleno o un JSON corrupto se
 * reportan y la sesion sigue en memoria.
 */

const fs = require('fs');
const path = require('path');

const PREFIJO = 'session_';

function rutaDeSesion(dir, id) {
  const seguro = String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(dir, `${PREFIJO}${seguro}.json`);
}

/** Escribe por temporal + rename: un corte a medias no deja un JSON roto. */
function guardarSesion(dir, memoria) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const destino = rutaDeSesion(dir, memoria.id);
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(memoria.serializar()), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, destino);
  return destino;
}

/**
 * La sesion guardada mas reciente, si tiene menos de `maxDias`. Devuelve
 * {datos, ruta} o null.
 */
function cargarUltimaSesion(dir, { maxDias = 7, ahora = Date.now() } = {}) {
  let archivos;
  try {
    archivos = fs.readdirSync(dir).filter((f) => f.startsWith(PREFIJO) && f.endsWith('.json'));
  } catch {
    return null;
  }
  const candidatos = archivos
    .map((f) => {
      const ruta = path.join(dir, f);
      try {
        return { ruta, mtime: fs.statSync(ruta).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  const limite = ahora - maxDias * 24 * 60 * 60 * 1000;
  for (const { ruta, mtime } of candidatos) {
    if (mtime < limite) return null;
    try {
      return { datos: JSON.parse(fs.readFileSync(ruta, 'utf8')), ruta };
    } catch {
      // Corrupto: se prueba el siguiente mas reciente.
    }
  }
  return null;
}

module.exports = { guardarSesion, cargarUltimaSesion, rutaDeSesion };
