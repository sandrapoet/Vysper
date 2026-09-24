# Atajos globales y escritura de teclas bajo Wayland

**Fecha:** 2026-09-24
**Repo afectado:** `Vysper`
**Estado:** propuesta, pendiente de aprobación

## Problema

Vysper depende de dos capacidades que X11 concede y Wayland no:

1. **Capturar teclas globalmente** — 32 atajos, de los que ~10 deben funcionar
   estando el foco en cualquier aplicación (`Alt+R` grabar, `Alt+S` sesión larga,
   `Alt+B` captura, `Alt+O`/`Alt+9` optimización, `Ctrl+1` pegar, `Ctrl+Shift+C`
   chat, `Ctrl+↑/↓` cambiar de modo).
2. **Escribir teclas en la aplicación enfocada** — el pegado de `Ctrl+1`, que
   existe precisamente para llevar el texto a otra aplicación.

Bajo Wayland ambas están rotas, por causas distintas y con soluciones distintas.

### Estado medido en la máquina afectada (2026-09-24)

GNOME Shell 46.0, mutter 46.2, `xdg-desktop-portal` 1.18.4, sesión `wayland`.

| Comprobación | Resultado |
|---|---|
| `globalShortcut.register()` de Electron | devuelve `true` para los 32, **0 fallos** |
| Atajo con el foco en la ventana de Vysper | **dispara** |
| Atajo con el foco en VS Code (también X11) | **no dispara** — lo recibe VS Code |
| Portal `org.freedesktop.portal.GlobalShortcuts` | **no existe** (28 interfaces, ninguna es esa) |
| `wtype ''` | `Compositor does not support the virtual keyboard protocol`, código 1 |
| Portal `org.freedesktop.portal.RemoteDesktop` | **disponible** |
| `wl-copy` / `wl-paste` | funcionan |

Conclusiones que se siguen de esa tabla:

- El registro de Electron **miente**: mutter no honra los grabs globales de X11
  de los clientes XWayland, así que la tecla solo llega cuando la ventana de
  Vysper tiene el foco — lo contrario de un atajo global. Al cerrar la ventana
  de chat, la aplicación queda inoperable y solo se recupera matándola.
- El camino "oficial" (portal `GlobalShortcuts`) **no está disponible** en GNOME
  46. Hay que resolverlo por otra vía sin cerrarle la puerta.
- `wtype` **no puede** funcionar en GNOME. El pegado está roto con independencia
  de los atajos.

X11 seguirá funcionando, pero está en mantenimiento y GNOME empuja Wayland por
defecto: la migración es cuestión de tiempo, no de preferencia.

## Decisiones de diseño

### D1 — Probar, no suponer

La causa raíz del incidente no fue elegir mal la herramienta, sino **no
comprobarlo**. Todo backend debe demostrar que funciona antes de ser
seleccionado, y la decisión queda registrada.

*(Corregido parcialmente y ya en `main` — commit `f819278`, `src/core/typing-tool-probe.js`.)*

### D2 — Dos capas de backends intercambiables

| `ShortcutBackend` | Cuándo |
|---|---|
| `ElectronGlobalShortcut` | X11, Windows, macOS — comportamiento actual, intacto |
| `GnomeKeybinding` | Wayland + GNOME |
| `PortalGlobalShortcuts` | cuando GNOME publique la interfaz — detectado en runtime |

| `InputBackend` | Cuándo |
|---|---|
| `Xdotool` / `Powershell` / `Osascript` | X11, Windows, macOS |
| `PortalRemoteDesktop` | Wayland + GNOME |
| `ClipboardOnly` | último recurso |

La selección es por **capacidad probada**, no por variable de entorno. La tercera
fila de la primera tabla es lo que evita repetir esta reingeniería: cuando GNOME
publique `GlobalShortcuts`, es un backend nuevo detectado en runtime.

**Alternativa descartada para la captura:** `ydotool` sobre `/dev/uinput`. Funciona
en cualquier compositor, pero exige un demonio con acceso de root y una regla de
udev, se salta el modelo de seguridad de Wayland y se rompe con actualizaciones.
Precio demasiado alto para una herramienta de escritorio.

### D3 — Los atajos globales viven en GNOME, no en Vysper

Los atajos personalizados de GNOME (`org.gnome.settings-daemon.plugins.media-keys`)
sí se entregan globalmente, porque los gestiona el compositor. Vysper los instala
al arrancar en Wayland vía `gsettings`, apuntando a su propio servidor HTTP.

