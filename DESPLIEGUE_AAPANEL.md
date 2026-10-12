# Subir Park Plaza v2 al servidor aaPanel (reemplazo completo, sin tumbar los demás sistemas)

Servidor: el aaPanel de producción. Hoy corre ahí la versión de septiembre de Park Plaza (carpeta
`/www/wwwroot/GA/CLIENTES/parkplaza.grupoamayo.com`, contenedores `park_plaza_*`) junto con **otros sistemas de
clientes**. **Ninguno de ellos se toca.**

## Cómo se hace sin riesgo
1. **Se revisa** el servidor (solo lectura).
2. **Se respalda** la versión anterior: base de datos, fotos, carpeta y configuración de Nginx.
3. La versión nueva se instala **en otra carpeta y con otro nombre** (`parkplaza_v2`), escuchando solo dentro del
   servidor en `127.0.0.1:18081` (ERP) y `127.0.0.1:18082` (cliente). La anterior sigue funcionando mientras tanto.
4. Se **verifica** la nueva sin que nadie la vea todavía.
5. Se **cambia el proxy** de los dominios: es cambiar un número de puerto en aaPanel. Si algo falla, se vuelve a poner
   el anterior y listo.
6. Recién entonces se **apaga** (no se borra) la versión anterior.

Nunca se ejecuta `docker system prune`, `docker compose down -v`, ni se reinicia Docker o Nginx (aaPanel solo *recarga*
la configuración de un sitio). Los otros sitios no se enteran.

| Dominio | Antes | Después |
|---|---|---|
| `parkplaza.grupoamayo.com` | ERP v1 (puerto 5173) | **ERP v2** → `127.0.0.1:18081` |
| `cliente.parkplaza.grupoamayo.com` | App del cliente v1 (4173) | **App del cliente v2** → `127.0.0.1:18082` |
| `operaciones.parkplaza.grupoamayo.com` | App de operaciones v1 (4174) | Ya no existe en v2: Limpieza y Mantenimiento entran al ERP. Se redirige al ERP. |

> Los puertos "Antes" son los de la configuración de septiembre; el paso 1 muestra los reales.

## Reemplazo completo el mismo día (lo vigente)
El dueño decidió quitar la versión anterior y dejar solo la nueva. Orden, todo en una sesión:
**1 → 2 → 3 → 4 → 5 → 6 → 8.** La versión anterior se borra recién al final, cuando la nueva ya responde en los
dominios, y queda su respaldo (paso 2). El corte que ven los usuarios es solo el instante del cambio de proxy (paso 5).

## Fotos de la carta (por qué antes no subieron)
89 de las 96 fotos de platos se subieron desde el ERP: **no están en el código ni en GitHub**, viven en el volumen de
fotos de Docker. Si solo se sube el código, la carta llega sin fotos. Este paquete las trae en `datos/uploads.tgz`
(con la base en `datos/parkplaza.dump`) y el paso 3 las carga. Verificado el 2026-10-12 instalando el zip desde cero:
96 platos y 194/194 fotos servidas por la app del cliente y el ERP. Si más adelante se suben fotos nuevas en la PC,
hay que regenerar `uploads.tgz` (ver *Opción B* en el historial de la guía o pedirlo) antes de volver a subir.

## Orden de trabajo para cada mejora
**LOCAL → GITHUB → CLAVES/RESPALDO → NUBE**: se prueba en la PC, se sube a GitHub, se respalda la nube (paso 2) y se
guardan sus claves (`.env.aapanel`), y recién entonces se despliega.

## Credenciales (sin correo)
| Usuario | Clave | Entra a |
|---|---|---|
| `superadmin` | `superadmin` | Centro de dirección (dueño) |
| `recepcion` | `recepcion` | Recepción |
| `cocina` | `cocina` | Cocina |
| `bar` | `bar` | Bar |
| `limpieza` | `limpieza` | Limpieza |
| `mantenimiento` | `mantenimiento` | Mantenimiento |

