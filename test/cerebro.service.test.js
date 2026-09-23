const { EventEmitter } = require('events');
const { CerebroService, CerebroError } = require('../src/services/cerebro.service');

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

describe('CerebroService', () => {
  test('runDiagnose resolves with parsed JSON on success', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDiagnose('el servicio X falla');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'ok', citations: [] })));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({ summary: 'ok', citations: [] });
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'diagnose', 'el servicio X falla', '--persona', 'silia'],
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  test('runDiagnose passes --tool through when a scope is given', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDiagnose('que capacidades faltan', { tool: 'jira' });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'ok', citations: [] })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'diagnose', 'que capacidades faltan', '--persona', 'silia', '--tool', 'jira'],
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  test('rejects with a friendly CerebroError on non-zero exit code', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDiagnose('algo');
    child.stderr.emit('data', Buffer.from('traceback...'));
    child.emit('close', 1);

    await expect(promise).rejects.toBeInstanceOf(CerebroError);
  });

  test('rejects using the tail of stderr, not the head, so init noise does not bury the real error', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDiagnose('algo');
    const initNoise = 'INFO: Creating working directory ./rag_storage/abc\n'.repeat(20);
    const realError = 'Traceback (most recent call last):\n  ...\nValueError: jira_api_token no configurado';
    child.stderr.emit('data', Buffer.from(initNoise + realError));
    child.emit('close', 1);

    await expect(promise).rejects.toThrow(/ValueError: jira_api_token no configurado/);
  });

  test('rejects using the structured {"error"} message from stdout when present', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDailyCheckpoint('LAGE-999');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ error: 'El ticket LAGE-999 no tiene assignee en Jira.' })));
    child.emit('close', 1);

    await expect(promise).rejects.toThrow('El ticket LAGE-999 no tiene assignee en Jira.');
  });

  test('rejects with a friendly CerebroError on invalid JSON output', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runIncident('descripcion');
    child.stdout.emit('data', Buffer.from('esto no es json'));
    child.emit('close', 0);

    await expect(promise).rejects.toBeInstanceOf(CerebroError);
  });

  test('rejects with a friendly CerebroError on timeout and kills the process', async () => {
    jest.useFakeTimers();
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 1000 });

    const promise = service.runDiagnose('algo lento');
    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toBeInstanceOf(CerebroError);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });

  test('runDailyCheckpoint rejects when no assignee is configured', async () => {
    const service = new CerebroService({ spawnFn: jest.fn(), logger: silentLogger() });
    await expect(service.runDailyCheckpoint('')).rejects.toBeInstanceOf(CerebroError);
  });

  test('runDailyCheckpoint passes the assignee through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDailyCheckpoint('ana.perez');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'checkpoint', citations: [] })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'daily-checkpoint', 'ana.perez', '--persona', 'silia'],
      expect.any(Object)
    );
  });

  test('runOptimizaciones passes estado/dias filters through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runOptimizaciones({ estado: 'propuesta', dias: 7 });
    child.stdout.emit('data', Buffer.from('[]'));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'optimizaciones', '--estado', 'propuesta', '--dias', '7'],
      expect.any(Object)
    );
  });

  test('runDecidirPropuesta passes id/estado/motivo through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDecidirPropuesta(3, 'aceptada', 'buena idea');
    child.stdout.emit('data', Buffer.from('{"ok": true}'));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'propuesta-decidir', '3', 'aceptada', '--motivo', 'buena idea'],
      expect.any(Object)
    );
  });

  test('runSprintRetro rejects when no project is configured', async () => {
    const service = new CerebroService({ spawnFn: jest.fn(), logger: silentLogger() });
    await expect(service.runSprintRetro('')).rejects.toBeInstanceOf(CerebroError);
  });

  test('runSprintRetro passes project and sprint ref through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runSprintRetro('AGE', { sprint: '5' });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'ok', retro: null })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'sprint-retro', 'AGE', '--sprint', '5', '--persona', 'silia'],
      expect.any(Object)
    );
  });

  test('runCompararRetro passes both sprint refs through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCompararRetro('AGE', 5, 6);
    child.stdout.emit('data', Buffer.from('{}'));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'comparar-retro', 'AGE', '5', '6'],
      expect.any(Object)
    );
  });

  test('runHoy rejects when no dominio is given', async () => {
    const service = new CerebroService({ spawnFn: jest.fn(), logger: silentLogger() });
    await expect(service.runHoy('')).rejects.toBeInstanceOf(CerebroError);
  });

  test('runDiagnoseVisual rejects when no image path is given', async () => {
    const service = new CerebroService({ spawnFn: jest.fn(), logger: silentLogger() });
    await expect(service.runDiagnoseVisual('', 'explica')).rejects.toBeInstanceOf(CerebroError);
  });

  test('runDiagnoseVisual passes the image path and prompt through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDiagnoseVisual('/tmp/slide.png', 'explica esta lamina');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'ok', citations: [] })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'diagnose', 'explica esta lamina', '--imagen', '/tmp/slide.png', '--persona', 'silia'],
      expect.any(Object)
    );
  });

  test('runHoy passes the dominio through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runHoy('agentes');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'ok', domain_risk_review: null })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'hoy', 'agentes', '--persona', 'silia'],
      expect.any(Object)
    );
  });

  test('runDetalle passes the dominio through to the CLI when given', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDetalle('agentes');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ path: '/tmp/detalle-agentes.md', domain: 'agentes' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'detalle', 'agentes'],
      expect.any(Object)
    );
  });

  test('runDetalle omits the dominio arg when none is given (most recent across any domain)', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDetalle();
    child.stdout.emit('data', Buffer.from(JSON.stringify({ path: '/tmp/detalle-agentes.md', domain: 'agentes' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'detalle'],
      expect.any(Object)
    );
  });

  test('runRevisar builds bare args for the default mode (silia)', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisar('https://github.com/org/repo/pull/1');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ status: 'APPROVED' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'revisar', 'https://github.com/org/repo/pull/1', '--async', '--persona', 'silia'],
      expect.any(Object)
    );
  });

  test('runRevisar passes --basico through: the default mode is silia, so basico needs the flag', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisar('https://github.com/org/repo/pull/1', { mode: 'basico' });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ status: 'APPROVED' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'revisar', 'https://github.com/org/repo/pull/1', '--basico', '--async', '--persona', 'silia'],
      expect.any(Object)
    );
  });

  test('runRevisar passes the depth flag and --diablo through to the CLI', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisar('https://github.com/org/repo/pull/1', { mode: 'security', diablo: true });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ status: 'APPROVED' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'revisar', 'https://github.com/org/repo/pull/1', '--security', '--diablo', '--async', '--persona', 'silia'],
      expect.any(Object)
    );
  });

  test('runRevisarMerge builds revisar-merge args, with --release when requested', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisarMerge('https://github.com/org/repo/pull/1', { release: true });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ merged: true })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'revisar-merge', 'https://github.com/org/repo/pull/1', '--release'],
      expect.any(Object)
    );
  });

  test('runCrearPr always passes --labels explicit (comma sentinel when none given) and --no-milestone', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCrearPr('feature/AGE-123');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ pr_url: 'https://github.com/org/repo/pull/9' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'crear-pr', 'feature/AGE-123', '--draft', '--labels', ',', '--no-milestone'],
      expect.any(Object)
    );
  });

  test('runCrearPr passes --publish, joined --labels and --ticket when given', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCrearPr('feature/AGE-123', {
      draft: false, labels: ['bug-fix', 'backend'], tickets: ['AGE-123']
    });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ pr_url: 'https://github.com/org/repo/pull/9' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'crear-pr', 'feature/AGE-123', '--publish', '--labels', 'bug-fix,backend', '--ticket', 'AGE-123', '--no-milestone'],
      expect.any(Object)
    );
  });

  test('runCrearPr manda un --ticket REPETIDO por cada ticket', async () => {
    // Repetido y no "AGE-233,AGE-234" en un solo flag: es el formato que
    // el CLI de Cerebro toma nativamente, y degrada mejor si el chat
    // quedara con un Cerebro viejo (ahi --ticket era un str y se queda con
    // el ultimo, en vez de recibir una "clave" inexistente con comas).
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCrearPr('feature/x', {
      labels: [], tickets: ['AGE-233', 'AGE-234', 'AGE-236'],
    });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ pr_url: 'u' })));
    child.emit('close', 0);

    await promise;
    const args = spawnFn.mock.calls[0][1];
    expect(args.filter((a) => a === '--ticket')).toHaveLength(3);
    expect(args).toContain('AGE-233');
    expect(args).toContain('AGE-234');
    expect(args).toContain('AGE-236');
    expect(args.join(' ')).not.toContain('AGE-233,AGE-234');
  });

  test('runCrearPr sin tickets no manda ningun --ticket', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCrearPr('feature/x', { labels: [] });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ pr_url: 'u' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn.mock.calls[0][1]).not.toContain('--ticket');
  });

  test('runCrearPr passes --base and --repo-dir when given', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCrearPr('feature/AGE-309', {
      tickets: ['AGE-309'], labels: ['age-309'], base: 'develop', repoDir: '/media/san/repo/Agent'
    });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ pr_url: 'https://github.com/org/repo/pull/9' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      [
        '-m', 'cerebro.cli', 'crear-pr', 'feature/AGE-309', '--draft',
        '--labels', 'age-309', '--ticket', 'AGE-309',
        '--base', 'develop', '--repo-dir', '/media/san/repo/Agent', '--no-milestone'
      ],
      expect.any(Object)
    );
  });

  test('runCancelarPr builds cancelar-pr args', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCancelarPr('https://github.com/org/repo/pull/9');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ closed: true })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'cancelar-pr', 'https://github.com/org/repo/pull/9'],
      expect.any(Object)
    );
  });

  test('runAprobarPr never passes --merge/--tag without --confirmar unless the caller sets confirmar', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runAprobarPr('https://github.com/org/repo/pull/9', { revisar: true });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ approved: true })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'aprobar-pr', 'https://github.com/org/repo/pull/9', '--revisar'],
      expect.any(Object)
    );
  });

  test('runAprobarPr passes --merge --tag --confirmar only when confirmar:true is passed explicitly', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runAprobarPr('https://github.com/org/repo/pull/9', {
      merge: true, tag: true, confirmar: true, tagMensaje: 'release 1.2.3'
    });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ approved: true })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'aprobar-pr', 'https://github.com/org/repo/pull/9', '--merge', '--tag', '--tag-mensaje', 'release 1.2.3', '--confirmar'],
      expect.any(Object)
    );
  });

  test('runAprobarPr with evaluar sends --merge --evaluar and NEVER --confirmar', async () => {
    // Turno 1: corre el merge gate y devuelve su evidencia sin mergear.
    // --evaluar y --confirmar juntos serian mergear sin que nadie confirme.
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runAprobarPr('https://github.com/org/repo/pull/9', { merge: true, evaluar: true });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ approved: true })));
    child.emit('close', 0);

    await promise;
    const args = spawnFn.mock.calls[0][1];
    expect(args).toContain('--merge');
    expect(args).toContain('--evaluar');
    expect(args).not.toContain('--confirmar');
  });

  test('runActualizarJira without confirmar sends --texto and never a --plan', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runActualizarJira('AGE-143: aclarar que el Planner es autonomo');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ pending: true, cambios: [] })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'actualizar-jira', '--texto', 'AGE-143: aclarar que el Planner es autonomo'],
      expect.any(Object)
    );
  });

  test('runActualizarJira with confirmar sends the plan as JSON and never re-sends --texto', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });
    const plan = [{ issue_key: 'AGE-143', campo: 'descripcion', requiere_revision: false }];

    const promise = service.runActualizarJira(null, { plan, confirmar: true });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ aplicados: [], fallidos: [], omitidos: [] })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'actualizar-jira', '--confirmar', '--plan', JSON.stringify(plan)],
      expect.any(Object)
    );
  });

  // --- revisar-merge: el codigo 2 significa "se mergeo, pero algo quedo pendiente" ---
  //
  // El merge es irreversible, asi que Cerebro nunca convierte un fallo
  // POSTERIOR (transicion de Jira, comentario de cierre, release) en
  // {"error": ...}: eso invitaria a reintentar un merge que ya paso. Lo
  // reporta en `pasos_no_completados` + `advertencia` y sale con codigo 2.
  //
  // Sin esto, _runCli rechazaba con cualquier codigo != 0 y el chat mostraba
  // "Cerebro fallo (codigo 2)": se perdian el link del PR mergeado, el
  // comment_url y el del release. Encontrado en vivo en el PR 272.

  test('runRevisarMerge resolves on exit code 2 because the merge did happen', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });
    const payload = {
      merged: true,
      message: 'Pull Request successfully merged',
      comment_url: 'https://github.com/o/r/pull/1#issuecomment-1',
      release: null,
      pasos_no_completados: [{
        paso: 'jira_transition_done',
        label: 'transicion del ticket de Jira a "Done"',
        detalle: 'No se pudo mover AGE-335 a "Done"',
        remediacion: 'Transiciona AGE-335 a mano en Jira.',
      }],
      advertencia: 'El merge SI se completo, pero 1 paso(s) posterior(es) no.',
    };

    const promise = service.runRevisarMerge('https://github.com/o/r/pull/1');
    child.stdout.emit('data', Buffer.from(JSON.stringify(payload)));
    child.stderr.emit('data', Buffer.from(payload.advertencia));
    child.emit('close', 2);

    await expect(promise).resolves.toEqual(payload);
  });

  test('runRevisarMerge still rejects on exit code 1 because nothing was merged', async () => {
    // El 1 sigue significando "no se mergeo, puedes reintentar".
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisarMerge('https://github.com/o/r/pull/1');
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      error: 'No hay una revision APPROVED guardada para este PR.',
    })));
    child.emit('close', 1);

    await expect(promise).rejects.toThrow(/No hay una revision APPROVED/);
  });

  test('a command without okExitCodes keeps rejecting on exit code 2', async () => {
    // El permiso es por comando, no global: /revisar saliendo con 2 sigue
    // siendo un fallo.
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisar('https://github.com/o/r/pull/1');
    child.stderr.emit('data', Buffer.from('traceback...'));
    child.emit('close', 2);

    await expect(promise).rejects.toBeInstanceOf(CerebroError);
  });

  test('an allowed non-zero exit still rejects when stdout is not valid JSON', async () => {
    // Aceptar el 2 no puede degradar en "resuelve con basura": si no hay
    // payload que renderizar, es un fallo como cualquier otro.
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisarMerge('https://github.com/o/r/pull/1');
    child.stdout.emit('data', Buffer.from('no soy json'));
    child.emit('close', 2);

    await expect(promise).rejects.toBeInstanceOf(CerebroError);
  });
});

