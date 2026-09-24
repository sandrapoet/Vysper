const { primerObjetoJson } = require('../src/core/json-extract');

/**
 * El clasificador de la asesoria pide JSON, pero un modelo puede envolverlo
 * en prosa o en una valla de codigo. Si este parser lanza, rompe el dictado
 * de una reunion en curso: NUNCA puede lanzar.
 */
describe('primerObjetoJson', () => {
  test('JSON limpio', () => {
    expect(primerObjetoJson('{"esPregunta":true}')).toEqual({ esPregunta: true });
  });

  test('JSON dentro de una valla de codigo', () => {
    expect(primerObjetoJson('```json\n{"esPregunta":false}\n```')).toEqual({ esPregunta: false });
  });

  test('JSON rodeado de prosa del modelo', () => {
    expect(primerObjetoJson('Claro, aqui tienes: {"a":1} espero que sirva'))
      .toEqual({ a: 1 });
  });

  test('objeto anidado: toma hasta la ultima llave', () => {
    expect(primerObjetoJson('x {"a":{"b":2}} y')).toEqual({ a: { b: 2 } });
  });

  test('devuelve null en vez de lanzar con JSON roto', () => {
    expect(() => primerObjetoJson('{roto')).not.toThrow();
    expect(primerObjetoJson('{roto')).toBeNull();
  });

  test('devuelve null sin lanzar con entradas invalidas', () => {
    expect(primerObjetoJson('')).toBeNull();
    expect(primerObjetoJson(undefined)).toBeNull();
    expect(primerObjetoJson(null)).toBeNull();
    expect(primerObjetoJson('sin nada de json')).toBeNull();
  });

  test('un array de primer nivel no cuenta como objeto', () => {
    expect(primerObjetoJson('[1,2,3]')).toBeNull();
  });
});
