const { construirPeticion, leerToken } = require('../src/core/accion-http');

test('la peticion lleva el token en la cabecera, nunca en la URL', () => {
  const p = construirPeticion('grabar', { puerto: 8080, token: 's3cr3t' });
  expect(p.url).toBe('http://127.0.0.1:8080/accion/grabar');
  expect(p.url).not.toContain('s3cr3t');
  expect(p.headers.Authorization).toContain('Basic ');
});

test('se rechaza una accion con caracteres raros', () => {
  expect(() => construirPeticion('../../etc/passwd', { puerto: 8080, token: 't' })).toThrow();
});

test('no acepta un archivo de token con permisos abiertos', () => {
  const stat = () => ({ mode: 0o644 });
  const r = leerToken('/x/token', () => 't', stat);
  expect(r.token).toBeNull();
  expect(r.error).toMatch(/permisos/i);
});

test('acepta 0600', () => {
  const stat = () => ({ mode: 0o600 });
  expect(leerToken('/x/token', () => 'tok', stat).token).toBe('tok');
});

test('si el archivo no existe lo dice, no revienta', () => {
  const r = leerToken('/x/token', () => { throw new Error('ENOENT'); }, () => ({ mode: 0o600 }));
  expect(r.token).toBeNull();
  expect(r.error).toBeTruthy();
});
