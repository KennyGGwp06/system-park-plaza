# Auditoría de escalabilidad — Park Plaza (2026-09-28)

**Pregunta del dueño:** ¿el sistema aguanta cuando haya mucho flujo de clientes, o se cae?

**Respuesta corta: hoy NO es escalable.** Funciona bien con pocas personas y pocos datos. Pero tiene un techo fijo de capacidad y, peor aún, **se vuelve más lento cada día que se usa**, aunque no haya más clientes. Con unos 3 meses de operación normal colapsa. El problema no está en la app del cliente ni en las pantallas del ERP: está en **cómo el servidor guarda los datos**. Tiene arreglo, y el arreglo es conocido.

---

## 1. Cómo se midió

- Se clonó la base real en una copia aparte (`pp_carga`) y se levantó un servidor de prueba sobre ella. **La base real no se tocó**; la copia se borró al terminar.
- Un script simuló clientes simultáneos: viendo el catálogo, las habitaciones y los cupos, entrando a "Mis reservas" y enviando solicitudes. Cada "usuario" del script pide sin pausa, así que representa a varias personas reales.
- Después se infló la copia con **90 días de operación**: 40 reservas, 150 pedidos y 1 200 registros de auditoría por día. Hoy la auditoría ya suma 1 563 registros con muy poco uso.
- Todo corrió en esta misma PC (Docker + Postgres 16).

## 2. Resultados

### Con los datos de hoy (0,66 MB)

| Personas pidiendo a la vez | Pedidos atendidos por segundo | Espera típica | Espera del 5 % más lento |
|---|---|---|---|
| 1 | 31 | 0,03 s | 0,05 s |
| 10 | 42 | 0,23 s | 0,28 s |
| 50 | 44 | 0,97 s | 1,8 s |
| 100 | 50 | 1,8 s | 3,5 s |
| 200 | 35 | 4,8 s | 8,9 s |

- **Techo de lecturas: unos 45 pedidos por segundo para TODO el sistema.** Con más gente no se atiende más: solo crece la espera.
- **Techo de escrituras: unas 9 por segundo para TODO el hotel.** Una escritura es una reserva, un pago, un pedido, una solicitud, una marcación o cualquier cambio del personal. Con 50 escrituras a la vez, cada una espera unos 5,8 s.
- Por la forma de trabajar, no hubo reservas duplicadas ni datos corruptos: todo se hace en fila. Eso es lo bueno. Lo malo es que la fila es una sola.

### Con 90 días de datos acumulados (43 MB)

| Prueba | Resultado |
|---|---|
| 1 persona viendo el catálogo o las habitaciones | **2,2 s por pantalla** |
| 1 persona creando una solicitud o reserva | **~10 s** |
| 10 personas a la vez | 17–21 s de espera |
| 50 personas a la vez | **83 % de los pedidos se caen** (más de 30 s sin respuesta) |
| 10 escrituras a la vez | **80 % se caen** |
| Memoria del servidor | 1,1 GB (pico de 1,3 GB). Con más meses se acerca al límite de Node y el proceso se puede caer |

**Conclusión:** el sistema no se cae por tener muchos clientes un día. Se cae porque **cada día guarda más historia en el mismo lugar** y cada pedido la carga entera.

---

## 3. Por qué pasa (causas, de mayor a menor peso)

### C1 · Todo el hotel vive en UNA sola fila de la base de datos (crítico)
`app_state` es una sola fila JSON con reservas, pagos, pedidos, pases, auditoría, asistencia, personal y clientes. Está en `server/src/db.js`.
- **Cada lectura** (`readState`) abre una transacción, **bloquea la fila** (`SELECT … FOR UPDATE`) y descarga el JSON completo. Por eso dos personas no pueden ni siquiera *mirar* al mismo tiempo: esperan su turno. De ahí sale el techo de ~45 por segundo.
- **Cada escritura** (`mutateState`) bloquea la fila, copia el JSON completo en memoria (`structuredClone`), lo compara con el inventario y **reescribe los 0,66 MB** (43 MB a los 3 meses) para guardar un solo cambio. De ahí sale el techo de ~9 por segundo.
- El servidor usa `readState` en 86 lugares y `mutateState` en 100. No hay índices ni consultas por cliente o por fecha: para ver "Mis reservas" de un cliente se carga y se recorre la historia de todo el hotel.

