# Atajos globales y escritura bajo Wayland — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los atajos globales y el pegado de Vysper funcionen en una sesión Wayland de GNOME, sin depender de Xorg y sin cerrarle la puerta al portal `GlobalShortcuts` cuando GNOME lo publique.

**Architecture:** Dos capas de backends intercambiables elegidos por capacidad **probada**. Los atajos globales pasan a vivir en GNOME (dconf) y llaman al servidor HTTP que Vysper ya expone; la escritura de teclas va por el portal `RemoteDesktop`. Toda degradación se anuncia.

**Tech Stack:** Node 20 / Electron / jest · gsettings (dconf) · D-Bus (`org.freedesktop.portal.RemoteDesktop`)

**Spec:** `docs/superpowers/specs/2026-09-24-wayland-atajos-y-escritura-design.md`

## Global Constraints

- Ningún backend se selecciona sin **probar** que funciona. La decisión se registra en el log con su motivo.
- X11, Windows y macOS **no cambian de comportamiento**. Sus backends son los actuales.
- Los atajos instalados en dconf llevan el prefijo `vysper-` y se desinstalan exactamente los que se instalaron.
- El token del Basic Auth **nunca** aparece en una línea de comandos ni en dconf. Vive en un archivo con permisos `0600`.
- Toda degradación es **audible**: si el pegado cae a portapapeles, se le dice al usuario en el chat.
- `PortalGlobalShortcuts` se declara como backend pero **no se implementa** (la interfaz no existe en GNOME 46).
- Comentarios y mensajes en español; commits en español, sin prefijo convencional, terminados en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Selector de backends por capacidad probada

**Files:**
- Create: `src/core/backend-selector.js`
- Test: `test/backend-selector.test.js`

**Interfaces:**
- Produces: `elegirBackends(entorno, sondas) -> {atajos: {nombre, motivo}, escritura: {nombre, motivo}}`

`sondas` es `{portalRemoteDesktop: () => bool, portalGlobalShortcuts: () => bool, gsettings: () => bool, xdotool: () => bool, wtype: () => bool}`. Ninguna se llama si la plataforma ya decide.

- [ ] **Step 1: Escribir el test que falla**

```javascript
const { elegirBackends } = require('../src/core/backend-selector');

const TODAS_OK = {
  portalRemoteDesktop: () => true, portalGlobalShortcuts: () => true,
  gsettings: () => true, xdotool: () => true, wtype: () => true
};
const NINGUNA = {
  portalRemoteDesktop: () => false, portalGlobalShortcuts: () => false,
  gsettings: () => false, xdotool: () => false, wtype: () => false
};

describe('elegirBackends', () => {
  test('en X11 usa Electron y xdotool, sin tocar ninguna sonda de Wayland', () => {
    const llamadas = [];
    const sondas = { ...TODAS_OK, portalRemoteDesktop: () => { llamadas.push('portal'); return true; } };
    const r = elegirBackends({ XDG_SESSION_TYPE: 'x11' }, sondas);
    expect(r.atajos.nombre).toBe('ElectronGlobalShortcut');
    expect(r.escritura.nombre).toBe('Xdotool');
    expect(llamadas).toHaveLength(0);
  });

  test('en Windows no consulta sondas de Linux', () => {
    const r = elegirBackends({ PLATAFORMA: 'win32' }, NINGUNA);
    expect(r.escritura.nombre).toBe('Powershell');
  });

  test('en Wayland+GNOME prefiere GnomeKeybinding y PortalRemoteDesktop', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }, TODAS_OK);
    expect(r.atajos.nombre).toBe('GnomeKeybinding');
    expect(r.escritura.nombre).toBe('PortalRemoteDesktop');
  });

  test('si el portal GlobalShortcuts existe, gana sobre GnomeKeybinding', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' }, TODAS_OK);
    // Hoy portalGlobalShortcuts() es false en GNOME 46; cuando exista, gana.
    expect(['GnomeKeybinding', 'PortalGlobalShortcuts']).toContain(r.atajos.nombre);
  });

  test('sin portal RemoteDesktop la escritura degrada a portapapeles, con motivo', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' },
      { ...TODAS_OK, portalRemoteDesktop: () => false });
    expect(r.escritura.nombre).toBe('ClipboardOnly');
    expect(r.escritura.motivo).toMatch(/portal/i);
  });

  test('sin gsettings no hay atajos globales, y se dice por que', () => {
    const r = elegirBackends(
      { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' },
      { ...TODAS_OK, gsettings: () => false, portalGlobalShortcuts: () => false });
    expect(r.atajos.nombre).toBe('Ninguno');
    expect(r.atajos.motivo).toMatch(/gsettings/i);
  });

  test('toda eleccion trae motivo no vacio', () => {
    const r = elegirBackends({ XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' }, TODAS_OK);
    expect(r.atajos.motivo.length).toBeGreaterThan(0);
    expect(r.escritura.motivo.length).toBeGreaterThan(0);
  });

  test('una sonda que revienta se trata como no disponible, no propaga', () => {
    const sondas = { ...TODAS_OK, portalRemoteDesktop: () => { throw new Error('dbus caido'); } };
    const r = elegirBackends({ XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'GNOME' }, sondas);
    expect(r.escritura.nombre).toBe('ClipboardOnly');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest test/backend-selector.test.js`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

