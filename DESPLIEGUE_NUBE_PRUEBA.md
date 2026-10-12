# Despliegue en la nube de prueba — guía paso a paso

**Objetivo:** subir Park Plaza a la nube de prueba, usarla 2 días con el flujo real y corregir lo que aparezca. Después, el cliente decide si se compra el VPS y el dominio.

Esta configuración (`docker-compose.production.yml`) se probó completa en la PC local el 2026-09-28, antes de escribir esta guía:
- Caddy con HTTPS;
- 2 copias del servidor repartidas por nginx;
- respaldo automático;
- datos locales restaurados;
- recorrido de todas las rutas: 0 errores;
- flujo completo de reserva a cocina: 12/12;
- carga: ~950 pedidos por segundo con 200 personas a la vez, sin errores.

---

## 1. Qué necesita el servidor de prueba
- Linux con **Docker** y **Docker Compose v2**. Se revisa con `docker compose version`.
- **Puertos 80 y 443 abiertos** a internet. Caddy los usa para obtener el certificado HTTPS.
- Al menos **2 núcleos y 4 GB de RAM** para la prueba. Para el cliente se recomiendan 4 núcleos y 8 GB.
- **Dos nombres que apunten a la IP del servidor:**
  - **Sin dominio propio**, usar sslip.io, que no requiere configurar nada: `erp.203.0.113.10.sslip.io` y `reservas.203.0.113.10.sslip.io`, reemplazando la IP de ejemplo por la del servidor. Caddy obtiene certificados reales para esos nombres.
  - **Con dominio propio**, crear dos registros A (por ejemplo `erp.` y `reservas.`) apuntando a la IP.

## 2. Copiar el proyecto
Copiar la carpeta `park_plaza_ejem` al servidor (con `git`, `scp` o un zip), **sin** `node_modules`, `dist` ni `backups`. El archivo `.dockerignore` ya los excluye de la construcción, pero no hace falta subirlos.

## 3. Crear el archivo de entorno
```bash
cp .env.production.example .env.production
# Claves al azar (cópialas dentro de .env.production):
openssl rand -base64 18   # POSTGRES_PASSWORD (y la misma en DATABASE_URL)
openssl rand -hex 48      # JWT_SECRET
```
Completa estas variables en `.env.production`:

| Variable | Qué poner |
|---|---|
| `ERP_DOMAIN`, `CUSTOMER_DOMAIN` | Los dos nombres del punto 1, sin `https://`. |
| `POSTGRES_PASSWORD` | La clave generada. |
| `DATABASE_URL` | `postgresql://park_plaza:<la misma clave>@postgres:5432/park_plaza`. |
| `JWT_SECRET` | El secreto generado. |
| `DEMO_STAFF_PASSWORD` | Clave de **al menos 12 caracteres** (ver el punto 6). |
| `BACKEND_REPLICAS` | `2`. |
| `BACKUP_KEEP_DAYS` | `14`. |
| `SUNAT_MODE` | Dejar `demo` hasta tener las credenciales. |

Revisa el archivo antes de levantar:
```bash
node scripts/production/preflight.mjs .env.production
```
Tiene que responder `"status": "PASSED"`. Si no hay Node en el servidor, revisa a mano que no quede ningún valor de ejemplo.

## 4. Levantar
```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
docker compose -f docker-compose.production.yml --env-file .env.production ps
```
Deben verse estos servicios:
- `postgres`, `frontend`, `customer`, **dos** `backend` y `caddy`;
- `backup`, que queda en marcha y guarda un respaldo al arrancar.

La primera vez tarda unos minutos, por la construcción de las imágenes y el certificado HTTPS.

## 5. Pasar los datos locales (opcional)
Para probar con los mismos datos de la PC:

1. **En la PC local**, tomar el respaldo más reciente. El servicio `park_plaza_backup` deja uno cada día en `backups/`. También se puede generar uno en el momento:
   ```bash
   docker exec park_plaza_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/local.dump'
   docker cp park_plaza_postgres:/tmp/local.dump ./local.dump
   ```
