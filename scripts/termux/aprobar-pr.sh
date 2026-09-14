#!/data/data/com.termux/files/usr/bin/bash

# ============================================================
# VYSPER - /aprobar-pr de un PR desde el celular
# ============================================================
# Mismo patron que revisar-pr.sh (menu de un tap por paso, pensado para
# usarse manejando), con un paso mas: /aprobar-pr --merge se resuelve en
# DOS envios. El primero aprueba y corre el MERGE GATE -- las pruebas
# sobre base+head YA mergeados, que es otra pregunta que la del CI del PR:
# un PR verde contra una base de hace tres dias puede romper la base de
# hoy. Recien con esa evidencia en pantalla se pregunta si mergear, y el
# "si" viaja en un segundo envio.
#
# Por eso el gate corre ANTES de la pregunta y no despues: preguntar,
# recibir el si y recien entonces fallar es peor que no preguntar.
#
# Modo no interactivo (widget/atajo de Termux con el texto ya armado):
#   ./aprobar-pr.sh [<alias-repo>:]<numero-pr> [--merge] [--tag] [--revisar]
#   ./aprobar-pr.sh agent:2321 --merge
#   ./aprobar-pr.sh https://github.com/Silia-mx/Agent/pull/2321 --merge
# En modo no interactivo con --merge, la confirmacion SIGUE pidiendose por
# pantalla: este script nunca manda el "si" solo.
#
# Requisitos:
#   - Tailscale activo (misma cuenta que la PC).
#   - La app Vysper en la PC corriendo con --server (este script pone el
#     modo silia solo).
#   - python3 (`pkg install python -y`).

SERVER="${VYSPER_HOST:-http://100.83.125.94:8080}"
USER="${VYSPER_HTTP_USER:-sanVysper}"
PASS="${VYSPER_HTTP_PASSWORD:-S@Ndra21}"
MODO="silia"
# El CLI de Cerebro tiene 480s para /aprobar-pr (ver APROBAR_PR_TIMEOUT_MS
# en cerebro.service.js): el merge gate paga worktree + merge + las suites
# del repo. 500 deja al servidor cortar primero, que sabe explicar por que.
TIMEOUT=500

REPO_NAMES=(agent silia skills)
REPO_VALUES=(Silia-mx/Agent Silia-mx/silia Silia-mx/Skills)
DEFAULT_REPO_INDEX=1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

if ! command -v python3 >/dev/null 2>&1; then
    echo -e "${RED}❌ Falta python3 (Termux no lo trae instalado por defecto)${NC}"
    echo -e "${YELLOW}💡 Instálalo una sola vez con:${NC} pkg install python -y"
    exit 1
fi

enviar_comando() {
    local comando="$1"
    local max_time="$2"
    curl -s --connect-timeout 15 --max-time "$max_time" \
        -u "$USER:$PASS" \
        -H "Content-Type: application/json" \
        -d "$(printf '{"comando": %s}' "$(printf '%s' "$comando" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
        "$SERVER/comando"
}

# Lee "ok"/"fallo" del body. Son dos cosas distintas: ok=el comando llego y
# se ejecuto, fallo=se ejecuto pero su resultado es un error. Colapsarlas
# hacia anunciar exito encima de un traceback.
leer_estado() {
    echo "$1" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    if not d.get("ok"):
        print("false")
    else:
        print("fallo" if d.get("fallo") else "true")
except Exception:
    print("parse-error")'
}

leer_resultado() {
    echo "$1" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("resultado", ""))
except Exception:
    pass'
}

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
echo -e "${BLUE}       ✅ VYSPER - /aprobar-pr  ✅${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$1" ]; then
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

    COMANDO="/aprobar-pr $PR_URL"
    [ -n "$FLAGS" ] && COMANDO="$COMANDO $FLAGS"
    [[ "$FLAGS" == *"--merge"* || "$FLAGS" == *"--tag"* ]] && PIDE_CONFIRMACION=1 || PIDE_CONFIRMACION=0
else
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

    echo -e "${BOLD}Que hacer:${NC}"
    echo "  1) solo aprobar *"
    echo "  2) aprobar y mergear"
    echo "  3) aprobar, mergear y taguear"
    ACCION_IDX=$(leer_opcion "Elige (ENTER = *): " 3 1)
    case "$ACCION_IDX" in
        2) ACCION_FLAGS="--merge"; PIDE_CONFIRMACION=1 ;;
        3) ACCION_FLAGS="--merge --tag"; PIDE_CONFIRMACION=1 ;;
        *) ACCION_FLAGS=""; PIDE_CONFIRMACION=0 ;;
    esac
    echo ""

    PR_URL="https://github.com/$REPO/pull/$PR_NUM"
    COMANDO="/aprobar-pr $PR_URL"
    [ -n "$ACCION_FLAGS" ] && COMANDO="$COMANDO $ACCION_FLAGS"
fi

echo -e "${YELLOW}Comando:${NC} $COMANDO"
echo ""

# 1. Modo silia primero: sin esto el comando se descarta EN SILENCIO.
echo -e "${BLUE}⏳ Cambiando a modo $MODO...${NC}"
MODO_RESPONSE=$(enviar_comando "/modo $MODO" 20)