Módulo puro. Orden de decisión para atajos: plataforma no-Linux o sesión X11 → `ElectronGlobalShortcut`; Wayland → `PortalGlobalShortcuts` si la sonda dice que sí, si no `GnomeKeybinding` si hay `gsettings`, si no `Ninguno`. Para escritura: no-Linux → `Powershell`/`Osascript`; X11 → `Xdotool`; Wayland → `PortalRemoteDesktop` si la sonda dice que sí, si no `ClipboardOnly`. Cada sonda se invoca dentro de `try/catch` que trata la excepción como `false`. Cada rama devuelve `motivo` en español explicando la elección.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest test/backend-selector.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/backend-selector.js test/backend-selector.test.js
git commit -m "$(cat <<'EOT'
Los backends se eligen por capacidad probada, no por variable de entorno

Suponer por XDG_SESSION_TYPE fue lo que hizo elegir wtype en un compositor
que no lo soporta. Cada eleccion trae su motivo, y una sonda que revienta
cuenta como no disponible.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOT
)"
```

---

### Task 2: Atajos de GNOME — construir, detectar choques, instalar, desinstalar

**Files:**
- Create: `src/core/gnome-keybindings.js`
- Test: `test/gnome-keybindings.test.js`

**Interfaces:**
- Consumes: nada
- Produces: `construirAtajos(acciones, rutaEjecutable)`, `detectarChoques(deseados, existentes)`, `planInstalacion(deseados, existentes)`, `planDesinstalacion(existentes)`, constante `PREFIJO = 'vysper-'`

Todas puras: devuelven descripciones de lo que hay que hacer. Quien ejecuta `gsettings` es la Tarea 3.

- [ ] **Step 1: Escribir el test que falla**

```javascript
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest test/gnome-keybindings.test.js`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

Puro, sin ejecutar nada. `detectarChoques` compara por `binding`, y NO cuenta como choque cuando el `id` del existente ya lleva `PREFIJO` **y** coincide con el deseado. `planInstalacion` devuelve `{instalar, saltados}`; `planDesinstalacion` devuelve `{quitar}` filtrando por `PREFIJO`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest test/gnome-keybindings.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/gnome-keybindings.js test/gnome-keybindings.test.js
git commit -m "$(cat <<'EOT'
Atajos de GNOME: construir, detectar choques y desinstalar solo lo propio

Escribir en la configuracion del escritorio del usuario es intrusivo aunque
sea reversible: no se pisa nada ocupado, y la desinstalacion quita
exactamente lo que se instalo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOT
)"
```

---

### Task 3: Aplicar el plan de atajos contra gsettings

**Files:**
- Create: `src/services/gnome-keybindings.service.js`
- Test: `test/gnome-keybindings.service.test.js`