### C2 · La historia crece sin fin (crítico)
Nada se archiva. La auditoría (265 KB hoy, el 40 % del total), las reservas terminadas, los pedidos y las marcaciones se quedan para siempre dentro de la misma fila. **El costo de cada pedido crece cada día**, aunque tengas los mismos clientes.

### C3 · Cada pedido con sesión lee el sistema DOS veces (alto)
Tanto la verificación del cliente (`clientAuth`) como la del personal (`staffAuth`) llaman a `readState` antes que la propia pantalla. Así, "Mis reservas" hace dos lecturas completas con bloqueo.

### C4 · Las pantallas del ERP se refrescan en cadena (alto)
- Cada bloque de datos del ERP (`client/src/hooks/useFetch.js`, 112 usos) **pregunta al servidor cada 5 segundos**, aunque nada haya cambiado. Un equipo con una pantalla abierta hace de 3 a 5 consultas cada 5 s, y cada una lee todo con bloqueo.
- Además, **cada cambio de cualquier persona** se avisa a **todas** las pantallas conectadas (`io.emit("state:changed")`), y todas vuelven a pedir todo. Con 15 pantallas del personal abiertas, **una sola reserva provoca unas 60 lecturas completas**.
- Solo el personal ya consume buena parte del techo antes de que entre un solo cliente.

### C5 · La app del cliente pregunta cada 8 segundos (medio)
Cada cliente con sesión pide "Mis reservas" cada 8 s (`customer/src/app/main.js`). Cada consulta hace 2 lecturas completas. Con 100 clientes con la app abierta son unas 25 lecturas completas por segundo, más de la mitad del techo.

### C6 · No se puede poner un segundo servidor (medio)
Aunque se pague más máquina, hoy no sirve poner más copias del servidor:
- La fila única seguiría siendo una sola fila (C1).
- Los avisos en tiempo real (socket.io) viven en la memoria de un solo proceso.
- Las fotos subidas se guardan en una carpeta local.
- El límite de intentos de acceso vive en memoria.
- Hay un solo proceso Node y ninguna copia de respaldo. Si se reinicia, todo el hotel queda sin sistema mientras vuelve.

### C7 · Detalles menores
- El catálogo público (igual para todos) se recalcula y se lee con bloqueo en cada visita, sin caché (`Cache-Control: no-store` en toda la API).
- Las claves y PIN se verifican con `scryptSync`, que congela el servidor unos milisegundos por cada ingreso.
- No hay medición de tiempos de respuesta ni alertas: el hotel se entera de la lentitud cuando los clientes se quejan.

## 4. Lo que SÍ está bien (no hay que rehacerlo)
- La app del cliente es liviana (47 KB comprimida) y se sirve como archivos estáticos: aguanta miles de visitas sin esfuerzo.
- Postgres 16 es una base de datos que aguanta millones de registros si se usa con tablas e índices.
- **El inventario ya se pasó a tablas propias** (`inventory_*`). Ese es el camino, y el patrón ya existe en el código.
- Consistencia: hoy es imposible vender dos veces la misma habitación. Hay que conservarlo al cambiar.
- Ya hay Caddy (HTTPS + compresión), Docker con reinicio automático y scripts de respaldo de la base.

---

## 5. Plan recomendado

### Fase 0 · Quitar el freno (2–3 días, sin cambiar pantallas)
1. **Lecturas sin bloqueo:** `readState` pasa a lectura simple (sin `FOR UPDATE`). El cierre del día de asistencia se mueve al vigilante que ya corre cada minuto.
2. **Copia en memoria:** el servidor guarda la última versión leída y solo vuelve a la base cuando algo cambió (se compara `updated_at`). Las lecturas pasan de cientos de milisegundos a 1–2 ms.
3. **Una sola lectura por pedido:** la verificación del cliente o del personal reutiliza el estado que ya leyó la pantalla.
4. **Auditoría fuera del JSON:** a su propia tabla, con índice por fecha. Es el 40 % del peso y la parte que más crece.
5. **Avisos con destino:** el aviso de cambio dice qué módulo cambió y solo va al personal. El sondeo cada 5 s pasa a 30 s como respaldo.
6. **Catálogo público en caché** de 15–30 s.

