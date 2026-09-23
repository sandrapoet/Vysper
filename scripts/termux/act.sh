#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# VYSPER - Actualiza los atajos del celular (se instala como `act`)
# ============================================================
# Baja los scripts de Termux desde la PC (GET /scripts/<nombre>, ver
# stt/http_server.js) y los instala en $PREFIX/bin con nombres de una sola
# palabra, para poder invocarlos manejando sin escribir rutas:
#
#   sube   -> upload-audio.sh   (sube un audio ya grabado y genera la minuta)
#   pr     -> revisar-pr.sh     (corre /modo silia + /revisar sobre un PR)
#   apr    -> aprobar-pr.sh     (/aprobar-pr: merge gate + confirmacion)
#   pr-estado -> revisar-estado.sh (en que quedo una revision profunda que sigue corriendo)
#   audit  -> audit.sh          (audita TU trabajo local, antes del PR)
#   audit-estado -> audit-estado.sh (en que quedo una auditoria que sigue corriendo)
#   act    -> este mismo script (se actualiza solo)
#
# Cada archivo se baja a un temporal y solo se mueve al destino si la
# descarga fue completa y el resultado es un script valido. Sin eso, una
# descarga truncada o una respuesta de error (un 401 se guarda como si
# fuera el script) reemplaza un atajo que funcionaba por uno roto: ya paso
# con un pegado a mano y el fallo es dificil de reconocer -- el archivo
# arrancaba a mitad de una funcion y daba errores sin relacion aparente
# ("local: can only be used in a function", variables vacias).

SERVER="${VYSPER_HOST:-http://100.83.125.94:8080}"
USER="${VYSPER_HTTP_USER:-sanVysper}"
PASS="${VYSPER_HTTP_PASSWORD:-S@Ndra21}"
BIN="${PREFIX:-/data/data/com.termux/files/usr}/bin"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# nombre_remoto:nombre_local
ATAJOS="upload-audio.sh:sube revisar-pr.sh:pr revisar-estado.sh:pr-estado audit.sh:audit audit-estado.sh:audit-estado aprobar-pr.sh:apr act.sh:act"

echo -e "${BLUE}🔄 Actualizando atajos desde $SERVER${NC}"

mkdir -p "$BIN" || exit 1
fallos=0

# El log de curl va junto a los atajos, no a /tmp: Termux no tiene /tmp
# escribible (su temporal es $TMPDIR = .../usr/tmp) y con la ruta fija la
# redireccion fallaba con "Permission denied" ANTES de que curl arrancara --
# eso tumbaba el `if` completo, asi que TODAS las descargas se daban por
# fallidas aunque el servidor respondiera bien, y el detalle que explicaba
# por que tampoco se podia imprimir, porque salia del mismo archivo.
# $BIN sirve por construccion: es donde ya se escriben los .nuevo.
ERRLOG="$BIN/.act-curl.err"

# El listado trae el md5 de cada script (ver GET /scripts en
# stt/http_server.js): es la unica forma fiable de saber que la descarga
# llego entera. Comprobar shebang + `bash -n` no alcanza -- un script
# cortado por abajo en una frontera limpia pasa las dos cosas.
LISTADO=$(curl -fsS --connect-timeout 15 --max-time 30 -u "$USER:$PASS" "$SERVER/scripts" 2>/dev/null)

md5_esperado() {
    echo "$LISTADO" | python3 -c "import json,sys
try:
    d = json.load(sys.stdin)
    for s in d.get('scripts') or []:
        if isinstance(s, dict) and s.get('name') == '$1':
            print(s.get('md5', '')); break
except Exception:
    pass" 2>/dev/null
}

md5_local() {
    if command -v md5sum >/dev/null 2>&1; then
        md5sum "$1" | cut -d' ' -f1
    else
        python3 -c "import hashlib,sys;print(hashlib.md5(open(sys.argv[1],'rb').read()).hexdigest())" "$1" 2>/dev/null
    fi
}

