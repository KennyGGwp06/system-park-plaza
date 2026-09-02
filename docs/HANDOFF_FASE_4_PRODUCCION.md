# Park Plaza ERP — cierre de fase 4 y preparación de producción

Fecha: 1 de septiembre de 2026

## Resultado

El repositorio quedó preparado para construir y ejecutar conjuntamente:

- ERP interno de Super Admin, Recepción, Restaurante y Bar;
- experiencia del cliente;
- sistema de operaciones de Limpieza y Mantenimiento;
- API Node.js con tiempo real;
- PostgreSQL;
- almacenamiento persistente de imágenes;
- proxy público con HTTPS automático.

La fase deja el sistema **listo para el corte a un servidor**, pero no lo publica sin autorización ni inventa dominios o credenciales. El encendido público requiere la IP del servidor y tres nombres DNS reales.

## Arquitectura de producción

```text
Internet
   |
   | 80 / 443
   v
Caddy — HTTPS automático y cabeceras de seguridad
   |-- erp.dominio       -> frontend interno
   |-- reservas.dominio  -> experiencia del cliente
   `-- operaciones.dominio -> limpieza/mantenimiento
                                 |
                                 v
                          API privada :3000
                                 |
                                 v
                         PostgreSQL privado :5432
```

La API y PostgreSQL ya no publican puertos al exterior en `docker-compose.production.yml`.

## Archivos agregados

- `.dockerignore`: excluye `.env`, dependencias, builds, cargas y material local del contexto Docker.
- `.env.production.example`: plantilla sin credenciales reales.
- `Caddyfile`: tres dominios, HTTPS, compresión y cabeceras de seguridad.
- `docker-compose.production.yml`: composición aislada con healthchecks, red privada, volúmenes y rotación de logs.
- `scripts/production/preflight.mjs`: valida dominios, secretos, conexión PostgreSQL y archivos requeridos.
- `scripts/production/backup-database.ps1`: genera respaldo PostgreSQL en formato restaurable.
- `scripts/production/restore-database.ps1`: restaura únicamente con confirmación explícita.

## Seguridad aplicada

### Secretos e imágenes Docker

- Los archivos `.env` ya no entran al contexto ni a la imagen del backend.
- Se inspeccionó la imagen construida y no se encontraron archivos `.env`.
- Producción no inicia con `JWT_SECRET` ausente.
- Producción no inicia con `ParkPlaza123*` ni con una contraseña temporal menor a 12 caracteres.
- CORS en producción solo acepta los tres dominios configurados; localhost queda limitado al desarrollo.
- La API reconoce correctamente al proxy para límites por IP.
- Los logs de contenedores rotan para no llenar el disco.
- El backend atiende `SIGTERM` y `SIGINT`, cierra HTTP, Socket.IO y PostgreSQL antes de salir.

### Contraseñas individuales

Se corrigió el flujo de usuarios:

- un trabajador nuevo requiere una contraseña temporal propia;
- **Restablecer acceso** abre un formulario para elegir una nueva clave;
- la contraseña se almacena con `scrypt`, salt aleatorio y hash de 64 bytes;
- la clave anterior deja de funcionar inmediatamente;
- ni la lista de usuarios, ni login, ni `/auth/me` devuelven el hash;
- las cuentas antiguas conservan temporalmente `DEMO_STAFF_PASSWORD` hasta que Super Admin restablezca su acceso una por una.

Antes de abrir el sistema al público, Super Admin debe restablecer las credenciales de todas las cuentas heredadas.

## Persistencia

La composición utiliza cuatro volúmenes:

- `postgres_data`: datos del ERP e inventario;
- `uploads_data`: imágenes de carta, portadas, habitaciones y evidencias;
- `caddy_data`: certificados TLS;
- `caddy_config`: estado del proxy.

Recrear un contenedor no elimina estos datos. No se debe ejecutar `docker compose down --volumes` en producción.

## Rendimiento de la experiencia del cliente

El bundle principal anterior era de aproximadamente 579 kB. Se configuró separación automática:

- aplicación: ~102 kB;
- Firebase: ~152 kB;
- interfaz React/Lucide: ~206 kB;
- animación: ~70 kB;
- tiempo real: ~42 kB;
- vendor restante: ~7 kB.

La compilación ya no genera la advertencia de chunk superior a 500 kB.

## Validaciones ejecutadas

### Construcción

- Backend Docker: construido.
- ERP interno Docker: construido.
- Experiencia del cliente Docker: construida.
- Operaciones Docker: construida.
- Build local de los tres frontends: correcto.
- Nginx de los tres frontends: sintaxis correcta.
- Caddy: configuración válida.
- Docker Compose de producción: configuración válida.
- `git diff --check`: sin errores de parche.

### Ejecución real aislada

Se levantó un proyecto Docker desechable separado de los datos actuales:

- PostgreSQL: saludable;
- backend: saludable y reportando modo `production`;
- ERP: saludable;
- cliente: saludable;
- operaciones: saludable;
- `/api/health` respondió a través de los tres frontends;
- no se publicaron API ni PostgreSQL al host.

### Credenciales

Se verificaron 9 condiciones:

- login de Super Admin;
- listado seguro de trabajadores;
- ningún `passwordHash` expuesto;
- cambio individual de contraseña de Restaurante;
- rechazo de la clave anterior;
- aceptación de la nueva clave;
- respuesta segura de login;
- salud por los tres proxys;
- hash persistido únicamente en backend.

### Datos e inventario

- solicitudes de insumos: **10/10**;
- transferencias: **10/10**;
- respaldo PostgreSQL: correcto;
- restauración del respaldo: correcta sobre la base desechable.

Los contenedores y volúmenes de prueba se eliminaron al terminar. Quedó un respaldo desechable ignorado por Git en `backups/phase4-test`; puede borrarse manualmente sin afectar el ERP.

## Procedimiento para el servidor real

Requisitos recomendados para el piloto:

- Ubuntu Server actual;
- 2 vCPU como mínimo;
- 4 GB de RAM como mínimo;
- 40 GB de disco SSD o más;
- Docker Engine y Docker Compose;
- puertos públicos 80 y 443;
- tres registros DNS tipo A apuntando a la IP del servidor.

### 1. Preparar variables

```powershell
Copy-Item .env.production.example .env.production
```

Editar `.env.production` y reemplazar todos los valores. No subir ese archivo a Git.

### 2. Verificación previa

```powershell
npm run prod:preflight
npm run prod:config
```

Ambos comandos deben finalizar correctamente.

### 3. Construir

```powershell
npm run prod:build
```

### 4. Iniciar

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up -d --wait
```

