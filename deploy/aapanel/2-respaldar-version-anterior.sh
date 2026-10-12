#!/usr/bin/env bash
# Respalda la instalación anterior sin detenerla ni escribir dentro de sus contenedores.
# Compatible con los nombres explícitos park_plaza_* y parkplazagrupoamayocom-*-1.
set -euo pipefail
umask 077
ANTERIOR="${1:-/www/wwwroot/GA/CLIENTES/parkplaza.grupoamayo.com}"
VHOST=/www/server/panel/vhost
DOMINIOS=(parkplaza.grupoamayo.com cliente.parkplaza.grupoamayo.com operaciones.parkplaza.grupoamayo.com)

[ -d "$ANTERIOR" ] || { echo "ERROR: no existe la carpeta anterior: $ANTERIOR"; exit 1; }
[ -d "$VHOST/nginx" ] || { echo "ERROR: no se puede leer Nginx de aaPanel. Ejecuta con sudo."; exit 1; }
ACTIVOS=$(docker ps --format '{{.Names}}')
PARES=()
for prefijo in park_plaza parkplazagrupoamayocom; do
  if [ "$prefijo" = park_plaza ]; then
    db=park_plaza_postgres; backend=park_plaza_backend
  else
    db=parkplazagrupoamayocom-postgres-1; backend=parkplazagrupoamayocom-backend-1
  fi
  if grep -qxF "$db" <<< "$ACTIVOS" && grep -qxF "$backend" <<< "$ACTIVOS"; then
    PARES+=("$db $backend")
  fi
done
[ "${#PARES[@]}" -eq 1 ] || { echo "ERROR: debe existir una única pareja conocida de base/backend anterior en marcha."; exit 1; }
read -r DB BACKEND <<< "${PARES[0]}"
VOLUMEN=$(docker inspect -f '{{range .Mounts}}{{if and (eq .Destination "/app/uploads") (eq .Type "volume")}}{{.Name}}{{end}}{{end}}' "$BACKEND")
[ -n "$VOLUMEN" ] || { echo "ERROR: falta el volumen de fotos anterior."; exit 1; }
for dominio in "${DOMINIOS[@]}"; do
  [ -r "$VHOST/nginx/$dominio.conf" ] || { echo "ERROR: no se puede leer la configuración de $dominio. Ejecuta con sudo."; exit 1; }
done

mkdir -p /www/backup/parkplaza
DESTINO=$(mktemp -d "/www/backup/parkplaza/$(date +%F_%H%M%S).XXXXXX")
trap 'echo "ERROR: respaldo incompleto; no se ha habilitado su uso. Revisa $DESTINO"' ERR
echo "Respaldo en $DESTINO"
echo "Base anterior: $DB; backend anterior: $BACKEND"
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' > "$DESTINO/contenedores.txt"
docker inspect -f '{{.Name}} {{json .Mounts}}' "$DB" "$BACKEND" > "$DESTINO/montajes.txt"

docker exec "$DB" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DESTINO/base-anterior.dump"
[ -s "$DESTINO/base-anterior.dump" ]
docker exec -i "$DB" pg_restore -l < "$DESTINO/base-anterior.dump" > /dev/null
echo "OK base de datos"
docker exec "$BACKEND" tar czf - -C /app/uploads . > "$DESTINO/fotos-anteriores.tgz"
tar tzf "$DESTINO/fotos-anteriores.tgz" > /dev/null
echo "OK fotos ($VOLUMEN)"
tar czf "$DESTINO/carpeta-anterior.tgz" --exclude='node_modules' --exclude='*/node_modules' -C "$(dirname "$ANTERIOR")" "$(basename "$ANTERIOR")"
tar tzf "$DESTINO/carpeta-anterior.tgz" > /dev/null
echo "OK carpeta anterior"

# Busca también por ruta: el proxy puede contener solo un puerto, sin el dominio.
for area in nginx rewrite cert; do
  [ -d "$VHOST/$area" ] || continue
  lista="$DESTINO/.lista-$area"
  find "$VHOST/$area" -type f \( -name '*parkplaza.grupoamayo.com*' -o -path '*/parkplaza.grupoamayo.com/*' -o -path '*/cliente.parkplaza.grupoamayo.com/*' -o -path '*/operaciones.parkplaza.grupoamayo.com/*' \) -print0 > "$lista"
  while IFS= read -r -d '' archivo; do
    relativo="${archivo#"$VHOST/"}"
    mkdir -p "$DESTINO/$(dirname "$relativo")"
    cp -p -- "$archivo" "$DESTINO/$relativo"
  done < "$lista"
  rm -- "$lista"
done
for dominio in "${DOMINIOS[@]}"; do [ -s "$DESTINO/nginx/$dominio.conf" ]; done
echo "OK configuración Nginx y archivos asociados de Park Plaza"
(
  cd "$DESTINO"
  find . -type f ! -name SHA256SUMS ! -name RESPALDO_COMPLETO -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS
)
date -Iseconds > "$DESTINO/RESPALDO_COMPLETO"
echo "RESPALDO COMPLETO: $DESTINO"
echo "Contiene configuración y credenciales privadas. Descárgalo a tu PC; no lo publiques en GitHub."
