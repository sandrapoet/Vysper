/**
 * Cliente minimo de Ollama local, para el clasificador de la asesoria cuando
 * las nubes no responden (ver src/core/asesoria-modelos.js).
 *
 * El timeout NO es opcional: en Cerebro ya paso que un Ollama congelado se
 * comia la consulta entera. Un modelo frio que no carga a tiempo se corta y
 * la asesoria avisa, en vez de quedarse pasmada.
 */

const DEFAULT_HOST = 'http://localhost:11434';
// El mismo que Cerebro usa como ultimo fallback: ya esta descargado, y si
// Cerebro lo tiene cargado no hay que pagar otra carga en VRAM.
const DEFAULT_MODELO = 'qwen2.5:14b-instruct-q4_K_M';
// Medido el 2026-09-29 con qwen2.5:14b: ~15s en frio (cargar a VRAM) y ~5s
// en caliente. 15s cortaba justo la carga en frio, que es el caso tipico:
// si las nubes cayeron, nadie estaba usando Ollama.
const DEFAULT_TIMEOUT_MS = 30000;

function crearClienteOllama({
  host = process.env.OLLAMA_HOST || DEFAULT_HOST,
  modelo = process.env.VYSPER_OLLAMA_MODEL || DEFAULT_MODELO,
  timeoutMs = Number(process.env.VYSPER_OLLAMA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  async function chatJson(prompt) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);
    try {
      const respuesta = await fetchImpl(`${host.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          format: 'json',
          keep_alive: '10m',
          options: { temperature: 0 }
        }),
        signal: control.signal
      });
      if (!respuesta.ok) throw new Error(`Ollama respondio HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      return datos?.message?.content || '';
    } catch (error) {
      if (control.signal.aborted) {
        throw new Error(`Ollama (${modelo}) no respondio en ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(reloj);
    }
  }

  return { chatJson, modelo };
}

module.exports = { crearClienteOllama, DEFAULT_MODELO, DEFAULT_TIMEOUT_MS };
