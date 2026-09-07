#!/data/data/com.termux/files/usr/bin/bash

# ============================================================
# VYSPER - /revisar de un PR desde el celular
# ============================================================
# Menu de eleccion rapida pensado para usarse manejando: cada paso es un
# solo tap de numero (sin ENTER, salvo el numero de PR que si lo necesita).
# ENTER solo (sin digitar nada) siempre toma la opcion por defecto marcada
# con "*".
#
# Tambien admite modo no interactivo (para un widget/atajo de Termux con
# el texto ya armado), pasando los mismos argumentos de antes:
#   ./revisar-pr.sh [<alias-repo>:]<numero-pr> [--profundo|--arq|--security] [--diablo] [--force]
#   ./revisar-pr.sh agent:42 --profundo
#   ./revisar-pr.sh https://github.com/Silia-mx/Agent/pull/42
#
# Requisitos:
#   - Tailscale activo (misma cuenta que la PC).
#   - La app Vysper en la PC debe estar corrida con --server y en modo
#     "silia" o "system-design" (si no, el comando se descarta sin aviso;
#     este script cambia el modo automaticamente antes de /revisar).
#   - python3 -- Termux NO lo trae instalado por defecto, instalalo una vez
#     con `pkg install python -y`. Se usa para armar/parsear JSON de forma
#     segura (el reporte de /revisar puede traer comillas, backslashes,
#     etc. que un parseo con grep/sed rompe).

SERVER="http://100.83.125.94:8080"
USER="sanVysper"
PASS='S@Ndra21'
MODO="silia"                # modo requerido para que /revisar no se descarte en silencio
TIMEOUT=320                 # el server da hasta 300s (5 min) al CLI de Cerebro

# Repos disponibles, en el orden en que se numeran en el menu. Agrega aqui
# cualquier otro repo de Silia-mx que revises seguido (mismo indice en
# ambos arrays).
REPO_NAMES=(agent silia skills)
REPO_VALUES=(Silia-mx/Agent Silia-mx/silia Silia-mx/Skills)
DEFAULT_REPO_INDEX=1   # 1-based, coincide con REPO_NAMES[0]

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Sin esto, cada "$(... | python3 -c ...)" de abajo falla en silencio
# (command not found) y el script sigue con variables vacias -- por
# ejemplo arma "{\"comando\": }" (JSON invalido, sin el valor) y lo manda
# igual, y el servidor lo rechaza con un error confuso en vez de este
# mensaje claro.
if ! command -v python3 >/dev/null 2>&1; then
    echo -e "${RED}❌ Falta python3 (Termux no lo trae instalado por defecto)${NC}"
    echo -e "${YELLOW}💡 Instálalo una sola vez con:${NC} pkg install python -y"
    exit 1
fi

