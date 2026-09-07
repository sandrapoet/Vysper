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
# backslashes, etc. que un parseo con grep/sed rompe). ffprobe
# (`pkg install ffmpeg`) es opcional -- si está, se manda la duración real
# del audio; si no, se manda "0" (el servidor lo acepta, solo se pierde ese
# dato informativo).

SERVER="${VYSPER_HOST:-http://100.83.125.94:8080}"
USER="${VYSPER_HTTP_USER:-sanVysper}"
PASS="${VYSPER_HTTP_PASSWORD:-S@Ndra21}"
TEMP_DIR="/sdcard/Download/vysper_temp"
CONNECT_TIMEOUT=15
MAX_RETRIES=3
RETRY_DELAY=2
FINISH_TIMEOUT=320   # /finish corre el pipeline completo (transcribe+diariza+minuta)

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
echo "      ${BLUE}$TEMP_DIR/${NC}"
echo "   4. Vuelve a esta terminal y presiona ENTER"
echo ""

rm -f "$TEMP_DIR"/* 2>/dev/null
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
UPLOAD=$(curl_with_retries 60 -X POST -u "$USER:$PASS" \
    -F "archivo=@$SELECTED_FILE" \
    -F "seq=1" \
    -F "durationSec=$DURATION" \
    "$SERVER/stream/$STREAM_ID/segmento")
UPLOAD_CODE=$(echo "$UPLOAD" | tail -n1)
UPLOAD_BODY=$(echo "$UPLOAD" | sed '$d')

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
