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

  test('rejects with a friendly CerebroError on non-zero exit code', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runDiagnose('algo');
    child.stderr.emit('data', Buffer.from('traceback...'));
    child.emit('close', 1);

    await expect(promise).rejects.toBeInstanceOf(CerebroError);
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
});
