/**
 * Memoria de una asesoría en vivo: la transcripción reciente de la reunión y
 * el hilo de consultas ya respondidas.
 *
 * Existe porque Cerebro no tiene memoria conversacional y no va a tenerla:
 * se invoca como subproceso de un solo tiro. El estado vive acá y viaja en
 * cada llamada. Ver docs/superpowers/specs/2026-09-24-asesoria-en-vivo-design.md
 *
 * Sin persistencia: al reiniciar Vysper se empieza de cero, a propósito.
 */

const MAX_TRANSCRIPCION_CHARS = 6000;
const MAX_TURNOS = 5;

class AsesoriaSession {
  constructor() {
    this.reset('inicio');
  }

  reset(motivo = '') {
    this.fragmentos = [];
    this.turnos = [];
    this.ultimoMotivoReset = motivo;
  }

  agregarFragmento(texto) {
    const limpio = typeof texto === 'string' ? texto.trim() : '';
    if (!limpio) return;
    this.fragmentos.push(limpio);
    this._recortar();
  }

  agregarTurno(pregunta, respuesta) {
    this.turnos.push({ pregunta: String(pregunta || ''), respuesta: String(respuesta || '') });
    if (this.turnos.length > MAX_TURNOS) {
      this.turnos = this.turnos.slice(-MAX_TURNOS);
    }
  }

  fragmentosRecientes(n) {
    // slice(-0) es slice(0): devuelve TODO el arreglo, no nada. Sin esta
    // guarda, un 0 (o negativo) por error del llamador filtraria de vuelta
    // la transcripcion entera hacia donde se esperaba solo los ultimos n.
    if (!Number.isFinite(n) || n <= 0) return [];
    return this.fragmentos.slice(-n);
  }

  contexto() {
    return { transcripcion: this.fragmentos.join('\n'), turnos: [...this.turnos] };
  }

  _recortar() {
    // Descarta los fragmentos más viejos hasta caber. Nunca parte uno por la
    // mitad: media frase es peor contexto que no tenerla.
    while (this.fragmentos.length > 1 && this.fragmentos.join('\n').length > MAX_TRANSCRIPCION_CHARS) {
      this.fragmentos.shift();
    }
    // Un único fragmento más largo que el límite se recorta por el final.
    if (this.fragmentos.length === 1 && this.fragmentos[0].length > MAX_TRANSCRIPCION_CHARS) {
      this.fragmentos[0] = this.fragmentos[0].slice(-MAX_TRANSCRIPCION_CHARS);
    }
  }
}

module.exports = { AsesoriaSession, MAX_TRANSCRIPCION_CHARS, MAX_TURNOS };