Reloj de asistencia (`/reloj`, DNI + PIN): Rosa 70000002/2222, Carlos 70000003/3333, Luis 70000004/4444, Ana 70000005/5555, Jorge 70000007/6666.
Las claves se cambian en ERP › Sistema › Usuarios (recomendado antes de operar con clientes reales).

---

## Paso 0 — Subir los archivos
Lo que hay que subir está en la PC, en `C:\Dev\Clientes\park_plaza_ejem\subir-aapanel\`:
- `parkplaza-v2.zip`: el sistema (sin `node_modules`) **con la carpeta `datos/`** (base en día cero con la carta real y las fotos).

En aaPanel › **Files** › `/www/wwwroot/GA/CLIENTES/` › **New** › carpeta **`parkplaza-v2`** › entra › **Upload** el zip ›
clic derecho › **Unzip** (ahí mismo). **No** lo descomprimas dentro de la carpeta anterior.

Desde aquí todo es en aaPanel › **Terminal**:
```bash
cd /www/wwwroot/GA/CLIENTES/parkplaza-v2
```

## Paso 1 — Revisar (no cambia nada)
```bash
bash deploy/aapanel/1-revisar-servidor.sh
```
Fíjate en:
- **Memoria libre**: conviene ≥ 1,5 GB disponibles (si no, aaPanel › Linux Tools › Swap de 2 GB).
- Los puertos **18081 y 18082 libres**.
- La sección **"A dónde apunta hoy cada dominio"**: anota los puertos `proxy_pass` actuales (servirán para volver atrás).

## Paso 2 — Respaldar la versión anterior
```bash
bash deploy/aapanel/2-respaldar-version-anterior.sh
```
Queda todo en `/www/backup/parkplaza/<fecha>/` (base, fotos, carpeta y Nginx). **Descarga esa carpeta a tu PC**
(aaPanel › Files › clic derecho › Download). Opcional: en aaPanel › Website › parkplaza › *Backup*, botón *Backup*.

## Paso 3 — Instalar la versión nueva al lado
```bash
bash deploy/aapanel/3-instalar-version-nueva.sh
```
Genera las claves internas (`.env.aapanel`), construye, levanta `parkplaza_v2-*`, carga la base y las fotos de `datos/`
y termina con la verificación. La primera vez tarda de 5 a 10 minutos. Debe terminar con **`Todo OK`** y
"los dominios SIGUEN mostrando la versión anterior" (correcto: aún no se cambió nada visible).

**Guarda las claves:** descarga `parkplaza-v2/.env.aapanel` (aaPanel › Files › Download) y guárdalo junto al respaldo.
Tiene la clave de la base de datos y el secreto de las sesiones: sin él no se puede restaurar ni reinstalar con los
mismos datos. No lo subas a GitHub.

## Paso 4 — Verificar (cuantas veces quieras)
```bash
bash deploy/aapanel/4-verificar.sh
```
Prueba la API, la app del cliente, el ingreso de las 6 cuentas y la carta.

## Paso 5 — Cambiar los dominios a la versión nueva (en aaPanel)
Para cada sitio, en aaPanel › **Website**:

**`parkplaza.grupoamayo.com` → 18081**
- Si el sitio usa la pestaña **Reverse proxy**: edita el proxy y cambia la URL destino a `http://127.0.0.1:18081` › Guardar.
- Si el proxy está escrito en **Conf**: cambia el puerto de cada `proxy_pass http://127.0.0.1:XXXX;` por `18081` › Guardar.
  (Plantilla completa, con websocket, en `deploy/aapanel/nginx-sitio.conf`.)

**`cliente.parkplaza.grupoamayo.com` → 18082**: lo mismo con `18082`.

**`operaciones.parkplaza.grupoamayo.com`**: en el sitio › **Redirect** › redirigir todo a `https://parkplaza.grupoamayo.com`
(o cambia su proxy a `18081`).

