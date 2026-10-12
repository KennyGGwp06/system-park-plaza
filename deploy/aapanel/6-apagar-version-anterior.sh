#!/usr/bin/env bash
# PASO 6 — Apaga (NO borra) la versión anterior, solo cuando los dominios ya muestran la nueva y la probaste.
# Detiene únicamente los contenedores park_plaza_* (la versión de septiembre). Sus datos quedan en sus volúmenes y
# en el respaldo del paso 2; con 7-volver-atras.sh se encienden de nuevo en segundos.
# No usa "down", "rm" ni "prune": no toca imágenes, volúmenes ni contenedores de otros sistemas.
# Uso: bash deploy/aapanel/6-apagar-version-anterior.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! bash deploy/aapanel/4-verificar.sh | grep -q "ya muestra la versión NUEVA"; then
  echo "Los dominios todavía no muestran la versión nueva. Cambia primero el proxy en aaPanel (paso 5)."; exit 1
fi
ANTERIORES=$(docker ps --format '{{.Names}}' | grep -E '^park_plaza_(frontend|customer|operations|backend|postgres|backup)$' || true)
[ -z "$ANTERIORES" ] && { echo "No hay contenedores de la versión anterior en marcha."; exit 0; }
echo "Se detendrán: $ANTERIORES"
for nombre in park_plaza_frontend park_plaza_customer park_plaza_operations park_plaza_backend park_plaza_backup park_plaza_postgres; do
  echo "$ANTERIORES" | grep -qx "$nombre" && docker stop "$nombre" >/dev/null && echo "detenido $nombre"
done
echo "Listo. La versión anterior quedó apagada (sus datos siguen guardados)."
