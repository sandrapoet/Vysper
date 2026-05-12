#!/bin/bash

# Navegar al directorio 'stt' que está dentro del directorio actual (Vysper)
cd /media/san/Miscosas6/Vysper/stt || exit 1 || { echo "No se pudo acceder al directorio stt"; exit 1; }

# Ejecutar el script de configuración
./setup_vysper_stt.sh