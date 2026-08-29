const {
  parseActualizaRagCommand,
  parseReconocerVozCommand,
  parseOptimizaCommand,
  parseReconocerVozPendientesCommand,
  parseActualizarHablantesCommand
} = require('../src/core/secretaria-commands');

describe('parseActualizaRagCommand', () => {
  test('matches "/actualizaRag" exactly', () => {
    expect(parseActualizaRagCommand('/actualizaRag')).toBe(true);
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseActualizaRagCommand('  /ACTUALIZARAG  ')).toBe(true);
  });

  test('rejects unrelated text', () => {
    expect(parseActualizaRagCommand('/actualizaRag algo')).toBe(false);
    expect(parseActualizaRagCommand('actualizaRag')).toBe(false);
    expect(parseActualizaRagCommand('')).toBe(false);
    expect(parseActualizaRagCommand(undefined)).toBe(false);
  });
});

describe('parseReconocerVozCommand', () => {
  test('extracts the raw path argument', () => {
    expect(parseReconocerVozCommand('/reconocerVoz /home/san/minutas/sesion')).toBe('/home/san/minutas/sesion');
  });

  test('is case-insensitive and trims surrounding whitespace', () => {
    expect(parseReconocerVozCommand('  /RECONOCERVOZ   /ruta/sesion  ')).toBe('/ruta/sesion');
  });

  test('strips a single pair of surrounding quotes', () => {
    expect(parseReconocerVozCommand('/reconocerVoz "/ruta con espacios/sesion"')).toBe('/ruta con espacios/sesion');
    expect(parseReconocerVozCommand("/reconocerVoz '/ruta con espacios/sesion'")).toBe('/ruta con espacios/sesion');
  });

  test('returns null without a path argument or for unrelated text', () => {
    expect(parseReconocerVozCommand('/reconocerVoz')).toBeNull();
    expect(parseReconocerVozCommand('/reconocerVoz   ')).toBeNull();
    expect(parseReconocerVozCommand('reconocerVoz /ruta')).toBeNull();
    expect(parseReconocerVozCommand('')).toBeNull();
    expect(parseReconocerVozCommand(undefined)).toBeNull();
  });
});

describe('parseOptimizaCommand', () => {
  test('extracts the raw path argument', () => {
    expect(parseOptimizaCommand('/optimiza /home/san/minutas/sesion')).toBe('/home/san/minutas/sesion');
  });

  test('is case-insensitive and trims surrounding whitespace', () => {
    expect(parseOptimizaCommand('  /OPTIMIZA   /ruta/sesion  ')).toBe('/ruta/sesion');
  });

  test('strips a single pair of surrounding quotes', () => {
    expect(parseOptimizaCommand('/optimiza "/ruta con espacios/sesion"')).toBe('/ruta con espacios/sesion');
    expect(parseOptimizaCommand("/optimiza '/ruta con espacios/sesion'")).toBe('/ruta con espacios/sesion');
  });

  test('returns null without a path argument or for unrelated text', () => {
    expect(parseOptimizaCommand('/optimiza')).toBeNull();
    expect(parseOptimizaCommand('/optimiza   ')).toBeNull();
    expect(parseOptimizaCommand('optimiza /ruta')).toBeNull();
    expect(parseOptimizaCommand('')).toBeNull();
    expect(parseOptimizaCommand(undefined)).toBeNull();
  });
});

describe('parseReconocerVozPendientesCommand', () => {
  test('extracts the raw path argument', () => {
    expect(parseReconocerVozPendientesCommand('/reconocerVozPendientes /home/san/minutas/sesion')).toBe('/home/san/minutas/sesion');
  });

  test('is case-insensitive and trims surrounding whitespace', () => {
    expect(parseReconocerVozPendientesCommand('  /RECONOCERVOZPENDIENTES   /ruta/sesion  ')).toBe('/ruta/sesion');
  });

  test('strips a single pair of surrounding quotes', () => {
    expect(parseReconocerVozPendientesCommand('/reconocerVozPendientes "/ruta con espacios/sesion"')).toBe('/ruta con espacios/sesion');
  });

  test('returns null without a path argument, for unrelated text, or for the plain /reconocerVoz command', () => {
    expect(parseReconocerVozPendientesCommand('/reconocerVozPendientes')).toBeNull();
    expect(parseReconocerVozPendientesCommand('/reconocerVozPendientes   ')).toBeNull();
    expect(parseReconocerVozPendientesCommand('reconocerVozPendientes /ruta')).toBeNull();
    expect(parseReconocerVozPendientesCommand('/reconocerVoz /ruta')).toBeNull();
    expect(parseReconocerVozPendientesCommand('')).toBeNull();
    expect(parseReconocerVozPendientesCommand(undefined)).toBeNull();
  });
});

describe('parseActualizarHablantesCommand', () => {
  test('extracts the raw path argument', () => {
    expect(parseActualizarHablantesCommand('/actualizarHablantes /home/san/minutas/sesion')).toBe('/home/san/minutas/sesion');
  });

  test('is case-insensitive and trims surrounding whitespace', () => {
    expect(parseActualizarHablantesCommand('  /ACTUALIZARHABLANTES   /ruta/sesion  ')).toBe('/ruta/sesion');
  });

  test('strips a single pair of surrounding quotes', () => {
    expect(parseActualizarHablantesCommand('/actualizarHablantes "/ruta con espacios/sesion"')).toBe('/ruta con espacios/sesion');
  });

  test('returns null without a path argument or for unrelated text', () => {
    expect(parseActualizarHablantesCommand('/actualizarHablantes')).toBeNull();
    expect(parseActualizarHablantesCommand('/actualizarHablantes   ')).toBeNull();
    expect(parseActualizarHablantesCommand('actualizarHablantes /ruta')).toBeNull();
    expect(parseActualizarHablantesCommand('')).toBeNull();
    expect(parseActualizarHablantesCommand(undefined)).toBeNull();
  });
});