for par in $ATAJOS; do
    remoto="${par%%:*}"
    local_="${par##*:}"
    tmp="$BIN/.$local_.nuevo"

    # -f: que curl falle en vez de guardar el cuerpo de un error. Sin esto un
    # 401/404 se escribe como si fuera el script y el atajo queda roto.
    if ! curl -fsS --connect-timeout 15 --max-time 120 \
        -u "$USER:$PASS" "$SERVER/scripts/$remoto" -o "$tmp" 2>"$ERRLOG"; then
        echo -e "  ${RED}✗ $local_${NC} (no se pudo bajar $remoto)"
        [ -s "$ERRLOG" ] && sed "s/^/      /" "$ERRLOG"
        rm -f "$tmp"
        fallos=$((fallos + 1))
        continue
    fi

    # Verificacion principal: el md5 que publica el servidor. Si el listado
    # no se pudo leer (o es un servidor viejo que no lo publica), se cae a la
    # comprobacion estructural, que atrapa menos pero es mejor que nada.
    esperado=$(md5_esperado "$remoto")
    if [ -n "$esperado" ]; then
        obtenido=$(md5_local "$tmp")
        if [ "$obtenido" != "$esperado" ]; then
            echo -e "  ${RED}✗ $local_${NC} (descarga incompleta: md5 no coincide; se conserva la versión anterior)"
            rm -f "$tmp"
            fallos=$((fallos + 1))
            continue
        fi
    elif ! head -c 2 "$tmp" | grep -q '^#!' || ! bash -n "$tmp" 2>/dev/null; then
        echo -e "  ${RED}✗ $local_${NC} (descarga incompleta o corrupta; se conserva la versión anterior)"
        rm -f "$tmp"
        fallos=$((fallos + 1))
        continue
    fi

    # ¿Cambio el propio act? Se anota ANTES de pisarlo: despues ya no hay
    # con que comparar.
    if [ "$remoto" = "act.sh" ] && [ -f "$BIN/$local_" ]; then
        [ "$(md5_local "$tmp")" != "$(md5_local "$BIN/$local_")" ] && ACT_CAMBIO=1
    fi

    chmod +x "$tmp"
    mv -f "$tmp" "$BIN/$local_"
    echo -e "  ${GREEN}✓ $local_${NC} ($(wc -c < "$BIN/$local_") bytes)"
done

# LA LISTA DE ATAJOS VIVE DENTRO DE ESTE ARCHIVO, asi que un act viejo solo
# conoce los atajos viejos: cuando se agrega uno nuevo en la PC, la primera
# corrida se actualiza a si mismo pero NO baja el atajo nuevo, y hace falta
# correr `act` dos veces sin que nada lo diga. Si el propio act cambio, se
# vuelve a ejecutar con la lista nueva -- una sola corrida basta siempre.
#
# ACT_REEJECUTADO corta el bucle: la segunda pasada ya no puede cambiarse a
# si misma, pero si el servidor devolviera algo inestable, esto lo frena.
if [ "${ACT_CAMBIO:-0}" = "1" ] && [ "${ACT_REEJECUTADO:-0}" != "1" ]; then
    echo -e "${BLUE}🔁 act se actualizo: repasando con la lista nueva...${NC}"
    ACT_REEJECUTADO=1 exec "$BIN/act"
fi

rm -f "$ERRLOG" 2>/dev/null

if [ "$fallos" -gt 0 ]; then
    echo -e "${RED}❌ $fallos atajo(s) no se actualizaron${NC}"
    echo -e "${YELLOW}💡 Verifica que Vysper esté abierta en la PC y Tailscale activo en ambos${NC}"
    exit 1
fi

# Si $BIN no esta en el PATH los archivos existen pero "sube" no se
# encuentra, y el mensaje de Termux ("No command sube found, did you mean:
# ...") no da ninguna pista de que el problema es el PATH y no la
# instalacion. Se comprueba y se dice como invocarlos igual.
if ! command -v sube >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Instalados en $BIN, pero ese directorio no está en tu PATH${NC}"
    echo -e "${YELLOW}   Invócalos con la ruta completa:${NC} $BIN/sube"
    exit 0
fi

echo -e "${GREEN}✅ Listos:${NC} ${BLUE}sube${NC} un audio, ${BLUE}pr${NC} revisa un PR ajeno, ${BLUE}audit${NC} audita tu trabajo local, ${BLUE}apr${NC} aprueba"
echo -e "${GREEN}   En curso:${NC} ${BLUE}pr-estado${NC} / ${BLUE}audit-estado${NC} <job-id>"
