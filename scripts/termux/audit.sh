#!/data/data/com.termux/files/usr/bin/bash
# audit -- audita TU trabajo local con la skill silia-audit-pr.
#
# Es el hermano de `pr`, y hace lo contrario: `pr` revisa el PR de OTRA
# persona (silia-review-pr); esto audita lo que vos tenes en la PC y que
# TODAVIA no es un PR -- cambios sin commitear incluidos.
#
# Seis lentes en paralelo tardan minutos, contra el techo de 480s de este
# tunel, asi que el comando devuelve en segundos el preflight (rama, base,
# archivos) mas un job_id, y la auditoria sigue corriendo en la PC. Se
# consulta con `audit-estado <job-id>`; tambien avisa por Slack al terminar.

set -u

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SERVER="${VYSPER_HOST:-http://100.83.125.94:8080}"
USUARIO="${VYSPER_USER:-sanVysper}"
CLAVE="${VYSPER_PASS:-}"
MODO="${VYSPER_MODO:-silia}"

REPO_ARG="${1:-}"

enviar_comando() {
    local comando="$1" timeout="${2:-120}"
    curl -s --max-time "$timeout" -u "$USUARIO:$CLAVE" \
        -H 'Content-Type: application/json' \
        -d "$(python3 -c 'import json,sys; print(json.dumps({"comando": sys.argv[1]}))' "$comando")" \
        "$SERVER/comando"
}

texto_de() {
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("resultado",""))' 2>/dev/null
}

echo -e "${BLUE}🔎 Auditando tu trabajo local${NC}"
echo ""

# 1) El modo, primero: /audit se descarta en silencio si la PC no esta en
#    modo silia (mismo motivo que en revisar-pr.sh).
echo -e "${BLUE}⏳ Cambiando a modo $MODO...${NC}"
MODO_RESPONSE=$(enviar_comando "/modo $MODO" 20)
if [ -z "$MODO_RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor (timeout o sin conexión)${NC}"
    echo -e "${YELLOW}💡 Verificá Tailscale y que la app esté corriendo con --server${NC}"
    exit 1
fi

# 2) El comando. 500s de margen sobre los 480 del lado de la PC, para que
#    corte siempre el eslabón que sabe explicar por qué.
COMANDO="/audit"
[ -n "$REPO_ARG" ] && COMANDO="$COMANDO $REPO_ARG"
echo -e "${YELLOW}Comando:${NC} $COMANDO"
echo ""

RESPONSE=$(enviar_comando "$COMANDO" 500)
if [ -z "$RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor${NC}"
    exit 1
fi

TEXTO=$(echo "$RESPONSE" | texto_de)
if [ -z "$TEXTO" ]; then
    echo -e "${RED}❌ Respuesta inesperada:${NC}"
    echo "$RESPONSE"
    exit 1
fi

echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
echo "$TEXTO"
echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"

# 3) Si quedó un job corriendo, ofrecer esperar. Rechazar NO cancela nada:
#    la auditoría sigue y avisa por Slack.
JOB_ID=$(echo "$TEXTO" | python3 -c '
import re, sys
encontrado = re.search(r"/audit-estado (\S+)", sys.stdin.read())
print(encontrado.group(1) if encontrado else "")
' 2>/dev/null)

if [ -z "$JOB_ID" ]; then
    exit 0
fi

echo ""
read -r -p "¿Esperar acá a que termine? (s/N) " ESPERAR
if [ "$ESPERAR" != "s" ] && [ "$ESPERAR" != "S" ]; then
    echo -e "${BLUE}Consultá cuando quieras con:${NC} audit-estado $JOB_ID"
    exit 0
fi

# 40 x 45s = 30 min. Cada consulta es una lectura de SQLite: no cuesta nada.
for _ in $(seq 1 40); do
    sleep 45
    ESTADO_TEXTO=$(enviar_comando "/audit-estado $JOB_ID" 60 | texto_de)
    case "$ESTADO_TEXTO" in
        *"Todavía corriendo"*) echo -n "." ;;
        "") echo -n "?" ;;
        *)
            echo ""
            echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
            echo "$ESTADO_TEXTO"
            echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
            case "$ESTADO_TEXTO" in
                *"NO completó"*) exit 1 ;;
                *) exit 0 ;;
            esac
            ;;
    esac
done
echo ""
echo -e "${YELLOW}Sigue corriendo después de 30 min. Consultá con:${NC} audit-estado $JOB_ID"