**Interfaces:**
- Consumes: `planInstalacion`, `planDesinstalacion` (Task 2)
- Produces: clase `GnomeKeybindingsService({ ejecutar, logger })` con `leerExistentes()`, `instalar(acciones, rutaEjecutable)`, `desinstalar()`

`ejecutar(bin, args) -> {status, stdout, stderr}` se inyecta: los tests no llaman a gsettings de verdad.

- [ ] **Step 1: Escribir el test que falla**

```javascript
const { GnomeKeybindingsService } = require('../src/services/gnome-keybindings.service');

function servicio(respuestas) {
  const llamadas = [];
  const ejecutar = (bin, args) => {
    llamadas.push([bin, ...args].join(' '));
    const clave = args.join(' ');
    return respuestas[clave] || { status: 0, stdout: '', stderr: '' };
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { svc: new GnomeKeybindingsService({ ejecutar, logger }), llamadas, logger };
}

test('leerExistentes devuelve lista vacia cuando no hay ninguno', () => {
  const { svc } = servicio({ "get org.gnome.settings-daemon.plugins.media-keys custom-keybindings": { status: 0, stdout: "@as []\n", stderr: '' } });
  expect(svc.leerExistentes()).toEqual([]);
});

test('instalar no escribe nada si todo choca, y avisa', () => {
  const { svc, llamadas, logger } = servicio({});
  jest.spyOn(svc, 'leerExistentes').mockReturnValue([{ id: 'x', binding: '<Alt>r', command: 'otra' }]);
  const r = svc.instalar([{ nombre: 'grabar', combo: '<Alt>r' }], '/bin/va');
  expect(r.instalados).toHaveLength(0);
  expect(r.saltados).toHaveLength(1);
  expect(logger.warn).toHaveBeenCalled();
  expect(llamadas.filter((c) => c.includes(' set '))).toHaveLength(0);
});

test('un fallo de gsettings no revienta: se reporta', () => {
  const { svc, logger } = servicio({});
  jest.spyOn(svc, 'leerExistentes').mockReturnValue([]);
  const svcFallo = new GnomeKeybindingsService({
    ejecutar: () => ({ status: 1, stdout: '', stderr: 'no such schema' }),
    logger
  });
  jest.spyOn(svcFallo, 'leerExistentes').mockReturnValue([]);
  expect(() => svcFallo.instalar([{ nombre: 'grabar', combo: '<Alt>r' }], '/bin/va')).not.toThrow();
});

test('desinstalar solo toca lo del prefijo', () => {
  const { svc, llamadas } = servicio({});
  jest.spyOn(svc, 'leerExistentes').mockReturnValue([
    { id: 'vysper-grabar', binding: '<Alt>r', command: '/bin/va grabar', path: '/p/vysper-grabar/' },
    { id: 'ajeno', binding: '<Alt>k', command: 'otra', path: '/p/ajeno/' },
  ]);
  svc.desinstalar();
  expect(llamadas.join('\n')).toContain('vysper-grabar');
  expect(llamadas.join('\n')).not.toContain('/p/ajeno/');
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest test/gnome-keybindings.service.test.js`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

