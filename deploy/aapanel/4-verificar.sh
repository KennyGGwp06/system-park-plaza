#!/usr/bin/env bash
# PASO 4 — Verificación de la versión nueva (solo lectura). Se puede repetir cuantas veces quieras.
# Comprueba la API, la app del cliente, que cada cuenta del personal entre con usuario = clave y, si los dominios
# ya apuntan a la versión nueva, que respondan por HTTPS.
# Uso: bash deploy/aapanel/4-verificar.sh
set -u
cd "$(dirname "$0")/../.."
set -a; . ./.env.aapanel; set +a
ERP="http://127.0.0.1:${ERP_PORT}"; CLIENTE="http://127.0.0.1:${CUSTOMER_PORT}"
fallas=0
ok() { if [ "$1" = 0 ]; then echo "OK  $2"; else echo "ERR $2"; fallas=$((fallas + 1)); fi; }

curl -fsS "$ERP/api/health" | grep -q '"database":"connected"'; ok $? "API y base de datos ($ERP/api/health)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$ERP/")" = 200 ]; ok $? "ERP responde"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$CLIENTE/")" = 200 ]; ok $? "App del cliente responde"
for usuario in superadmin recepcion cocina bar limpieza mantenimiento; do
  curl -fsS -X POST "$ERP/api/auth/login" -H 'content-type: application/json' -d "{\"username\":\"$usuario\",\"password\":\"$usuario\"}" | grep -q '"token"'
  ok $? "Entra $usuario / $usuario"
done
PRODUCTOS=$(curl -fsS "$ERP/api/public/catalog" | grep -o '"salesEnabled":true' | wc -l)
[ "$PRODUCTOS" -gt 0 ]; ok $? "Carta del cliente con productos a la venta"

# ¿El dominio ya sirve la versión nueva? Se compara el archivo principal (assets/…js) del dominio con el local.
for par in "$ERP_DOMAIN|$ERP" "$CUSTOMER_DOMAIN|$CLIENTE"; do
  dominio=${par%%|*}; local_url=${par#*|}
  nuevo=$(curl -s --max-time 10 "$local_url/" | grep -o 'assets/[A-Za-z0-9_-]*\.js' | head -1)
  publico=$(curl -s --max-time 10 "https://$dominio/" | grep -o 'assets/[A-Za-z0-9_-]*\.js' | head -1)
  if [ -n "$publico" ] && [ "$publico" = "$nuevo" ]; then echo "OK  https://$dominio ya muestra la versión NUEVA"
  elif [ -n "$publico" ]; then echo "--  https://$dominio todavía muestra la versión anterior (cambia el proxy, paso 5)"
  else echo "--  https://$dominio no respondió"; fi
done
[ "$fallas" = 0 ] && echo "Todo OK" || echo "$fallas falla(s): revisa con  docker compose -f docker-compose.aapanel.yml --env-file .env.aapanel logs --tail 80 backend"
exit "$fallas"