**Antes de instalar, lee lo que ya existe.** Si una combinación está ocupada, no la
pisa: la salta y lo reporta. Todos llevan un prefijo propio (`vysper-`) para poder
desinstalar exactamente lo que se instaló.

### D4 — Un ejecutable intermedio, nunca `curl` con el token

El servidor HTTP de Vysper (puerto 8080, ya existente) está detrás de Basic Auth.
Los atajos de dconf **se ven en Ajustes y en la lista de procesos**, así que poner
el token en la línea de comandos sería publicarlo. Los atajos invocan
`vysper-accion <nombre>`, que lee el token de un archivo con permisos `0600`.

### D5 — La escritura va por el portal RemoteDesktop

Es el mecanismo que GNOME soporta para inyectar teclado. La sesión se crea con
`persist_mode` persistente y se guarda el testigo de restauración, de modo que el
diálogo de permiso aparezca una vez y no en cada arranque. Si la restauración
falla porque el permiso fue revocado, se pide de nuevo **una** vez y se explica al
usuario por qué apareció el diálogo.

**Alternativa descartada:** solo portapapeles. Cero permisos, pero convierte cada
pegado en un paso manual y pisa lo que el usuario tuviera copiado. Se conserva
como degradación, no como diseño.

### D6 — Degradar en voz alta

Si el portal se deniega o el backend no está disponible, el pegado cae a
portapapeles **y se le dice al usuario en el chat**: "pegado automático no
disponible, el texto está en el portapapeles, pégalo con Ctrl+V".

Ésta es la propiedad que de verdad se compra con esta reingeniería. El fallo del
2026-09-24 fue mudo de principio a fin: se instaló una herramienta inservible, se
registraron 32 atajos que no enganchaban nada, y nada avisó. Un fallo ruidoso
habría costado diez minutos en vez de un día.

## Componentes

1. `src/core/backends/shortcut/*.js` — los tres `ShortcutBackend`, con una
   interfaz común (`isAvailable()`, `register(bindings)`, `unregister()`).
2. `src/core/backends/input/*.js` — los `InputBackend`
   (`isAvailable()`, `typeText(texto)`, `sendKeys(combo)`).
3. `src/core/backend-selector.js` — puro: recibe las sondas y el entorno,
   devuelve qué backend usar y **por qué**. Testeable sin compositor.
4. `src/core/gnome-keybindings.js` — puro salvo el lanzador inyectado:
   construir, detectar choques, instalar y desinstalar los atajos de dconf.
5. `bin/vysper-accion` — ejecutable mínimo que traduce nombre de acción a
   petición HTTP autenticada.
6. `stt/http_server.js` — puntos nuevos para las acciones de teclado. `/comando`
   se queda como está: ejecuta comandos de chat, no acciones de teclado.

## Pruebas

Puros y con jest: selección de backends (con sondas falsas), construcción de
atajos de dconf, detección de choques, instalación/desinstalación idempotente,
traducción de acción a petición. La sesión del portal, con un bus DBus simulado.

**Ningún test unitario prueba que un compositor entregue una tecla.** Hace falta
una verificación manual en la máquina real, con lista de comprobación explícita:
cada atajo global con el foco en una aplicación que no sea Vysper, **con la
ventana de chat cerrada**, y el pegado sobre una aplicación de terceros. Se
declara aquí para que no aparezca como sorpresa al final.

## Fuera de alcance

- X11, Windows y macOS: conservan sus backends actuales sin cambios de
  comportamiento.
- `PortalGlobalShortcuts`: se deja la costura, no se implementa (la interfaz no
  existe en el sistema de destino).
- KDE y otros compositores: el diseño no los impide, pero no se verifican.

## Riesgos abiertos

- **El diálogo del portal puede reaparecer.** El testigo de restauración puede
  invalidarse por actualizaciones o cambios de permisos. Hay que tratarlo como
  estado normal, no como error.
- **Los atajos de GNOME sobreviven a Vysper.** Si la aplicación no corre, la
  tecla invoca un ejecutable que no encuentra servidor. Debe fallar de forma
  legible, y se evalúa si conviene que levante Vysper.
- **Escribir en la configuración del escritorio del usuario** es intrusivo aunque
  sea reversible. La desinstalación limpia no es opcional.

## Mitigación mientras tanto

`WaylandEnable=false` en `/etc/gdm3/custom.conf` devuelve la sesión a Xorg y con
ella todo el comportamiento actual. Es la vía recomendada hasta que esto exista.
