/**
 * Aplica contra gsettings (dconf) los planes de src/core/gnome-keybindings.js.
 *
 * GNOME guarda los atajos personalizados en dos niveles:
 *   - org.gnome.settings-daemon.plugins.media-keys custom-keybindings: la
 *     lista de rutas, p.ej. ['/org/gnome/.../custom-keybindings/custom0/'].
 *   - org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:<ruta>
 *     con name, command y binding de cada uno.
 *
 * Nuestros atajos viven en rutas que terminan en <PREFIJO><accion>/, asi que
 * el id de cada atajo es el ultimo segmento de su ruta.
 *
 * Ningun fallo de gsettings lanza: se registra como warn y se sigue. Un
 * escritorio sin atajos es un Vysper degradado, no un Vysper que no arranca.
 */

const { spawnSync } = require('child_process');
const { planInstalacion, planDesinstalacion, construirAtajos } = require('../core/gnome-keybindings');

const ESQUEMA = 'org.gnome.settings-daemon.plugins.media-keys';
const ESQUEMA_ATAJO = `${ESQUEMA}.custom-keybinding`;
const CLAVE_LISTA = 'custom-keybindings';
const RUTA_BASE = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/';

function ejecutarReal(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || (r.error ? r.error.message : '') };
}

// gsettings imprime GVariant: 'texto' con \' y \\ escapados, y las listas
// como ['a', 'b'] o @as [] cuando estan vacias.
function leerCadenas(salida) {
  const cadenas = [];
  const patron = /'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = patron.exec(salida)) !== null) {
    cadenas.push(m[1].replace(/\\(.)/g, '$1'));
  }
  return cadenas;
}

function citar(texto) {
  return `'${String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function citarLista(lista) {
  return `[${lista.map(citar).join(', ')}]`;
}

function idDeRuta(ruta) {
  return ruta.replace(/\/+$/, '').split('/').pop();
}

class GnomeKeybindingsService {
  constructor({ ejecutar = ejecutarReal, logger } = {}) {
    this.ejecutar = ejecutar;
    this.logger = logger;
  }

  gsettings(args) {
    const r = this.ejecutar('gsettings', args);
    if (r.status !== 0) {
      this.logger?.warn('gsettings fallo', { args: args.join(' '), status: r.status, stderr: String(r.stderr).trim() });
      return null;
    }
    return r.stdout;
  }

  leerRutas() {
    const salida = this.gsettings(['get', ESQUEMA, CLAVE_LISTA]);
    return salida === null ? null : leerCadenas(salida);
  }

  leerCampo(ruta, campo) {
    const salida = this.gsettings(['get', `${ESQUEMA_ATAJO}:${ruta}`, campo]);
    if (salida === null) return '';
    const [valor = ''] = leerCadenas(salida);
    return valor;
  }

  leerExistentes() {
    const rutas = this.leerRutas() || [];
    return rutas.map((ruta) => ({
      id: idDeRuta(ruta),
      path: ruta,
      name: this.leerCampo(ruta, 'name'),
      binding: this.leerCampo(ruta, 'binding'),
      command: this.leerCampo(ruta, 'command')
    }));
  }

  escribirAtajo(atajo) {
    const esquema = `${ESQUEMA_ATAJO}:${RUTA_BASE}${atajo.id}/`;
    const campos = [['name', `Vysper: ${atajo.id}`], ['command', atajo.command], ['binding', atajo.binding]];
    return campos.every(([campo, valor]) => this.gsettings(['set', esquema, campo, citar(valor)]) !== null);
  }

  instalar(acciones, rutaEjecutable) {
    const deseados = construirAtajos(acciones, rutaEjecutable);
    const existentes = this.leerExistentes();
    const plan = planInstalacion(deseados, existentes);

    for (const salto of plan.saltados) {
      this.logger?.warn('Atajo de Vysper no instalado: el combo ya esta ocupado', {
        atajo: salto.id,
        binding: salto.binding,
        ocupadoPor: salto.ocupadoPor
      });
    }

    const instalados = plan.instalar.filter((atajo) => this.escribirAtajo(atajo));
    if (instalados.length) {
      const rutas = this.leerRutas() || existentes.map((e) => e.path);
      const nuevas = instalados.map((a) => `${RUTA_BASE}${a.id}/`).filter((r) => !rutas.includes(r));
      if (nuevas.length) {
        this.gsettings(['set', ESQUEMA, CLAVE_LISTA, citarLista([...rutas, ...nuevas])]);
      }
    }

    return { instalados, saltados: plan.saltados };
  }

  desinstalar() {
    const { quitar } = planDesinstalacion(this.leerExistentes());
    if (!quitar.length) return { quitados: [] };

    for (const atajo of quitar) {
      const esquema = `${ESQUEMA_ATAJO}:${atajo.path}`;
      ['name', 'command', 'binding'].forEach((campo) => this.gsettings(['reset', esquema, campo]));
    }

    // La lista se relee justo antes de escribirla: solo se le quitan
    // nuestras rutas, y lo ajeno queda en el orden en que estaba.
    const rutas = this.leerRutas();
    if (rutas !== null) {
      const nuestras = new Set(quitar.map((a) => a.path));
      const restantes = rutas.filter((r) => !nuestras.has(r));
      if (restantes.length !== rutas.length) {
        this.gsettings(['set', ESQUEMA, CLAVE_LISTA, citarLista(restantes)]);
      }
    }
    return { quitados: quitar };
  }
}

module.exports = { GnomeKeybindingsService, leerCadenas, citar };
