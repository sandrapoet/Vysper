#!/usr/bin/python3
"""Puente entre Vysper y el portal org.freedesktop.portal.RemoteDesktop.

Bajo GNOME/Wayland ninguna herramienta de linea de comandos puede escribir
teclas en otra aplicacion (wtype falla: mutter no implementa el protocolo de
teclado virtual). El portal RemoteDesktop si puede, pero su sesion vive
atada a la conexion D-Bus que la creo, asi que hace falta un proceso vivo.
Este es ese proceso: Node lo lanza una vez y le habla por JSON, una linea
por mensaje, en stdin/stdout.

Usa el python3 del sistema porque necesita gi (Gio), que el venv de stt/ no
trae.

Mensajes (entrada -> salida):
  {"id": n, "op": "disponible"}
      -> {"id": n, "ok": true, "disponible": bool}
  {"id": n, "op": "iniciar", "restore_token": str|null}
      -> {"id": n, "ok": true, "restore_token": str|null}
       | {"id": n, "ok": false, "motivo": str, "denegado": bool}
  {"id": n, "op": "keysym", "keysym": int, "pulsada": bool}
      -> {"id": n, "ok": true} | {"id": n, "ok": false, "motivo": str}
"""

import json
import sys
import secrets

from gi.repository import Gio, GLib

BUS = "org.freedesktop.portal.Desktop"
RUTA = "/org/freedesktop/portal/desktop"
IFACE = "org.freedesktop.portal.RemoteDesktop"
TECLADO = 1
# 2 = el permiso persiste hasta que el usuario lo revoque.
PERSISTIR = 2


class Puente:
    def __init__(self):
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.sesion = None
        # Las rutas de Request se derivan del nombre unico del bus.
        self.remitente = self.bus.get_unique_name()[1:].replace(".", "_")

    def responder(self, mensaje):
        sys.stdout.write(json.dumps(mensaje) + "\n")
        sys.stdout.flush()

    def disponible(self):
        try:
            r = self.bus.call_sync(BUS, RUTA, "org.freedesktop.DBus.Properties", "Get",
                                   GLib.Variant("(ss)", (IFACE, "version")),
                                   None, Gio.DBusCallFlags.NONE, 2000, None)
            return r is not None
        except GLib.Error:
            return False

    def pedir(self, metodo, argumentos, opciones, alTerminar):
        """Llama a un metodo del portal que responde por la senal Request::Response."""
        token = "vysper_" + secrets.token_hex(6)
        opciones["handle_token"] = GLib.Variant("s", token)
        ruta_request = f"/org/freedesktop/portal/desktop/request/{self.remitente}/{token}"
        suscripcion = [None]

        def al_responder(_con, _rem, _ruta, _iface, _senal, parametros):
            self.bus.signal_unsubscribe(suscripcion[0])
            codigo, resultados = parametros.unpack()
            alTerminar(codigo, resultados)

        # Suscribirse ANTES de llamar: la respuesta puede llegar enseguida.
        suscripcion[0] = self.bus.signal_subscribe(
            BUS, "org.freedesktop.portal.Request", "Response", ruta_request,
            None, Gio.DBusSignalFlags.NONE, al_responder)
        firma = "(" + "".join(a[0] for a in argumentos) + "a{sv})"
        valores = tuple(a[1] for a in argumentos) + (opciones,)
        try:
            self.bus.call_sync(BUS, RUTA, IFACE, metodo, GLib.Variant(firma, valores),
                               None, Gio.DBusCallFlags.NONE, -1, None)
        except GLib.Error as error:
            self.bus.signal_unsubscribe(suscripcion[0])
            alTerminar(2, {"error": str(error)})

    def iniciar(self, id_, restore_token):
        def fallo(etapa, codigo, resultados):
            self.sesion = None
            denegado = codigo == 1
            motivo = ("el usuario denego el permiso de control remoto" if denegado
                      else f"el portal fallo en {etapa} (codigo {codigo}): {resultados.get('error', '')}".strip())
            self.responder({"id": id_, "ok": False, "motivo": motivo, "denegado": denegado})

        def tras_start(codigo, resultados):
            if codigo != 0:
                return fallo("Start", codigo, resultados)
            self.responder({"id": id_, "ok": True, "restore_token": resultados.get("restore_token")})

        def tras_select(codigo, resultados):
            if codigo != 0:
                return fallo("SelectDevices", codigo, resultados)
            self.pedir("Start", [("o", self.sesion), ("s", "")], {}, tras_start)

        def tras_crear(codigo, resultados):
            if codigo != 0:
                return fallo("CreateSession", codigo, resultados)
            self.sesion = resultados["session_handle"]
            opciones = {"types": GLib.Variant("u", TECLADO), "persist_mode": GLib.Variant("u", PERSISTIR)}
            if restore_token:
                opciones["restore_token"] = GLib.Variant("s", restore_token)
            self.pedir("SelectDevices", [("o", self.sesion)], opciones, tras_select)

        self.cerrar_sesion()
        self.pedir("CreateSession", [],
                   {"session_handle_token": GLib.Variant("s", "vysper_" + secrets.token_hex(6))},
                   tras_crear)

    def cerrar_sesion(self):
        if not self.sesion:
            return
        try:
            self.bus.call_sync(BUS, self.sesion, "org.freedesktop.portal.Session", "Close",
                               None, None, Gio.DBusCallFlags.NONE, 2000, None)
        except GLib.Error:
            pass
        self.sesion = None

    def keysym(self, id_, keysym, pulsada):
        if not self.sesion:
            return self.responder({"id": id_, "ok": False, "motivo": "no hay sesion del portal"})
        try:
            self.bus.call_sync(BUS, RUTA, IFACE, "NotifyKeyboardKeysym",
                               GLib.Variant("(oa{sv}iu)", (self.sesion, {}, int(keysym), 1 if pulsada else 0)),
                               None, Gio.DBusCallFlags.NONE, 2000, None)
            self.responder({"id": id_, "ok": True})
        except GLib.Error as error:
            self.responder({"id": id_, "ok": False, "motivo": str(error)})

    def atender(self, linea):
        try:
            m = json.loads(linea)
        except ValueError:
            return
        id_, op = m.get("id"), m.get("op")
        if op == "disponible":
            self.responder({"id": id_, "ok": True, "disponible": self.disponible()})
        elif op == "iniciar":
            self.iniciar(id_, m.get("restore_token"))
        elif op == "keysym":
            self.keysym(id_, m.get("keysym", 0), bool(m.get("pulsada")))
        else:
            self.responder({"id": id_, "ok": False, "motivo": f"op desconocida: {op}"})


def main():
    puente = Puente()
    bucle = GLib.MainLoop()
    canal = GLib.IOChannel.unix_new(sys.stdin.fileno())

    def al_leer(canal_, condicion):
        # Con la ultima linea y el cierre juntos llegan IN y HUP a la vez:
        # primero se lee lo pendiente, y solo al agotarlo se termina.
        if condicion & GLib.IO_IN:
            linea = canal_.readline()
            if linea:
                puente.atender(linea)
                return True
        bucle.quit()
        return False

    GLib.io_add_watch(canal, GLib.PRIORITY_DEFAULT, GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, al_leer)
    bucle.run()
    puente.cerrar_sesion()


if __name__ == "__main__":
    main()