Lee y escribe el esquema `org.gnome.settings-daemon.plugins.media-keys` clave `custom-keybindings` (lista de rutas), y por cada ruta el esquema `org.gnome.settings-daemon.plugins.media-keys.custom-keybinding` con `name`, `command`, `binding`. Todo `ejecutar` con status distinto de 0 se registra como `warn` y NO lanza. `instalar` devuelve `{instalados, saltados}` y registra en el log cada salto con el atajo que lo ocupaba.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest test/gnome-keybindings.service.test.js`
Expected: PASS

- [ ] **Step 5: Verificación manual contra dconf real**

```bash
gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings
```
Instalar, comprobar que aparecen en Ajustes → Teclado → Atajos personalizados, desinstalar, y comprobar que la lista vuelve **exactamente** a su valor original.

- [ ] **Step 6: Commit**

```bash
git add src/services/gnome-keybindings.service.js test/gnome-keybindings.service.test.js
git commit -m "$(cat <<'EOT'
Instalar y desinstalar los atajos de GNOME sin pisar los del usuario

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOT
)"
```

---

### Task 4: `vysper-accion` — el ejecutable que guarda el token

**Files:**
- Create: `bin/vysper-accion`
- Create: `src/core/accion-http.js`
- Test: `test/accion-http.test.js`

**Interfaces:**
- Produces: `construirPeticion(accion, {puerto, token}) -> {url, method, headers}`, `leerToken(ruta, leerArchivo, statArchivo) -> {token, error}`

- [ ] **Step 1: Escribir el test que falla**

```javascript
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest test/accion-http.test.js`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

`construirPeticion` valida la acción contra `/^[a-z][a-z0-9-]*$/` y lanza si no encaja. `leerToken` comprueba que `mode & 0o077` sea 0 antes de leer. `bin/vysper-accion` es un script Node mínimo: lee el token, construye la petición, la lanza, e imprime el error en stderr con código distinto de 0 si falla — para que el usuario pueda diagnosticarlo desde una terminal.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest test/accion-http.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/vysper-accion src/core/accion-http.js test/accion-http.test.js
git commit -m "$(cat <<'EOT'
El token no puede viajar en un atajo de dconf: se ve en Ajustes y en ps

Los atajos personalizados son visibles para el usuario y para cualquier
proceso. El ejecutable intermedio lee el token de un archivo 0600 y se
niega a usarlo si los permisos estan abiertos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOT
)"
```

---

### Task 5: Puntos `/accion/<nombre>` en el servidor HTTP

**Files:**
- Modify: `stt/http_server.js` (junto a `/comando`, línea ~255)
- Test: `test/accion-endpoint.test.js`

**Interfaces:**
- Consumes: el `controller` que ya recibe `startRemoteAudioServer`
- Produces: `POST /accion/:nombre` → `{ok, accion}` con 404 si la acción no existe

Acciones: `grabar` (`toggleSpeechRecognition`), `sesion` (`handleSecretariaMeetingShortcut`), `captura`, `pegar`, `chat`, `modo-siguiente`, `modo-anterior`.

- [ ] **Step 1: Escribir el test que falla**

Test del mapeo puro acción→método del controlador (extraer `ACCIONES` a un objeto exportable), con un controlador falso que registra qué método se invocó. Verificar: cada acción llama a su método; una acción inexistente devuelve 404 sin llamar a nada; un método que lanza no tumba el servidor.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest test/accion-endpoint.test.js`
Expected: FAIL

- [ ] **Step 3: Implementar**

Añadir el mapa y el punto detrás del mismo Basic Auth global que ya cubre `/comando`. `/comando` **no se toca**: sigue ejecutando comandos de chat.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest`
Expected: PASS, sin regresiones

- [ ] **Step 5: Commit**

```bash
git add stt/http_server.js test/accion-endpoint.test.js
git commit -m "$(cat <<'EOT'
El servidor expone las acciones de teclado, no solo comandos de chat

/comando ejecuta comandos de chat y se queda como esta. Las acciones que
antes solo llegaban por atajo global necesitan su propia puerta para que
GNOME pueda llamarlas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOT
)"
```

---

### Task 6: Backend de escritura por el portal RemoteDesktop

**Files:**
- Create: `src/services/portal-remote-desktop.service.js`
- Test: `test/portal-remote-desktop.test.js`

**Interfaces:**
- Produces: clase `PortalRemoteDesktop({ dbus, almacen, logger })` con `disponible()`, `asegurarSesion()`, `typeText(texto)`, `sendKeys(combo)`

`almacen` guarda y lee el testigo de restauración (`{leer(), guardar(t)}`). `dbus` se inyecta entero: los tests no hablan con D-Bus.

- [ ] **Step 1: Escribir el test que falla**

