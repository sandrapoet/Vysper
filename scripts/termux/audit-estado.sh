#!/data/data/com.termux/files/usr/bin/bash
# audit-estado <job-id> -- en qué quedó una auditoría que dejaste corriendo.

set -u

RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SERVER="${VYSPER_HOST:-http://100.83.125.94:8080}"
USUARIO="${VYSPER_USER:-sanVysper}"
CLAVE="${VYSPER_PASS:-}"

if [ $# -lt 1 ]; then
    echo -e "${YELLOW}Uso:${NC} audit-estado <job-id>"
    echo "El job-id te lo dio 'audit' cuando lanzaste la auditoría."
    exit 1
fi

RESPONSE=$(curl -s --max-time 90 -u "$USUARIO:$CLAVE" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"comando": "/audit-estado " + sys.argv[1]}))' "$1")" \
    "$SERVER/comando")

if [ -z "$RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor (timeout o sin conexión).${NC}"
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

# 2 = sigue corriendo, 1 = falló, 0 = terminado.
case "$TEXTO" in
    *"Todavía corriendo"*) exit 2 ;;
    *"NO completó"*) exit 1 ;;
    *) exit 0 ;;
esac
