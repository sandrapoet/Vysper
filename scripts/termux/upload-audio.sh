#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# VYSPER - Subida de un archivo de audio ya grabado
# ============================================================
# Sube un archivo de audio existente (copiado a mano al celular) y hace
# EXACTAMENTE lo mismo que Alt+S en la PC: transcribe + diariza + genera
# la minuta, siempre, en un solo paso -- vía /stream/start -> /stream/:id/
# segmento -> /stream/:id/finish (mismo pipeline que usa una reunion en
# vivo, ver finishSecretariaStreamSession/finalizeSecretariaMeetingSession
# en main.js). No hay que elegir "transcribir" vs "minuta": el servidor no
# distingue esos modos para este endpoint, así que no hace falta preguntar.
#
# Requiere: python3 -- Termux NO lo trae instalado por defecto, hay que
# instalarlo una vez con `pkg install python -y`. Se usa para armar/parsear
# JSON de forma segura (el texto de la minuta puede traer comillas,
# backslashes, etc. que un parseo con grep/sed rompe). ffmpeg
# (`pkg install ffmpeg -y`, trae tambien ffprobe) es opcional pero muy
# recomendado: sin el no se puede medir la duracion real ni comprimir
# sesiones largas (ver CONVERT_THRESHOLD_SEC) -- una reunion de 2h grabada
# sin comprimir puede pesar mas de 1GB y tardar mucho en subir por celular.

SERVER="${VYSPER_HOST:-http://100.83.125.94:8080}"
USER="${VYSPER_HTTP_USER:-sanVysper}"
PASS="${VYSPER_HTTP_PASSWORD:-S@Ndra21}"
TEMP_DIR="/sdcard/Download/vysper_temp"
CONNECT_TIMEOUT=15
MAX_RETRIES=3
RETRY_DELAY=2
FINISH_TIMEOUT=320   # /finish corre el pipeline completo (transcribe+diariza+minuta)

# Si el audio dura mas de esto, se comprime a Opus antes de subir (ver paso
# 2.5 mas abajo) -- la mayoria de las sesiones largas (reuniones de horas)
# se graban sin comprimir desde el celular y pesan varios GB; subir eso tal
# cual es lento e innecesario, ya que el servidor igual reconvierte todo a
# 16kHz mono para transcribir (ver convertToWav en stt/http_server.js).
# El POST del segmento no responde hasta que el servidor TRANSCRIBE el audio
# (ingestSecretariaStreamSegment en main.js corre dentro del handler), asi que
# su timeout tiene que cubrir subida + transcripcion, no solo la transferencia.
# Medido en esta instalacion: 625s de audio -> 327s de proceso, y 4433s ->
# 1944s, o sea ~0.5x tiempo real. Se usa 1.5x como margen (3x lo medido) para
# aguantar una PC cargada.
PROCESS_FACTOR_NUM=3         # factor = NUM/DEN = 1.5x la duracion del audio
PROCESS_FACTOR_DEN=2
PROCESS_MARGIN_SEC=300       # arranque del modelo y escritura de la sesion

# Si la subida termino pero el servidor no contesto a tiempo, se consulta
# /stream/:id/estado hasta que el segmento quede transcrito, en vez de
# reintentar el POST -- reintentar le hace repetir la transcripcion completa.
POLL_INTERVAL_SEC=20

CONVERT_THRESHOLD_SEC=1200   # 20 minutos
CONVERT_BITRATE="32k"        # de sobra para voz -- Opus a 32kbps es inteligible

# Segundo disparador de compresion, por tamano: cubre el caso en que
# ffprobe no esta instalado (o no pudo leer la duracion) y DURATION_INT
# queda en 0 -- sin esto, un .wav crudo de horas se subia entero.
CONVERT_THRESHOLD_BYTES=$((100 * 1024 * 1024))   # 100 MB

