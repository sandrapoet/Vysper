const { EventEmitter } = require('events');
const { CerebroService } = require('../src/services/cerebro.service');
const { formatCerebroFinalAnswer, formatOptimizacionesList } = require('../src/core/silia-response');
const {
  parseSiliaDailyCommand,
  parseSiliaDailyArgument,
  parseIncidenteCommand,
  parseOptimizacionesCommand,
  parsePropuestaDecidirCommand
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

/**
 * Emulates the routing done by ApplicationController.processTextWithSilia
 * in main.js, using the same pure building blocks it uses, so the routing
 * logic can be exercised without booting Electron.
 */
async function routeSiliaText(cerebroService, text) {
  if (parseSiliaDailyCommand(text)) {
    const assignee = parseSiliaDailyArgument(text) || 'lider@equipo.com';
    const result = await cerebroService.runDailyCheckpoint(assignee);
    return formatCerebroFinalAnswer(result);
  }
  if (parseOptimizacionesCommand(text)) {
    const result = await cerebroService.runOptimizaciones();
    return formatOptimizacionesList(result);
  }
  const propuestaDecision = parsePropuestaDecidirCommand(text);
  if (propuestaDecision) {
    await cerebroService.runDecidirPropuesta(propuestaDecision.id, propuestaDecision.estado, propuestaDecision.motivo);
    return `Propuesta #${propuestaDecision.id} marcada como "${propuestaDecision.estado}".`;
  }
  const incidente = parseIncidenteCommand(text);
  if (incidente) {
    const result = await cerebroService.runIncident(incidente);
    return result.incident_prompt || formatCerebroFinalAnswer(result);
  }
  const result = await cerebroService.runDiagnose(text);
  return formatCerebroFinalAnswer(result);
}

describe('Silia mode activates and routes correctly', () => {
  test('a "sprint status" query returns Jira-sourced information', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = routeSiliaText(service, '¿cómo va el sprint actual?');
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      summary: 'El sprint tiene 3 tickets en progreso y 1 vencido.',
      citations: [{ file_source: 'JIRA-123', url: 'https://example.atlassian.net/browse/JIRA-123' }],
      action_items: ['Escalar JIRA-123']
    })));
    child.emit('close', 0);

    const text = await promise;
    expect(text).toContain('sprint tiene 3 tickets');
    expect(text).toContain('JIRA-123');
    expect(text).toContain('Escalar JIRA-123');
  });

  test('an "architecture decision" query returns Notion + RAG sourced information', async () => {
    const child = makeFakeChild();
    const service = new CerebroService({ spawnFn: () => child, logger: silentLogger(), timeoutMs: 5000 });

    const promise = routeSiliaText(service, '¿por qué se decidió usar colas en el módulo de pagos?');
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      summary: 'Se eligieron colas para desacoplar el procesamiento de pagos, segun la decision documentada.',
      citations: [
        { file_source: 'Notion - Manual de Arquitectura', url: 'https://notion.so/arquitectura' },
        { file_source: 'rag:reunion-2026-01-10' }
      ],
      action_items: []
    })));
    child.emit('close', 0);

    const text = await promise;
    expect(text).toContain('desacoplar el procesamiento de pagos');
    expect(text).toContain('Notion - Manual de Arquitectura');
    expect(text).toContain('rag:reunion-2026-01-10');
  });

  test('/silia daily routes to runDailyCheckpoint', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = routeSiliaText(service, '/silia daily');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'checkpoint diario', citations: [] })));
    child.emit('close', 0);

    const text = await promise;
    expect(text).toContain('checkpoint diario');
    expect(spawnFn.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['daily-checkpoint', 'lider@equipo.com'])
    );
  });

  test('/silia daily <argumento> passes the argument through instead of the default assignee', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = routeSiliaText(service, '/silia daily LAGE-143');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ summary: 'checkpoint diario', citations: [] })));
    child.emit('close', 0);

    await promise;
    expect(spawnFn.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['daily-checkpoint', 'LAGE-143'])
    );
  });

  test('/optimizaciones routes to runOptimizaciones and formats the proposal list', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = routeSiliaText(service, '/optimizaciones');
    child.stdout.emit('data', Buffer.from(JSON.stringify([
      {
        id: 1,
        title: "Reducir timeouts de Ollama",
        problem: "4 incidentes por timeout en Ollama",
        proposal: "Aumentar timeout y agregar retries",
        impact_estimate: "Ahorro de 2-3h/semana",
        priority: "Alta",
        status: "propuesta"
      }
    ])));
    child.emit('close', 0);

    const text = await promise;
    expect(text).toContain('#1 — Reducir timeouts de Ollama');
    expect(text).toContain('Aumentar timeout y agregar retries');
    expect(spawnFn.mock.calls[0][1]).toEqual(expect.arrayContaining(['optimizaciones']));
  });

  test('/propuesta 1 aceptar routes to runDecidirPropuesta', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = routeSiliaText(service, '/propuesta 1 aceptar');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ ok: true, id: 1, status: 'aceptada' })));
    child.emit('close', 0);

    const text = await promise;
    expect(text).toContain('Propuesta #1');
    expect(text).toContain('aceptada');
    expect(spawnFn.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['propuesta-decidir', '1', 'aceptada'])
    );
  });
});
