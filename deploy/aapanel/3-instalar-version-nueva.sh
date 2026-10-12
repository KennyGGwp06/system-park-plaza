#!/usr/bin/env bash
# PASO 3 — Instala Park Plaza v2 AL LADO de la versión anterior. No toca la anterior, ni los demás sitios, ni el Nginx.
#  - Crea .env.aapanel con claves aleatorias si no existe (proyecto parkplaza_v2, puertos 127.0.0.1:18081 y 18082).
#  - Construye y levanta los contenedores (parkplaza_v2-*).
#  - La primera vez carga los datos preparados en la PC: datos/parkplaza.dump (base en día cero con la carta real)
#    y datos/uploads.tgz (fotos). Si no están, arranca con la carta completa y venta pausada.
#  - Comprueba que responde y que el superadmin puede entrar.
# Uso (dentro de la carpeta nueva): bash deploy/aapanel/3-instalar-version-nueva.sh
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
ENV_FILE=.env.aapanel
C="docker compose -f docker-compose.aapanel.yml --env-file $ENV_FILE"

if [ ! -f "$ENV_FILE" ]; then
  cp .env.aapanel.example "$ENV_FILE"
  CLAVE_DB=$(openssl rand -hex 18); JWT=$(openssl rand -hex 48); RESPALDO=$(openssl rand -hex 12)
  sed -i "s|REEMPLAZAR_CON_CLAVE_ALEATORIA_DE_24_CARACTERES|$CLAVE_DB|; s|REEMPLAZAR_CON_CLAVE_URL_ENCODED|$CLAVE_DB|; s|REEMPLAZAR_CON_SECRETO_ALEATORIO_DE_64_CARACTERES|$JWT|; s|REEMPLAZAR_CON_CLAVE_TEMPORAL_SEGURA_DE_16_CARACTERES|$RESPALDO|" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Creado $ENV_FILE con claves aleatorias. Dominios: $(grep -E '^(ERP|CUSTOMER)_DOMAIN=' "$ENV_FILE" | tr '\n' ' ')"
fi
set -a; . "./$ENV_FILE"; set +a
[ "${COMPOSE_PROJECT_NAME:-}" = parkplaza_v2 ] || { echo "ERROR: COMPOSE_PROJECT_NAME debe ser parkplaza_v2; no se toca otro proyecto."; exit 1; }
[ "$(realpath "$PWD")" != /www/wwwroot/GA/CLIENTES/parkplaza.grupoamayo.com ] || { echo "ERROR: ejecuta el instalador en la carpeta nueva, no en la anterior."; exit 1; }

for puerto in "$ERP_PORT" "$CUSTOMER_PORT"; do
  if ss -ltnp 2>/dev/null | grep -qE "[:.]${puerto}[[:space:]]"; then
    ocupantes=$(docker ps --filter "publish=$puerto" -q)
    [ -n "$ocupantes" ] || { echo "ERROR: el puerto $puerto lo usa otro programa."; exit 1; }
    for contenedor in $ocupantes; do
      proyecto=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$contenedor")
      [ "$proyecto" = "$COMPOSE_PROJECT_NAME" ] || { echo "ERROR: el puerto $puerto pertenece a otro proyecto ($proyecto)."; exit 1; }
    done
  fi
done
LIBRE_MB=$(free -m | awk '/^Mem:/{print $7}')
[ "${LIBRE_MB:-0}" -lt 1200 ] && echo "AVISO: quedan ${LIBRE_MB} MB libres; la construcción puede ir lenta. Si falla, activa swap en aaPanel › Linux Tools."

docker run --rm -v "$PWD":/app:ro -w /app node:22-alpine node scripts/production/preflight.mjs "$ENV_FILE" aapanel
$C config --quiet

echo "Construyendo y levantando (la primera vez tarda varios minutos)…"
$C up -d --build

esperar() { for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:${ERP_PORT}/api/health" >/dev/null 2>&1 && return 0; sleep 5; done; echo "ERROR: el sistema no respondió en 5 minutos. Revisa: $C logs --tail 80 backend"; exit 1; }
esperar

if [ -f datos/parkplaza.dump ] && [ ! -f datos/.cargado ]; then
  echo "Cargando la base preparada en la PC…"
  [ -s datos/uploads.tgz ] || { echo "ERROR: falta datos/uploads.tgz; no se carga una base con fotos incompletas."; exit 1; }
  [ -s datos/SHA256SUMS ] || { echo "ERROR: falta datos/SHA256SUMS; no se importa un paquete sin verificación."; exit 1; }
  (cd datos && sha256sum -c SHA256SUMS)
  $C stop backend backup
  P=$($C ps -q postgres)
  docker cp datos/parkplaza.dump "$P":/tmp/parkplaza.dump
  docker exec "$P" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error /tmp/parkplaza.dump'
  docker exec "$P" rm -f /tmp/parkplaza.dump
  if [ -f datos/uploads.tgz ]; then
    docker run --rm -v "${COMPOSE_PROJECT_NAME}_uploads_data":/datos -v "$PWD/datos":/entrada:ro alpine sh -c 'tar xzf /entrada/uploads.tgz -C /datos'
    echo "Fotos cargadas."
  fi
  $C start backend backup
  esperar
  bash deploy/aapanel/4-verificar.sh
  date -Iseconds > datos/.cargado
fi

bash deploy/aapanel/4-verificar.sh
echo
echo "La versión nueva ya funciona en 127.0.0.1:${ERP_PORT} (ERP) y 127.0.0.1:${CUSTOMER_PORT} (cliente)."
echo "Los dominios SIGUEN mostrando la versión anterior hasta que cambies el proxy en aaPanel (paso 5 de la guía)."
