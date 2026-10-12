#!/usr/bin/env bash
# PASO 8 (definitivo, 1 o 2 semanas después) — Borra la versión de septiembre para liberar espacio.
# Candados: exige que exista el respaldo del paso 2, que los dominios ya muestren la versión nueva, que la versión
# anterior esté apagada (paso 6) y que escribas BORRAR. Solo elimina:
#   - los contenedores park_plaza_* (frontend, customer, operations, backend, postgres, backup);
#   - los volúmenes que esos contenedores usaban (base y fotos de la versión anterior);
#   - las imágenes que solo usaba la versión anterior;
#   - la carpeta anterior (por defecto /www/wwwroot/GA/CLIENTES/parkplaza.grupoamayo.com).
# No toca parkplaza_v2-*, ni otros contenedores, volúmenes o carpetas del servidor. No usa "prune".
# Uso: bash deploy/aapanel/8-borrar-version-anterior.sh [/carpeta/anterior]
set -euo pipefail
cd "$(dirname "$0")/../.."
ANTERIOR="${1:-/www/wwwroot/GA/CLIENTES/parkplaza.grupoamayo.com}"
NOMBRES="park_plaza_frontend park_plaza_customer park_plaza_operations park_plaza_backend park_plaza_backup park_plaza_postgres"

RESPALDO=$(ls -d /www/backup/parkplaza/*/ 2>/dev/null | tail -1 || true)
if [ -z "$RESPALDO" ] || [ ! -s "${RESPALDO}base-anterior.dump" ]; then echo "No encuentro el respaldo del paso 2 (/www/backup/parkplaza/<fecha>/base-anterior.dump). Hazlo primero."; exit 1; fi
if ! bash deploy/aapanel/4-verificar.sh | grep -q "ya muestra la versión NUEVA"; then echo "Los dominios todavía no muestran la versión nueva. No se borra nada."; exit 1; fi
for nombre in $NOMBRES; do
  if docker ps --format '{{.Names}}' | grep -qx "$nombre"; then echo "$nombre sigue encendido: ejecuta primero el paso 6."; exit 1; fi
done
case "$ANTERIOR" in */parkplaza-v2|*/parkplaza-v2/) echo "Esa es la carpeta de la versión NUEVA. No se borra."; exit 1;; esac

EXISTEN=$(for nombre in $NOMBRES; do docker ps -a --format '{{.Names}}' | grep -x "$nombre" || true; done)
VOLUMENES=$(for nombre in $EXISTEN; do docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}' "$nombre"; done | tr ' ' '\n' | grep -v '^$' | sort -u)
IMAGENES=$(for nombre in $EXISTEN; do docker inspect -f '{{.Image}}' "$nombre"; done | sort -u)
echo "Respaldo encontrado: $RESPALDO"
echo "Se borrarán:"
echo "  contenedores: ${EXISTEN:-ninguno}" | tr '\n' ' '; echo
echo "  volúmenes:    ${VOLUMENES:-ninguno}" | tr '\n' ' '; echo
echo "  carpeta:      $ANTERIOR $( [ -d "$ANTERIOR" ] && du -sh "$ANTERIOR" | cut -f1)"
read -r -p "Escribe BORRAR para confirmar: " respuesta
[ "$respuesta" = "BORRAR" ] || { echo "Cancelado. No se borró nada."; exit 1; }

for nombre in $EXISTEN; do docker rm "$nombre" >/dev/null && echo "contenedor $nombre eliminado"; done
for volumen in $VOLUMENES; do
  if [ -z "$(docker ps -a --filter volume="$volumen" -q)" ]; then docker volume rm "$volumen" >/dev/null && echo "volumen $volumen eliminado"; else echo "volumen $volumen lo usa otro contenedor: se conserva"; fi
done
for imagen in $IMAGENES; do
  if [ -z "$(docker ps -a --filter ancestor="$imagen" -q)" ]; then docker rmi "$imagen" >/dev/null 2>&1 && echo "imagen ${imagen:7:12} eliminada" || echo "imagen ${imagen:7:12} en uso: se conserva"; fi
done
[ -d "$ANTERIOR" ] && rm -rf "$ANTERIOR" && echo "carpeta $ANTERIOR eliminada"
echo "Listo. La versión anterior se borró; su respaldo sigue en $RESPALDO."