describe('CerebroService: el revisor asincrono', () => {
  test('runRevisar pide --async por defecto: el revisor tarda mas que el timeout', async () => {
    // El revisor con herramientas tarda 6-20 min (medido: 370s en el PR
    // 313) contra un techo de 480s que se aplica DOS veces en la cadena del
    // tunel y que mata con SIGKILL. Esperarlo aqui no es lento: es perder el
    // trabajo entero justo antes de que termine.
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisar('https://github.com/org/repo/pull/1');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ job_id: 'abc' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn.mock.calls[0][1]).toContain('--async');
  });

  test('runRevisar deja pedir el modo sincrono explicitamente, para la PC', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisar('https://github.com/org/repo/pull/1', { async: false });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ status: 'APPROVED' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn.mock.calls[0][1]).not.toContain('--async');
  });

  test('runRevisarEstado acepta el exit 2: "en curso" no es un fallo del comando', async () => {
    // Tratarlo como error perderia el payload que explica cuanto falta, que
    // es justo lo unico que el celular queria saber.
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisarEstado('abc');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ job_id: 'abc', job_estado: 'en_curso' })));
    child.emit('close', 2);

    await expect(promise).resolves.toEqual({ job_id: 'abc', job_estado: 'en_curso' });
  });

  test('runRevisarEstado tambien acepta el exit 1: un job fallido trae su motivo', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisarEstado('abc');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ job_estado: 'fallido', job_detalle: 'usage limit' })));
    child.emit('close', 1);

    await expect(promise).resolves.toEqual({ job_estado: 'fallido', job_detalle: 'usage limit' });
  });
});
