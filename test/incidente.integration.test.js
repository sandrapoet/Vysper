const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { CerebroService } = require('../src/services/cerebro.service');
const { buildIncidenteLogEntry } = require('../src/core/silia-response');
const { parseIncidenteCommand } = require('../src/core/silia-commands');

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

const INCIDENT_MARKDOWN = [
  '# Incidente: pagos caen con 500',
  '',
  '## Contexto del Error',
  'El servicio de pagos devuelve 500 intermitentemente.',
  '',
  '## Hipotesis Iniciales',
  '1. Falla de validacion de email duplicado.',
  '',
  '## Archivos y Lineas de Codigo Sospechosas',
  '- src/api/users.py:45',
  '',
  '## Pasos para Reproducir',
  '- pytest tests/test_users.py -k duplicate_email',
  '',
  '## Practicas CI/CD Recomendadas',
  '- Testing: agregar test unitario.',
  '',
  '## Runbooks Asociados',
  '- Manual de despliegue',
  '',
  '## Accion Inmediata Sugerida',
  'Hacer rollback del ultimo deploy.',
  ''
].join('\n');

describe('/incidente command', () => {
  test('is recognized and its description extracted', () => {
    const description = parseIncidenteCommand('/incidente el servicio de pagos devuelve 500 intermitentemente');
    expect(description).toBe('el servicio de pagos devuelve 500 intermitentemente');
  });

  test('runIncident invokes the Cerebro CLI "incident" subcommand with the description', async () => {
    const child = makeFakeChild();
    const spawnFn = jest.fn(() => child);
    const service = new CerebroService({ spawnFn, logger: silentLogger(), timeoutMs: 5000 });

    const promise = service.runIncident('el servicio de pagos devuelve 500 intermitentemente');
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      summary: 'diagnostico',
      citations: [],
      action_items: ['Hacer rollback'],
      incident_prompt: INCIDENT_MARKDOWN
    })));
    child.emit('close', 0);

    const result = await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'cerebro.cli', 'incident', 'el servicio de pagos devuelve 500 intermitentemente', '--persona', 'silia'],
      expect.any(Object)
    );
    expect(result.incident_prompt).toBe(INCIDENT_MARKDOWN);
  });

  test('generated prompt contains all required sections and is ready to paste', () => {
    for (const section of [
      '## Contexto del Error',
      '## Hipotesis Iniciales',
      '## Archivos y Lineas de Codigo Sospechosas',
      '## Pasos para Reproducir',
      '## Practicas CI/CD Recomendadas',
      '## Runbooks Asociados',
      '## Accion Inmediata Sugerida'
    ]) {
      expect(INCIDENT_MARKDOWN).toContain(section);
    }
    // No wrapping code fences or extra chatter — plain markdown ready to paste.
    expect(INCIDENT_MARKDOWN.trim().startsWith('```')).toBe(false);
  });

  test('descripcion and prompt are appended to incidentes.log', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vysper-incidentes-'));
    const logPath = path.join(tmpDir, 'incidentes.log');
    const descripcion = 'el servicio de pagos devuelve 500 intermitentemente';

    const entry = buildIncidenteLogEntry(descripcion, INCIDENT_MARKDOWN, new Date('2026-08-19T10:00:00.000Z'));
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.descripcion).toBe(descripcion);
    expect(parsed.prompt).toBe(INCIDENT_MARKDOWN);
    expect(parsed.timestamp).toBe('2026-08-19T10:00:00.000Z');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