# Por encima de esto no se intenta subir un archivo sin comprimir: el
# servidor lo rechaza con 413 (ver el limite VYSPER_HTTP_MAX_MB en
# stt/http_server.js) y por celular se pierde mas de una hora antes de
# enterarse. Mejor cortar aca y decir por que.
MAX_UNCOMPRESSED_BYTES=$((500 * 1024 * 1024))    # 500 MB


RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Sin esto, cada "$(python3 ...)" de abajo falla en silencio (command not
# found) y el script sigue con variables vacias -- confunde mucho mas que
# cortar aca con un mensaje claro (ver historial: causo un JSON invalido
# mandado al servidor y errores fantasma de "no devolvio streamId").
if ! command -v python3 >/dev/null 2>&1; then
    echo -e "${RED}❌ Falta python3 (Termux no lo trae instalado por defecto)${NC}"
    echo -e "${YELLOW}💡 Instálalo una sola vez con:${NC} pkg install python -y"
    exit 1
fi

mkdir -p "$TEMP_DIR"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       🎙️  VYSPER - Subida de Audio  🎙️${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# ============================================================
# Helper: request con reintentos. Devuelve "cuerpo\ncodigo_http" o vacio
# en la ultima linea si nunca hubo respuesta.
# ============================================================
curl_with_retries() {
    local max_time="$1"; shift
    local attempt=1
    local response http_code http_body

    while [ $attempt -le $MAX_RETRIES ]; do
        response=$(curl -s -w "\n%{http_code}" --connect-timeout "$CONNECT_TIMEOUT" --max-time "$max_time" "$@" 2>&1)
        http_code=$(echo "$response" | tail -n1)
        http_body=$(echo "$response" | sed '$d')

        if [ "$http_code" != "000" ]; then
            printf '%s\n%s' "$http_body" "$http_code"
            return 0
        fi

        if [ $attempt -eq $MAX_RETRIES ]; then
            printf '\n000'
            return 1
        fi
        echo -e "${YELLOW}   Sin respuesta (intento $attempt/$MAX_RETRIES), reintentando en ${RETRY_DELAY}s...${NC}" >&2
        sleep $RETRY_DELAY
        attempt=$((attempt + 1))
    done
}

# ============================================================
# Helpers del segmento: subida y consulta de estado
# ============================================================
# Un 000 (sin respuesta) puede significar dos cosas opuestas:
#   a) la subida se corto a medio camino -> hay que resubir;
#   b) el servidor la recibio entera y esta TRANSCRIBIENDO, y tardo mas que
#      --max-time en contestar -> resubir le hace repetir el trabajo desde
#      cero (medido en vivo: el mismo seq=1 transcrito dos y tres veces,
#      attempts:3 en el stream-manifest.json, con 32 min duplicados).
# No se adivina cual de las dos es: se le pregunta al servidor con
# /stream/:id/estado, que es quien sabe. Ojo -- %{size_upload} de curl NO
# sirve para distinguirlas: cuenta lo que curl volco al socket, no lo que el
# servidor llego a leer, y el cuerpo multipart es mas grande que el archivo,
# asi que da "subida completa" incluso cuando la conexion se corto a mitad.
curl_segmento_una_vez() {
    local max_time="$1"; shift
    local response http_code http_body

    response=$(curl -s -w "\n%{http_code}" \
        --connect-timeout "$CONNECT_TIMEOUT" --max-time "$max_time" "$@" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    http_body=$(echo "$response" | sed '$d')
    printf '%s\n%s' "$http_body" "$http_code"
}

# Imprime el status del segmento seq=1 segun el servidor, o vacio si el
# servidor todavia no lo tiene (es decir, si hay que resubir).
estado_segmento() {
    local stream_id="$1"
    curl -s --connect-timeout "$CONNECT_TIMEOUT" --max-time 30 \
        -u "$USER:$PASS" "$SERVER/stream/$stream_id/estado" 2>/dev/null | python3 -c "import json,sys
try:
    d = json.load(sys.stdin)
    segs = d.get('segments') or []
    match = [s for s in segs if s.get('seq') == 1]
    print(match[0].get('status', '') if match else '')
except Exception:
    print('')" 2>/dev/null
}

# Espera a que el segmento quede transcrito. Se usa cuando la subida llego
# pero la respuesta no: la sesion sigue viva y no hay nada que resubir.
esperar_segmento_transcrito() {
    local stream_id="$1" limite="$2"
    local esperado=0 seg_status

    while [ "$esperado" -lt "$limite" ]; do
        sleep "$POLL_INTERVAL_SEC"
        esperado=$((esperado + POLL_INTERVAL_SEC))

        seg_status=$(estado_segmento "$stream_id")
        if [ "$seg_status" = "transcrito" ]; then
            echo -e "${GREEN}✅ El servidor terminó de transcribir (tras $((esperado / 60)) min de espera)${NC}"
            return 0
        fi
        echo -e "${YELLOW}   Sigue procesando... ($((esperado / 60)) min, estado: ${seg_status:-desconocido})${NC}"
    done
    return 1
}

json_get() {
    python3 -c "import json,sys
try:
    d = json.load(sys.stdin)
    v = d.get('$1', '')
    print(v if v is not None else '')
except Exception:
    print('')"
}

# ============================================================
# 1. Verificar servidor
# ============================================================
echo -e "${BLUE}🔍 Verificando servidor...${NC}"
CHECK=$(curl_with_retries 20 -I -u "$USER:$PASS" "$SERVER")
CHECK_CODE=$(echo "$CHECK" | tail -n1)
if [ "$CHECK_CODE" = "000" ]; then
    echo -e "${RED}❌ No se pudo conectar al servidor tras $MAX_RETRIES intentos${NC}"
    echo -e "${YELLOW}💡 Verifica Tailscale activo en AMBOS dispositivos${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Servidor accesible (HTTP $CHECK_CODE)${NC}"

# ============================================================
# 2. Seleccionar archivo (copiado a mano a TEMP_DIR)
# ============================================================
echo ""
echo -e "${BLUE}📂 Selecciona un archivo de audio${NC}"
echo -e "${YELLOW}   (Usando Gestor de archivos +)${NC}"
echo ""
echo -e "${YELLOW}📋 Instrucciones:${NC}"
echo "   1. Abre Gestor de archivos +"
echo "   2. Navega hasta el archivo de audio"
echo "   3. Copia el archivo a:"
echo -e "      ${BLUE}$TEMP_DIR/${NC}"
echo "   4. Vuelve a esta terminal y presiona ENTER"
echo ""

# Solo se limpian los residuos del script (el LEE_ME y un comprimido de una
# corrida anterior), NO los audios que ya esten copiados: si una corrida
# previa aborto por tamano dejo el archivo a proposito, volver a copiar GB
# al celular seria carisimo. El `ls -t` de abajo toma el mas reciente, asi
# que copiar uno nuevo lo sustituye igual.
rm -f "$TEMP_DIR/LEE_ME.txt" "$TEMP_DIR/comprimido.opus" 2>/dev/null
EXISTING=$(ls -t "$TEMP_DIR" 2>/dev/null | head -1)
if [ -n "$EXISTING" ]; then
    echo -e "${YELLOW}📎 Ya hay un archivo aquí:${NC} $EXISTING"
    echo -e "${YELLOW}   Presiona ENTER para usarlo, o copia otro y luego ENTER${NC}"
fi
echo "📂 Copia tu archivo de audio aquí" > "$TEMP_DIR/LEE_ME.txt"

echo -n "Presiona ENTER cuando hayas copiado el archivo... "
read -r

SELECTED_FILE=$(ls -t "$TEMP_DIR" 2>/dev/null | grep -v "LEE_ME.txt" | head -1)
if [ -z "$SELECTED_FILE" ]; then
    echo -e "${RED}❌ No se encontró ningún archivo en $TEMP_DIR${NC}"
    exit 1
fi
SELECTED_FILE="$TEMP_DIR/$SELECTED_FILE"
if [ ! -f "$SELECTED_FILE" ]; then
    echo -e "${RED}❌ Error: El archivo no existe${NC}"
    exit 1
fi

FILE_SIZE=$(du -h "$SELECTED_FILE" | cut -f1)
echo -e "${GREEN}✅ Archivo:${NC} $(basename "$SELECTED_FILE") ${YELLOW}($FILE_SIZE)${NC}"

DURATION=$(command -v ffprobe >/dev/null 2>&1 && ffprobe -v error -show_entries format=duration -of csv=p=0 "$SELECTED_FILE" 2>/dev/null)
DURATION="${DURATION:-0}"
DURATION_INT="${DURATION%.*}"
DURATION_INT="${DURATION_INT:-0}"

# ============================================================
# 2.5. Comprimir si la sesion es larga o el archivo es grande
# ============================================================
# Se comprime por duracion (> CONVERT_THRESHOLD_SEC) O por tamano
# (> CONVERT_THRESHOLD_BYTES): el criterio de tamano es el que salva el
# caso en que ffprobe no esta instalado o no pudo leer la duracion, donde
# DURATION_INT queda en 0 y un .wav crudo de horas pasaba derecho a la
# subida.
ORIGINAL_SIZE_BYTES=$(wc -c < "$SELECTED_FILE" 2>/dev/null || echo 0)
NEEDS_CONVERT=0
[ "$DURATION_INT" -gt "$CONVERT_THRESHOLD_SEC" ] && NEEDS_CONVERT=1
[ "$ORIGINAL_SIZE_BYTES" -gt "$CONVERT_THRESHOLD_BYTES" ] && NEEDS_CONVERT=1

if [ "$NEEDS_CONVERT" = "1" ]; then
    if command -v ffmpeg >/dev/null 2>&1; then
        echo ""
        if [ "$DURATION_INT" -gt 0 ]; then
            echo -e "${BLUE}🔄 Sesión larga ($((DURATION_INT / 60)) min): comprimiendo a Opus antes de subir...${NC}"
        else
            echo -e "${BLUE}🔄 Archivo grande ($FILE_SIZE): comprimiendo a Opus antes de subir...${NC}"
        fi
        CONVERTED_FILE="$TEMP_DIR/comprimido.opus"
        # El destino del log se elige PROBANDO que se pueda escribir, no
        # asumiendolo: Termux no tiene /tmp escribible (su temporal es
        # $TMPDIR = /data/data/com.termux/files/usr/tmp) y con la ruta fija
        # a /tmp la redireccion fallaba con "Permission denied" ANTES de que
        # ffmpeg arrancara -- eso tumbaba el `if`, el script creia que la
        # compresion habia fallado y subia el original: 1.2GB de wav
        # rechazados con 413 tras 70 minutos de subida movil.
        FFMPEG_LOG=""
        for candidate in "${TMPDIR:-}" "$TEMP_DIR" /tmp; do
            [ -n "$candidate" ] || continue
            # El probe va en un subshell: bash imprime el error de una
            # redireccion fallida al evaluarla, antes de aplicar el
            # 2>/dev/null del comando, asi que sin el subshell el propio
            # chequeo ensucia la salida con "Permission denied".
            if ( : >"$candidate/vysper-upload-audio-ffmpeg.log" ) 2>/dev/null; then
                FFMPEG_LOG="$candidate/vysper-upload-audio-ffmpeg.log"
                break
            fi
        done
        # Ultimo recurso: sin log, pero la compresion se intenta igual --
        # perder el diagnostico es mucho mas barato que perder la subida.
        [ -n "$FFMPEG_LOG" ] || FFMPEG_LOG=/dev/null
        # 16kHz mono: el servidor igual reconvierte a esto para transcribir
        # (convertToWav en stt/http_server.js), asi que bajar la calidad de
        # entrada no pierde nada que Whisper fuera a usar de todos modos.
        if ffmpeg -y -i "$SELECTED_FILE" -ar 16000 -ac 1 -c:a libopus -b:a "$CONVERT_BITRATE" \
            "$CONVERTED_FILE" >"$FFMPEG_LOG" 2>&1; then
            NEW_SIZE=$(du -h "$CONVERTED_FILE" | cut -f1)
            echo -e "${GREEN}✅ Comprimido:${NC} $FILE_SIZE -> $NEW_SIZE"
            SELECTED_FILE="$CONVERTED_FILE"
            FILE_SIZE="$NEW_SIZE"
        else
            echo -e "${YELLOW}⚠️ Falló la compresión (log en $FFMPEG_LOG)${NC}"
            tail -5 "$FFMPEG_LOG" 2>/dev/null | sed 's/^/   /'
            # No se sube el original a ciegas: una sesion larga sin
            # comprimir son cientos de MB o GB, y el servidor la rechaza
            # igual (413) despues de gastar una hora de subida movil. Ver
            # historial: un .wav de 1.2GB murio asi tras 70 minutos.
            if [ "$ORIGINAL_SIZE_BYTES" -gt "$MAX_UNCOMPRESSED_BYTES" ]; then
                echo -e "${RED}❌ El archivo sin comprimir ($FILE_SIZE) es demasiado grande para subirse tal cual${NC}"
                echo -e "${YELLOW}💡 Revisa el log de ffmpeg y reintenta; o convierte a mano con:${NC}"
                echo "   ffmpeg -i \"$SELECTED_FILE\" -ar 16000 -ac 1 -c:a libopus -b:a $CONVERT_BITRATE salida.opus"
                # No se borra $TEMP_DIR: volver a copiar un archivo de GB al
                # celular es carisimo y el original sigue sirviendo para
                # reintentar una vez arreglada la compresion.
                exit 1
            fi
            echo -e "${YELLOW}   Se sube el archivo original (es lo bastante chico)${NC}"
        fi
    else
        echo ""
        echo -e "${YELLOW}⚠️ Archivo grande/sesión larga sin ffmpeg instalado -- la subida va a ser lenta y pesada${NC}"
        echo -e "${YELLOW}💡 Instálalo para comprimir automáticamente:${NC} pkg install ffmpeg -y"
        if [ "$ORIGINAL_SIZE_BYTES" -gt "$MAX_UNCOMPRESSED_BYTES" ]; then
            echo -e "${RED}❌ Sin ffmpeg no se puede comprimir, y $FILE_SIZE es demasiado para subirse tal cual${NC}"
            # Idem: se deja el archivo para reintentar tras instalar ffmpeg.
            exit 1
        fi
    fi
fi

# Timeout de subida dinamico segun el tamano real del archivo -- un valor
# fijo (60s) fallaba con audio largo/sin comprimir (ej. un .wav de horas):
# curl abortaba la subida a mitad de camino por --max-time, y como el
# ultimo status que alcanzo a leer fue el "100 Continue" intermedio (que
# curl manda automaticamente en un POST multipart de este tamano antes del
# cuerpo), %{http_code} reportaba "100" en vez de "000" -- un fallo real
# de timeout disfrazado de respuesta rara. Asume una subida movil lenta
# (300 KB/s) como piso realista, con margen fijo para el handshake/TLS.
FILE_SIZE_BYTES=$(wc -c < "$SELECTED_FILE" 2>/dev/null || echo 0)
UPLOAD_TIMEOUT=$(( FILE_SIZE_BYTES / (300 * 1024) + 60 ))
[ "$UPLOAD_TIMEOUT" -lt 120 ] && UPLOAD_TIMEOUT=120

# El timeout del POST tiene que cubrir subida + transcripcion, porque el
# servidor no contesta hasta haber transcrito (ver PROCESS_FACTOR_*). Modelar
# solo la transferencia era el bug: daba 120s para los dos casos reales
# medidos, mientras el servidor tardaba 327s y 1944s -- curl abandonaba,
# reintentaba, y el servidor volvia a transcribir desde cero.
SEGMENT_TIMEOUT=$(( UPLOAD_TIMEOUT + DURATION_INT * PROCESS_FACTOR_NUM / PROCESS_FACTOR_DEN + PROCESS_MARGIN_SEC ))
# Presupuesto aparte para el sondeo de /estado, que corre DESPUES de que el
# POST ya agoto su timeout: son dos esperas consecutivas, no la misma. Por
# defecto se le da lo mismo, o sea el doble del estimado en total -- margen
# sano para una PC cargada, y de todos modos el sondeo corta en cuanto el
# segmento queda transcrito, no espera el limite completo.
POLL_BUDGET_SEC="${POLL_BUDGET_SEC:-$SEGMENT_TIMEOUT}"
if [ "$UPLOAD_TIMEOUT" -gt 300 ]; then
    echo -e "${YELLOW}⏱️  Archivo grande: la subida puede tardar hasta $((UPLOAD_TIMEOUT / 60)) minutos${NC}"
fi
if [ "$DURATION_INT" -gt 0 ]; then
    echo -e "${YELLOW}⏱️  Transcripción estimada: ~$((DURATION_INT / 120)) min (espera hasta $((SEGMENT_TIMEOUT / 60)) min)${NC}"
fi

# Mismo problema para /finish si el audio es largo: transcribir + diarizar
# horas de audio puede tardar mas que un valor fijo de 320s. Un piso
# generoso por segundo de audio (o el default si ffprobe no dio duracion).
FINISH_TIMEOUT_DYNAMIC=$(( DURATION_INT + 900 ))
[ "$FINISH_TIMEOUT_DYNAMIC" -gt "$FINISH_TIMEOUT" ] && FINISH_TIMEOUT="$FINISH_TIMEOUT_DYNAMIC"

# ============================================================
# 3. Confirmar
# ============================================================
echo ""
echo -e "${YELLOW}📄 Archivo:${NC} $(basename "$SELECTED_FILE")"
echo -e "${YELLOW}📝 Se va a transcribir, diarizar y generar la minuta${NC} ${BLUE}(igual que Alt+S)${NC}"
echo ""
echo -n "¿Subir? (s/N): "
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[sS]$ ]]; then
    echo -e "${YELLOW}⏹️ Cancelado${NC}"
    rm -f "$TEMP_DIR"/* 2>/dev/null
    exit 0
fi

# ============================================================
# 4. Crear sesión (POST /stream/start)
# ============================================================
echo ""
echo -e "${BLUE}⏳ Creando sesión en el servidor...${NC}"
SESSION=$(curl_with_retries 20 -X POST -u "$USER:$PASS" \
    -H "Content-Type: application/json" \
    -d '{"segmentSec": 30}' \
    "$SERVER/stream/start")
SESSION_CODE=$(echo "$SESSION" | tail -n1)
SESSION_BODY=$(echo "$SESSION" | sed '$d')

if [ "$SESSION_CODE" != "200" ]; then
    echo -e "${RED}❌ Error al crear sesión (HTTP $SESSION_CODE)${NC}"
    echo -e "${YELLOW}   Respuesta:${NC} $SESSION_BODY"
    rm -f "$TEMP_DIR"/* 2>/dev/null
    exit 1
fi

STREAM_ID=$(echo "$SESSION_BODY" | json_get streamId)
if [ -z "$STREAM_ID" ]; then
    echo -e "${RED}❌ El servidor no devolvió un streamId${NC}"
    echo -e "${YELLOW}   Respuesta:${NC} $SESSION_BODY"
    rm -f "$TEMP_DIR"/* 2>/dev/null
    exit 1
fi
echo -e "${GREEN}✅ Sesión creada:${NC} $STREAM_ID"

# ============================================================
# 5. Subir el archivo completo como segmento único 1
# ============================================================
echo ""
echo -e "${BLUE}⏳ Subiendo archivo...${NC}"
# -H "Expect:" desactiva el "Expect: 100-continue" que curl agrega solo en
# uploads -F grandes -- sin esto, curl espera a que el servidor confirme
# "100 Continue" antes de mandar el cuerpo; si esa espera se solapa con
# --max-time, %{http_code} puede terminar reportando ese "100" intermedio
# en vez de "000"/el status real. Al desactivarlo, curl manda el cuerpo de
# inmediato sin esperar nada -- innecesario contra un servidor propio de
# confianza que siempre va a aceptar el body.
# Bucle de subida: ante un 000 se le pregunta al servidor si ya tiene el
# segmento antes de decidir si resubir (ver curl_segmento_una_vez).
UPLOAD_INTENTO=1
while [ "$UPLOAD_INTENTO" -le "$MAX_RETRIES" ]; do
    UPLOAD=$(curl_segmento_una_vez "$SEGMENT_TIMEOUT" -X POST -u "$USER:$PASS" \
        -H "Expect:" \
        -F "archivo=@$SELECTED_FILE" \
        -F "seq=1" \
        -F "durationSec=$DURATION" \
        "$SERVER/stream/$STREAM_ID/segmento")
    UPLOAD_CODE=$(echo "$UPLOAD" | tail -n1)
    UPLOAD_BODY=$(echo "$UPLOAD" | sed '$d')

    [ "$UPLOAD_CODE" != "000" ] && break

    # Sin respuesta: el servidor decide si la subida llego o no.
    SEG_STATUS=$(estado_segmento "$STREAM_ID")
    if [ -n "$SEG_STATUS" ]; then
        echo -e "${YELLOW}⚠️  El archivo subió completo, pero el servidor aún no responde (estado: $SEG_STATUS)${NC}"
        if [ "$SEG_STATUS" = "transcrito" ]; then
            echo -e "${GREEN}✅ Ya está transcrito${NC}"
        else
            echo -e "${BLUE}⏳ Esperando a que termine de transcribir (consultando cada ${POLL_INTERVAL_SEC}s)...${NC}"
            if ! esperar_segmento_transcrito "$STREAM_ID" "$POLL_BUDGET_SEC"; then
                echo -e "${RED}❌ El servidor no terminó de transcribir tras $((POLL_BUDGET_SEC / 60)) min de espera${NC}"
                echo -e "${YELLOW}💡 La sesión sigue abierta. Consulta su estado con:${NC}"
                echo "   curl -u $USER:*** $SERVER/stream/$STREAM_ID/estado"
                echo -e "${YELLOW}   y genera la minuta cuando termine con:${NC}"
                echo "   curl -u $USER:*** -X POST -H 'Content-Type: application/json' \\"
                echo "     -d '{\"graceMs\": 20000}' $SERVER/stream/$STREAM_ID/finish"
                exit 1
            fi
        fi
        # A partir de aca el flujo es el mismo que si hubiera contestado 200:
        # el segmento ya es del servidor, resubirlo solo duplicaria trabajo.
        UPLOAD_CODE=200
        break
    fi

    # El servidor no tiene el segmento: la subida se corto de verdad.
    if [ "$UPLOAD_INTENTO" -eq "$MAX_RETRIES" ]; then
        echo -e "${RED}❌ La subida se cortó y el servidor no recibió el segmento tras $MAX_RETRIES intentos${NC}"
        echo -e "${YELLOW}💡 Verifica Tailscale activo en AMBOS dispositivos${NC}"
        rm -f "$TEMP_DIR"/* 2>/dev/null
        exit 1
    fi
    echo -e "${YELLOW}   La subida se cortó sin llegar al servidor (intento $UPLOAD_INTENTO/$MAX_RETRIES), reintentando en ${RETRY_DELAY}s...${NC}"
    sleep "$RETRY_DELAY"
    UPLOAD_INTENTO=$((UPLOAD_INTENTO + 1))
done

if [ "$UPLOAD_CODE" = "408" ]; then
    # 408 lo emite Node, no la app: es server.requestTimeout (5 min por
    # defecto en Node >=18) vencido con el cuerpo a medio subir. Si sale
    # esto, el servidor no tiene el arreglo de VYSPER_HTTP_REQUEST_TIMEOUT_MS
    # (o quedo corto) -- no es un problema del archivo ni de la red.
    echo -e "${RED}❌ El servidor cortó la subida por timeout (HTTP 408)${NC}"
    echo -e "${YELLOW}   Respuesta:${NC} $UPLOAD_BODY"
    echo -e "${YELLOW}💡 Reinicia Vysper en la PC: el servidor necesita${NC} VYSPER_HTTP_REQUEST_TIMEOUT_MS"
    echo -e "${YELLOW}   (el default de Node son 5 min, insuficiente para subir por datos móviles)${NC}"
    exit 1
fi

if [ "$UPLOAD_CODE" = "413" ]; then
    # El servidor rechazo el archivo por tamano (ver el limite maxMb /
    # VYSPER_HTTP_MAX_MB en stt/http_server.js). Casi siempre es una sesion
    # larga que se subio sin comprimir porque falta ffmpeg en el celular.
    echo -e "${RED}❌ El servidor rechazo el archivo por tamano (HTTP 413)${NC}"
    echo -e "${YELLOW}   Respuesta:${NC} $UPLOAD_BODY"
    if ! command -v ffmpeg >/dev/null 2>&1; then
        echo -e "${YELLOW}💡 Instala ffmpeg para que el script comprima antes de subir:${NC} pkg install ffmpeg -y"
    else
        echo -e "${YELLOW}💡 Baja CONVERT_BITRATE (hoy $CONVERT_BITRATE) o parte la grabación en dos${NC}"
    fi
    rm -f "$TEMP_DIR"/* 2>/dev/null
    exit 1
fi

if [ "$UPLOAD_CODE" != "200" ]; then
    echo -e "${RED}❌ Error al subir archivo (HTTP $UPLOAD_CODE)${NC}"
    echo -e "${YELLOW}   Respuesta:${NC} $UPLOAD_BODY"
    rm -f "$TEMP_DIR"/* 2>/dev/null
    exit 1
fi
echo -e "${GREEN}✅ Archivo subido correctamente${NC}"

# ============================================================
# 6. Finalizar: transcribe + diariza + genera minuta (igual que Alt+S)
# ============================================================
echo ""
echo -e "${BLUE}⏳ Procesando audio (transcripción + diarización + minuta)...${NC}"
echo -e "${YELLOW}   Esto puede tomar varios minutos, no cierres la terminal${NC}"

FINAL=$(curl_with_retries "$FINISH_TIMEOUT" -X POST -u "$USER:$PASS" \
    -H "Content-Type: application/json" \
    -d '{"graceMs": 20000}' \
    "$SERVER/stream/$STREAM_ID/finish")
FINAL_CODE=$(echo "$FINAL" | tail -n1)
FINAL_BODY=$(echo "$FINAL" | sed '$d')

rm -f "$TEMP_DIR"/* 2>/dev/null

if [ "$FINAL_CODE" = "200" ]; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ ¡MINUTA GENERADA!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    SESSION_DIR=$(echo "$FINAL_BODY" | json_get sessionDir)
    [ -n "$SESSION_DIR" ] && echo -e "${YELLOW}📁 Sesión guardada en:${NC} $SESSION_DIR"
    PERDIDOS=$(echo "$FINAL_BODY" | python3 -c "import json,sys
try:
    d = json.load(sys.stdin)
    p = d.get('segmentosPerdidos') or []
    print(', '.join(str(x) for x in p))
except Exception:
    print('')")
    [ -n "$PERDIDOS" ] && echo -e "${YELLOW}⚠️  Segmentos perdidos:${NC} $PERDIDOS"
    echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
    echo "$FINAL_BODY" | json_get resultado
    echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
else
    echo ""
    echo -e "${RED}❌ Error al procesar (HTTP $FINAL_CODE)${NC}"
    echo -e "${YELLOW}   Respuesta:${NC} $FINAL_BODY"
    exit 1
fi

echo ""
echo -e "${BLUE}✨ ¡Listo!${NC}"