Resultado esperado: el techo de lecturas pasa de ~45 a varios cientos por segundo, y el crecimiento deja de pesar en las lecturas. **Las escrituras siguen en fila**, y el JSON sigue creciendo por reservas y pedidos. Es un alivio, no la solución final.

### Fase 1 · Tablas de verdad (3–5 semanas, por partes y con pruebas)
Pasar lo que más crece y más se consulta a tablas con índices, igual que ya se hizo con el inventario:
1. Reservas (hospedaje y experiencias), pases y derechos de acceso.
2. Pagos y comprobantes.
3. Pedidos de cocina y bar.
4. Solicitudes, tareas de limpieza y mantenimiento.
5. Clientes, asistencia y marcaciones.

Cada escritura bloquea solo lo que toca (esa habitación, ese turno de piscina), no todo el hotel. Así la regla de "no vender dos veces lo mismo" se conserva y las escrituras pueden ocurrir en paralelo. En `app_state` queda solo la configuración, que es pequeña y casi no cambia. Las reservas terminadas se archivan por mes.

### Fase 2 · Infraestructura para crecer (1 semana, cuando el hotel salga a internet)
- 2 o más copias del servidor detrás de Caddy. Avisos en tiempo real con Redis. Fotos en almacenamiento externo. Límite de intentos en Redis.
- Pool de conexiones (PgBouncer), respaldos automáticos diarios fuera del equipo y alojamiento en un servidor en la nube (VPS), no en una PC del hotel.
- Medición de tiempos y alertas: aviso si la espera pasa de 1 s o si hay errores.
- **Prueba de carga como requisito** antes de cada entrega grande. El script de esta auditoría se puede reutilizar.

### Meta de escalabilidad propuesta
Con 300 clientes con la app abierta, 30 pantallas del personal y 3 años de historia:
- 95 % de las pantallas en menos de 0,5 s.
- Al menos 50 reservas o pedidos por segundo.
- 0 errores.
- Memoria del servidor estable (que no crezca con la historia).

---

## 6. Archivos clave
- `server/src/db.js`: `readState`, `mutateState`, fila única `app_state`.
- `server/src/index.js`: 86 `readState` y 100 `mutateState`; `clientAuth` y `staffAuth` (línea ~2364); aviso `io.emit("state:changed")` (línea ~162); endpoints públicos (líneas 334–600).
- `server/src/audit-chain.js`: la auditoría se agrega al JSON (`unshift`) y nunca se archiva.
- `client/src/hooks/useFetch.js`: sondeo cada 5 s y recarga ante cualquier cambio.
- `customer/src/app/main.js`: sondeo de "Mis reservas" cada 8 s.
- Scripts de la prueba: `scripts/carga/carga.mjs` (escenarios `lectura`, `cliente`, `escritura`, `mixto`; `LEVELS=1,10,50`) y `scripts/carga/inflar.mjs <días>` (solo toca la base `pp_carga`). Procedimiento:
  1. En el contenedor de Postgres: `pg_dump -Fc` de la base real, `createdb pp_carga` y `pg_restore` dentro de ella.
  2. Levantar un servidor de prueba con `PORT=3100` y `DATABASE_URL=…/pp_carga`.
  3. Correr `node scripts/carga/carga.mjs lectura 10` desde la raíz.
  4. Al terminar, `dropdb pp_carga`.

---

## 7. Fase 0 — HECHA (2026-09-28, mismo día)

### Qué se cambió
1. **Lecturas sin bloqueo + copia en memoria** (`server/src/db.js`):
   - `readState` ya no bloquea la fila: consulta solo `version` (~1 ms).
   - Si la versión no cambió, responde con la copia en memoria. Si cambió, la descarga una sola vez aunque lleguen muchos pedidos juntos.
   - La copia está **congelada**: ningún módulo puede modificarla al leer (antes esos cambios se perdían en silencio; ahora darían error y se ven).
2. **Versión automática** (migración `018_app_state_version_audit_log`): un disparador de Postgres sube `version` en cada escritura, venga de donde venga: `mutateState`, compras, traslados, recetas o scripts.
3. **Auditoría en su propia tabla** (`audit_log`, índices por fecha y por código):
   - El mismo disparador archiva los registros nuevos y deja en el JSON solo los 200 más recientes.
   - `GET /api/auditoria` (5 000 más recientes; hasta 20 000 con `?limit=`) y la verificación de la cadena firmada leen la tabla.
   - El historial de cada reserva combina lo reciente con lo archivado.
