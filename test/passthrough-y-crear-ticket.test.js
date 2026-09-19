/**
 * Que el celular no se quede atrás por construcción.
 *
 * `auditar-bump` se agregó a la CLI de Cerebro y nació fuera del alcance del
 * teléfono el mismo día. El defecto no era que Vysper lo rechazara: es que
 * NO lo rechazaba -- caía en `diagnose` y volvía una respuesta redactada por
 * el modelo con pinta de resultado. Un rechazo se nota; eso no.
 *
 * De ahí la forma de estas pruebas: no asertan "no hubo error" (hoy tampoco
 * lo hay), asertan QUÉ argv recibió la CLI.
 */

const { EventEmitter } = require('events');
const { CerebroService } = require('../src/services/cerebro.service');
const {
  parsePassthroughCommand,
  parseCrearTicketCommand,
  isUnknownSlashCommand,
  PASSTHROUGH_COMMANDS,
  FLAGS_PROHIBIDOS_EN_EL_TUNEL,
} = require('../src/core/silia-commands');

function makeFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

function silentLogger() {
  return { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}

const URL_PR = 'https://github.com/Silia-mx/silia/pull/2420';

describe('parsePassthroughCommand', () => {
  test('LA prueba de mutación: /auditar-bump llega como el subcomando real, no como texto para el LLM', async () => {
    // Antes de esto el argv era:
    //   ['diagnose', '/auditar-bump <url>', '--persona', 'silia']
    // o sea, el comando entero viajaba como PREGUNTA en lenguaje libre.
    const parsed = parsePassthroughCommand(`/auditar-bump ${URL_PR}`);
    expect(parsed).toEqual({ cli: 'auditar-bump', args: [URL_PR] });

    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runPassthrough([parsed.cli, ...parsed.args]);
    child.stdout.emit('data', Buffer.from(JSON.stringify({ estado: 'no_op' })));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({ estado: 'no_op' });
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'auditar-bump', URL_PR],
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  test('un flag que Vysper NO conoce viaja completo: la CLI es la que valida', () => {
    // El criterio de fondo: un flag nuevo en Cerebro queda disponible desde
    // el celular el mismo dia, sin tocar Vysper.
    expect(parsePassthroughCommand(`/auditar-bump ${URL_PR} --algo-que-no-existe-aun`)).toEqual({
      cli: 'auditar-bump',
      args: [URL_PR, '--algo-que-no-existe-aun'],
    });
  });

  test('los cuatro que faltaban quedan alcanzables', () => {
    expect(parsePassthroughCommand('/estado-llm')).toEqual({ cli: 'estado-llm', args: [] });
    expect(parsePassthroughCommand('/preflight-promocion AGE-245 AGE-296')).toEqual({
      cli: 'preflight-promocion', args: ['AGE-245', 'AGE-296'],
    });
    expect(parsePassthroughCommand('/hoy-historial agentes')).toEqual({
      cli: 'hoy-historial', args: ['agentes'],
    });
    expect(parsePassthroughCommand('/hoy-comparar agentes')).toEqual({
      cli: 'hoy-comparar', args: ['agentes'],
    });
  });

  test('no se come los comandos que tienen parser propio', () => {
    // El passthrough va AL FINAL del dispatch; aun asi, no debe reconocer
    // nada que ya tenga su propia ruta.
    expect(parsePassthroughCommand(`/revisar ${URL_PR}`)).toBeNull();
    expect(parsePassthroughCommand(`/aprobar-pr ${URL_PR}`)).toBeNull();
    expect(parsePassthroughCommand('/hoy agentes')).toBeNull();
    expect(parsePassthroughCommand('/crear-ticket --resumen X')).toBeNull();
  });

  test('los flags prohibidos no cruzan el túnel', () => {
    for (const flag of FLAGS_PROHIBIDOS_EN_EL_TUNEL) {
      const r = parsePassthroughCommand(`/auditar-bump ${URL_PR} ${flag}`);
      expect(r.error).toMatch(/no se puede usar desde el chat/i);
    }
  });

  test('--ignorar-checks-no-requeridos sigue fuera del alcance del chat', () => {
    // En el chat no se ve la lista de rojos de un vistazo como en la web de
    // GitHub, asi que un "ignoralos todos" desde el telefono es aun mas
    // ciego que desde la terminal. La version acotada SI esta (ver
    // parseAprobarPrCommand).
    expect(FLAGS_PROHIBIDOS_EN_EL_TUNEL).toContain('--ignorar-checks-no-requeridos');
  });

  test('falta de argumentos se dice con el ejemplo, no se manda incompleto', () => {
    expect(parsePassthroughCommand('/auditar-bump').error).toMatch(/Falta\(n\) argumento/);
  });

  test('el registro solo contiene comandos de LECTURA', () => {
    // Guarda contra el error que importa: meter aqui algo que escribe se
    // saltaria el flujo de confirmacion de dos turnos, que vive en Vysper.
    for (const nombre of ['revisar-merge', 'aprobar-pr', 'actualizar-jira', 'crear-ticket', 'merge-pr', 'crear-pr']) {
      expect(Object.keys(PASSTHROUGH_COMMANDS)).not.toContain(nombre);
    }
  });
});

describe('/revisar-merge como alias', () => {
  const { parseRevisarCommand } = require('../src/core/silia-commands');

  test('implica --merge sin tener que escribirlo', () => {
    expect(parseRevisarCommand(`/revisar-merge ${URL_PR}`)).toEqual({
      url: URL_PR, mode: 'silia', diablo: false, merge: true, release: false, force: false,
    });
  });

  test('sigue admitiendo --release', () => {
    expect(parseRevisarCommand(`/revisar-merge ${URL_PR} --release`).release).toBe(true);
  });

  test('sin url lo dice en vez de caer como comando desconocido', () => {
    expect(parseRevisarCommand('/revisar-merge').error).toMatch(/Falta la url/);
  });

  test('no altera el /revisar normal', () => {
    expect(parseRevisarCommand(`/revisar ${URL_PR} --profundo`).merge).toBe(false);
  });
});

describe('isUnknownSlashCommand', () => {
  test('un comando inventado se nombra en vez de mandarse al LLM', () => {
    expect(isUnknownSlashCommand('/comando-que-no-existe')).toBe(true);
  });

  test('ningún comando real cae como desconocido', () => {
    const reales = [
      `/revisar ${URL_PR}`, `/aprobar-pr ${URL_PR}`, `/auditar-bump ${URL_PR}`,
      '/estado-llm', '/hoy agentes', '/detalle', '/modo silia', '/silia daily',
      '/silia retro', '/script', '/optimizaciones', '/actualizar-jira mover AGE-1',
      '/crear-ticket --resumen X --descripcion hola', '/jira AGE-1', '/incidente algo',
      '/merge 42 --repo o/r', '/cancelar-pr ' + URL_PR, '/crear-pr rama',
      '/preflight-promocion AGE-1', '/hoy-historial agentes', '/hoy-comparar agentes',
      '/propuesta 5 aceptar', `/revisar-merge ${URL_PR}`,
    ];
    for (const texto of reales) {
      expect({ texto, desconocido: isUnknownSlashCommand(texto) })
        .toEqual({ texto, desconocido: false });
    }
  });

  test('los comandos que maneja otro módulo tampoco', () => {
    expect(isUnknownSlashCommand('/actualizaRag')).toBe(false);
    expect(isUnknownSlashCommand('/optimiza')).toBe(false);
  });

  test('texto libre y rutas no se confunden con comandos', () => {
    expect(isUnknownSlashCommand('¿cómo va el sprint?')).toBe(false);
    expect(isUnknownSlashCommand('/media/san/Miscosas6/Vysper')).toBe(false);
    expect(isUnknownSlashCommand('')).toBe(false);
    expect(isUnknownSlashCommand(undefined)).toBe(false);
  });
});

describe('parseCrearTicketCommand', () => {
  test('la descripción multilínea viaja verbatim hasta el final del mensaje', () => {
    // Son 73 lineas con bloques de codigo y criterios de aceptacion: cortar
    // en el proximo "--" partiria cualquier lista de markdown.
    const descripcion = '## Contexto\n\n```js\nconst agentId = body.agentId;\n```\n\n- [ ] Validar contra el token\n- [ ] Test de regresión';
    const r = parseCrearTicketCommand(
      `/crear-ticket --proyecto AGE --resumen "Validar agentId" --descripcion ${descripcion}`
    );
    expect(r.descripcion).toBe(descripcion);
    expect(r.resumen).toBe('Validar agentId');
    expect(r.proyecto).toBe('AGE');
  });

  test('los tres links del hallazgo conservan cada uno su relación', () => {
    // Poner "bloquea" donde iba "relacionado con" habria dejado varado el PR
    // de AGE-246 contradiciendo lo que se le prometio por escrito a su autor.
    const r = parseCrearTicketCommand(
      '/crear-ticket --resumen X --link "bloquea:AGE-219" ' +
      '--link "relacionado con:AGE-246" --link "relacionado con:AGE-247" --descripcion hola'
    );
    expect(r.links).toEqual(['bloquea:AGE-219', 'relacionado con:AGE-246', 'relacionado con:AGE-247']);
  });

  test('acepta un link sin comillas -- se usa manejando', () => {
    const r = parseCrearTicketCommand(
      '/crear-ticket --resumen X --link relacionado con:AGE-246 --descripcion hola'
    );
    expect(r.links).toEqual(['relacionado con:AGE-246']);
  });

  test('padre y sprint se leen', () => {
    const r = parseCrearTicketCommand(
      '/crear-ticket --resumen X --padre AGE-147 --sprint "Sprint 6" --descripcion hola'
    );
    expect(r.padre).toBe('AGE-147');
    expect(r.sprint).toBe('Sprint 6');
  });

  test('sin descripción no se manda a medias', () => {
    expect(parseCrearTicketCommand('/crear-ticket --resumen X').error).toMatch(/descripcion/i);
  });

  test('un flag desconocido se dice, no se ignora en silencio', () => {
    expect(parseCrearTicketCommand('/crear-ticket --resumen X --bogus Y --descripcion hola').error)
      .toBe('Flag desconocido: --bogus');
  });
});

describe('CerebroService.runCrearTicket', () => {
  test('fase 1 no manda --confirmar ni --plan', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCrearTicket({
      proyecto: 'AGE', tipo: 'Story', resumen: 'Validar agentId',
      descripcion: '## Contexto', padre: 'AGE-147',
      links: ['bloquea:AGE-219', 'relacionado con:AGE-246'],
    });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ pending: true, plan_hash: 'abc' })));
    child.emit('close', 0);
    await promise;

    const argv = spawnFn.mock.calls[0][1];
    expect(argv).toEqual([
      '-m', 'cerebro.cli', 'crear-ticket',
      '--proyecto', 'AGE', '--tipo', 'Story', '--resumen', 'Validar agentId',
      '--descripcion', '## Contexto', '--padre', 'AGE-147',
      '--link', 'bloquea:AGE-219', '--link', 'relacionado con:AGE-246',
    ]);
    expect(argv).not.toContain('--confirmar');
  });

  test('fase 2 manda el plan TAL CUAL con su hash, y nada más', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });
    const plan = { proyecto: 'AGE', resumen: 'Validar agentId', links: [] };

    const promise = service.runCrearTicket({}, { plan, planHash: 'abc123', confirmar: true });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ key: 'AGE-350' })));
    child.emit('close', 0);
    await promise;

    expect(spawnFn.mock.calls[0][1]).toEqual([
      '-m', 'cerebro.cli', 'crear-ticket',
      '--confirmar', '--plan', JSON.stringify(plan), '--plan-hash', 'abc123',
    ]);
  });
});
