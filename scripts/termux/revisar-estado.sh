#!/data/data/com.termux/files/usr/bin/bash
# pr-estado <job-id> -- en que quedo una revision profunda que quedo corriendo.
#
# El revisor con herramientas tarda 6-20 minutos y el celular no tiene canal
# de push: Termux abre su request HTTP y se va. Esta es la forma de volver a
# preguntar. La otra es Slack, que avisa solo cuando el trabajo termina.

set -u

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SERVER="${VYSPER_HOST:-http://100.83.125.94:8080}"
USUARIO="${VYSPER_USER:-sanVysper}"
CLAVE="${VYSPER_PASS:-}"

if [ $# -lt 1 ]; then
    echo -e "${YELLOW}Uso:${NC} pr-estado <job-id>"
    echo "El job-id te lo dio 'pr' cuando lanzaste la revisión."
    exit 1
fi

JOB_ID="$1"

RESPONSE=$(curl -s --max-time 90 -u "$USUARIO:$CLAVE" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"comando": "/revisar-estado " + sys.argv[1]}))' "$JOB_ID")" \
    "$SERVER/comando")

if [ -z "$RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor (timeout o sin conexión).${NC}"
    echo -e "${YELLOW}💡 Verificá Tailscale y que la app esté corriendo con --server${NC}"
    exit 1
fi

TEXTO=$(echo "$RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("resultado",""))' 2>/dev/null)
if [ -z "$TEXTO" ]; then
    echo -e "${RED}❌ Respuesta inesperada:${NC}"
    echo "$RESPONSE"
    exit 1
fi

echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
echo "$TEXTO"
echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"

# Exit code util para scripts: 2 = sigue corriendo, 1 = fallo, 0 = terminado.
case "$TEXTO" in
    *"Todavía corriendo"*) exit 2 ;;
    *"NO completó"*) exit 1 ;;
    *) exit 0 ;;
esac
