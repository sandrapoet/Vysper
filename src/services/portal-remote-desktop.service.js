/**
 * Escritura de teclas bajo GNOME/Wayland por el portal RemoteDesktop.
 *
 * wtype no sirve en GNOME (mutter no implementa el teclado virtual de
 * wlroots) y xdotool solo llega a ventanas XWayland. El portal si escribe en
 * cualquier ventana, a cambio de un dialogo de permiso. Con persist_mode 2
 * el permiso se recuerda: el portal entrega un testigo de restauracion en
 * cada Start y con el la siguiente sesion no vuelve a preguntar.
 *
 * Un solo reintento ante restauracion fallida: reintentar en bucle convierte
 * un permiso revocado en una lluvia de dialogos. Y si el usuario deniega, no
 * se le vuelve a preguntar en cada pegado: queda denegado hasta reiniciar.
 *
 * `dbus` se inyecta entero (ver crearClienteHelper para el real, que habla
 * con portal_remote_desktop_helper.py): los tests no tocan D-Bus.
 */

const path = require('path');
const { spawn } = require('child_process');

const MODIFICADORES = {
  ctrl: 0xffe3, control: 0xffe3, shift: 0xffe1, alt: 0xffe9, super: 0xffeb
};

const TECLAS = {
  enter: 0xff0d, return: 0xff0d, tab: 0xff09, escape: 0xff1b, esc: 0xff1b,
  backspace: 0xff08, delete: 0xffff, space: 0x20,
  up: 0xff52, down: 0xff54, left: 0xff51, right: 0xff53, home: 0xff50, end: 0xff57
};

function keysymDeCaracter(ch) {
  if (ch === '\n') return 0xff0d;
  if (ch === '\t') return 0xff09;
  const codigo = ch.codePointAt(0);
  // Latin-1 imprimible coincide con su keysym; el resto va por el rango
  // Unicode de X11 (0x01000000 + punto de codigo).
  if ((codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff)) return codigo;
  return 0x01000000 + codigo;
}

function keysymsDeCombo(combo) {
  const partes = String(combo).toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  const tecla = partes.pop();
  const modificadores = partes.map((m) => {
    if (!(m in MODIFICADORES)) throw new Error(`modificador desconocido: ${m}`);
    return MODIFICADORES[m];
  });
  let principal;
  if (tecla in TECLAS) principal = TECLAS[tecla];
  else if (tecla && [...tecla].length === 1) principal = keysymDeCaracter(tecla);
  else throw new Error(`tecla desconocida: ${tecla}`);
  return { modificadores, principal };
}

class PortalRemoteDesktop {
  constructor({ dbus, almacen, logger }) {
    this.dbus = dbus;
    this.almacen = almacen;
    this.logger = logger;
    this.activa = false;
    this.denegado = null;
  }

  async disponible() {
    try {
      return Boolean(await this.dbus.disponible());
    } catch (_error) {
      return false;
    }
  }

  async iniciar(token) {
    try {
      return await this.dbus.iniciar(token);
    } catch (error) {
      return { ok: false, motivo: error.message };
    }
  }

  async asegurarSesion() {
    if (this.activa) return { ok: true };
    if (this.denegado) return { ok: false, motivo: this.denegado };

    const guardado = this.almacen.leer() || null;
    let r = await this.iniciar(guardado);
    if (!r.ok && guardado && !r.denegado) {
      this.logger?.warn('El permiso guardado del portal RemoteDesktop no sirvio; se pide de nuevo (una sola vez)', { motivo: r.motivo });
      r = await this.iniciar(null);
    }

    if (!r.ok) {
      if (r.denegado) this.denegado = r.motivo || 'el usuario denego el permiso de control remoto';
      this.logger?.warn('Sin sesion del portal RemoteDesktop', { motivo: r.motivo });
      return { ok: false, motivo: r.motivo || 'el portal no abrio la sesion' };
    }

    if (r.restore_token) this.almacen.guardar(r.restore_token);
    this.activa = true;
    return { ok: true };
  }

