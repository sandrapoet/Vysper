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

  test('runRevisar builds bare args for modo basico', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runRevisar('https://github.com/org/repo/pull/1');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ status: 'APPROVED' })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'revisar', 'https://github.com/org/repo/pull/1', '--persona', 'silia'],
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
      ['-m', 'cerebro.cli', 'revisar', 'https://github.com/org/repo/pull/1', '--security', '--diablo', '--persona', 'silia'],
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
      draft: false, labels: ['bug-fix', 'backend'], ticket: 'AGE-123'
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

  test('runCrearPr passes --base and --repo-dir when given', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runCrearPr('feature/AGE-309', {
      ticket: 'AGE-309', labels: ['age-309'], base: 'develop', repoDir: '/media/san/repo/Agent'
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
});