4. **Escrituras más livianas**:
   - `mutateState` reutiliza la copia en memoria en vez de volver a descargar el JSON.
   - Deja lo recién guardado como nueva copia, así el siguiente lector no vuelve a la base.
   - El cierre automático de la jornada de ayer pasó al vigilante de cada minuto (antes lo intentaba cada lectura).
5. **Avisos en tiempo real agrupados**:
   - Los cambios de 250 ms se envían en un solo aviso.
   - Ingresar, identificarse y la vista previa de un QR ya no avisan (no cambian nada).
   - En el ERP (`client/src/hooks/useFetch.js`), con el tiempo real conectado el sondeo de respaldo baja a uno cada 30 s como mucho, y las recargas por aviso se reparten entre 0,3 y 0,8 s.
6. **Catálogo público en caché**: se arma una vez por versión y dura hasta 20 s.
7. Corrección que destapó el congelado: `ensureOrderDeadlines` (`order-operations.js`) modificaba los pedidos al leerlos. Ahora devuelve una copia.

### Resultado medido (servidor dentro de Docker, igual que en producción)
| | Antes | Fase 0 |
|---|---|---|
| Lecturas por segundo (máximo) | ~45 | **~650–720** |
| Espera típica con 200 personas a la vez | 4,8 s | **0,26 s** |
| Espera del 5 % más lento con 200 personas | 8,9 s | **0,34 s** |
| Escrituras por segundo (datos de hoy) | ~9 | ~14 |
| Mixto (1 de cada 10 es escritura), 100 personas | — | ~150 pedidos/s, 0 errores |
| ERP del dueño sin actividad, 20 s | varias consultas cada 5 s | **0 consultas** |
| Peso del estado (base real) | 661 KB | **467 KB** (1 563 registros de auditoría a su tabla) |

### Con historia acumulada (sigue siendo el límite)
| Días simulados | Tamaño del JSON | Lecturas/s | Escritura |
|---|---|---|---|
| 0 (hoy) | 0,47 MB | ~700 | ~70 ms |
| 30 | 9,6 MB | ~38 | ~0,8 s |
| 90 | 26 MB (antes 54 MB, la auditoría ya no está) | ~15 | ~2,6 s |

Las lecturas ya no esperan turno. Pero **cada pantalla sigue recorriendo el historial completo** (la disponibilidad revisa todas las reservas pasadas) y **cada escritura sigue reescribiendo todo el JSON**. Al ritmo simulado (40 reservas y 150 pedidos al día), el margen dura **semanas, no meses**. La **Fase 1 (tablas para reservas, pagos, pedidos y solicitudes) es obligatoria** antes de abrir al público con volumen real.

### Verificación
- Recorrido de todas las rutas de lectura (`scripts/carga/recorrido-lecturas.mjs`): 1 080 lecturas, 113 rutas, 7 roles del personal + cliente, **0 errores**, en la copia y en el sistema real.
- Flujo de punta a punta `e2e-conexion.cjs`: **12/12**, en la copia y en el sistema real. En el real creó la reserva de prueba RES-0151 y las tareas LIM-0086, SOL-0109 y PED-0030.
- Pruebas del servidor: `realtime-update`, `rbac-security`, `stabilization`, `phase2-operations`, `stock-requests`, `order-inventory` y `operational-inventory` **pasan**.
- Cadena firmada de auditoría verificada sobre la tabla: intacta.
- Respaldo previo de la base real: `backups/antes-fase0-2026-09-28.dump`.

---

## 8. Fase 1 — HECHA (2026-09-28): estado operativo + historial en tablas

### Idea
En vez de reescribir unas 600 referencias del servidor (semanas de trabajo y mucho riesgo), el estado en memoria guarda **solo lo vivo**. Lo cerrado y antiguo pasa a la tabla `history_records`, con índices por fecha, cliente y código.
- Las pantallas del día a día trabajan sobre lo vivo, cuyo tamaño depende de la capacidad del hotel y no de su historia.
- Los reportes que miran el pasado piden solo el rango que usan y reciben los datos con la misma forma de siempre, así que sus cálculos no cambiaron.

