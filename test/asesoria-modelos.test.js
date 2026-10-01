const { primeroQueResponda } = require('../src/core/asesoria-modelos');
const { crearClienteOllama } = require('../src/services/ollama-local');

const ok = (nombre, texto) => ({ nombre, llamar: async () => texto });
const cae = (nombre, mensaje) => ({ nombre, llamar: async () => { throw new Error(mensaje); } });

describe('primeroQueResponda', () => {
  test('usa el primero que responde y no llama a los de despues', async () => {
    const llamados = [];
    const espia = (nombre) => ({ nombre, llamar: async () => { llamados.push(nombre); return 'r'; } });
    const r = await primeroQueResponda([espia('anthropic'), espia('gemini')], 'p');
    expect(r).toEqual({ texto: 'r', proveedor: 'anthropic' });
    expect(llamados).toEqual(['anthropic']);
  });

  test('el escenario del 2026-09-29: las nubes caen y responde el local', async () => {
    const r = await primeroQueResponda(
      [cae('anthropic', 'HTTP 503'), cae('gemini', '429 spend cap'), ok('ollama', '{"esPregunta":true}')], 'p'
    );
    expect(r.proveedor).toBe('ollama');
  });

  test('una respuesta vacia cuenta como fallo, no como respuesta', async () => {
    const r = await primeroQueResponda([ok('anthropic', '   '), ok('gemini', 'si')], 'p');
    expect(r.proveedor).toBe('gemini');
  });

  test('si nadie responde, el error dice que fallo cada uno', async () => {
    await expect(primeroQueResponda([cae('anthropic', 'HTTP 503'), cae('gemini', '429')], 'p'))
      .rejects.toThrow('anthropic: HTTP 503; gemini: 429');
  });
});

describe('crearClienteOllama', () => {
  test('pide JSON sin streaming al modelo configurado y devuelve el contenido', async () => {
    let pedido;
    const fetchFalso = async (url, init) => {
      pedido = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ message: { content: '{"esPregunta":false}' } }) };
    };
    const ollama = crearClienteOllama({ host: 'http://h:1', modelo: 'qwen', fetchImpl: fetchFalso });
    await expect(ollama.chatJson('hola')).resolves.toBe('{"esPregunta":false}');
    expect(pedido.url).toBe('http://h:1/api/chat');
    expect(pedido.body).toMatchObject({ model: 'qwen', stream: false, format: 'json' });
  });

  test('chat pide texto libre: sin format json (los resumenes de la memoria)', async () => {
    let body;
    const fetchFalso = async (url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ message: { content: '- AGE-1 pospuesto' } }) };
    };
    const ollama = crearClienteOllama({ fetchImpl: fetchFalso });
    await expect(ollama.chat('resume')).resolves.toBe('- AGE-1 pospuesto');
    expect(body.format).toBeUndefined();
  });

  test('un Ollama que no contesta a tiempo se corta, no congela la asesoria', async () => {
    const colgado = (url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const ollama = crearClienteOllama({ timeoutMs: 20, fetchImpl: colgado });
    await expect(ollama.chatJson('hola')).rejects.toThrow(/no respondio en/);
  });

  test('un HTTP de error se reporta con su codigo', async () => {
    const fetch404 = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const ollama = crearClienteOllama({ fetchImpl: fetch404 });
    await expect(ollama.chatJson('hola')).rejects.toThrow('HTTP 404');
  });
});