Casos obligatorios: reutiliza el testigo guardado y NO abre diálogo; si la restauración falla lo pide de nuevo **una sola vez** y lo registra; si el usuario deniega, `typeText` devuelve `{ok:false, motivo}` sin lanzar; un testigo nuevo se guarda; `disponible()` es false si la interfaz no está en el bus.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest test/portal-remote-desktop.test.js`
Expected: FAIL

- [ ] **Step 3: Implementar**

`CreateSession` con `persist_mode: 2`, `SelectDevices` con teclado, `Start`, y `NotifyKeyboardKeysym` para escribir. El testigo de restauración se guarda tras cada `Start` exitoso. **Un solo reintento** ante restauración fallida: reintentar en bucle convertiría un permiso revocado en una lluvia de diálogos.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest test/portal-remote-desktop.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/portal-remote-desktop.service.js test/portal-remote-desktop.test.js
git commit -m "$(cat <<'EOT'
Escritura de teclas por el portal, con el permiso recordado

Un solo reintento ante restauracion fallida: reintentar en bucle convierte
un permiso revocado en una lluvia de dialogos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOT
)"
```

---

### Task 7: Integración en `main.js` y degradación audible

**Files:**
- Modify: `main.js` (`ensureLinuxTools`/`ensureTypingTool`, registro de atajos ~línea 1050, `typeText`/`pasteText` ~515-590)
- Test: manual (ver Step 4)

**Interfaces:**
- Consumes: todo lo anterior

- [ ] **Step 1: Cablear la selección**

En el arranque, llamar a `elegirBackends(process.env, sondas)` y registrar en el log el backend elegido **y su motivo**. Las sondas reales: `gdbus introspect` para el portal, `which gsettings/xdotool`, y `evaluarWtype` (ya existe en `src/core/typing-tool-probe.js`).

- [ ] **Step 2: Atajos según el backend**

Si es `ElectronGlobalShortcut`, el registro actual sin cambios. Si es `GnomeKeybinding`, instalar los atajos con el servicio de la Tarea 3 y **no** registrar los globales de Electron para esas combinaciones — registrar dos veces la misma tecla es pedir un conflicto. Al salir, desinstalar.

- [ ] **Step 3: Escritura según el backend, degradando en voz alta**

`ClipboardOnly` copia con `wl-copy` y emite en el chat: *"Pegado automático no disponible (motivo). El texto está en el portapapeles: pégalo con Ctrl+V."* Nunca en silencio.

- [ ] **Step 4: Verificación manual — la que de verdad decide**

En una sesión **Wayland**, con Vysper corriendo y **la ventana de chat cerrada**:
1. Foco en Chrome (Wayland nativo) → `Alt+S` inicia grabación.
2. Foco en VS Code (X11) → `Alt+S` la detiene.
3. `Ctrl+1` sobre un documento de terceros → el texto aparece ahí.
4. Denegar el permiso del portal a propósito → aparece el aviso en el chat y el texto queda en el portapapeles.
5. Salir de Vysper → `gsettings get ... custom-keybindings` vuelve a su valor original.

Ningún test unitario sustituye esto: no prueban que un compositor entregue una tecla.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "$(cat <<'EOT'
Vysper funciona en Wayland: atajos por GNOME y escritura por el portal

Y cuando no puede, lo dice. El fallo del 2026-09-24 fue mudo de principio a
fin: 32 atajos registrados que no enganchaban nada y una herramienta de
escritura instalada con sudo que el compositor no soporta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOT
)"
```

---

## Autorrevisión

- **Cobertura de la espec:** D1 → T1. D2 → T1 (selector) + T3/T6 (backends). D3 → T2+T3. D4 → T4. D5 → T6. D6 → T7 Step 3. Componente 6 (`/accion`) → T5.
- **Sin marcadores de relleno:** T5 y T6 describen los casos de test en prosa en vez de código literal, porque sus dobles dependen de la forma real de `startRemoteAudioServer` y del cliente D-Bus elegido; cada uno enumera los casos obligatorios, que es el contrato que debe cumplirse.
- **Consistencia de tipos:** `construirAtajos` devuelve `{id, binding, command}` en T2 y así lo consumen `detectarChoques`, `planInstalacion` y el servicio de T3. `elegirBackends` devuelve `{atajos:{nombre,motivo}, escritura:{nombre,motivo}}` en T1 y así se usa en T7.
- **Riesgo declarado:** `PortalGlobalShortcuts` aparece en el selector de T1 como rama futura y no se implementa. Es deliberado: la interfaz no existe en GNOME 46.
