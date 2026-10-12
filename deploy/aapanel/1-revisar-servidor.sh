#!/usr/bin/env bash
# PASO 1 — Revisión del servidor. SOLO LEE: no detiene, no borra ni cambia nada.
# Muestra memoria y disco, los contenedores en marcha, la versión anterior de Park Plaza (park_plaza_*), los puertos
# que usaría la nueva versión y a qué puerto apunta hoy cada dominio de Park Plaza en el Nginx de aaPanel.
# Uso: bash deploy/aapanel/1-revisar-servidor.sh
set -u
linea() { printf '\n== %s ==\n' "$1"; }

linea "Servidor"
uname -srm; [ -f /etc/os-release ] && . /etc/os-release && echo "$PRETTY_NAME"
free -h | sed -n '1,3p'
df -h / /www 2>/dev/null | sort -u

linea "Docker"
docker --version 2>/dev/null || echo "FALTA Docker (aaPanel › App Store › Docker)"
docker compose version 2>/dev/null || echo "FALTA Docker Compose v2"

linea "Contenedores en marcha (todos los sistemas del servidor)"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null

linea "Versión anterior de Park Plaza"
docker ps -a --filter name=park_plaza_ --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null
docker ps -a --filter name=parkplaza_v2 --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | sed 's/^/(nueva) /'

linea "Puertos que usará la versión nueva (deben estar LIBRES o ser de parkplaza_v2)"
for puerto in 18081 18082; do
  if ss -ltnp 2>/dev/null | grep -qE "[:.]${puerto}[[:space:]]"; then echo "$puerto OCUPADO:"; ss -ltnp | grep -E "[:.]${puerto}[[:space:]]"; else echo "$puerto libre"; fi
done

linea "A dónde apunta hoy cada dominio de Park Plaza (Nginx de aaPanel)"
for archivo in $(grep -rlis "parkplaza" /www/server/panel/vhost/nginx/ 2>/dev/null); do
  echo "-- $archivo"; grep -nE "server_name|proxy_pass|root " "$archivo" | sed 's/^/   /'
done

linea "Listo"
echo "Nada se modificó. Envía esta salida si algo no coincide con la guía (DESPLIEGUE_AAPANEL.md)."