  async tecla(keysym, pulsada) {
    const r = await this.dbus.keysym(keysym, pulsada);
    if (!r || !r.ok) {
      // Una sesion que el usuario cerro desde el indicador de GNOME deja de
      // aceptar teclas: se da por caida para reabrirla en el proximo intento.
      this.activa = false;
      throw new Error(r?.motivo || 'el portal rechazo la tecla');
    }
  }

  async typeText(texto) {
    const sesion = await this.asegurarSesion();
    if (!sesion.ok) return sesion;
    try {
      for (const ch of String(texto)) {
        const k = keysymDeCaracter(ch);
        await this.tecla(k, true);
        await this.tecla(k, false);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, motivo: error.message };
    }
  }

  async sendKeys(combo) {
    let teclas;
    try {
      teclas = keysymsDeCombo(combo);
    } catch (error) {
      return { ok: false, motivo: error.message };
    }
    const sesion = await this.asegurarSesion();
    if (!sesion.ok) return sesion;
    const pulsados = [];
    try {
      for (const m of teclas.modificadores) {
        await this.tecla(m, true);
        pulsados.push(m);
      }
      await this.tecla(teclas.principal, true);
      await this.tecla(teclas.principal, false);
      return { ok: true };
    } catch (error) {
      return { ok: false, motivo: error.message };
    } finally {
      // Un modificador que se queda pulsado deja el teclado inservible.
      for (const m of pulsados.reverse()) {
        await this.dbus.keysym(m, false).catch(() => {});
      }
    }
  }
}

/**
 * Cliente real: lanza el helper de Python una vez y le habla por JSON.
 * `iniciar` espera hasta 2 min porque puede haber un dialogo esperando al
 * usuario.
 */
function crearClienteHelper({ python = '/usr/bin/python3', lanzar = spawn, logger } = {}) {
  const script = path.join(__dirname, 'portal_remote_desktop_helper.py');
  let proceso = null;
  let siguienteId = 1;
  const pendientes = new Map();
  let bufer = '';

  function arrancar() {
    if (proceso) return proceso;
    proceso = lanzar(python, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
    proceso.stdout.on('data', (trozo) => {
      bufer += trozo;
      let fin;
      while ((fin = bufer.indexOf('\n')) !== -1) {
        const linea = bufer.slice(0, fin);
        bufer = bufer.slice(fin + 1);
        let m;
        try { m = JSON.parse(linea); } catch (_e) { continue; }
        const p = pendientes.get(m.id);
        if (p) { pendientes.delete(m.id); clearTimeout(p.temporizador); p.resolve(m); }
      }
    });
    proceso.stderr.on('data', (t) => logger?.warn('portal helper stderr', { texto: String(t).trim() }));
    proceso.on('exit', (codigo) => {
      proceso = null;
      for (const [, p] of pendientes) { clearTimeout(p.temporizador); p.resolve({ ok: false, motivo: `el helper del portal salio (codigo ${codigo})` }); }
      pendientes.clear();
    });
    proceso.on('error', (error) => logger?.warn('No se pudo lanzar el helper del portal', { error: error.message }));
    return proceso;
  }

  function pedir(mensaje, esperaMs) {
    return new Promise((resolve) => {
      const p = arrancar();
      const id = siguienteId++;
      const temporizador = setTimeout(() => {
        pendientes.delete(id);
        resolve({ ok: false, motivo: `el portal no respondio en ${Math.round(esperaMs / 1000)}s` });
      }, esperaMs);
      pendientes.set(id, { resolve, temporizador });
      p.stdin.write(`${JSON.stringify({ id, ...mensaje })}\n`);
    });
  }

  return {
    disponible: async () => (await pedir({ op: 'disponible' }, 5000)).disponible === true,
    iniciar: (token) => pedir({ op: 'iniciar', restore_token: token }, 120000),
    keysym: (keysym, pulsada) => pedir({ op: 'keysym', keysym, pulsada }, 2000),
    cerrar: () => { if (proceso) proceso.stdin.end(); }
  };
}

module.exports = { PortalRemoteDesktop, crearClienteHelper, keysymDeCaracter, keysymsDeCombo };
