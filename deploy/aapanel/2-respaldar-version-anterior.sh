#!/usr/bin/env bash
# PASO 2 — Respaldo completo de la versión anterior ANTES de cambiar nada. No la detiene ni la modifica.
# Guarda en /www/backup/parkplaza/<fecha>/:
#   base-anterior.dump   copia de la base de datos (pg_dump) del contenedor park_plaza_postgres
#   fotos-anteriores.tgz las fotos subidas (volumen montado en /app/uploads del backend anterior)
#   carpeta-anterior.tgz la carpeta del sistema anterior, sin node_modules
#   nginx/               la configuración de los sitios de Park Plaza en aaPanel
#   contenedores.txt     el estado de Docker en este momento
# Uso: bash deploy/aapanel/2-respaldar-version-anterior.sh [/carpeta/de/la/version/anterior]
set -euo pipefail
umask 077
ANTERIOR="${1:-/www/wwwroot/GA/CLIENTES/parkplaza.grupoamayo.com}"
DESTINO="/www/backup/parkplaza/$(date +%F_%H%M%S)"
mkdir -p "$DESTINO/nginx"
echo "Respaldo en $DESTINO"

docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' > "$DESTINO/contenedores.txt"

if docker ps --format '{{.Names}}' | grep -qx park_plaza_postgres; then
  docker exec park_plaza_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/anterior.dump'
  docker cp park_plaza_postgres:/tmp/anterior.dump "$DESTINO/base-anterior.dump"
  docker exec park_plaza_postgres rm -f /tmp/anterior.dump
  echo "OK base de datos: $(du -h "$DESTINO/base-anterior.dump" | cut -f1)"
else
  echo "ERROR: no hay un contenedor park_plaza_postgres en marcha; respaldo incompleto. Revisa el paso 1."; exit 1
fi

VOLUMEN=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' park_plaza_backend 2>/dev/null || true)
if [ -n "$VOLUMEN" ]; then
  docker run --rm -v "$VOLUMEN":/datos:ro -v "$DESTINO":/salida alpine tar czf /salida/fotos-anteriores.tgz -C /datos .
  echo "OK fotos ($VOLUMEN): $(du -h "$DESTINO/fotos-anteriores.tgz" | cut -f1)"
else
  echo "ERROR: no se encontró el volumen de fotos; respaldo incompleto."; exit 1
fi

if [ -d "$ANTERIOR" ]; then
  tar czf "$DESTINO/carpeta-anterior.tgz" --exclude='node_modules' --exclude='*/node_modules' -C "$(dirname "$ANTERIOR")" "$(basename "$ANTERIOR")"
  echo "OK carpeta: $(du -h "$DESTINO/carpeta-anterior.tgz" | cut -f1)"
else
  echo "ERROR: no existe $ANTERIOR; respaldo incompleto."; exit 1
fi

for archivo in $(grep -rlis "parkplaza" /www/server/panel/vhost/nginx/ 2>/dev/null); do
  mkdir -p "$DESTINO/nginx/$(dirname "${archivo#/www/server/panel/vhost/nginx/}")"
  cp "$archivo" "$DESTINO/nginx/${archivo#/www/server/panel/vhost/nginx/}"
done
echo "OK configuración Nginx: $(find "$DESTINO/nginx" -type f | wc -l) archivo(s)"
[ "$(find "$DESTINO/nginx" -type f | wc -l)" -gt 0 ] || { echo "ERROR: faltan las configuraciones Nginx."; exit 1; }
(cd "$DESTINO" && sha256sum base-anterior.dump fotos-anteriores.tgz carpeta-anterior.tgz > SHA256SUMS)
date -Iseconds > "$DESTINO/RESPALDO_COMPLETO"

echo; ls -lh "$DESTINO"; echo
echo "Listo. Descarga también esta carpeta a tu PC (aaPanel › Files › $DESTINO › Download)."