### Reglas de archivo (`server/src/history.js`)
Ante la duda, un registro se queda en el estado.
- Se archiva solo lo **cerrado**, cuya última fecha es anterior a **ayer** y que no tiene **saldo por cobrar**:
  - reservas finalizadas, canceladas o no-show;
  - eventos finalizados o cancelados;
  - pedidos entregados o cancelados;
  - solicitudes resueltas y tareas finalizadas;
  - ingresos a piscina finalizados;
  - pagos que no están pendientes;
  - movimientos de inventario (son una copia del kardex).
- Lo que cuelga de algo vivo sigue vivo:
  - los pagos, pases, derechos de acceso y pedidos de una reserva activa;
  - la reserva de una estadía activa;
  - el pase de un acceso vivo.
- Las marcas técnicas (`repairedAt`, cierres automáticos) no cuentan como fecha.
- Un vigilante archiva **al arrancar y cada minuto**, y solo escribe si hay algo que archivar.

### Cómo se lee la historia

| Pantalla / ruta | Qué trae del historial |
|---|---|
| Inicio del dueño y ocupación de recepción | Solo su período, el período anterior y la serie diaria (`ownerHomeWindow`) |
| Listado de reservas (dueño y recepción) | Su rango (N días más el período anterior); "todas" trae todo |
| Reservas de Piscina, Mirador, Terraza y Eventos | Últimos **90 días** (o `?from=&to=`) |
| Listas de pagos, eventos, pedidos, solicitudes, tareas de recepción, accesos, caja, devoluciones y movimientos de inventario | Últimos **90 días** (o `?from=&to=`) |
| Planilla semanal y torre de control | Su semana o sus N días (evidencia de trabajo) |
| Directorio de clientes | Todo (guardado 30 s) |
| Perfil del cliente, "Mis reservas" del cliente y comprobantes | Todo lo de **ese cliente** (índice por cliente) |
| Detalle de una reserva e inventario de un pedido | Ese registro y lo de su cliente |
| Estaciones de cocina, bar y limpieza; disponibilidad; habitaciones; recepción del día | Solo lo vivo |

**Acciones sobre algo archivado:** cobrar, confirmar, reprogramar o cancelar una reserva antigua, o facturar un pago antiguo, primero lo devuelve al estado junto con sus pagos, pases y accesos. Si sigue cerrado, el vigilante lo archiva otra vez.

### Resultado medido
Con 90 días de operación simulada, los mismos datos para ambas fases y el servidor corriendo dentro de Docker:

| | Fase 0 | **Fase 1** |
|---|---|---|
| Tamaño del estado en memoria | ~26 MB, y creciendo | **0,5 MB** (26 522 + 5 504 registros pasaron al historial) |
| Lecturas por segundo | 32 | **469** |
| Espera del 5 % más lento, con 100 personas a la vez | 11,7 s | **0,23 s** |
| Escrituras (reservas, pagos, pedidos) por segundo | 1, y el 54 % se cae con 50 personas | **37, 0 errores** (31 ms con 1 persona) |
| Mixto, con 50 personas | 7 pedidos/s | **94 pedidos/s, 0 errores** |
| Inicio del dueño, 7 días | 0,64 s | **0,09 s** |

**Conclusión: el sistema ya no se degrada con la historia.** Con 90 días de datos rinde como con 0 días. El techo ahora depende de cuánto tiene el hotel en curso, no de los meses acumulados.

### Verificación
- **Comparación ruta por ruta** (`scripts/carga/comparar-rutas.mjs`) entre Fase 0 y Fase 1 con los mismos datos: 670 respuestas iguales. Las diferencias son las esperadas:
  - las listas operativas (cocina, limpieza, check-in, pases en la ficha del cliente) ya no muestran lo cerrado de días anteriores;
  - "pases activos" bajó de 24 a 23, que es el número correcto.
- **Una reserva archivada sigue apareciendo** en "Mis reservas" del cliente, en el listado del dueño (7 días y todas), en el detalle (con sus 2 pagos y su historial) y en el perfil del cliente.
- **Restauración al actuar:**
  - Reprogramar una reserva archivada aplica la regla del negocio ("ya no admite reprogramarse") sin perder datos.
  - Facturar un pago archivado emitió la boleta B001-00000002 y devolvió el pago al estado.
