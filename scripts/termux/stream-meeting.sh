#!/data/data/com.termux/files/usr/bin/bash
# Graba una reunion en vivo desde el celular (Termux) y la sube a Vysper por
# segmentos cortos via /stream/start -> /stream/:id/segmento (con reintento,
# por numero de secuencia) -> /stream/:id/finish. Ver README.md de Vysper,
# seccion "Acceso remoto por Tailscale" para el detalle de los endpoints.
#
# Requiere: Termux + el paquete Termux:API (tanto el app de F-Droid/Play
# Store como el paquete `termux-api` instalado con `pkg install termux-api`),
# y `ffprobe` (`pkg install ffmpeg`) para medir la duracion real de cada
# segmento.
#
# Configuracion: copia este archivo, ajusta HOST/USER/PASS abajo (o
# exportalos como variables de entorno antes de correr el script).

set -uo pipefail

HOST="${VYSPER_HOST:-http://100.83.125.94:8080}"
USER="${VYSPER_HTTP_USER:?falta VYSPER_HTTP_USER}"
PASS="${VYSPER_HTTP_PASSWORD:?falta VYSPER_HTTP_PASSWORD}"

SEGMENT_SEC="${SEGMENT_SEC:-30}"
MAX_RETRIES="${MAX_RETRIES:-5}"

# El encoder "opus" de termux-microphone-record no esta disponible en todas
# las versiones de Termux:API -- si tu instalacion lo soporta, cambia esto a
# "opus"/".opus" para mandar el audio mas comprimido. "aac"/".m4a" es el
# formato mas seguro (soportado en cualquier Android) y el servidor de
# Vysper ya acepta .m4a sin cambios.
ENCODER="${ENCODER:-aac}"
EXT="${EXT:-m4a}"

WORKDIR="$HOME/vysper-stream"
mkdir -p "$WORKDIR"
PIDFILE="$WORKDIR/current.pid"
STREAMFILE="$WORKDIR/current.streamid"

echo $$ > "$PIDFILE"
termux-wake-lock

echo "Iniciando stream en $HOST..."
start_resp=$(curl -s -u "$USER:$PASS" -X POST "$HOST/stream/start" \
  -H 'Content-Type: application/json' \
  -d "{\"segmentSec\": $SEGMENT_SEC}")

STREAM_ID=$(echo "$start_resp" | sed -n 's/.*"streamId":"\([^"]*\)".*/\1/p')
if [ -z "$STREAM_ID" ]; then
  echo "No se pudo iniciar el stream. Respuesta del servidor: $start_resp"
  termux-wake-lock -d
  rm -f "$PIDFILE"
  exit 1
fi
echo "$STREAM_ID" > "$STREAMFILE"
echo "Stream $STREAM_ID iniciado."

# Notificacion persistente con boton "Terminar reunion": el boton solo mata
# este proceso (kill -TERM) -- el trap de abajo (el mismo que atiende
# Ctrl+C) se encarga de llamar /finish y limpiar. Un solo camino de cierre,
# sea por boton o por Ctrl+C en la terminal.
termux-notification \
  --id "vysper-stream" \
  --title "Vysper: grabando reunion" \
  --content "stream $STREAM_ID -- toca para terminar" \
  --ongoing \
  --button1 "Terminar reunion" \
  --button1-action "kill -TERM \$(cat $PIDFILE) 2>/dev/null"

finish_and_exit() {
  echo
  echo "Cerrando stream $STREAM_ID..."
  termux-microphone-record -q >/dev/null 2>&1
  termux-notification-remove "vysper-stream" >/dev/null 2>&1

  resp=$(curl -s -u "$USER:$PASS" -X POST "$HOST/stream/$STREAM_ID/finish" \
    -H 'Content-Type: application/json' -d '{"graceMs": 20000}')
  echo "$resp" > "$WORKDIR/resultado-$STREAM_ID.json"

  if echo "$resp" | grep -q '"ok":true'; then
    termux-notification \
      --title "Vysper: minuta lista" \
      --content "Guardada en $WORKDIR/resultado-$STREAM_ID.json"
    echo "Listo. Resultado guardado en $WORKDIR/resultado-$STREAM_ID.json"
  else
    # 404 aca es normal si finish_and_exit ya corrio una vez (idempotente:
    # el servidor borra la sesion de streaming al terminarla).
    echo "Aviso al finalizar (puede ser normal si ya se cerro antes): $resp"
  fi

  termux-wake-lock -d
  rm -f "$PIDFILE" "$STREAMFILE"
  exit 0
}
trap finish_and_exit INT TERM

upload_with_retry() {
  local file="$1" seq="$2"
  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$file" 2>/dev/null)

  for attempt in $(seq 1 "$MAX_RETRIES"); do
    if curl -s -f -u "$USER:$PASS" -X POST "$HOST/stream/$STREAM_ID/segmento" \
        -F "archivo=@$file" -F "seq=$seq" -F "durationSec=${dur:-0}" >/dev/null; then
      echo "segmento $seq subido (intento $attempt)"
      rm -f "$file"
      return 0
    fi
    echo "segmento $seq fallo intento $attempt/$MAX_RETRIES, reintentando en 2s..."
    sleep 2
  done

  echo "segmento $seq se dio por perdido tras $MAX_RETRIES intentos (el servidor lo marca como hueco en la minuta)"
  return 1
}

seq=1
while true; do
  file="$WORKDIR/segmento-$(printf '%04d' "$seq").$EXT"
  termux-microphone-record -f "$file" -l "$SEGMENT_SEC" -e "$ENCODER"
  sleep "$SEGMENT_SEC"
  termux-microphone-record -q >/dev/null 2>&1

  # Subida en paralelo a la siguiente grabacion: como el servidor ensambla
  # por "seq", el desorden de llegada no importa.
  upload_with_retry "$file" "$seq" &

  seq=$((seq + 1))
done