if [ -z "$MODO_RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor al cambiar de modo (timeout o sin conexión)${NC}"
    echo -e "${YELLOW}💡 Verifica Tailscale y que la app este corriendo con --server${NC}"
    exit 1
fi

if [ "$(leer_estado "$MODO_RESPONSE")" != "true" ]; then
    echo -e "${RED}❌ No se pudo cambiar a modo $MODO:${NC}"
    echo "$MODO_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✅ $(leer_resultado "$MODO_RESPONSE")${NC}"
echo ""

# 2. Turno 1: aprueba y corre el merge gate. Puede tardar: las suites del
#    repo corren de verdad sobre el merge, no es solo una llamada a la API.
echo -e "${BLUE}⏳ Aprobando y corriendo el merge gate (las pruebas del merge, puede tardar)...${NC}"
RESPONSE=$(enviar_comando "$COMANDO" "$TIMEOUT")

if [ -z "$RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor (timeout o sin conexión)${NC}"
    echo -e "${YELLOW}💡 Verifica Tailscale y que la app este en modo silia${NC}"
    exit 1
fi

ESTADO=$(leer_estado "$RESPONSE")
RESULTADO=$(leer_resultado "$RESPONSE")

echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
echo "$RESULTADO"
echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"

if [ "$ESTADO" = "fallo" ]; then
    # Bloqueo por checks NO requeridos en rojo: Cerebro devuelve en el
    # propio texto la linea acotada, ya armada con los nombres exactos de
    # los rojos que acaba de listar. Se ofrece reintentar con ESA linea --
    # nunca con el flag en bloque, que es el que se tragaba los rojos que
    # nadie miro (silia#2426: cuatro rojos, uno visto, tres a staging).
    #
    # El reintento es UNO solo y a mano alzada: si vuelve a bloquear por
    # otro motivo, se sale. Un loop aca seria una forma elegante de
    # insistir hasta que pase, que es exactamente lo contrario del punto.
    SUGERENCIA=$(printf '%s' "$RESULTADO" | grep -o -- '--ignorar-checks "[^"]*"' | head -1)
    if [ -n "$SUGERENCIA" ] && [ "$REINTENTO" != "1" ]; then
        CUANTOS=$(printf '%s' "$SUGERENCIA" | sed 's/.*"\(.*\)"/\1/' | awk -F',' '{print NF}')
        echo ""
        echo -e "${YELLOW}⚠️  Bloqueado por $CUANTOS check(s) en rojo que NO son requeridos.${NC}"
        echo -e "${YELLOW}   Leelos arriba antes de decidir: si alguno es real, aqui se cuela.${NC}"
        echo ""
        echo -e "${BOLD}Reintentar ignorando ESOS $CUANTOS y solo esos?${NC}"
        echo "  1) No, salir *"
        echo "  2) Si, reintentar"
        RETRY_IDX=$(leer_opcion "Elige (ENTER = *): " 2 1)
        if [ "$RETRY_IDX" = "2" ]; then
            REINTENTO=1
            COMANDO="$COMANDO $SUGERENCIA"
            echo -e "${YELLOW}Comando:${NC} $COMANDO"
            echo -e "${BLUE}⏳ Reintentando...${NC}"
            RESPONSE=$(enviar_comando "$COMANDO" "$TIMEOUT")
            if [ -z "$RESPONSE" ]; then
                echo -e "${RED}❌ Sin respuesta del servidor al reintentar${NC}"
                exit 1
            fi
            ESTADO=$(leer_estado "$RESPONSE")
            RESULTADO=$(leer_resultado "$RESPONSE")
            echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
            echo "$RESULTADO"
            echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
        fi
    fi
fi

if [ "$ESTADO" = "fallo" ]; then
    echo -e "${RED}❌ No se aprobo/mergeo (mira el detalle de arriba)${NC}"
    exit 1
elif [ "$ESTADO" != "true" ]; then
    echo -e "${RED}❌ Respuesta inesperada del servidor:${NC}"
    echo "$RESPONSE"
    exit 1
fi

if [ "$PIDE_CONFIRMACION" != "1" ]; then
    echo -e "${GREEN}✅ Listo${NC}"
    exit 0
fi

# 3. Turno 2: la confirmacion. Nunca se manda sola -- el gate ya paso, pero
#    mergear es la accion irreversible y la decide una persona.
echo ""
echo -e "${BOLD}Confirmar la accion del PR?${NC}"
echo "  1) No *"
echo "  2) Si, adelante"
CONF_IDX=$(leer_opcion "Elige (ENTER = *): " 2 1)

if [ "$CONF_IDX" != "2" ]; then
    CANCEL_RESPONSE=$(enviar_comando "no" 60)
    echo -e "${YELLOW}Cancelado: $(leer_resultado "$CANCEL_RESPONSE")${NC}"
    exit 0
fi

echo -e "${BLUE}⏳ Confirmando...${NC}"
CONF_RESPONSE=$(enviar_comando "si" "$TIMEOUT")

if [ -z "$CONF_RESPONSE" ]; then
    echo -e "${RED}❌ Sin respuesta del servidor al confirmar${NC}"
    echo -e "${YELLOW}💡 La confirmacion pudo haber llegado igual -- revisa el PR en GitHub antes de reintentar${NC}"
    exit 1
fi

echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"
leer_resultado "$CONF_RESPONSE"
echo -e "${BLUE}───────────────────────────────────────────────────────${NC}"

if [ "$(leer_estado "$CONF_RESPONSE")" = "true" ]; then
    echo -e "${GREEN}✅ Listo${NC}"
else
    echo -e "${RED}❌ La confirmacion no se completo${NC}"
    exit 1
fi