- **Recorrido de lecturas:** 1 080 lecturas con 0 errores, tanto en la copia con 90 días como en el sistema real.
- **Flujo de punta a punta:** 12/12 en la copia y en el sistema real. En el sistema real creó RES-0152, LIM-0087, SOL-0111 y PED-0031.
- **Pruebas del servidor:** las 6 pasaron.
- **Base real:** se archivaron 114 registros (104 movimientos de inventario antiguos, y la reserva RES-0141 con lo que cuelga de ella). El estado bajó de 467 KB a 400 KB.
- **Respaldo previo:** `backups/antes-fase1-2026-09-28.dump`.
- **Corrección adicional:** la sincronización de inventario comparaba cada movimiento contra todos los demás (costo cuadrático); ahora usa un índice.

### Lo que queda
1. **Techo de escrituras (~37 por segundo):** cada escritura sigue reescribiendo todo lo vivo (~0,5 MB), una tras otra. Para un hotel de 33 habitaciones el margen es amplio, porque un pico real son pocas escrituras por segundo. Superarlo exige guardar reservas, pagos y pedidos vivos fila por fila (Fase 1b).
2. **Listas limitadas a 90 días:** pagos, eventos, accesos y las demás listas muestran por defecto los últimos 90 días. Para ver más atrás hay que agregar un selector de fechas en esas pantallas (el servidor ya acepta `?from=&to=`).
3. **Directorio de clientes:** carga toda la historia (la guarda 30 s). Más adelante conviene precalcular los totales de cada cliente.
4. **Pantallas antiguas de recepción:** la lista antigua de reservas (`/api/reservations`) y la búsqueda de check-in solo muestran lo vivo. Por eso, editar una reserva de hospedaje ya terminada desde el cajón antiguo de recepción no la encontrará.
5. **Fase 2 (infraestructura):** varias copias del servidor, Redis, servidor en la nube, monitoreo y respaldos automáticos.

---

## 9. Fase 2 — parte independiente del hosting HECHA (2026-09-28)

### Qué se hizo
1. **Varias copias del servidor en paralelo.** En `docker-compose.production.yml` el backend corre con `deploy.replicas: ${BACKEND_REPLICAS:-2}`, y nginx reparte los pedidos entre las copias.
   - **Tiempo real compartido:** los avisos de cambio pasan por Postgres (`LISTEN/NOTIFY`, en `server/src/realtime-bus.js`). Un cambio atendido por una copia llega a las pantallas conectadas a cualquier otra, sin agregar Redis. Si el canal se cae, el aviso llega al menos a las pantallas de esa copia, y el ERP igual sondea cada 30 s mientras se reconecta.
   - **El ERP se conecta solo por websocket** (`client/src/services/realtime.js`), porque el modo "polling" obligaría a que cada pedido vuelva siempre a la misma copia.
   - **Arranque ordenado:** las migraciones corren bajo un candado de Postgres (`pg_advisory_lock`), así dos copias que arrancan a la vez no las ejecutan juntas.
   - **Tareas de cada minuto** (archivar el historial, cerrar la jornada, limpiar contadores): las hace una sola copia a la vez (`asLeader`).
   - Lo demás ya estaba preparado desde las Fases 0 y 1: la copia del estado en memoria se renueva según la versión en la base, y las escrituras se bloquean en la base, no en la memoria del proceso.
2. **Límites de intentos compartidos y por persona** (migración `020_shared_rate_limits`, `server/src/rate-limit.js`). **Corrige un fallo grave para el alto flujo:** antes el límite era de 10 ingresos por IP cada 15 minutos, guardado en la memoria de un solo proceso. Además, detrás del proxy todos los clientes parecían tener la misma IP, así que **el cliente número 11 que se identificaba en 15 minutos quedaba bloqueado**. Se reprodujo en el sistema real. Ahora:

   | Quién | Límite por persona (15 min) | Tope por IP (15 min) |
   |---|---|---|
   | Clientes (DNI o correo) | 10 | 200 (wifi compartido del hotel) |
   | Personal (correo) | 10 | 100 |
   | Reloj de asistencia (DNI) | 5 | — |

   - `TRUST_PROXY` acepta la cantidad de proxys delante del servidor: 2 en producción (Caddy y nginx), 1 en la instalación local. Así el servidor ve la IP real de cada cliente.
