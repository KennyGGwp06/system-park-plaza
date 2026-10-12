#!/usr/bin/env bash
# PLAN B — Volver a la versión anterior si algo sale mal.
#  1. Enciende de nuevo los contenedores park_plaza_* de la versión anterior (si se apagaron en el paso 6).
#  2. Te recuerda devolver el proxy de los dominios a sus puertos anteriores en aaPanel (los que mostró el paso 1 y
#     quedaron copiados en /www/backup/parkplaza/<fecha>/nginx/).
# La versión nueva NO se borra (se puede apagar con: docker compose -f docker-compose.aapanel.yml --env-file .env.aapanel stop).
# Uso: bash deploy/aapanel/7-volver-atras.sh
set -euo pipefail
for nombre in park_plaza_postgres park_plaza_backend park_plaza_frontend park_plaza_customer park_plaza_operations park_plaza_backup; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$nombre"; then docker start "$nombre" >/dev/null && echo "encendido $nombre"; fi
done
echo
echo "Ahora en aaPanel › Website › cada sitio de Park Plaza › Reverse proxy (o Config): vuelve a poner el puerto anterior"
echo "(normalmente 5173 el ERP, 4173 el cliente y 4174 operaciones). Copia exacta en /www/backup/parkplaza/<fecha>/nginx/."