2. Subir `local.dump` al servidor.
3. **Restaurarlo en el servidor.** No hace falta apagar nada: desde 2026-09-28 cada copia detecta que la base cambió y recarga sola.
   ```bash
   P=$(docker compose -f docker-compose.production.yml --env-file .env.production ps -q postgres)
   docker cp local.dump $P:/tmp/local.dump
   docker exec $P sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges /tmp/local.dump'
   ```

Los avisos del tipo "does not exist" durante la restauración son normales.

## 6. Ingresar
- **ERP:** `https://<ERP_DOMAIN>`.
- **App del cliente:** `https://<CUSTOMER_DOMAIN>`.
- **Personal:** las cuentas de demostración (superadmin, admin, recepción, restaurante, bar, limpieza, mantenimiento `@parkplaza.com`) entran con la clave de **`DEMO_STAFF_PASSWORD`**, no con `ParkPlaza123*`. Esto aplica también a los datos traídos de la PC, porque esas cuentas no guardan su propia clave.

## 7. Comprobar que todo está conectado
1. **ERP › Control del sistema › Salud del sistema:** debe mostrar **2 copias activas** con canal compartido "Activa", y la espera del 5 % más lento por debajo de 400 ms.
2. **Tiempo real:** con dos pantallas abiertas (por ejemplo Recepción y Cocina), un pedido hecho desde la app del cliente debe aparecer sin recargar.
3. **Pruebas automáticas desde una PC con Node.** Se corren desde la raíz del proyecto:
   ```bash
   # Recorre todas las rutas con cada rol (debe dar "errores 500: 0")
   API=https://<ERP_DOMAIN>/api STAFF_PASSWORD='<DEMO_STAFF_PASSWORD>' node scripts/carga/recorrido-lecturas.mjs
   # Flujo completo cliente → dueño → limpieza, mantenimiento y cocina (12 comprobaciones)
   WEB=https://<CUSTOMER_DOMAIN> API=https://<ERP_DOMAIN>/api STAFF_PASSWORD='<DEMO_STAFF_PASSWORD>' node scripts/pruebas/flujo-completo.cjs
   ```
   El flujo completo usa el DNI 40222333, que existe en los datos locales, y crea una reserva de prueba.
4. **Carga (opcional, solo en la nube de prueba):**
   ```bash
   API=https://<ERP_DOMAIN>/api LEVELS=50,100 node scripts/carga/carga.mjs lectura 10
   ```

## 8. Durante los 2 días de prueba
- **Ver alertas del servidor:**
  ```bash
  docker compose -f docker-compose.production.yml --env-file .env.production logs backend | grep ALERTA
  ```
  Aparece una alerta si la espera del 5 % más lento pasa de 1 s o si hay errores 500.
- **Ver errores:**
  ```bash
  docker compose -f docker-compose.production.yml --env-file .env.production logs --tail 200 backend
  ```
- **Respaldos:** carpeta `backups/` del servidor, uno por día (03:00 UTC). Conviene copiarlos fuera del servidor.
- **Actualizar después de una corrección:** subir los archivos cambiados y ejecutar
  ```bash
  docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
  ```
  Las migraciones corren solas, con un candado para que las dos copias no choquen.
- **Volver atrás:** restaurar el último respaldo con el mismo comando del punto 5.

## 9. Qué se probó y qué no
- **Probado en la PC** con la misma configuración: HTTPS y redirección de http a https; reparto entre las 2 copias; tiempo real entre copias; límites de intentos con la IP real del cliente (a través de Caddy y nginx); respaldo y restauración en caliente; todas las rutas; flujo completo; carga.
- **Pendiente de probar en la nube:**
  - certificado real de Let's Encrypt (en la PC se usó el certificado interno de Caddy);
  - velocidad con la red real;
  - uso desde celulares fuera del hotel.