3. **Respaldo automático diario:** servicio `backup` en `docker-compose.production.yml`. Hace un `pg_dump` a las 03:00 (y uno al encender si no hay ninguno) en `./backups` y guarda los últimos `BACKUP_KEEP_DAYS` días (14 por defecto).
4. **Monitoreo:**
   - `server/src/metrics.js` mide tiempos de respuesta y errores por minuto.
   - `GET /api/superadmin/system-health` entrega esas métricas junto con memoria, tamaño del estado vivo, historial, base de datos y tiempo real.
   - Nueva pantalla del ERP: **Control del sistema › Salud del sistema**.
   - Si en un minuto la espera del 5 % más lento pasa de 1 s o hay errores 500, el servidor deja una **ALERTA** en su registro.

### Resultado medido (dos copias contra la copia de la base, dentro de Docker)
| | 1 copia | **2 copias** |
|---|---|---|
| Lecturas por segundo (100–200 personas a la vez) | 706–716 | **1 252–1 444** |
| Mixto con 50 personas | 225 pedidos/s | **434 pedidos/s** |
| Errores | 0 | 0 |

Las escrituras siguen en fila (~11–37 por segundo según la mezcla): agregar copias no las acelera. Eso solo cambia con la Fase 1b (guardar cada registro vivo por separado).

### Verificación
- **Tiempo real cruzado:** un cambio hecho en la copia A llegó a una pantalla conectada a la copia B en 271 ms (250 ms son la espera para agrupar avisos).
- **Flujo de punta a punta repartido entre copias:** el cliente reservó en A; el dueño aprobó y el personal trabajó en B. Resultado 12/12 (creó RES-0153, LIM-0088, SOL-0337 y PED-0032 en la copia de la base).
- **Límites de intentos:**
  - 15 clientes distintos desde la misma IP pasan todos.
  - El mismo DNI se bloquea al intento 11 aunque los intentos vayan repartidos entre las dos copias.
  - Lo mismo con una clave errada del personal.
- **Respaldo:** el script del servicio generó el archivo y se restauró en una base aparte con estado e historial completos.
- **Sistema real** (una copia en la instalación local):
  - 1 088 lecturas con 0 errores.
  - Tiempo real OK.
  - Flujo completo 12/12.
  - 15 identificaciones seguidas por la app del cliente sin bloqueo (antes se bloqueaba en la 11).
  - Pantalla de salud sin errores.
- **Respaldo previo:** `backups/antes-fase2-2026-09-28.dump`.
- **Error encontrado en prueba y corregido antes de publicar:** al iniciar sesión correctamente, el código seguía intentando limpiar el contador viejo en memoria (`loginAttempts`), que ya no existía.

### Lo que depende del dueño (hosting)
El sistema está listo para correr en varias copias. Falta decidir **dónde** se aloja:
- **Opción recomendada — un servidor en la nube (VPS)**, por ejemplo con 4 núcleos y 8 GB de RAM, usando `docker-compose.production.yml` tal como está: dominio con HTTPS automático (Caddy), 2 copias del servidor y respaldo diario.
  - Hay que **copiar la carpeta `backups/` fuera del servidor** (otro disco o almacenamiento en la nube).
- **Si se queda en la PC del hotel:** funciona, pero sin respaldo externo y con el riesgo de que un corte de luz o de internet deje a los clientes sin app.
- **Más adelante, si hace falta:** fotos subidas en almacenamiento externo (hoy están en un volumen del servidor) y una base de datos administrada.

---

## 10. Cierre local de la Fase 2 (2026-09-28): la PC funciona igual que producción

El dueño decidió seguir en local por ahora. Mañana se sube a una nube de prueba 2 días; después el cliente decide sobre el VPS y el dominio. La instalación local quedó con la misma arquitectura escalable que producción.

### Qué se hizo
- **Dos copias del servidor también en local** (`docker-compose.yml`):
  - `backend` sigue publicada en el puerto 3000, para pruebas y scripts.
  - `backend_2` responde al mismo nombre interno `backend`, así nginx reparte los pedidos entre las dos.
  - Ambas comparten la base, el tiempo real (Postgres LISTEN/NOTIFY) y los límites de intentos.
