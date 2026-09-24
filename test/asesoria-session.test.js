const { AsesoriaSession, MAX_TRANSCRIPCION_CHARS, MAX_TURNOS } = require('../src/core/asesoria-session');

describe('AsesoriaSession', () => {
  test('acumula fragmentos en orden', () => {
    const s = new AsesoriaSession();
    s.agregarFragmento('uno');
    s.agregarFragmento('dos');
    expect(s.contexto().transcripcion).toBe('uno\ndos');
  });

  test('descarta lo mas viejo al pasar el limite de caracteres', () => {
    const s = new AsesoriaSession();
    s.agregarFragmento('A'.repeat(MAX_TRANSCRIPCION_CHARS));
    s.agregarFragmento('NUEVO');
    const t = s.contexto().transcripcion;
    expect(t.length).toBeLessThanOrEqual(MAX_TRANSCRIPCION_CHARS);
    expect(t).toContain('NUEVO');
  });

  test('conserva solo los ultimos turnos', () => {
    const s = new AsesoriaSession();
    for (let i = 0; i < MAX_TURNOS + 3; i++) s.agregarTurno(`p${i}`, `r${i}`);
    const turnos = s.contexto().turnos;
    expect(turnos).toHaveLength(MAX_TURNOS);
    expect(turnos[turnos.length - 1].pregunta).toBe(`p${MAX_TURNOS + 2}`);
  });

  test('fragmentosRecientes devuelve los ultimos n', () => {
    const s = new AsesoriaSession();
    ['a', 'b', 'c', 'd'].forEach((f) => s.agregarFragmento(f));
    expect(s.fragmentosRecientes(2)).toEqual(['c', 'd']);
  });

  test('reset vacia todo', () => {
    const s = new AsesoriaSession();
    s.agregarFragmento('x');
    s.agregarTurno('p', 'r');
    s.reset('cambio de modo');
    expect(s.contexto()).toEqual({ transcripcion: '', turnos: [] });
  });

  test('ignora fragmentos vacios', () => {
    const s = new AsesoriaSession();
    s.agregarFragmento('   ');
    s.agregarFragmento(null);
    expect(s.contexto().transcripcion).toBe('');
  });

  test('fragmentosRecientes(0) no devuelve todo el historial (M1)', () => {
    // slice(-0) es slice(0): devuelve TODO el arreglo, no nada. La Tarea 8
    // llama fragmentosRecientes(3) pero un 0 (o negativo) por error de
    // llamador no puede filtrar la transcripcion entera a Cerebro.
    const s = new AsesoriaSession();
    ['a', 'b', 'c'].forEach((f) => s.agregarFragmento(f));
    expect(s.fragmentosRecientes(0)).toEqual([]);
  });
});
