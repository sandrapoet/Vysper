const {
  construirAtajos, detectarChoques, planInstalacion, planDesinstalacion, PREFIJO
} = require('../src/core/gnome-keybindings');

const ACCIONES = [
  { nombre: 'grabar', combo: '<Alt>r' },
  { nombre: 'sesion', combo: '<Alt>s' },
];

describe('construirAtajos', () => {
  test('cada atajo lleva el prefijo, su combo y el ejecutable', () => {
    const atajos = construirAtajos(ACCIONES, '/opt/vysper/bin/vysper-accion');
    expect(atajos[0].id).toBe(`${PREFIJO}grabar`);
    expect(atajos[0].binding).toBe('<Alt>r');
    expect(atajos[0].command).toBe('/opt/vysper/bin/vysper-accion grabar');
  });

  test('el comando NUNCA lleva token ni credencial', () => {
    const atajos = construirAtajos(ACCIONES, '/opt/vysper/bin/vysper-accion');
    atajos.forEach((a) => {
      expect(a.command).not.toMatch(/token|auth|password|:.*@/i);
    });
  });
});

describe('detectarChoques', () => {
  test('marca un combo ya ocupado por otro', () => {
    const deseados = construirAtajos(ACCIONES, '/bin/va');
    const existentes = [{ id: 'terminal', binding: '<Alt>r', command: 'gnome-terminal' }];
    const choques = detectarChoques(deseados, existentes);
    expect(choques).toHaveLength(1);
    expect(choques[0]).toMatchObject({ binding: '<Alt>r', ocupadoPor: 'terminal' });
  });

  test('un atajo nuestro de una corrida anterior NO es un choque', () => {
    const deseados = construirAtajos(ACCIONES, '/bin/va');
    const choques = detectarChoques(deseados, deseados);
    expect(choques).toHaveLength(0);
  });
});

describe('planInstalacion', () => {
  test('salta los que chocan y los reporta, instala el resto', () => {
    const deseados = construirAtajos(ACCIONES, '/bin/va');
    const existentes = [{ id: 'terminal', binding: '<Alt>r', command: 'gnome-terminal' }];
    const plan = planInstalacion(deseados, existentes);
    expect(plan.instalar.map((a) => a.id)).toEqual([`${PREFIJO}sesion`]);
    expect(plan.saltados).toHaveLength(1);
  });

  test('es idempotente: reinstalar lo ya instalado no duplica', () => {
    const deseados = construirAtajos(ACCIONES, '/bin/va');
    const plan = planInstalacion(deseados, deseados);
    expect(plan.instalar).toHaveLength(0);
  });
});

describe('planDesinstalacion', () => {
  test('solo quita lo del prefijo, jamas lo ajeno', () => {
    const existentes = [
      { id: `${PREFIJO}grabar`, binding: '<Alt>r', command: '/bin/va grabar' },
      { id: 'mio', binding: '<Alt>k', command: 'otra-cosa' },
    ];
    const plan = planDesinstalacion(existentes);
    expect(plan.quitar.map((a) => a.id)).toEqual([`${PREFIJO}grabar`]);
  });
});