- **Respaldo automático local:** servicio `park_plaza_backup`. Guarda un respaldo al encender y otro cada día en `backups/`, y conserva 7 días.
- **Monitoreo de todas las copias:**
  - Migración `021_server_metrics`: cada copia guarda sus números por minuto y un latido.
  - Salud del sistema suma todas las copias y lista cada una ("Activa" o "Detenida").
  - Las copias detenidas se muestran solo 10 minutos, así un reemplazo al actualizar no parece una falla.
- **Corrección importante para restaurar respaldos:** la copia del estado en memoria ahora se recarga ante *cualquier* cambio de versión, incluso si la base vuelve a una versión menor. Pasa al restaurar un respaldo. Antes, cada servidor habría seguido mostrando los datos anteriores hasta reiniciarlo.
- **Guía de despliegue en la nube de prueba:** `DESPLIEGUE_NUBE_PRUEBA.md`. Cubre dominios sin comprar (sslip.io), claves, arranque, paso de los datos locales, verificación, qué vigilar y cómo volver atrás.
- `.env.production.example`: se quitó `OPERATIONS_DOMAIN` (la app 4174 ya no existe) y se explica sslip.io.
- `e2e-conexion.cjs` acepta `STAFF_PASSWORD` y `BROWSER_ARGS`, y `recorrido-lecturas.mjs` acepta `STAFF_PASSWORD`, para poder correrlos contra la nube.

### Ensayo completo de producción en la PC
Proyecto aparte `pp_prodtest`, con `docker-compose.production.yml` sin cambios, dominios `*.localhost` y claves al azar. Ya está borrado.

| Qué se probó | Resultado |
|---|---|
| HTTPS | ERP y app del cliente responden 200; http redirige a https (308) |
| 2 copias del servidor | Ambas sanas; nginx reparte entre ellas; canal compartido activo |
| Límite de intentos | Ve la IP real del cliente (172.20.0.1), no la de Caddy (172.20.0.8), gracias a `TRUST_PROXY=2` |
| Respaldo | Se creó al arrancar |
| Restauración en caliente | Datos locales → base nueva (versión menor) → datos locales, sin reiniciar: las dos copias mostraron siempre lo restaurado |
| Recorrido de rutas | 1 088 lecturas, 0 errores |
| Flujo completo | 12/12 (el cliente entra por HTTPS a través de Caddy) |
| Carga por nginx | ~950 pedidos/s con 200 personas a la vez, p95 0,28 s, 0 errores |

Hallazgo para mañana: las cuentas de demostración del personal entran con la clave de `DEMO_STAFF_PASSWORD` del entorno (no guardan una propia), también con los datos traídos de la PC. Está explicado en la guía.

### Verificación de la instalación local final
- **Contenedores:** 2 copias del servidor, nginx del ERP y del cliente, Postgres y respaldo.
- **Rutas:** 1 088 lecturas con 0 errores, a través de nginx y con las dos copias.
- **Tiempo real:** 6 de 6 avisos llegaron aunque los cambios los atendieran copias distintas.
- **Flujo completo:** 12/12 (dos corridas). Crearon reservas de prueba desde RES-0155 en la base local.
- **Pruebas del servidor:** `realtime-update` y `rbac-security` pasan.
- **Contrato de navegación:** OK.
- **Respaldos previos:** `backups/antes-dos-copias-local-2026-09-28.dump`.

### Estado de escalabilidad al cierre
| Pregunta | Respuesta |
|---|---|
| ¿Se degrada con la historia? | No: lo cerrado va al historial y el estado vivo queda acotado. |
| ¿Cuántas lecturas aguanta? | ~700 por segundo por copia; con 2 copias, ~1 400 (~950 medidas a través de nginx). |
| ¿Cuántas escrituras (reservas, pagos, pedidos)? | ~37 por segundo en fila. Para un hotel de 33 habitaciones sobra; subirlo es la Fase 1b (guardar cada registro vivo por separado). |
| ¿Se cae un cliente por el límite de intentos? | No: ahora es por persona. |
| ¿Hay respaldo? | Sí, diario y automático, probado y restaurado. |
| ¿Se ve si algo anda mal? | Sí: Salud del sistema, y alertas en el registro. |