### 5. Verificar

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail 100 backend caddy
```

Abrir los tres dominios y comprobar el certificado HTTPS.

## Respaldo

```powershell
./scripts/production/backup-database.ps1
```

El archivo se guarda en `backups/`. Debe copiarse además a otro equipo o almacenamiento externo. Un respaldo que permanece únicamente en el mismo servidor no protege contra pérdida del servidor.

## Restauración

La restauración reemplaza datos y exige confirmación explícita:

```powershell
./scripts/production/restore-database.ps1 -BackupFile ./backups/park-plaza-FECHA.dump -ConfirmDatabaseRestore
```

Primero debe ensayarse en un servidor de prueba.

## Comprobaciones antes de la presentación/piloto

1. Reemplazar dominios y secretos.
2. Crear respaldo inicial.
3. Restablecer la contraseña de cada trabajador heredado.
4. Configurar los dominios autorizados en Firebase para el acceso con Google.
5. Subir una imagen de carta y una portada; reiniciar backend y confirmar que continúan visibles.
6. Ejecutar un pedido de cliente hasta entrega y descuento de inventario.
7. Ejecutar una solicitud de limpieza y otra de mantenimiento hasta cierre.
8. Probar desde un celular fuera de la red del hotel.

## Límites que deben explicarse correctamente

- El flujo Yape/Plin actual representa la experiencia y registra el pago en el ERP, pero todavía no confirma automáticamente una transacción contra una pasarela bancaria. Para cobrar público real se debe integrar un proveedor como Culqi, Niubiz u otro contratado por el hotel.
- Google/Firebase necesita que los dominios definitivos sean autorizados en su consola.
- El HTTPS automático solo puede emitirse cuando los DNS reales apunten al servidor y los puertos 80/443 estén disponibles.
- El archivo `.env.production` debe crearse directamente en el servidor; no debe enviarse por chat ni guardarse en el repositorio.

## Estado final de la reestructuración

Las cuatro fases planeadas quedan implementadas en el repositorio. El siguiente trabajo ya no es otra fase de reestructuración: es el **corte controlado al servidor real**, seguido por prueba del dueño y correcciones surgidas del uso diario.