El SSL de los sitios no se toca: sigue el mismo certificado. Comprueba:
```bash
bash deploy/aapanel/4-verificar.sh     # debe decir "ya muestra la versión NUEVA" para los dos dominios
```
En el navegador: `https://parkplaza.grupoamayo.com` → usuario `superadmin`, clave `superadmin`. Si la pantalla
sale en blanco, recarga con Ctrl+F5 (caché del navegador).

## Paso 6 — Apagar la versión anterior
Solo cuando la nueva ya se ve en los dominios y la probaste:
```bash
bash deploy/aapanel/6-apagar-version-anterior.sh
```
Detiene únicamente `park_plaza_*` (no borra nada). La carpeta vieja puede quedarse unas semanas; después se puede
borrar junto con sus volúmenes, una vez descargado el respaldo del paso 2.

## Paso 8 — Borrar la versión anterior (1 o 2 semanas después)
Cuando la nueva lleva días funcionando y el respaldo del paso 2 está descargado en tu PC:
```bash
bash deploy/aapanel/8-borrar-version-anterior.sh
```
Borra solo los contenedores, volúmenes, imágenes y la carpeta de la versión de septiembre. Pide escribir `BORRAR` y se
niega si falta el respaldo, si los dominios aún no muestran la nueva o si la anterior sigue encendida. Después quita
en aaPanel › Website el sitio `operaciones.parkplaza…` si ya no lo quieres.

## Plan B — Volver atrás
```bash
bash deploy/aapanel/7-volver-atras.sh
```
y en aaPanel devuelve el proxy de cada sitio a su puerto anterior (paso 1 / respaldo `nginx/`). En segundos vuelve la
versión de septiembre, con sus datos.

---

## Después de subirlo
- **Configuración general** (ERP › Sistema): RUC, razón social, dirección fiscal y ubigeo (para boletas y facturas),
  números reales de Yape y Plin, dirección y teléfono del hotel.
- **Google en la app del cliente**: en Firebase (proyecto `logincon-936a3`) › Authentication › Settings ›
  Authorized domains, agrega `cliente.parkplaza.grupoamayo.com`.
- **Respaldos**: el servicio `backup` deja una copia diaria en `parkplaza-v2/backups/` (14 días). Conviene una tarea en
  aaPanel › Cron que copie esa carpeta fuera del servidor.
- **Volver a día cero** (borra clientes, reservas y pagos de prueba; conserva configuración, carta y fotos):
  ```bash
  docker compose -f docker-compose.aapanel.yml --env-file .env.aapanel exec backend node scripts/clean-operational-demo.js
  ```
- **Actualizar a otra versión**: sube los archivos nuevos encima de `parkplaza-v2` (sin borrar `.env.aapanel`,
  `datos/.cargado` ni `backups/`) y ejecuta
  `docker compose -f docker-compose.aapanel.yml --env-file .env.aapanel up -d --build`.
- **Ver errores**: `docker compose -f docker-compose.aapanel.yml --env-file .env.aapanel logs --tail 100 backend`.

## Facturación electrónica real
Hoy está en `SUNAT_MODE=demo` (XML UBL 2.1 con hash, CDR y PDF con QR, sin enviar a SUNAT). Para emitir de verdad se
necesita un OSE/PSE y el certificado digital del hotel; con su URL y token se pone en `.env.aapanel`
`SUNAT_MODE=beta` (pruebas) y luego `production`, y se ejecuta `up -d`.

## Problemas comunes
| Síntoma | Solución |
|---|---|
| Pantalla en blanco, 404 en `/assets/…` | En el **Conf** del sitio hay reglas de estáticos de aaPanel (`location ~ .*\.(js|css)?$`): bórralas. |
| 502 Bad Gateway | `docker compose -f docker-compose.aapanel.yml --env-file .env.aapanel ps` y `logs backend`. |
| No se actualiza "en vivo" | El proxy del sitio no pasa el websocket: usa el bloque `/socket.io/` de `nginx-sitio.conf`. |
| La cámara de Recepción no lee QR | El sitio debe abrirse con `https://`. |
| "Usuario o contraseña incorrectos" | Usuario en minúsculas (`superadmin`), sin correo. |