# Envia un comando de texto a POST /comando y devuelve el body crudo de la
# respuesta (o vacio si no hubo respuesta / hubo timeout).
enviar_comando() {
    local comando="$1"
    local max_time="$2"
    curl -s --connect-timeout 15 --max-time "$max_time" \
        -u "$USER:$PASS" \
        -H "Content-Type: application/json" \
        -d "$(printf '{"comando": %s}' "$(printf '%s' "$comando" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
        "$SERVER/comando"
}

# Lee un solo digito sin esperar ENTER. ENTER solo (cadena vacia) devuelve
# el default. Vuelve a preguntar si el digito no esta en el rango 1..$2.
leer_opcion() {
    local prompt="$1" maximo="$2" default="$3" key
    while true; do
        read -rsn1 -p "$prompt" key
        echo "" >&2
        if [ -z "$key" ]; then
            echo "$default"
            return
        fi
        if [[ "$key" =~ ^[0-9]$ ]] && [ "$key" -ge 1 ] && [ "$key" -le "$maximo" ]; then
            echo "$key"
            return
        fi
        echo -e "${RED}   Opcion invalida, intenta de nuevo${NC}" >&2
    done
}

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       🔍 VYSPER - /revisar PR  🔍${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$1" ]; then
    # ------------------------------------------------------------
    # Modo no interactivo (widget/atajo con argumentos ya armados)
    # ------------------------------------------------------------
    PR_ARG="$1"
    shift
    FLAGS="$*"

    if [[ "$PR_ARG" =~ ^https?:// ]]; then
        PR_URL="$PR_ARG"
    elif [[ "$PR_ARG" =~ ^([a-zA-Z0-9_-]+):([0-9]+)$ ]]; then
        ALIAS="${BASH_REMATCH[1],,}"
        PR_NUM="${BASH_REMATCH[2]}"
        REPO=""
        for i in "${!REPO_NAMES[@]}"; do
            [ "${REPO_NAMES[$i]}" = "$ALIAS" ] && REPO="${REPO_VALUES[$i]}"
        done
        if [ -z "$REPO" ]; then
            echo -e "${RED}❌ Alias de repo desconocido: $ALIAS${NC}"
            echo -e "${YELLOW}   Alias disponibles: ${REPO_NAMES[*]}${NC}"
            exit 1
        fi
        PR_URL="https://github.com/$REPO/pull/$PR_NUM"
    else
        REPO="${REPO_VALUES[$((DEFAULT_REPO_INDEX - 1))]}"
        PR_URL="https://github.com/$REPO/pull/$PR_ARG"
    fi

    COMANDO="/revisar $PR_URL"
    [ -n "$FLAGS" ] && COMANDO="$COMANDO $FLAGS"
else
    # ------------------------------------------------------------
    # Menu de eleccion rapida (interactivo)
    # ------------------------------------------------------------
    echo -e "${BOLD}Repo:${NC}"
    for i in "${!REPO_NAMES[@]}"; do
        n=$((i + 1))
        marca=""
        [ "$n" -eq "$DEFAULT_REPO_INDEX" ] && marca=" *"
        echo "  $n) ${REPO_NAMES[$i]}$marca"
    done
    REPO_IDX=$(leer_opcion "Elige (ENTER = *): " "${#REPO_NAMES[@]}" "$DEFAULT_REPO_INDEX")
    REPO="${REPO_VALUES[$((REPO_IDX - 1))]}"
    echo -e "${GREEN}✅ Repo:${NC} $REPO"
    echo ""

    while true; do
        read -rp "Numero de PR: " PR_NUM
        [[ "$PR_NUM" =~ ^[0-9]+$ ]] && break
        echo -e "${RED}   Solo digitos, intenta de nuevo${NC}"
    done
    echo ""

    echo -e "${BOLD}Profundidad:${NC}"
    echo "  1) basico *"
    echo "  2) profundo"
    echo "  3) arq"
    echo "  4) security"
    MODE_IDX=$(leer_opcion "Elige (ENTER = *): " 4 1)
    case "$MODE_IDX" in
        2) MODE_FLAG="--profundo" ;;
        3) MODE_FLAG="--arq" ;;
        4) MODE_FLAG="--security" ;;
        *) MODE_FLAG="" ;;
    esac
    echo ""

    echo -e "${BOLD}Pasada adversarial (--diablo)?${NC}"
    echo "  1) No *"
    echo "  2) Si"
    DIABLO_IDX=$(leer_opcion "Elige (ENTER = *): " 2 1)
    [ "$DIABLO_IDX" = "2" ] && DIABLO_FLAG="--diablo" || DIABLO_FLAG=""
    echo ""

    PR_URL="https://github.com/$REPO/pull/$PR_NUM"
    COMANDO="/revisar $PR_URL"
    [ -n "$MODE_FLAG" ] && COMANDO="$COMANDO $MODE_FLAG"
    [ -n "$DIABLO_FLAG" ] && COMANDO="$COMANDO $DIABLO_FLAG"
fi

echo -e "${YELLOW}Comando:${NC} $COMANDO"
echo ""

# 1. Cambiar de modo primero -- /revisar se descarta en silencio si la PC
#    no esta en modo silia/system-design (ver README, seccion /comando).
echo -e "${BLUE}⏳ Cambiando a modo $MODO...${NC}"
MODO_RESPONSE=$(enviar_comando "/modo $MODO" 20)

if [ -z "$MODO_RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor al cambiar de modo (timeout o sin conexión)${NC}"
    echo -e "${YELLOW}💡 Verifica Tailscale y que la app este corriendo con --server${NC}"
    exit 1
fi

MODO_OK=$(echo "$MODO_RESPONSE" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print("true" if d.get("ok") else "false")
except Exception:
    print("parse-error")')

if [ "$MODO_OK" != "true" ]; then
    echo -e "${RED}❌ No se pudo cambiar a modo $MODO:${NC}"
    echo "$MODO_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error",""))' 2>/dev/null || echo "$MODO_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ $(echo "$MODO_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("resultado",""))')${NC}"
echo ""

# 2. Ahora si, /revisar
echo -e "${BLUE}⏳ Enviando /revisar (puede tardar varios minutos)...${NC}"

RESPONSE=$(enviar_comando "$COMANDO" "$TIMEOUT")

if [ -z "$RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor (timeout o sin conexión)${NC}"
    echo -e "${YELLOW}💡 Verifica Tailscale y que la app este en modo silia/system-design${NC}"
    exit 1
fi

OK=$(echo "$RESPONSE" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print("true" if d.get("ok") else "false")
except Exception:
    print("parse-error")')

if [ "$OK" = "true" ]; then
    echo -e "${GREEN}✅ Revision completada${NC}"
    echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
    echo "$RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("resultado",""))'
    echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
elif [ "$OK" = "parse-error" ]; then
    echo -e "${RED}❌ Respuesta inesperada del servidor:${NC}"
    echo "$RESPONSE"
    exit 1
else
    echo -e "${RED}❌ Error del servidor:${NC}"
    echo "$RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error",""))' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
