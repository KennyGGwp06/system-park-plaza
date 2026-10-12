# Registro de cambios — Sistema Superadmin

Regla de trabajo: cada cambio de código que afecte al Superadmin se documenta aquí (fecha, qué, por qué, archivos, cómo se verificó). Auditoría base: `SUPERADMIN_AUDIT.md`.

## 2026-10-12 — Auditoría, carta completa y entrega a aaPanel

La consulta pública anterior parecía incompleta porque filtraba todos los productos sin venta habilitada o stock.
Se añadió una vista de los 91 productos con sus imágenes; el filtro de pedidos conserva la protección de recetas y stock.
Se integraron las carpetas de fotos entregadas y se sincronizaron solo las imágenes del catálogo, comprobando que
precios, recetas, stock y demás datos operativos quedaron intactos. Las instalaciones nuevas cargan la carta completa.

Se corrigieron pruebas que contaban pantallas redirigidas como revisadas y lecturas sin cliente como autenticadas.
Se actualizaron Node y dependencias de ejecución y se reforzaron respaldo, hashes, restauración y comprobación de
ambos dominios en los scripts aaPanel. El despliegue conserva la versión anterior.

Archivos: `server/src/catalog-bootstrap.js`, `db.js`, `index.js`, manifiesto y fotos en `server/public/menu`,
`customer/src/app/carta.js`, scripts de pruebas, Dockerfiles y `deploy/aapanel`.
Pasaron 85 pantallas/2664 controles con acción asociada, 120 comprobaciones de negocio, permisos e inventario,
flujo en navegador, carta móvil/escritorio y restauración del paquete demo. Detalles y límites, incluidos los 7 avisos
de dependencias de construcción pendientes, en [AUDITORIA_2026-10-12.md](AUDITORIA_2026-10-12.md).

## 2026-09-21 — Auditoría inicial
- Solo lectura. **Sin cambios de código.**
- Se creó `SUPERADMIN_AUDIT.md` (hallazgos P0/P1/P2 y plan por fases).
- Se creó `SUPERADMIN_MODULOS.md` (qué hace cada módulo hoy y propuesta de estructura: agregar/quitar). Sin cambios de código.
- Se guardó el contexto del negocio y el resumen de la auditoría en la memoria del asistente.

## 2026-09-21 — Retiro del lector de huellas (biométrico)
- **Decisión del dueño:** el lector ZK9500 ya no se usará. La asistencia sigue por DNI + PIN en `/reloj`.
- `server/src/index.js`: eliminados `POST /api/biometric/clock`, `GET /api/biometric/status`, `PUT /api/biometric/config`, `POST /api/biometric/enroll` y el middleware `biometricBridgeAuth` (−72 líneas).
- `server/src/db.js` (`upgradeState`): al arrancar se borran `settings.biometric` (incluida `bridgeKey`) y `biometric` de usuarios y empleados. **Cierra P0-1** de la auditoría (fuga de la clave del puente).
- `client/src/modules/admin/BiometricSetupPage.jsx`: eliminado (no tenía ruta).
- Verificación: `node --check` correcto en `index.js` y `db.js`; búsqueda sin referencias restantes a "biometr" en `client/src`, `server/src`, `server/scripts`, `customer/src`, `operations`, compose y Caddyfile. **No se arrancó el servidor** (no probado en ejecución).
- Respaldo previo de los archivos en la carpeta temporal de la sesión.
- Pendiente para el dueño: la carpeta `biometric-bridge/` (drivers .dll) sigue en disco; ya está excluida de git y Docker. Puede borrarse cuando quiera.

## 2026-09-21 — Decisiones de negocio registradas (sin código)
- **Devolución del 50 %:** se devuelve al cancelar; la devolución se procesa en **2 días hábiles** (interpretación a confirmar: ¿o es un plazo mínimo de aviso?).
- **Terraza:** es un servicio con ingresos propios (entrada/reserva de asientos y descanso en la parte alta), no solo consumo.

## 2026-09-21 — Paleta de colores (sin código)
- Auditoría de colores del ERP, cliente y estaciones: hay 4-5 paletas conflictivas (verde/dorado, monocromo negro, azul/rojo, crema/dorado).
- Se creó `PALETA_PARK_PLAZA.md`: propuesta única azul marino + azul anclada en el logo real; verde/ámbar solo como estados. **Pendiente de aprobación del dueño; aún no aplicada al código.**

## 2026-09-21 — Paleta v2 (sin código)
- **Corrección de un error mío:** el logo oficial es el PNG (negro, blanco, "H" dorada `#FFB017→#FEC748`, palmas verdes `#019541`); el SVG azul es un redibujo. La v1 de la paleta se anclaba en ese SVG por error.
- `PALETA_PARK_PLAZA.md` v2: base azul marino aprobada + dorado del logo como acento (regla 60/30/10). Vista previa en `docs/paleta-preview.html`. **Pendiente de aprobación; no aplicada al código.**

## 2026-09-21 — Paleta v3 (sin código)
- **Decisión del dueño:** la identidad es el logo azul del pájaro; verde y dorado quedan obsoletos. (Mi "corrección" anterior, que daba por oficial el PNG negro/dorado, era errónea.)
- `PALETA_PARK_PLAZA.md` v3 y `docs/paleta-preview.html` rehechos: familia azul basada en `#0B1020`, `#1E6FD6`, `#7EC6FF`, `#E6E9EE`; sin dorado. **Pendiente de aprobación; no aplicada al código.**

## 2026-09-21 — Propuesta de rediseño del Inicio (sin cambios en la app)
- Se creó `docs/inicio-superadmin-propuesta.html` (prototipo visual con datos de ejemplo, paleta v3) y `SUPERADMIN_INICIO.md` (qué contiene hoy el Inicio, problemas, bloques nuevos con la fuente de datos de cada uno, orden de construcción e instrucción para la otra IA de imágenes).
- **No se modificó `SuperAdminMockup.jsx` ni ningún CSS.** El dueño validará la imagen generada por la otra IA antes de implementar.

## 2026-09-21 — Inicio v2: estilo empresarial (sin cambios en la app)
- El dueño pidió un diseño más empresarial y menos "hecho con IA". Se rehízo `docs/inicio-superadmin-propuesta.html`: plano, tablas, Inter, franja de KPIs, sin degradados ni resplandores.
- Se actualizaron `SUPERADMIN_INICIO.md` (secciones 4 y 6) y la línea de tipografía de `PALETA_PARK_PLAZA.md`.
- No se modificó ningún archivo de la aplicación.

## 2026-09-21 — Inicio v3: más gráficos (sin cambios en la app)
- A pedido del dueño ("más visual, menos texto"): `docs/inicio-superadmin-propuesta.html` ahora tiene 11 gráficos (líneas, barras, columnas, medidores, mapa de calor, plano de habitaciones, barras apiladas) y una sola tabla. Se generó con un script y se revisó renderizándolo (2 pasadas de corrección: texto cortado, títulos partidos, espacios vacíos).
- Colores de gráficos validados con `validate_palette.js`; el celeste `#7EC6FF` se descarta como marca sobre fondo claro (usar `#5AA0EA`).
- Nueva captura `docs/inicio-superadmin-propuesta.png`; la versión anterior queda en `docs/inicio-superadmin-propuesta-v2-tablas.html`.
- Actualizados `SUPERADMIN_INICIO.md` y `PALETA_PARK_PLAZA.md`. No se modificó ningún archivo de la aplicación.

## 2026-09-21 — Inicio del Superadmin IMPLEMENTADO (código real)
**Qué:** el nuevo Resumen ejecutivo (11 gráficos, aprobado por el dueño) reemplaza al Inicio antiguo. Captura de la app real con datos de prueba: `docs/inicio-superadmin-implementado.png`.

**Servidor**
- `server/src/owner-home.js` (nuevo): calcula todo el Inicio. Hora de Lima (no UTC); cada cobro se imputa al **servicio de origen** y se reparte en servicio / Restaurante / Bar (pedidos por `groupCode`, preórdenes de reserva proporcionales al pago); gastos = egresos de caja + costo de recetas de los pedidos; aforo por servicio (Piscina, Mirador y Terraza son **estimados**: no hay registro de salida); habitaciones, ocupación 14 días, cobros por método y canal, pendientes, cambios recientes.
- `server/src/index.js`: `GET /api/superadmin/home?days|from&to` (solo Superadmin). `audit()` acepta `changes` (antes → después). `PUT /admin/commercial-settings` ahora registra **cada cambio de precio, capacidad o visibilidad con su valor anterior y nuevo** (`priceSnapshot`/`diffSnapshots`). `POST /caja/movements` ahora valida tipo y monto y **exige `serviceCode`** (servicio o GENERAL) y `category` para egresos.
- `server/scripts/owner-home-test.js` (nuevo): pruebas del cálculo.

**Cliente**
- Nuevos: `OwnerHome.jsx`, `OwnerCharts.jsx`, `OwnerHome.css`, `SuperAdminShell.css`. `SuperAdminShell.jsx` reemplaza a `SuperAdminMockup.jsx` (573 → 269 líneas): el shell ya no descarga `control-state` ni `/dashboard` cada 15 s; usa el resumen del servidor, también para el contador de la campana.
- Menú, cabecera y cabeceras internas con estilo plano (paleta v3). `AdminResourcePage.jsx`: formulario de caja con **Servicio** y **Categoría**, columna Servicio; **corregido un error previo**: la pantalla Gastos fallaba con "se esperaba una lista" porque `/caja` responde un objeto. `App.jsx`: ruta al nuevo shell.
- Eliminados (sin uso): `SuperAdminMockup.jsx`, `OwnerDashboard.css`, `SuperAdminControlPage.jsx`, `SuperAdminPage.jsx`, `SuperAdminPendingPage.jsx` (copias en la carpeta temporal de la sesión).

**Verificación**
- `node scripts/owner-home-test.js`: pasa (hora de Lima, atribución, reparto de pedidos, gastos, aforo, sin datos). Prueba del registro de precios: pasa.
- `vite build`: correcto. Cálculo ejecutado con los **datos reales** de la base (solo lectura): sin errores; el mapa de calor cuadra con las ventas.
- Panel real renderizado en Edge con una API de prueba (misma función del servidor): KPIs, 11 gráficos, cambio de periodo, tooltips y formulario de gastos revisados visualmente.
- **No probado:** el servidor real corriendo con el endpoint nuevo (los contenedores en ejecución tienen el código anterior). Para aplicar: `docker compose up -d --build` (servidor y cliente).
- El test `client/scripts/access-contract-test.mjs` ya fallaba antes (importa un archivo sin extensión); no se tocó.

**Pendiente / límites conocidos**
- No existen aún anulaciones ni reembolsos (devolución del 50 % en 2 días hábiles): por eso "Pendientes" no los muestra.
- Gastos no incluyen planilla ni compras a crédito. Los gastos antiguos sin servicio aparecen como "sin asignar" con un aviso.
- El Inicio no separa "Extras" (cochera, extras de reserva): van dentro de "Servicio".
- Sigue pendiente el error de zona horaria del cierre de caja diario y de `/api/dashboard` (P0-9); el nuevo Inicio ya usa hora de Lima.
- El menú lateral conserva su estructura actual (Servicios/Gastronomía/Abastecimiento es una fase aparte).

## 2026-09-21 — Módulo Clientes: análisis y propuesta (sin cambios en la app)
- Se revisó `SuperAdminClientsPage.jsx`, `ClientsPage.jsx` y `/api/clients`. Se capturó cómo se ve hoy (`docs/clientes-actual-*.png`).
- Hallazgos verificados: Visitas y pestaña Accesos no funcionan (los accesos no guardan `clientId`); el Superadmin no puede bloquear, reactivar ni finalizar servicios desde las pantallas nuevas; no hay libro de consumo, segmentos, notas ni fusión de duplicados; cada pantalla descarga todo el historial cada 15 s.
- Se creó `SUPERADMIN_CLIENTES.md` y las propuestas `docs/clientes-directorio-propuesta.html/.png` y `docs/clientes-perfil-propuesta.html/.png`. No se modificó ningún archivo de la aplicación.

## 2026-09-21 — Módulo Clientes IMPLEMENTADO (código real)
**Qué:** Directorio y Perfil 360° del Superadmin, rediseñados (aprobados por el dueño) y con los datos reales corregidos: visitas/accesos, libro de consumo por servicio de origen, segmentos, bloquear/reactivar/finalizar servicios, notas internas y fusión de duplicados.

**Servidor**
- `server/src/revenue-split.js` (nuevo): reparto servicio/Restaurante/Bar de cada cobro, extraído de `owner-home.js` sin cambiar su comportamiento (mismas pruebas, mismo resultado) para que lo comparta el módulo Clientes.
- `server/src/client-directory.js` (nuevo): `buildClientDirectory` (tablero + tabla paginada/filtrable) y `buildClientProfile` (KPIs, gasto por servicio de origen, gasto por mes, visitas por servicio y por día, libro de consumo, pases QR, próxima visita, actividad, notas, duplicados) + `mergeClients` (fusión real, con reasignación de todo el historial). Segmentos: VIP (gasto ≥ S/ 3,000 o ≥ 8 visitas), Recurrente (≥ 3 visitas), Inactivo (+90 días sin visita), Nuevo (registrado hace ≤ 30 días), Ocasional (resto).
- `server/src/index.js`: `POST /api/access/validate` ahora guarda `clientId` en el registro de acceso (antes solo el pase; por eso "Visitas" y "Accesos" del perfil anterior daban 0 para quien no se hospedaba). Nuevas rutas `GET /superadmin/clients`, `GET /superadmin/clients/:id/profile`, `POST`/`DELETE /superadmin/clients/:id/notes`, `POST /superadmin/clients/merge` (todas exigen Superadmin).
- `server/scripts/client-directory-test.js` (nuevo): 20 aserciones, incluida la fusión completa de un duplicado.

**Cliente**
- `client/src/modules/admin/ClientsHub.jsx` + `.css` (nuevos): Directorio (5 indicadores, 6 gráficos, tabla con filtros/paginación, exportar CSV) y Perfil 360° (6 indicadores, 4 gráficos, libro de consumo, pases QR, actividad, notas, calidad de datos con fusión, selector rápido de cliente). Restaura **Bloquear/Reactivar** y **Finalizar servicios**, que existían en el `ClientsPage` anterior pero se habían perdido al migrar al nuevo shell.
- `OwnerCharts.jsx`: nuevos componentes genéricos `Columns`, `HBars`, `StackedRows`. `GroupedBars` ahora acepta `aColor`/`bColor`/`format`/`tipFormat` (antes azul/rojo fijos; el primer uso en Clientes tenía una leyenda que no coincidía con los colores reales — corregido antes de entregar).
- `SuperAdminShell.jsx` y `superAdminNavigation.js`: las vistas de Clientes apuntan al nuevo módulo. Eliminados `SuperAdminClientsPage.jsx`/`.css` (sin más referencias; copia en la carpeta temporal de la sesión).

**Verificación**
- `node scripts/owner-home-test.js` y `node scripts/client-directory-test.js`: pasan. `node --check` en los 4 archivos de servidor tocados. `vite build`: sin errores.
- Cálculo ejecutado contra los **datos reales** de la base (solo lectura, sin escribir nada): sin errores; el libro de consumo cuadra con el gasto total del cliente en todos los casos probados.
- App real renderizada con Edge headless y un generador de datos de ejemplo (25 clientes, historial variado, un duplicado intencional): se revisaron visualmente el Directorio, el Perfil, los tooltips, el formulario de gastos-cliente, el selector "Cambiar cliente" y el estado de los pases QR. Se corrigieron en el camino: una leyenda de gráfico que no coincidía con sus colores (bug real de `GroupedBars`, no solo del dato de prueba) y los íconos de servicio en la tabla (eran iniciales de una letra; ahora íconos reales). Capturas: `docs/clientes-directorio-implementado.png`, `docs/clientes-perfil-implementado.png`.
- **No probado:** el servidor real en ejecución (los contenedores corren el código anterior). Para aplicar: `docker compose up -d --build`.

**Pendiente / límites conocidos**
- Sin exportación PDF (solo CSV). Umbrales de segmento no configurables desde la interfaz. Catering de eventos no se probó con datos reales de Restaurante/Bar (mismo mecanismo que ya usa el Inicio, sin cambios).
- Borrado físico de clientes: no se tocó (sigue el `DELETE /api/clients/:id` original, fuera de este módulo; ver P0-6).

## 2026-09-22 — Hospedaje: rediseño visual (código real)
**Qué:** `client/src/modules/reservations/ReservationsPage.jsx` (usado en Reservas → Hospedaje del Superadmin y en la vista de Recepción) pasa del sistema Tailwind/`park-*` (negro y gris monocromo, 3 tipografías: Poppins/Inter/Roboto, esquinas de 12-16 px, sombras de color) al mismo sistema plano en azul (paleta v3, Inter, `.oh-*`/`.ro-*`) que ya tienen Inicio, Clientes y Reservas generales. Sin cambios en la lógica de negocio (formulario, validaciones, disponibilidad, cobro): solo la presentación.
- **Hallazgo que motivó el cambio:** `StatusBadge.jsx` pinta "Confirmada" y "Cancelada" casi idénticas — `park-green` y `park-danger` son ambos `#111111` en `tailwind.config.js`. Ahora usan las etiquetas de estado ya definidas en `PALETA_PARK_PLAZA.md` (verde/ámbar/rojo/azul/gris).
- Una sola pantalla para Superadmin y Recepción (antes tenían dos layouts distintos: `sar-hero` vs. un header Tailwind aparte).
- Nuevo: banda de 5 KPIs (`.oh-kpis`), gráfico de ocupación de las últimas 2 semanas (reutiliza `OccupancyChart` de `OwnerCharts.jsx`), estado de las reservas (`StackedBar`) y llegadas de los próximos 7 días (`Columns`); ninguno de estos gráficos existía antes en Hospedaje.
- Tabla y panel de detalle al estilo `.ro-table`/`.ro-drawer`; acciones de fila con texto (Ver/Editar/Cancelar) en vez de solo íconos; paginación (10 por página) en vez de listar todo de una vez.
- `client/src/modules/reservations/ReservationsPage.css` (nuevo): estilos del formulario (fieldsets, inputs, guía de pago) en el mismo lenguaje visual plano.
- `vite build` sin errores; aplicado con `docker compose up -d --build frontend`. **No verificado en navegador** (sin herramienta de navegador disponible); el dueño lo revisará al levantar la app y avisará si hay que corregir algo.

## 2026-09-22 — Reservas generales: corrección de accesos rápidos
- El dueño reportó que, de los 5 botones "Nueva reserva", solo Hospedaje y Evento llevaban a su propio módulo; Piscina/Mirador/Terraza mandaban a Clientes → Directorio (decisión original: esos tres no tienen alta propia, solo se reserva buscando al cliente).
- `client/src/modules/admin/SuperAdminReservationsPage.jsx` (`QUICK_CREATE`): los 5 botones ahora llevan por igual a su propio módulo (`reservas:piscina/mirador/terraza`, que sí muestran esa agenda y desde ahí su propio "Nueva reserva"/"Reservar mesa").
- `vite build` sin errores; aplicado con `docker compose up -d --build frontend`.

## 2026-09-22 — Reservas generales IMPLEMENTADO (código real)
**Qué:** la propuesta de `SUPERADMIN_RESERVAS.md` (aprobada por el dueño) reemplaza el "Reservas generales" anterior: agenda unificada de Hospedaje, Piscina, Mirador, Terraza y Eventos con estado y pago normalizados, KPIs, 3 gráficos, filtros con paginación real, y un panel de detalle con confirmar/cobrar saldo/reprogramar/cancelar.

**Servidor**
- `server/src/reservations-overview.js` (nuevo): `buildReservationsOverview` (KPIs + tabla paginada/filtrable por rango de creación, servicio, estado y texto) y `buildReservationDetail` (pagos + historial de auditoría de una reserva). Normaliza el estado de los tres modelos a `POR_CONFIRMAR / CONFIRMADA / EN_CURSO / COMPLETADA / CANCELADA` y calcula la "siguiente acción" (cobrar saldo tiene prioridad sobre confirmar).
- `server/src/index.js`: `GET /api/superadmin/reservations`, `GET /api/superadmin/reservations/:type/:id`, y `POST .../confirm`, `.../cancel` (exige motivo), `.../reschedule`, `.../pay` (reutiliza `registerPayment`, ya compartida por Hospedaje/servicios/eventos). Todas exigen Superadmin y auditan antes→después.
- **Bug real encontrado probando contra la base real (no solo con datos de prueba):** las reservas de Hospedaje creadas desde la reserva pública del cliente guardan `checkIn/checkOut/total/paid` (copiados del booking), mientras que las creadas desde el panel guardan `checkInDate/checkOutDate/totalPrice/advance` — el mismo respaldo que ya usaba `hydrateReservation`. Sin el respaldo, la mitad de las reservas de Hospedaje salían sin fecha ni monto. Corregido con `reservationDates()`, reutilizado también en la validación de choque de fechas al reprogramar.
- **Encontrado pero NO corregido (fuera de alcance de este módulo):** `POST /api/reservations` (crear reserva desde el panel) valida choques de fecha comparando contra `item.checkInDate` sin ese mismo respaldo — una reserva nueva podría no detectar el choque contra una reserva de origen público. Anotado para revisar aparte.
- `server/scripts/reservations-overview-test.js` (nuevo): normalización de estado (incluye el caso `PENDIENTE_CAJA` que la vista anterior no detectaba), prioridad cobrar-saldo-sobre-confirmar, rango de 30 días, filtros, paginación y detalle con pagos/historial.

**Cliente**
- `client/src/modules/admin/SuperAdminReservationsPage.jsx`: `ReservationsOverviewPage` reescrita (consume `/api/superadmin/reservations`); nuevo componente `ReservationDrawer` (detalle + acciones). `ServiceReservationsPage` (Piscina/Mirador/Terraza) no se tocó.
- `client/src/modules/admin/ReservationsOverview.css` (nuevo).
- Accesos rápidos de creación por servicio: Hospedaje y Eventos van a su propio módulo; Piscina/Mirador/Terraza van a Clientes → Directorio, igual que ya hace el botón "Nueva reserva" dentro de cada una de esas páginas (no existe un formulario de alta propio para esos tres servicios).

**Verificación**
- `node scripts/reservations-overview-test.js`, `owner-home-test.js`, `client-directory-test.js`: pasan. `node --check` en los archivos de servidor tocados. `vite build`: sin errores.
- **Probado contra el servidor real en ejecución** (`docker compose up -d --build backend frontend`, algo que no se había hecho para los módulos anteriores): login real, `GET /api/superadmin/reservations` con las 9 reservas reales de la base, `GET .../:type/:id` con pagos e historial reales, y `POST .../confirm` ejecutado de verdad sobre `RES-0122` (quedó en estado CONFIRMADA con su auditoría — dato de prueba de la base demo, no se revirtió).
- **No verificado:** la interfaz en un navegador real (sin herramienta de navegador disponible en esta sesión). El build de Vite no tiene errores y las llamadas a la API que usa la pantalla se probaron una por una contra el servidor real, pero no se vio la pantalla renderizada.
- La base demo actual solo tiene reservas de Hospedaje (no hay Piscina/Mirador/Terraza/Eventos de prueba), así que esas rutas del cálculo se verificaron con el test automatizado, no con datos reales en vivo.

## 2026-09-22 — Reservas > Eventos IMPLEMENTADO (código real) — Reservas termina de migrar
**Qué:** la propuesta de `docs/reservas-eventos-propuesta.html` (aprobada por el dueño) reemplaza el tablero de "Reservas > Eventos" del Superadmin. **A diferencia de Piscina/Mirador/Terraza, no se tocó `EventsPage.jsx`**: sigue sirviendo el calendario, el formulario de alta/edición y las rutas de Recepción (`/eventos/calendario`, `/eventos/reservas`, y las entradas `mirador`/`eventos` sin el prefijo `reservas:` en `SuperAdminShell.jsx`), tal como se anotó en la propuesta. La pantalla nueva es exclusiva de "Reservas > Eventos" del Superadmin.

**Decisión de alcance importante (encontrada al implementar, no en la propuesta):** el botón "Nuevo evento" de `EventsPage.jsx` no navegaba a ningún lado — abría un formulario embebido con estado local (`showForm`), que solo existe dentro de ese componente. Como la pantalla nueva no reconstruye ese formulario (seguía fuera de alcance), "Nuevo evento" y "Ver calendario" en la pantalla nueva son enlaces directos a `/eventos/reservas` y `/eventos/calendario` (la app completa, fuera del shell del Superadmin) en vez de navegación interna — es la única forma de no perder acceso a crear/editar eventos. Queda anotado como pendiente real: portar ese formulario al lenguaje plano es un trabajo aparte.

**Servidor**
- `server/src/events-overview.js` (nuevo): `buildEventsOverview`, mismo patrón que los tres anteriores. A diferencia de ellos, necesita el **estado real de 5 valores** (`COTIZACION/RESERVADO/CONFIRMADO/FINALIZADO/CANCELADO`) para el ciclo del evento y los filtros — `buildRows` los colapsa a 3 para los 5 servicios a la vez, así que se cruza con la reserva cruda (`rawStatus`) sin tocar `reservations-overview.js`. El "Ciclo del evento" reproduce exactamente el mismo criterio que ya usaba `EventsPage.jsx` (Reserva/Anticipo comparten RESERVADO; Producción/Evento comparten CONFIRMADO — no hay subetapas separadas, no es un bug nuevo).
- `server/src/reservations-overview.js`: `buildReservationDetail` ahora incluye, solo para type=EVENTOS, la propuesta que pidió el cliente (`eventType`, `guests`, `layout`, `catering`, `equipment`, `parkingCount`, `notes`) — campos aditivos que ya existían en la reserva cruda (los llenaba la reserva pública de eventos) pero que el detalle compartido no exponía.
- `server/src/index.js`: nueva ruta `GET /api/superadmin/reservations/eventos`. Las acciones (confirmar, cobrar saldo, reprogramar, cancelar) **no son nuevas**: `/api/superadmin/reservations/EVENTOS/:id/...` ya las soportaba desde "Reservas generales" (incluida la conversión de horario a `startsAt`/`endsAt`).
- `server/scripts/events-overview-test.js` (nuevo): 20+ aserciones (ciclo del evento, eventos por espacio sin la cancelada, estado de pago, próximos 7 días, filtros por estado real/espacio/búsqueda).

**Cliente**
- `client/src/modules/admin/SuperAdminReservationsPage.jsx`: nuevo `EventsReservationsPage` (KPIs, ciclo del evento en franja horizontal, `HBars` para eventos por espacio real, `StackedBar` para estado de pago, `Columns` para próximos 7 días, tabla con los 5 estados reales como chips y pills). El `ReservationDrawer` compartido (Piscina/Mirador/Reservas generales) ganó un bloque aditivo "Propuesta solicitada por el cliente" (montaje, platos, equipamiento, cochera, indicaciones) que solo aparece cuando `row.type === "EVENTOS"` y hay algo que mostrar — no afecta a los demás tipos.
- `client/src/modules/admin/SuperAdminShell.jsx`: `reservas:eventos` ahora renderiza `EventsReservationsPage` en vez de `EventsPage superAdmin`. Las entradas `mirador`/`eventos` sin el prefijo `reservas:` y el import de `EventsPage` en este archivo **no se tocaron** (las sigue usando esa ruta).
- `client/src/modules/admin/ReservationsOverview.css`: 2 reglas nuevas (`.ro-tags`) para las etiquetas de platos pedidos.

**Verificación**
- `node scripts/events-overview-test.js`, `terraza-reservations-test.js`, `mirador-reservations-test.js`, `pool-reservations-test.js`, `reservations-overview-test.js`, `owner-home-test.js`, `client-directory-test.js`: pasan. `node --check` en los archivos de servidor tocados. `vite build`: sin errores (incluido `EventsPage.jsx`, para confirmar que no se rompió).
- **Probado contra el servidor real en ejecución** (`docker compose up -d --build backend frontend`): login real; `GET /api/superadmin/reservations/eventos` responde sin error (la base demo no tiene eventos, todo en cero); `GET /api/superadmin/reservations/EVENTOS/999999` responde 404 en vez de romperse; se reconfirmaron con `200` Piscina, Mirador, Terraza, `/api/events` y `/api/events/spaces`, y se confirmó que el chunk de `EventsPage` se sigue generando y sirviendo. Bundle del contenedor confirmado con el nuevo código (`reservations/eventos` presente en el chunk servido).
- **No verificado:** pantalla con datos reales de eventos (no existen en la base demo), el bloque "Propuesta solicitada por el cliente" contra un evento real con catering/equipamiento, ni sesión de navegador (sin Puppeteer/Playwright).

## 2026-09-22 — Reservas > Eventos: propuesta visual (sin cambios en la app)
- Se revisó `client/src/modules/events/EventsPage.jsx` y el servidor (`/api/events*`, `eventSpaces()`, `createEvent`, `POST /api/public/event-bookings`). **Diferencia importante de alcance frente a Piscina/Mirador/Terraza:** `EventsPage.jsx` NO es exclusiva del Superadmin — la misma función (con `superAdmin=false`) atiende `/eventos/calendario`, `/eventos/reservas`, `/eventos/terraza`, `/eventos/mirador` (`client/src/App.jsx`) y dos entradas del menú de Recepción. Implementar esto debe crear una pantalla nueva solo para "Reservas > Eventos" del Superadmin (mismo patrón que las tres anteriores) sin tocar `EventsPage.jsx`. Por eso la propuesta no rediseña el formulario de alta/edición ni el calendario, solo el tablero/agenda/detalle.
- **Aclaración de datos:** los "espacios de evento" (Terraza, Mirador, Salón Amazónico — `eventSpaces()` en `index.js`) son ambientes para alquilar, no los mismos servicios Piscina/Mirador/Terraza ya rediseñados; coinciden en nombre por casualidad del negocio.
- **Dos hallazgos reales (no arreglados, son de lógica, no de pantalla):** (1) `PATCH /api/events/:id/status` acepta cualquier valor de estado sin validar la transición, a diferencia de confirmar/cancelar en `reservations-overview.js`; (2) `POST /api/public/event-bookings` toma `estimatedTotal` directo del cliente sin recalcularlo en el servidor, a diferencia de Hospedaje/Piscina/Mirador/Terraza (que sí recalculan con `calculateBookingPrice`). Quedan anotados para revisar aparte — el segundo en particular es un hueco de integridad de dinero real.
- Se creó `docs/reservas-eventos-propuesta.html` (+ `.png` y `-detalle.png`): mismo lenguaje plano azul v3. KPIs: Eventos hoy, Próximos, Cotizaciones, Invitados próximos 7 días, Saldo pendiente. Se conserva el "Ciclo del evento" (ya existía, solo con estilo plano) y se agregan gráficos: eventos por espacio real, estado de pago y próximos 7 días. Tabla y detalle conservan toda la información actual (propuesta del cliente: montaje, platos, equipamiento, cochera) con el estilo plano de Piscina/Mirador/Terraza.
- Renderizado con Brave headless, revisado visualmente (2 capturas: tablero y detalle abierto).
- **No se modificó ningún archivo de la aplicación.** Pendiente de aprobación del dueño antes de construirlo.

## 2026-09-22 — Reservas > Terraza IMPLEMENTADO (código real) — los 5 servicios ya tienen el diseño nuevo
**Qué:** la propuesta de `docs/reservas-terraza-propuesta.html` (aprobada por el dueño) reemplaza la pantalla de Terraza dentro de Reservas: mismo lenguaje plano azul v3 que ya tienen Piscina/Mirador/Inicio/Clientes/Reservas generales/Hospedaje. **Con esto, Reservas termina de migrar los 5 servicios** (Hospedaje, Piscina, Mirador, Terraza y Eventos ya usan el shell "Reservas generales"; Eventos sigue con su propia pantalla `EventsPage`, fuera de este trabajo).

**Corrección de fondo, no solo visual:** el panel viejo comparaba 3 zonas inventadas (`Vista piscina/Jardín/Interior cubierto`, cupos `[6,8,5]`) contra las 4 zonas reales que el cliente elige en `TerraceExperience.jsx` (`Zona fresca/Cerca al jardín/Cerca al bar/Mesa tranquila`) — 2 de 3 tarjetas siempre salían vacías. La implementación usa las zonas reales (con un bucket "Otra" para cualquier valor que no coincida, en vez de perderlo en silencio) y las 6 franjas horarias reales (`12:00/13:30/15:00/18:00/20:00/21:30`, las mismas de `GET /api/public/availability/TERRAZA`) con la capacidad real en personas (`state.services.TERRAZA` = 48), igual patrón que Piscina y Mirador. Sin gráfico ni columna de pago: la reserva de Terraza es gratuita hoy (el consumo de Restaurante/Bar se cobra aparte); mostrarlo habría sido puro ruido.

**Servidor**
- `server/src/terraza-reservations.js` (nuevo): `buildTerrazaOverview`, mismo patrón que `pool-reservations.js`/`mirador-reservations.js`. Agrega `zone` (normalizada a las 4 reales + "Otra") y `preorderCount` a cada fila cruzando con la reserva cruda, sin tocar `buildRows`.
- `server/src/index.js`: nueva ruta `GET /api/superadmin/reservations/terraza`.
- `server/scripts/terraza-reservations-test.js` (nuevo): 20+ aserciones (franjas reales, aforo, zonas reales incluida la que cae en "Otra", pedidos anticipados, filtros).

**Cliente**
- `client/src/modules/admin/SuperAdminReservationsPage.jsx`: nuevo `TerrazaReservationsPage` (KPIs sin dinero, `Columns` para ocupación y próximos 7 días, `Bullets` para aforo, `HBars` para reservas por zona reales, tabla sin columna de pago). Reutiliza el `ReservationDrawer` compartido tal cual (su botón "Cobrar saldo" nunca aparece porque el saldo de Terraza siempre es 0).
- `client/src/modules/admin/SuperAdminShell.jsx`: `reservas:terraza` ahora renderiza `TerrazaReservationsPage`.
- **Limpieza (ya no quedaba pendiente ningún servicio en el diseño viejo):** se eliminaron `ServiceReservationsPage`, `SERVICE_CONFIG`, `Availability`, `DetailDrawer`, `ReservationHero`, `Metric`, `Status`, `Empty` y los helpers que solo ellos usaban (`personCount`, `clientName`, `bookingDate`, `isToday`, `isUpcoming`, `isCancelled`, `needsAttention`, `upper`) de `SuperAdminReservationsPage.jsx` — ya no los usaba nadie tras migrar Terraza. También se quitaron los imports que quedaron sin uso (`useMemo`, varios íconos, `hotelDate` utils) y el import de `SuperAdminReservations.css` **de este archivo** (el CSS en sí no se borró: `EventsPage.jsx` lo sigue usando de forma independiente para su propia pantalla). El bundle de esta página bajó de 45.7 KB a 40.4 KB pese a sumar Terraza.
- `SuperAdminReservations.css` sigue existiendo intacto (lo usa Eventos); no se tocó su contenido.

**Verificación**
- `node scripts/terraza-reservations-test.js`, `mirador-reservations-test.js`, `pool-reservations-test.js`, `reservations-overview-test.js`, `owner-home-test.js`, `client-directory-test.js`: pasan. `node --check` en los archivos de servidor tocados. `vite build`: sin errores (incluido `EventsPage`, para confirmar que seguir usando `SuperAdminReservations.css` de forma independiente no se rompió).
- **Probado contra el servidor real en ejecución** (`docker compose up -d --build backend frontend`): login real; `GET /api/superadmin/reservations/terraza` responde sin error con la capacidad real (48) y todo en cero porque **la base demo no tiene reservas de Terraza**; se reconfirmaron con `200` los endpoints de Piscina y Mirador y una ruta de Eventos, para verificar que la limpieza no rompió nada ya en producción. Bundle del contenedor confirmado con el nuevo código (`reservations/terraza` presente en el chunk servido).
- **No verificado:** pantalla con datos reales de Terraza (no existen en la base demo) ni con sesión de navegador (sin Puppeteer/Playwright).

## 2026-09-22 — Reservas > Terraza: propuesta visual (sin cambios en la app)
- Se revisó `ServiceReservationsPage` (tono "terrace") y, esta vez, también la reserva pública real (`customer/src/TerraceExperience.jsx`) y `GET /api/public/availability/TERRAZA` (`server/src/index.js:366`). **Hallazgo real, no solo visual:** el panel de Superadmin muestra 3 zonas inventadas ("Vista piscina", "Jardín", "Interior cubierto") con cupos `[6,8,5]` también inventados, comparadas por coincidencia parcial de texto contra la zona que el cliente elige de verdad: `'Zona fresca', 'Cerca al jardín', 'Cerca al bar', 'Mesa tranquila'`. Con ese cruce por texto, **2 de las 3 tarjetas del panel actual siempre salen vacías** y "Zona fresca"/"Cerca al bar"/"Mesa tranquila" nunca aparecen bien contadas en ningún lado. Tampoco hay franjas horarias en el panel actual, aunque la reserva pública sí tiene 6 franjas reales (`12:00/13:30/15:00/18:00/20:00/21:30`) con capacidad real en **personas** (`state.services.TERRAZA`, hoy 48) — el mismo patrón que ya se corrigió en Piscina y Mirador, no una cifra inventada.
- También verificado: la reserva de Terraza **es gratuita hoy** (`TerraceExperience.jsx` envía `total: 0`; el consumo de Restaurante/Bar se cobra aparte tras validar el ingreso). Por eso la propuesta no tiene columna ni gráfico de pago — mostrar "Pagado S/ 0.00" en cada fila sería ruido. La decisión del dueño de que Terraza tenga "ingresos propios" (registrada en memoria, 2026-09-21) sigue sin implementarse en el código; queda fuera de esta propuesta (es un cambio de modelo de precios, no de pantalla).
- Se creó `docs/reservas-terraza-propuesta.html` (+ `.png` y `-detalle.png`): mismo lenguaje plano azul v3 que Piscina/Mirador. Gráficos: ocupación por franja horaria (6 franjas reales, personas), aforo ahora, **reservas por zona con los 4 nombres reales** (corrige el cruce roto) y próximos 7 días. KPIs: Mesas hoy, Cupos ahora, Comensales esperados, Pedidos anticipados, Por confirmar (sin saldo/pago, no aplica). Tabla y detalle sin columna de pago; el detalle explica que la reserva es gratuita y el consumo se cobra aparte.
- Renderizado con Brave headless, revisado visualmente (2 capturas: tablero y detalle abierto).
- **No se modificó ningún archivo de la aplicación.** Pendiente de aprobación del dueño antes de construirlo.

## 2026-09-22 — Reservas > Mirador IMPLEMENTADO (código real)
**Qué:** la propuesta de `docs/reservas-mirador-propuesta.html` (aprobada por el dueño) reemplaza la pantalla de Mirador dentro de Reservas: mismo lenguaje plano azul v3 que ya tienen Piscina/Inicio/Clientes/Reservas generales/Hospedaje. Terraza **no se tocó** — sigue en `ServiceReservationsPage`; se migra aparte.

**Corrección frente a la propuesta aprobada (avisada, no silenciosa):** la propuesta hablaba de "mesas" (capacidad fija de 14). Al construirlo encontré que la capacidad real configurada de Mirador es **15** y, como Piscina/Terraza/Bar, se guarda como aforo en **personas**, no en mesas — el código viejo de `ServiceReservationsPage` comparaba número de reservas (no personas) contra un 14 fijo, una inconsistencia que ya existía. La implementación usa personas y la capacidad real, igual que Piscina; los títulos "Ocupación por franja horaria" y "Aforo ahora" (en vez de "mesas ocupadas") quedan iguales a los de Piscina para no mezclar dos unidades distintas bajo el mismo diseño.

**Hallazgo de seguridad encontrado y corregido de una vez (relacionado directo con esto, no aparte):** Mirador y Hospedaje piden verificar manualmente el Yape/Plin antes de aprobarlo (`paymentStatus: "PENDIENTE_VERIFICACION"`, ver `POST /api/public/bookings/:id/pay-balance`). `POST /api/service-bookings/:id/pay` ya exigía que método/operación/monto coincidieran exactamente con lo que envió el cliente antes de aprobar — pero el botón genérico "Cobrar saldo" de Reservas generales (`POST /api/superadmin/reservations/:type/:id/pay`) **no tenía ese mismo resguardo**: un Superadmin podía aprobar cualquier monto sin comprobar la operación real, para reservas de Hospedaje o Mirador. Se agregó la misma validación a ese endpoint (`server/src/index.js`). Sin este hallazgo, mi nuevo botón "Verificar operación" habría convivido con un "Cobrar saldo" que lo saltaba.

**Servidor**
- `server/src/mirador-reservations.js` (nuevo): `buildMiradorOverview`, igual que `pool-reservations.js` pero agrega: franjas de media hora (16:30/17:30/18:30/20:00, con minutos reales, no solo la hora) y un cuarto estado de pago "por verificar" con los datos de la operación (método, código, monto), calculado cruzando la fila normalizada con la reserva cruda (sin tocar `buildRows`).
- `server/src/reservations-overview.js`: `buildReservationDetail` ahora incluye `verify` (método/operación/monto) cuando la reserva cruda está `PENDIENTE_VERIFICACION` — campo aditivo, `null` para todo lo demás (no cambia el detalle de Hospedaje/Piscina/Terraza/Eventos que ya estaba en producción).
- `server/src/index.js`: nueva ruta `GET /api/superadmin/reservations/mirador`; resguardo de verificación agregado a `POST /api/superadmin/reservations/:type/:id/pay` (ver hallazgo arriba).
- `server/scripts/mirador-reservations-test.js` (nuevo): 20+ aserciones (franjas de media hora, aforo con entitlements, cuarto estado de pago, `nextAction` forzado a "verificar" en vez de "cobrar saldo", filtros).

**Cliente**
- `client/src/modules/admin/SuperAdminReservationsPage.jsx`: nuevo `MiradorReservationsPage` (mismo patrón que `PoolReservationsPage`: KPIs, `Columns`, `Bullets`, `StackedBar` de 4 segmentos, tabla con chip "Por verificar"). El `ReservationDrawer` compartido (usado también por Piscina y Reservas generales) ganó un bloque aditivo: aviso de verificación + botón "Confirmar pago verificado" que llama a `/api/service-bookings/:id/pay` con el método/operación/monto exactos — solo aparece cuando `detail.verify` existe, así que Piscina y las demás pantallas no cambian.
- `client/src/modules/admin/SuperAdminShell.jsx`: `reservas:mirador` ahora renderiza `MiradorReservationsPage`.
- `client/src/modules/admin/ReservationsOverview.css`: 3 reglas nuevas (`.ro-dbtn.v`, `.ro-verify`) para el aviso ámbar de verificación.
- **Pendiente de limpieza (no se tocó a propósito):** `SERVICE_CONFIG.MIRADOR` y su rama en `ServiceReservationsPage` quedaron sin usar; se eliminan cuando se migre Terraza.

**Verificación**
- `node scripts/mirador-reservations-test.js`, `pool-reservations-test.js`, `reservations-overview-test.js`, `owner-home-test.js`, `client-directory-test.js`: pasan. `node --check` en los archivos de servidor tocados. `vite build`: sin errores.
- **Probado contra el servidor real en ejecución** (`docker compose up -d --build backend frontend`): login real, `GET /api/superadmin/reservations/mirador` responde sin error con la capacidad real (15) y todo en cero porque **la base demo no tiene reservas de Mirador**. Bundle del contenedor confirmado con el nuevo código (`reservations/mirador` y la llamada a `service-bookings/${` presentes en el chunk servido).
- **No verificado:** pantalla con datos reales de Mirador (no existen en la base demo) ni con sesión de navegador (sin Puppeteer/Playwright). El flujo de verificación de pago tampoco se probó de punta a punta contra el servidor real (no hay ninguna reserva `PENDIENTE_VERIFICACION` en la base demo); si el dueño genera una desde la reserva pública del cliente, conviene probarla antes de confiar en el botón nuevo.

## 2026-09-22 — Reservas > Mirador: propuesta visual (sin cambios en la app)
- Se revisó de nuevo `ServiceReservationsPage` (tono "lookout") para Mirador: comparte el mismo hero oscuro/Georgia serif y color propio (morado `#6d4bd1`) que tenía Piscina antes de su rediseño. Diferencia real frente a Piscina que hay que respetar: la capacidad de Mirador (14) es por **mesas**, no por personas (`usedCapacity` cuenta reservas, no `personCount`), y tiene un paso propio que Piscina no tiene: pagos Yape/Plin que quedan `PENDIENTE_VERIFICACION` y hoy solo se aprueban con un `window.confirm` de una línea, sin dejar ese aviso visible en ningún otro lugar del panel.
- Se creó `docs/reservas-mirador-propuesta.html` (+ `.png` y `-detalle.png`): mismo lenguaje plano azul v3 que ya tiene Piscina. Gráficos: ocupación por franja horaria (mesas, no personas), mesas ocupadas ahora, estado de pago (con un cuarto segmento "Por verificar" que hoy no existe como estado visible) y próximos 7 días. La tabla y el panel de detalle hacen visible el aviso de verificación de pago (operación, monto, método) en vez de un `confirm()` del navegador, y agregan pagos/historial/acciones al detalle (hoy solo muestra texto, igual que tenía Piscina).
- Renderizado con Brave headless, revisado visualmente (2 capturas: tablero y detalle con verificación de pago abierto).
- **No se modificó ningún archivo de la aplicación.** Pendiente de aprobación del dueño antes de construirlo. Mismo lenguaje serviría después para Terraza (zonas de mesas en vez de franjas simples, ver `Availability` de `ServiceReservationsPage` para Terraza).

## 2026-09-22 — Reservas > Piscina IMPLEMENTADO (código real)
**Qué:** la propuesta visual de `docs/reservas-piscina-propuesta.html` (aprobada por el dueño) reemplaza la pantalla de Piscina dentro de Reservas: mismo lenguaje plano azul v3 que ya tienen Inicio/Clientes/Reservas generales/Hospedaje, con gráficos (ocupación por franja, aforo en vivo, estado de pago, próximos 7 días) donde antes solo había texto y barras de progreso. Mirador y Terraza **no se tocaron** — siguen en `ServiceReservationsPage` con el diseño anterior; se migran aparte, uno por uno, como pidió el dueño.

**Servidor**
- `server/src/pool-reservations.js` (nuevo): `buildPoolOverview` construye KPIs, ocupación por franja horaria, aforo en vivo y estado de pago **solo para Piscina**, reutilizando `buildRows` de `reservations-overview.js` (se exportó esa función, sin cambiar su comportamiento) para no duplicar la normalización de estado/pago que ya usa "Reservas generales". El aforo en vivo usa el **mismo criterio que el Inicio** (entitlements validados por QR dentro de una ventana de 3h + ingresos manuales de `poolEntries`, `owner-home.js`) y la **capacidad real configurada** en `state.services` (antes el diseño anterior asumía 20 fijo en el cliente sin leer la configuración real; puede que coincida, pero ahora se lee del dato real).
- `server/src/index.js`: nueva ruta `GET /api/superadmin/reservations/pool` (exige Superadmin). Las acciones del panel de detalle (confirmar, cobrar saldo, reprogramar, cancelar) **no son nuevas**: reutilizan `/api/superadmin/reservations/PISCINA/:id/...`, ya implementadas y auditadas para los tres modelos de servicio desde "Reservas generales".
- `server/scripts/pool-reservations-test.js` (nuevo): 20+ aserciones (KPIs, aforo con entitlements + ingresos manuales, ocupación por franja compartida entre dos reservas, estado de pago, próximos 7 días, filtros y búsqueda).

**Cliente**
- `client/src/modules/admin/SuperAdminReservationsPage.jsx`: nuevo componente `PoolReservationsPage` (banda de 5 KPIs, `Columns` para ocupación por franja y próximos 7 días, `Bullets` para el aforo — el mismo componente ya usado en el Inicio para "personas dentro", así el número se lee igual en ambas pantallas —, `StackedBar` para estado de pago, tabla `.ro-table` con filtros/paginación) y reutiliza el `ReservationDrawer` que ya existía para Reservas generales (pagos, historial de auditoría y las cuatro acciones), en vez de construir un detalle nuevo. Cero CSS nuevo: todo con `OwnerHome.css`/`ReservationsOverview.css` ya existentes.
- `client/src/modules/admin/SuperAdminShell.jsx`: `reservas:piscina` ahora renderiza `PoolReservationsPage` en vez de `ServiceReservationsPage serviceCode="PISCINA"`. Mirador y Terraza no cambiaron.
- **Pendiente de limpieza (no se tocó a propósito):** `SERVICE_CONFIG.PISCINA` y la rama `serviceCode === "PISCINA"` dentro de `ServiceReservationsPage` quedaron sin usar (dead code); se eliminan cuando se migren Mirador/Terraza, para no arriesgar esas dos pantallas que siguen en producción con el diseño anterior.

**Verificación**
- `node scripts/pool-reservations-test.js`, `reservations-overview-test.js`, `owner-home-test.js`, `client-directory-test.js`: pasan. `node --check` en los archivos de servidor tocados. `vite build`: sin errores.
- **Probado contra el servidor real en ejecución** (`docker compose up -d --build backend frontend`): login real, `GET /api/superadmin/reservations/pool` responde sin error con la capacidad real de Piscina (20) y todo en cero porque **la base demo no tiene reservas de Piscina** (mismo límite ya anotado para "Reservas generales"). Se confirmó que el bundle servido por el contenedor de frontend incluye el nuevo código (`reservations/pool` presente en el chunk servido).
- **No verificado:** la pantalla renderizada con datos reales de Piscina (no existen en la base demo) ni en un navegador con sesión iniciada (no hay Puppeteer/Playwright disponible en el proyecto para automatizar el login; los gráficos sí se revisaron visualmente en el prototipo estático `docs/reservas-piscina-propuesta.html`, con datos de ejemplo). El dueño debería crear o revisar una reserva de Piscina real y avisar si algo se ve mal.

## 2026-09-22 — Reservas > Piscina: propuesta visual (sin cambios en la app)
- Se revisó `ServiceReservationsPage` (`SuperAdminReservationsPage.jsx:301`, compartida por Piscina/Mirador/Terraza) y su hoja `SuperAdminReservations.css`: sigue con el hero oscuro y Georgia serif, un color propio por servicio (`is-pool` = cian `#0891b2`, `is-lookout` = morado, `is-terrace` = verde — justo lo que `PALETA_PARK_PLAZA.md` marca como "sin color por servicio"), solo texto y barras de progreso (sin gráficos) y un panel de detalle sin pagos, historial ni acciones (a diferencia del de "Reservas generales", que ya tiene cobrar saldo/confirmar/reprogramar/cancelar con auditoría).
- Se creó `docs/reservas-piscina-propuesta.html` (+ `.png` y `-detalle.png`): mismo lenguaje plano azul v3 que ya tienen Inicio/Clientes/Reservas generales/Hospedaje (cabecera plana, banda de 5 KPIs, sin color por servicio). Gráficos nuevos: ocupación por franja horaria (columnas), aforo ahora (donut), estado de pago (barra apilada) y reservas próximos 7 días (columnas); antes solo había barras de progreso de texto. Panel de detalle propuesto con pagos, historial de auditoría y acciones (cobrar saldo, reprogramar, cancelar), a la par del de Reservas generales.
- Renderizado con Brave headless (`brave.exe --headless=new --screenshot`), revisado visualmente (2 capturas: tablero y detalle abierto).
- **No se modificó ningún archivo de la aplicación.** Mismo diseño serviría para Mirador y Terraza cambiando ícono, franjas/zonas y cifras — pendiente de aprobación del dueño antes de construir cualquiera de los tres.

## 2026-09-21 — Reservas generales: análisis y propuesta (sin cambios en la app)
- Se revisó `SuperAdminReservationsPage.jsx` (`ReservationsOverviewPage`), `ReservationsPage.jsx` (Hospedaje) y las rutas `/api/reservations`, `/api/service-bookings`, `/api/events`.
- Hallazgos verificados: el filtro "requiere atención" no reconoce los estados reales de Hospedaje; "Nueva reserva" siempre manda al formulario de Hospedaje; sin filtro de fechas ni paginación (descarga las tres listas completas, como pasaba en Clientes antes de corregirlo); se refresca con cualquier cambio del sistema por el evento global `state:changed`; "Gestionar" no abre el detalle de la reserva; Eventos tiene una experiencia distinta a Piscina/Mirador/Terraza; no hay cancelar/reprogramar desde la agenda general; el estado no está normalizado entre servicios.
- Se creó `SUPERADMIN_RESERVAS.md` y la propuesta `docs/reservas-generales-propuesta.html` (+ capturas `.png` y `-detalle.png` con el panel de detalle abierto). No se modificó ningún archivo de la aplicación.
- Nota aparte (ya en `SUPERADMIN_AUDIT.md`, no tocada): `/api/reservations` y `/api/service-bookings` no exigen ningún rol, solo estar logueado como staff.

## 2026-09-23 — Fase 1 (servidor): permisos reales, auditoría inmutable y cierre de huecos P0
Decisión del dueño: empezar por los cimientos del Superadmin (Fase 1 de `PROPUESTA_SISTEMA_CONTROL_2026-09-23.md`). Esta entrada cubre el SERVIDOR; el menú y las pantallas nuevas van en la entrada siguiente.
- **P0-2 cerrado (escalada de privilegios).** `requireFullAdministration` (`server/src/index.js`) dejaba pasar a cualquier `ADMINISTRADOR` que no fuera de recepción; ahora exige `isSuperAdmin`. Afecta a todo lo que cuelga de él (usuarios, permisos, configuración, personal, planilla, inventario/compras/recetas vía `requireInventoryAdmin`/`requirePurchasingAdmin`). `requireCashAdmin` ahora solo admite Superadmin o Admin de recepción. Un usuario creado con el rol ADMINISTRADOR recibe por defecto `position: ADMIN_RECEPCION`, así que ya no queda como "administrador a medias".
- **P0-5 cerrado (rutas sin guardia de rol).** Se cerraron a Recepción/Superadmin (`requireReceptionAdmin`): `GET/POST/PUT/DELETE /api/reservations`, `GET /api/checkin/search`, `GET /api/checkout/stays`, `GET /api/dashboard`, `GET /api/rooms/:id/check-availability`, `GET /api/service-bookings`, `GET /api/access/logs`, `GET /api/events/spaces`, `POST/PATCH /api/cochera/entries`. `PATCH /api/orders/:id/status` solo para Restaurante, Bar o Superadmin (`requireOrderOperator`); `GET /api/inventory/production-dashboard` solo Restaurante/Bar/Superadmin. `GET /api/attendance/current` ya no entrega el efectivo del día a empleados de campo. `GET /api/orders/:id/inventory` usa la identidad real del Superadmin en vez de comparar el rol reescrito.
- **P0-3 cerrado (protección del Superadmin).** No se puede desactivar, ni cambiar de rol, al último Superadmin activo (`saveUser` y `PATCH /api/usuarios/:id/status`). `PUT /api/roles/:id/permissions`: el rol SUPERADMIN es intocable, `permissionIds` se valida (antes devolvía 500) y cada cambio queda auditado como "permiso concedido/retirado".
- **P0-4 (permisos cosméticos) — decisión importante.** La autorización del servidor sigue siendo por ROL, pero ahora cada ruta tiene guardia y está cubierta por una prueba. La matriz editable de "Roles y permisos" sigue siendo descriptiva (no gobierna rutas individuales); hacerla gobernar las ~240 rutas es un cambio mayor que NO se hizo en esta fase.
- **P0-7 (auditoría) mayormente cerrado.** Nuevo `server/src/audit-chain.js`: cada registro guarda la firma SHA-256 del anterior (`prevHash`/`hash`); editar, borrar o reordenar un registro rompe la cadena. Firma sobre claves ordenadas porque JSONB no conserva el orden. Todas las escrituras de auditoría (index.js, purchasing.js, product-catalog.js, transfers.js) pasan por `sealAudit`. Nuevo `GET /api/superadmin/audit/verify` (solo Superadmin). `POST /api/auditoria` y `POST /api/roles` por la vía genérica ahora devuelven 405 (no se puede falsificar un registro ni crear un rol). Los cambios de configuración, usuarios (rol/estado) y permisos guardan antes → después. Los 1367 registros anteriores no llevan firma (quedan "sin firma"); la cadena empieza desde ahora. Falta aún: IP/agente del actor en cada registro.
- **P0-8 cerrado (asignación masiva).** `PUT /api/configuracion` solo acepta una lista de campos (nombre, moneda, zona horaria, IGV, dirección, teléfono, correo, RUC, razón social), valida el IGV (0–100) y ya no puede pisar `roomTypeMedia`, `experienceMedia`, `experiencePricing`, `eventSpaces` ni `parkingRates` (los precios solo se cambian por Precios y servicios, que audita).
- **P0-6 cerrado (borrar cliente destruía dinero).** `DELETE /api/clients/:id` se rechaza con 409 si el cliente tiene pagos o comprobantes; los registros contables ya no se destruyen.
- **Pruebas:** nuevo `server/scripts/authz-matrix-test.js` (76 comprobaciones contra el servidor real: cada rol de campo, Recepción y Superadmin contra las rutas sensibles, auditoría no falsificable, rol Superadmin intocable, configuración con lista blanca y auditoría antes → después, integridad de la cadena). Pasaron además `rbac-security-test`, `stabilization-test`, `phase2-operations-test`, `stock-requests-test`, `owner-home-test`, `reservations-overview-test`, `transfers-test`, `purchasing-receiving-test`, `product-catalog-test`.
- **Verificación de la cadena:** se alteró a mano un registro en la base y `/superadmin/audit/verify` lo marcó ("contenido alterado"); se restauró y volvió a `intact: true`.
- **Aplicado al servidor real:** `docker compose up -d --build backend` (Docker Desktop estaba apagado y se encendió. Durante las primeras pruebas el puerto 3000 estaba ocupado por un servidor de pruebas temporal, `mock-server.mjs`, levantado por una tarea paralela de esta misma sesión; se probó en el 3100 y, al liberarse el 3000, el backend volvió a su puerto normal 3000.) Se respaldó `app_state` antes de tocar la base (`scratchpad/app_state_backup_2026-09-23.sql`) y se quitó la firma de 3 registros de prueba generados con un algoritmo anterior en la misma sesión.
- **Sigue pendiente de la auditoría del 21/09:** P0-9 (zona horaria fuera de Inicio/cierre de caja), P0-10 (reembolsos/anulaciones, Fase 5), P0-11 (login con clave demo compartida, hoy solo se bloquea en producción), IP del actor en auditoría, y el hueco de `POST /api/public/event-bookings` (el total lo manda el cliente).

## 2026-09-23 — Fase 1 (cliente): menú a 12 módulos, Rentabilidad y Aforo reales
- **Menú del Superadmin reorganizado a 12 módulos.** Experiencias pasa a "Catálogo y precios"; Inventario y Compras se fusionan en "Insumos"; Restaurante y Bar siguen separados (decisión del dueño). Eliminadas las vistas duplicadas o falsas: Horarios, Promociones, Necesidades por receta, Roles en Equipo, Estado de áreas y Notificaciones. Renombradas: "Servicios y tarifas", "Habitaciones", "Solicitudes de las áreas".
- **Dinero › Rentabilidad por servicio** (`ProfitabilityPage.jsx`, nuevo): ventas, gastos, utilidad y margen reales por servicio desde `GET /api/superadmin/home` (antes abría el reporte de incidencias). Con selector de periodo, ranking de utilidad, margen contra la meta, tabla con total y desglose de Restaurante/Bar. Deja visible la nota de que el gasto aún no incluye planilla ni compras a crédito.
- **Admisión › Control de aforo** (`LiveOccupancyPage.jsx`, nuevo): personas dentro de los 5 servicios en vivo (refresco cada 30 s), barras de ocupación, afluencia por hora, y marca como "Estimado" el dato de Piscina, Mirador y Terraza (el sistema registra la entrada, no la salida). Antes solo mostraba Piscina.
- **Enlaces antiguos:** `superAdminNavigation.js` trae alias de compatibilidad (`resolveSuperAdminTarget`) para módulos y vistas viejos (`experiencias`→`catalogo`, `inventario`/`compras`→`insumos`, `equipo:roles`→`sistema:permisos`, `operaciones:areas`→`catalogo:habitaciones`, `sistema:notificaciones`→`sistema:configuracion`). `server/src/owner-home.js` ahora envía `["insumos","existencias"]` en el aviso de stock bajo.
- **Rutas legacy:** `/reportes` ahora redirige a Rentabilidad, por lo que `ReportsPage` (incidencias) ya no se alcanza desde el Superadmin (el archivo no se borró). `/inventario/recetas` → `restaurante:recetas` y `/inventario/turnos` → `restaurante:consumo` (la primera vista que declara la ruta la recibe).
- **Archivos:** `client/src/modules/admin/superAdminNavigation.js`, `SuperAdminShell.jsx`, `ProfitabilityPage.jsx`, `LiveOccupancyPage.jsx`, `ControlPages.css`, `server/src/owner-home.js`.
- **Verificación:** `npm run build` sin errores; `docker compose up -d --build backend frontend`; inicio de sesión real como Superadmin en Brave headless y navegación por el menú lateral contra el backend real. Se vieron con datos reales: Rentabilidad (Hospedaje S/ 2,400 en el mes), Control de aforo (8 personas dentro de 400 de aforo total), Servicios y tarifas y Auditoría (muestra "antes → después"). El menú se renderiza con los 12 módulos. **No se probó** clic por clic cada una de las ~40 vistas ni el flujo de guardado de precios desde la pantalla nueva.
- **Observaciones abiertas:** (1) en Rentabilidad, los indicadores superiores redondean al entero (Gastos "S/ 0", Utilidad "S/ 2,400") mientras la tabla muestra centavos (S/ 0.30, S/ 2,399.70); (2) `Servicios y tarifas`, `Auditoría` y otras pantallas heredadas siguen con el estilo antiguo (verde/dorado y serifa), distinto del azul plano del resto — es el rediseño visual pendiente, no parte de esta fase; (3) el registro de auditoría contiene entradas "(prueba)" y "Sin cambios" de la configuración generadas por las pruebas de esta sesión; no se pueden borrar porque la cadena es inmutable (son inofensivas: el nombre del hotel quedó sin cambios); (4) la pantalla de login conserva el diseño antiguo (verde oscuro/dorado).

## 2026-09-23 — Admin de Recepción: sidebar reorganizado (IMPLEMENTADO)
Decisión del dueño: "implementarlo" tras la propuesta `ADMIN_RECEPCION_SIDEBAR_PROPUESTA_2026-09-23.md`. Solo se implementó la distribución del menú y las dos vistas de apoyo; la regla de cancelaciones con pago sigue pendiente (ver abajo).
- **Menú (`client/src/modules/admin/adminReceptionNavigation.js`):** 8 módulos. "Equipo y coordinación" pasa a **"Coordinación"** (Personal en turno · Limpieza · Mantenimiento · Estado de pedidos). Eliminadas "Personal bajo mi coordinación" y "Turnos y asistencia" (daban 403: el servidor no deja al Admin de recepción ver personal, planilla ni tarifas) y "Asignar tareas" (era un acceso rápido "Nueva operación" que solo mostraba métricas). "Eventos" en Servicios presenciales se llama ahora **"Calendario de eventos"**.
- **Personal en turno (nuevo, solo lectura):** `client/src/modules/admin/ReceptionOnShiftPage.jsx` + `GET /api/reception/on-shift` (`server/src/index.js`). Muestra los turnos de hoy con persona, área, horario, estado (Por entrar / En turno / Terminó) y horas de entrada y salida. No expone tarifas, planilla ni PIN.
- **Control de aforo de los 5 servicios para Recepción:** `LiveOccupancyPage` ahora recibe `endpoint`; Recepción usa `GET /api/reception/occupancy`, que reutiliza el cálculo del Inicio (`buildOwnerHome`) y devuelve solo aforo (sin ventas, gastos ni utilidad). Antes apuntaba a `PoolPage` (solo Piscina).
- **Rutas nuevas (`client/src/App.jsx`):** `/admin-panel/aforo` y `/admin-panel/personal-en-turno` (roles SUPERADMIN y ADMINISTRADOR). Ambos endpoints usan `requireReceptionAdmin`.
- **Pruebas:** `authz-matrix-test.js` ahora tiene 86 comprobaciones (pasan): Limpieza, Mantenimiento, Restaurante y Bar reciben 403 en ambos endpoints; Recepción recibe 200, el aforo trae los 5 servicios sin campos de dinero y personal en turno no trae tarifas ni PIN.
- **Verificación real:** `docker compose up -d --build backend frontend`; sesión real como Rosa Recepción en Brave headless. Se vieron el sidebar con los 8 módulos, "Personal en turno" con 4 turnos de prueba (Bar, Limpieza, Recepción, Restaurante; todos "Por entrar") y "Control de aforo" con los 5 servicios. Los 4 turnos de prueba (ids 136–139) se cancelaron al terminar; quedan como CANCELADOS en el historial y con su registro de auditoría.
- **NO verificado:** clic por clic el resto de vistas del menú de Recepción (no se modificaron); el estado "En turno"/"Terminó" con marcaciones reales (solo se comprobó "Por entrar").
- **Pendiente (requiere respuesta del dueño):** cancelar reservas con pago. Hoy Recepción puede cancelar cualquier reserva; se recomendó que solo cancele las que no tienen pagos y que las demás pasen como solicitud al dueño (devolución solo por el dueño, en 2 días).

## 2026-09-23 — Restaurante y Bar: sidebars reorganizados + Preparación y porcionado para la cocina (IMPLEMENTADO)
Decisión del dueño: "implementarlo" para ambos, tras `RESTAURANTE_BAR_SIDEBAR_PROPUESTA_2026-09-23.md`.
- **Menú de Restaurante (`client/src/constants/menu.js`):** Inicio (Mi turno) · Pedidos (Preparar pedidos) · **Cocina** (Ver recetas, **Preparación y porcionado**) · **Insumos** (Mi stock, Solicitar insumos, Recibir insumos, Registrar merma) · **Cierre del día** (Cierre de inventario). Antes: grupos "Recetas" e "Inventario", con el cierre mezclado.
- **Menú de Bar:** Inicio · Pedidos (Preparar bebidas) · **Barra** (Ver recetas, Control de botellas) · Insumos (mismas 4 vistas) · Cierre del día. El control de botellas pasa junto a las recetas.
- **Preparación y porcionado para la cocina:** nueva ruta `/restaurante/produccion` (`client/src/App.jsx`, rol RESTAURANTE) que reutiliza `TransformationsPage` con `hideCosts`. La pantalla ya existía solo para el Superadmin (4 pestañas: limpiar o cortar, preparar una base, crear porciones, historial con trazabilidad; compara lo obtenido con lo esperado y marca fuera de tolerancia). El servidor ya permitía este uso al rol Restaurante, pero la cocina no tenía cómo llegar. Bar no lo recibe (decisión: sus botellas ya se miden por volumen/peso).
- **Costos ocultos de raíz, no solo en pantalla (`server/src/index.js`):** `withoutCosts` quita de la respuesta todo campo cuyo nombre contenga "cost" salvo para el Superadmin, en `GET /transformations/references`, `GET /transformations`, `GET /transformations/lots/:id/trace` y en los tres POST. Comprobado: el Superadmin recibe campos `cost`; la cocina, ninguno.
- **Turno obligatorio en el servidor:** los tres POST de preparación/porcionado/producción ahora exigen turno abierto (`requireActiveStaffShift`), igual que el resto de operaciones de la cocina; antes solo lo exigía la pantalla.
- **Regresión encontrada y corregida (causada por la Fase 1):** el `Navbar` consultaba `GET /dashboard` para todos los roles (campana con "pedidos necesitan seguimiento"). Al cerrar ese endpoint a Recepción/Superadmin, Restaurante y Bar recibían 403 en segundo plano y perdían ese aviso. Nuevo `GET /api/gastronomy/alerts` (solo Restaurante, Bar y Superadmin) devuelve únicamente `{ delayedOrders }` de su área; el `Navbar` lo usa para esos roles y consulta `/dashboard` solo para Superadmin y Admin de recepción (`client/src/layouts/Navbar.jsx`). Ningún otro rol quedó llamando a `/dashboard`.
- **Pruebas:** `authz-matrix-test.js` sube a 97 comprobaciones (pasan): Bar y Limpieza no entran a preparación; la cocina la ve sin ningún campo de costo; el Superadmin la sigue viendo; sin turno abierto los tres POST devuelven 409; el aviso de pedidos devuelve solo el contador y se cierra a Limpieza y Recepción. Nota: la prueba de "sin turno" requiere que Restaurante NO tenga turno abierto al correrla. Pasaron también `rbac-security-test`, `transformations-test`, `stock-requests-test`, `operational-inventory-test`, `bar-bottles-test` y `owner-home-test`.
- **Verificación real:** `docker compose up -d --build backend frontend`; marcaje real por `/api/attendance/clock` (DNI + PIN) de Carlos Cocina y Luis Bar; sesión real en Brave headless. Se recorrieron los 9 menús de cada uno sin ningún error HTTP 4xx/5xx ni excepción de JavaScript (salvo el `favicon.ico` 404, ya existente). Se vio la pantalla de Preparación y porcionado de la cocina con el sidebar nuevo y la de Control de botellas del Bar. Al terminar se marcó la salida de ambos.
- **Rastro en los datos demo:** los marcajes de prueba de Carlos Cocina y Luis Bar del 2026-09-23 quedaron en asistencia (con salida registrada) y crearon sus sesiones de inventario de turno; los registros de auditoría de prueba de esta sesión no se pueden borrar (cadena inmutable).
- **NO verificado:** registrar una preparación o porcionado de verdad (no hay lotes de existencias cargados en la base demo para probarlo) ni la pantalla con el tema del Bar en todas sus vistas; solo se comprobó que carguen sin errores.

## 2026-09-23 — Limpieza y Mantenimiento: sidebar con "Mi turno" (IMPLEMENTADO)
Decisión del dueño: seguir con lo que faltaba (Limpieza y Mantenimiento). Como en Restaurante y Bar, se decidió y ejecutó sin más preguntas.
- **Menú (`operations/src/App.jsx`, app aparte en el puerto 4174):** Limpieza = **Mi jornada** (Mi turno) + **Mis tareas** (Por hacer, En atención, Historial). Mantenimiento = **Mi jornada** (Mi turno) + **Mis trabajos** (Por hacer, En reparación, Historial). Antes eran 3 pestañas "Alertas / En atención|En reparación / Historial" y el turno se abría con un botón en el encabezado. "Alertas" pasa a llamarse "Por hacer". Ahora la app abre en "Mi turno" y la barra inferior móvil tiene 4 botones.
- **Mi turno (nuevo):** estado de la jornada (Sin turno abierto / En turno desde las HH:MM / Turno cerrado por hoy) con el botón Iniciar/Cerrar turno (DNI + PIN, el mismo modal de siempre), tres indicadores (Por hacer, Urgentes, Finalizadas hoy) y la lista "Para que tu día cuente": entrada marcada, trabajo con evidencia (tareas o trabajos finalizados hoy con fotos) y salida marcada. Es solo informativo: la validación del día para el pago semanal la hace el Superadmin y **todavía no está implementada** (Fase 3); el texto solo recuerda la regla del dueño (entrada, salida y evidencia).
- **Servidor:** `GET /api/attendance/current` ahora devuelve también `todayRecord` (entrada y salida de hoy, aunque el turno ya esté cerrado); antes solo devolvía el registro abierto, por lo que después de marcar salida no se podía mostrar la jornada.
- **Error de hora corregido (P0-9 en la asistencia):** el turno que se crea automáticamente al marcar entrada guardaba la hora en UTC (`start: at.slice(11,16)` daba "20:50" cuando en Lima eran las 15:50). Ahora usa la hora de Lima (`hotelClock`). Esto también afectaba a "Personal en turno" de Recepción para esos turnos. Los turnos auto-creados anteriores (de las pruebas de hoy) conservan la hora vieja.
- **Ajuste de texto:** un turno creado solo por marcar entrada (`source: ASISTENCIA`) ya no se muestra como "Horario programado"; se muestra "Sin horario programado para hoy".
- **Estilo:** clases nuevas al final de `operations/src/styles.css` (`day-status`, `day-check`, `nav-group`).
- **Pruebas:** `authz-matrix-test.js` sube a 99 comprobaciones (pasan; las dos nuevas verifican que "Mi turno" trae `todayRecord` y no filtra efectivo). Pasaron también `rbac-security-test`, `phase2-operations-test` y `stabilization-test`.
- **Verificación real:** `docker compose up -d --build backend operations`; marcaje real de Ana Operaciones (Limpieza) y Jorge Mantenimiento con DNI + PIN; sesión real en la app de Operaciones con Brave headless. Se recorrieron las 4 vistas de cada rol sin ningún error HTTP ni excepción, y se vio "Mi turno" sin turno abierto y con turno abierto. Al terminar se marcó la salida de ambos.
- **NO verificado:** el flujo de una tarea real de limpieza o un trabajo real de mantenimiento con fotos (la base demo no tiene tareas ni reportes), y por eso "Trabajo con evidencia" solo se comprobó en su estado vacío. El menú de Limpieza y Mantenimiento dentro del ERP principal (`menuSectionsByRole`) sigue redirigiendo a esta app.
- **Rastro en los datos demo:** los marcajes de prueba de Ana y Jorge (y los turnos auto-creados de hoy) quedaron en asistencia, con salida registrada.

## 2026-09-23 — Devoluciones de dinero (IMPLEMENTADO, P0-10 parcial)
Regla del dueño: se puede pedir la devolución hasta 24 horas después del primer pago (vale para el 100 % y para el 50 %); después ya no hay devoluciones; se devuelve en 2 días hábiles; solo el Superadmin devuelve dinero. Detalle en `DEVOLUCIONES_PROPUESTA_2026-09-23.md`.
- **Reglas (`server/src/refunds.js`, nuevo):** ventana de 24 h desde el primer pago, fecha límite de 2 días hábiles (lunes a viernes, hora de Lima), una solicitud abierta por reserva, Recepción no puede pedirla fuera de plazo y el dueño solo con excepción y motivo de al menos 10 caracteres, monto a devolver entre 0 y lo pagado (menos de lo pagado exige motivo), estados SOLICITADA → APROBADA → DEVUELTA (o RECHAZADA). Al pedirla, la reserva queda retenida (`refundHold`, pases `EN_REVISION`); al rechazar se restaura; al devolver se cancela la reserva, se anulan pases y derechos de ingreso y se registra un egreso `DEVOLUCION` ligado al servicio de origen (baja la utilidad de ese servicio).
- **Rutas (`server/src/index.js`):** `GET /api/refunds/candidates` y `GET /api/refunds` (Recepción y Superadmin; Recepción solo ve lo que registró y no ve el total devuelto en dinero), `POST /api/refunds` (Recepción/Superadmin, exige turno abierto), `POST /api/refunds/:id/decision` y `POST /api/refunds/:id/complete` (solo Superadmin). Auditoría de cada paso con estado antes → después. Con una devolución en trámite se bloquean el check-in (`POST /api/checkin`) y el cobro de saldo (`POST /api/service-bookings/:id/pay`).
- **Cierre de un hueco relacionado:** `DELETE /api/reservations/:id` y `PATCH /api/events/:id/status` (CANCELADO) ahora rechazan a Recepción si la reserva o evento tiene pagos (debe usar Devoluciones); solo el Superadmin cancela con pagos. `PATCH /api/events/:id/status` además valida que el estado sea uno de los cinco reales (cierra parte del pendiente "no valida el estado").
- **Pantalla (`client/src/modules/admin/RefundsPage.jsx`, nueva):** una sola pantalla que se adapta al rol. Recepción: Caja de recepción › Devoluciones (`/admin-panel/devoluciones`) con búsqueda, plazo restante y solicitud. Dueño: Dinero › Devoluciones (`dinero:devoluciones`, ruta `/devoluciones`) con indicadores (por decidir, por devolver, vencidas, devuelto este mes), tabla y ventanas para aprobar, rechazar y registrar la devolución. Estilos al final de `ControlPages.css`.
- **Pruebas:** `server/scripts/refunds-test.js` (sin base de datos: días hábiles, plazo de 24 h, excepciones, ciclo completo, efectos sobre reserva, pases y dinero, y visibilidad por rol; pasa), `server/scripts/refunds-e2e-test.js` (13 comprobaciones contra el servidor real; pasa) y `authz-matrix-test.js` sube a 123 comprobaciones (pasan). Pasaron también `rbac-security-test`, `stabilization-test`, `owner-home-test` y `reservations-overview-test`.
- **Verificación real:** `docker compose up -d --build backend frontend`. La prueba de punta a punta creó la reserva RES-0139 (S/ 150 de S/ 300), Recepción la solicitó como DEV-0001, el dueño la aprobó y la devolvió por Yape (operación OP-E2E-0001): la reserva quedó CANCELADA, se registró un egreso de S/ 150 a Hospedaje y la rentabilidad de Hospedaje bajó a S/ 2,399.70 de utilidad; la cadena de auditoría siguió íntegra. Se vieron con sesión real la pantalla del dueño y la de Recepción con su ventana de búsqueda (las reservas viejas salen con "Venció").
- **Rastro en los datos demo:** la reserva de prueba RES-0139 (CANCELADA), la solicitud DEV-0001 (DEVUELTA), su egreso de S/ 150 y sus registros de auditoría; asistencia de Rosa Recepción de hoy. No se pueden deshacer porque la auditoría es inmutable; si molesta en los reportes, se puede limpiar la base demo aparte.
- **NO verificado:** los botones Aprobar, Rechazar y Registrar devolución con clic en el navegador (el flujo completo se probó por la API, no por la interfaz); la devolución de reservas de Piscina, Mirador, Terraza y Eventos con datos reales (solo por la prueba con datos sintéticos); ni la anulación de un pase QR real. Los feriados no cuentan como días no hábiles.

## 2026-09-23 — Fase 2 (parte 1): cierre a las 23:00, Necesidades del día, solicitud vs teórico (IMPLEMENTADO)
- **Hora de cierre configurable** (`settings.closingTime`, por defecto 23:00): `PUT /api/superadmin/closing-time` (solo Superadmin, auditado antes → después), editable en Insumos › Necesidades del día.
- **Estado del cierre por área** (`server/src/daily-needs.js`): Cerró / Cierra a las HH:MM / **Sin cierre** (pasada la hora sin conteo enviado). Solo alerta: no bloquea despacho. Sin cierre aparece en rojo en "Pendientes de tu decisión" del Inicio (`GET /api/superadmin/home` agrega `areaClosings` y el pendiente) y en Necesidades del día.
- **Necesidades del día** (Insumos, nueva vista `DailyNeedsPage.jsx`, `GET /api/superadmin/daily-needs`): por área y por insumo = ventas de los últimos 7 días × receta vigente (con merma técnica, desde `inventory_recipe_sales`) + reposición al stock mínimo − stock del área; muestra lo que hay en almacén general y lo que **falta comprar**. Incluye lo ya pedido por el área y marca **Exceso** (tolerancia 10 %).
- **Solicitar insumos para mañana dentro del cierre** (`ClosingRequestSection.jsx`, en Restaurante y Bar, durante el conteo o tras enviarlo): sugiere lo justificado (`GET /api/inventory-closing/suggestions`, solo su área, sin costos); se envía como solicitud `source=CIERRE`. "Solicitar insumos" queda como canal de emergencia (`EMERGENCIA`).
- **Solicitudes** (migración 017): `inventory_stock_requests.source` y `inventory_stock_request_lines.justified_quantity` (lo justificado al momento de pedir). Las tarjetas muestran "Del cierre del día / Emergencia", "Se justifica: X" y la marca Exceso.
- **Pruebas:** `stock-requests-test` (agregadas migraciones 006 y 017; pasa), `operational-inventory-test`, `rbac-security-test`, `owner-home-test`, `authz-matrix-test` (123) pasan. Verificado con el sistema real: solicitud CIERRE de 50 kg de Arroz (justificado 0) salió marcada Exceso; tras enviar el conteo del Restaurante el estado cambió a "Cerró"; capturas de Necesidades y Solicitudes con sesión real.
- **NO verificado / pendiente de la Fase 2:** la tabla de sugerencias del cierre con datos (el stock demo es enorme, así que no se justifica pedir nada; solo se vio el estado vacío); el pendiente rojo "sin cierre" pasada la hora (solo probado el cálculo por API); **food cost real vs teórico por plato/turno** y **alerta que proyecte cuándo se agota** (puntos 4 y 5) siguen sin hacer. La lista de compras aún no se alimenta automáticamente de Necesidades.
- **Rastro demo:** solicitud SOL-RES-405E82 (pendiente), sesión de inventario 16 de Restaurante enviada (sin cerrar por el Superadmin), asistencia de Carlos.

## 2026-09-23 — Fase 2 (parte 2): alerta de agotamiento proyectado (IMPLEMENTADO)
- **Alcanza para:** en Necesidades del día cada insumo con ventas muestra cuántos días le quedan al stock del área según lo vendido por día (`daysLeft` = stock ÷ consumo diario por receta). Rojo si alcanza para 1 día o menos, ámbar hasta 3 días (`DEPLETION_ALERT_DAYS` en `server/src/daily-needs.js`). Un insumo con 3 días o menos aparece en la lista aunque no se justifique pedirlo hoy.
- **Verificado:** el endpoint devuelve `daysLeft` y `depletionAlertDays`; compila y se reconstruyó backend y frontend. **NO verificado:** ver una alerta real: con el stock demo (miles de kg) y sin ventas en los últimos 7 días ningún insumo cae bajo 3 días.
- **Pendiente de la Fase 2:** que Necesidades alimente la Lista de compras, y food cost real vs teórico por plato/turno.

## 2026-09-23 — Fase 2 (parte 3, cierre de la fase): orden de compra desde Necesidades y Food cost real vs teórico (IMPLEMENTADO)
- **Orden de compra desde Necesidades** (`POST /api/superadmin/daily-needs/purchase-order`, `server/src/food-cost.js`): botón "Crear orden de compra con lo que falta" en Necesidades del día. Suma lo "por comprar" de Restaurante y Bar por insumo, crea la orden (estado APROBADA, sin proveedor, costo = costo promedio) con el detalle por área en cada línea, y se completa en Lista de compras. Responde 409 si no hay nada por comprar. Usa el mismo `createPurchaseOrder` de siempre (auditoría y estado heredado incluidos).
- **Food cost real vs teórico** (Insumos, vista nueva `FoodCostPage.jsx`, `GET /api/superadmin/food-cost?days=`): por área, por cierre de turno enviado/cerrado: ventas con receta, costo teórico (consumo teórico × costo), costo real (consumo derivado del conteo físico × costo), diferencia, % teórico y % real, y los 5 insumos con mayor diferencia. Por plato: vendidos, ventas, costo teórico y % teórico; el **% real por plato es una estimación** (la diferencia de los cierres repartida según el costo teórico de cada plato) y así se indica en pantalla.
- **Verificado con el sistema real:** el food cost responde para ambas áreas y se vio en pantalla con sesión real; para la orden de compra se subió temporalmente el mínimo de Arroz, se creó la orden OC-20260924-AA5A50 (Arroz 6.419 kg, S/ 32.10) y se restauró el mínimo (10). **NO verificado:** el botón con clic en el navegador (la ruta se probó por API); la diferencia real ≠ 0 (los cierres demo se enviaron con lo esperado, así que salen sin diferencia).
- **Fase 2 completa** con: cierre configurable, Necesidades, solicitud vs teórico, alerta de agotamiento, orden de compra y food cost. Falta que el dueño pruebe el flujo completo. Rastro demo: orden OC-20260924-AA5A50.

## 2026-09-23 — Fase 3 (parte 1): Torre de control, puntualidad y día validado (IMPLEMENTADO)
- **Torre de control** (Equipo, vista nueva `ControlTowerPage.jsx`, `GET /api/superadmin/control-tower?date=&days=`, solo Superadmin; Recepción recibe 403): resumen del día, cierre del día por área (rojo si falta), tablero por turno (Esperado / En turno / Llegó tarde / Sin marcar / Faltó / Cerró turno con entrada, salida y minutos de tardanza), quien marca sin turno programado también aparece, huecos de cobertura del hotel 7:00–24:00 por área, días por validar y ranking de puntualidad de los últimos 14 días (tardanzas, minutos, faltas, días validados).
- **Puntualidad:** tardanza = hora real de entrada (Lima) − hora del turno − tolerancia. Tolerancia **configurable** (10 min por defecto) en la misma pantalla (`PUT /api/superadmin/workforce-settings`, auditado antes → después). Solo se registra; no descuenta planilla.
- **Día validado** (`server/src/workforce.js`): VALIDADO = entrada + salida + evidencia (mínimo configurable, 1 por defecto); PENDIENTE = entrada y salida sin evidencia; NO VALIDADO = sin entrada o sin salida. La evidencia sale sola de lo que la persona hizo: tareas de limpieza y trabajos de mantenimiento finalizados, pedidos atendidos, mermas, cierre de inventario enviado, caja, ingresos y accesos. El Superadmin aprueba o rechaza a mano un día con motivo de al menos 8 caracteres (`POST /api/superadmin/day-validations`, queda en la auditoría y en `state.dayValidations`).
- **Planilla semanal** (`GET /api/payroll/weekly`): ahora **solo paga los días validados**; devuelve además `pendingDays`, `notValidatedDays` y `pendingTotal`. El acceso ya era solo del Superadmin (el hallazgo P0-2 estaba resuelto).
- **Pruebas:** `authz-matrix-test` (123), `rbac-security-test`, `stabilization-test`, `phase2-operations-test` pasan. Verificado con el sistema real: el tablero muestra los 5 marcajes de prueba de hoy, Carlos (con cierre de inventario enviado) sale VALIDADO y los demás POR VALIDAR; al aprobar el día de Rosa con motivo pasó a VALIDADO y su planilla subió de S/ 0 a S/ 65; pantalla vista con sesión real.
- **NO verificado / pendiente de la Fase 3:** la pantalla de la planilla del cliente (`WorkforcePage`) no muestra aún los días pendientes; los botones Aprobar/Rechazar con clic en el navegador (probado por API); estados Esperado/Tardó/Sin marcar/Faltó y huecos de cobertura (no hay turnos programados hoy en la base demo); evidencia de Limpieza, Mantenimiento, Recepción y Piscina (la base demo no tiene tareas, cajas ni ingresos: los nombres de campo se leyeron del código, no se probaron con datos). **Sin hacer:** relevo de turno (quién entrega y quién recibe), SLA con escalamiento de alertas (Recepción → Superadmin), planilla como gasto en la rentabilidad, y la exigencia de evidencia en el servidor para cerrar tareas.
- **Nota importante:** con la regla nueva, en los datos actuales casi ningún día queda validado solo (falta evidencia); esos días aparecen "por validar" hasta que el dueño los apruebe o haya actividad real.

## 2026-09-23 — Fase 3 (parte 2, cierre de la fase): SLA de alertas, relevo de turno, planilla como gasto (IMPLEMENTADO)
- **Alertas sin atender (SLA)** en la Torre de control: solicitudes/incidencias abiertas y tareas de limpieza pendientes que superan el plazo (30 min por defecto, configurable 5–1440 min, `alertSlaMinutes`, auditado). Pasado el plazo se muestran "En Recepción"; al doble del plazo, "Escaló a ti". Indica si tienen responsable. Contador "Alertas vencidas" en el resumen.
- **Relevo de turno:** por área, quién entregó (salida), quién recibió (entrada), minutos sin cubrir entre ambos y la diferencia de inventario (costo) del cierre enviado por quien entregó, que queda a su nombre.
- **Planilla como gasto:** los días validados × tarifa diaria entran a los gastos y a la rentabilidad por servicio (`GET /api/superadmin/home` recibe `payrollRows` de `workforce.js`; últimos 120 días). Imputación: Recepción, Limpieza y Mantenimiento → Hospedaje; Piscina → Piscina; Restaurante y Bar → gastos generales. La nota de Rentabilidad ya no dice que falta planilla. **Regla de imputación decidida por mí; confírmala o cámbiala.**
- **Planilla (Equipo › Turnos y asistencia):** muestra días validados (los que se pagan) y días por validar con su monto.
- **Evidencia exigida por el servidor:** ya existía para cerrar tareas de Limpieza (fotos por zona) y trabajos de Mantenimiento (fotos antes y después); no hizo falta cambiar nada.
- **Pruebas:** `authz-matrix-test` (123), `rbac-security-test`, `stabilization-test`, `owner-home-test` pasan. Verificado con el sistema real: 14 alertas de prueba de septiembre aparecen vencidas y escaladas al dueño; Hospedaje muestra gastos que incluyen la planilla validada; pantalla vista con sesión real.
- **NO verificado:** relevos con datos (no hay dos personas de la misma área con turnos consecutivos en la base demo); clic en Aprobar/Rechazar; la imputación de planilla con varios servicios.
- **Fase 3 completa.** Pendiente de decisión del dueño: si la tardanza descuenta planilla (hoy solo se registra).

## 2026-09-23 — Descuento por tardanzas (decisión del dueño) (IMPLEMENTADO)
- **Regla:** cada 3 tardanzas sin justificar dentro de la semana de pago se descuenta el 20 % del pago semanal (`lateThreshold` = 3 y `lateDiscountPercent` = 20, configurables en la Torre de control y auditados). Si hay 6 sin justificar, 40 %, con tope de 100 %. Una tardanza cuenta cuando la entrada supera la hora del turno más la tolerancia (10 min) en un turno programado.
- **Justificar:** el Superadmin justifica una tardanza con un motivo de al menos 8 caracteres (`POST /api/superadmin/late-justifications`, auditado); las justificadas no cuentan. Nueva sección "Tardanzas de la semana" en la Torre de control.
- **Planilla** (`GET /api/payroll/weekly`): agrega `grossTotal`, `lateCount`, `unjustifiedLates`, `discountPercent`, `discountAmount`; `total` ya es el neto. La tabla de Equipo › Turnos y asistencia muestra las tardanzas sin justificar y el descuento.
- **Prueba:** nuevo `server/scripts/workforce-late-test.js` (3 tardanzas = 20 % de S/ 260 = S/ 52; una justificada, sin descuento; entrada dentro de la tolerancia no cuenta) y `authz-matrix-test` (123) pasan.
- **NO verificado / límite:** con clic en el navegador ni con tardanzas reales (la base demo no tiene turnos programados con marcaciones tardías). El gasto de planilla en la rentabilidad usa el pago bruto, sin restar estos descuentos.

## 2026-09-24 — Superadmin: panel de cada módulo y unificación visual (IMPLEMENTADO)
- **Panel de módulo** (nueva primera vista de los 11 módulos con submódulos; `ModuleHubPage.jsx`, `moduleGuide.js`, `ModuleHub.css`): tarjeta con el objetivo del módulo, cifras clave reales, avisos que llevan a donde se resuelven, "cómo funciona" (flujo en pasos, quién lo usa) y una tarjeta por submódulo con lo que se hace ahí, su cifra en vivo y un botón directo. Al abrir un módulo desde el menú lateral se entra a su panel; `/superadmin/<módulo>` también.
- **Datos:** `GET /api/superadmin/modules-overview` (`server/src/module-hub.js`, solo Superadmin; Recepción recibe 403) calcula desde la base y el estado: reservas por servicio, pagos por verificar, saldos, existencias bajo mínimo, lotes por vencer, necesidades por comprar, cierres sin hacer, torre de control, devoluciones, incidencias, etc.
- **Navegación:** barra de pestañas entre las vistas del módulo (Panel + submódulos) en todas las pantallas; se quitó la tarjeta de cabecera duplicada y "Volver al resumen".
- **Colores:** los verdes y dorados heredados en `styles.css` y los CSS del Superadmin (382 valores) pasaron a la familia azul de la marca; tipografía serif de títulos anulada dentro del Superadmin.
- **Verificado:** 11 paneles + 3 vistas heredadas capturadas con sesión real sin errores HTTP ni de JavaScript; `authz-matrix-test` (123) pasa. **NO verificado:** cada una de las ~45 vistas heredadas clic por clic; algunas pueden conservar tonos verdes en componentes con colores propios (tailwind `park-green` de otros archivos) o el rojo/ámbar de estados, que se dejaron a propósito.
- **Revisión visual pantalla por pantalla (2026-09-24):** se recorrieron con navegador real las ~50 vistas. Corregido: el título/etiqueta de las vistas heredadas salía cortado en el borde (margen lateral); **Insumos › Movimientos** mostraba la misma pantalla que Existencias y ahora es un kardex real (`GET /api/superadmin/stock-movements`, `StockMovementsPage.jsx`) con filtros por texto, tipo y periodo. Pendiente/observado: Perfil 360° sin cliente elegido solo muestra "Elige un cliente"; gráficos de Reservas generales con rótulos muy grandes; solo 2 de 91 platos están habilitados para vender (dato, no error); Mantenimiento muestra 14 reportes de prueba idénticos ("Daño controlado para prueba") y Restaurante un pedido de prueba de 20 000+ min.

## 2026-09-24 — Recorrido en vivo de la experiencia del cliente (localhost:4173) y correcciones
- **Pedido explícito del dueño:** navegar el cliente, buscar fallas y corregirlas (excepción a la regla "no tocar `customer/`"; avisar a la otra IA de estos cambios).
- Recorrido con Brave (extensión Claude): portada, las 5 pestañas, reserva de Piscina hasta el pago (sin confirmar), Mirador (incl. validación sin horario), Terraza, cotizador de Eventos (aforo: con 100 invitados solo queda el Salón), búsqueda de Hospedaje, Mis reservas y la estadía (Inicio, Pedidos, Mis accesos, Mi cuenta, Salida); celular a 390 y 320 px.
- **Cobro duplicado en Hospedaje (servidor, dinero).** RES-0145 tiene dos pagos aprobados: S/ 535 (Yape web, aprobado en Recepción) y S/ 520 ("Pago en Caja", 2 min después). Causa: `registerPayment` con `bookingId` actualizaba `booking.paid` pero no el espejo `state.reservations` (su `advance` quedó en 0); al editar la reserva en Recepción, `PUT` calculó `receivedNow = 520 − 0` y creó un pago nuevo.
  - `server/src/index.js` `registerPayment`: al pagar por `bookingId`, se sincroniza `advance/balance/paymentStatus` del espejo de Hospedaje.
  - `server/src/index.js` edición de reserva: lo ya pagado es `max(reservation.advance, booking.paid)`; si el formulario manda menos, responde 409 en vez de cobrar de nuevo.
  - **Datos existentes NO tocados:** RES-0145 sigue con S/ 1,055 cobrados sobre S/ 520 (Nora Dass). Requiere corrección/devolución por Caja con trazabilidad — decisión del dueño.
- **Cliente — pase "Pendiente de pago" estando pagado y alojado:** `customer/src/nuevo/site.js` pintaba el estado `ACTIVO` con la etiqueta por defecto. Nuevo mapa `PASS_LABEL` (Pendiente de pago / Listo / Activo / En uso / Finalizado / Desactivado) usado en "Mis accesos" y "Incluido en tu Premium".
- **Cliente — hora con doble punto** ("08:52 a. m.. En cuanto…") en Salida: se quita el punto final del formato es-PE.
- **Cliente — manifest:** `/logo.png` daba 404 y usaba verde obsoleto → ícono `/brand/park-plaza-mark.svg`, colores `#0B1020`/`#F5F8FC`; `index.html` theme-color verde → `#F5F8FC`.
- **Cliente — header en celular:** con la grilla 1fr·auto·1fr, "Mis reservas (1)" se partía en 3 líneas (botones de 58 px). `customer/src/nuevo/app.css`: en ≤560 px logo a la izquierda y botones en una línea (36 px); en ≤360 px el nombre no se parte.
- Verificación: `node --check` en `index.js` y `site.js`; `docker compose build customer backend` + `up -d`; en Brave: "Mis accesos" muestra **Activo**, Salida muestra "08:52 a. m. En cuanto…", manifest e ícono 200, header medido a 390/320 px sin desborde. **El arreglo del cobro duplicado no se probó de punta a punta** (requiere crear y pagar una reserva de prueba).
- Respaldos previos (`index.js.bak`, `site.js.bak`) en la carpeta temporal de la sesión.
- Observado sin corregir: número Yape `999 100 001` de relleno; textos contradictorios ("recibe tu QR al instante" vs. "tu pase aparece cuando el hotel confirma"); en la portada de escritorio el logo del header se encima con "PARK PLAZA PUCALLPA" al hacer scroll; el botón Atrás del navegador sale de la app (no hay historial); la carta a la habitación solo tiene 2 platos.

## 2026-09-24 — Experiencia del cliente v5: Hospedaje de punta a punta (portada → reserva → viaje → estadía → salida)
- **Pedido del dueño:** rediseñar con criterio de diseñador (no genérico), interactivo, responsivo, con la paleta azul; solo Hospedaje por ahora; corregir el parpadeo al cambiar de servicio en la portada.
- **Parpadeo (causa raíz):** cada clic reconstruía `#app` y repetía la animación de entrada (`.view`), y la portada recargaba su foto PNG de ~2 MB. Arreglo: `core.js render()` anima solo al cambiar de pantalla (`#app.enter`); la portada cambia de servicio **en su lugar** (dos capas de foto con fundido, texto que se desliza, indicador que se mueve; verificado que el nodo no se recrea); las hojas (calendario, huéspedes) ya no se re-animan al tocar un día; fotos convertidas a WebP (55–220 KB) en `customer/public/images/hs/`.
- **Portada:** panel oscuro + foto por servicio (fotos amazónicas/Ucayali; se dejó de usar la de "mirador" con mar). Hospedaje trae la búsqueda en la portada (cápsula Llegada→Salida + Huéspedes + "Ver habitaciones", atajos) y dato real "Esta noche quedan N habitaciones · desde S/ X". Mirador muestra la hora real del atardecer en Pucallpa (cálculo astronómico, `ui.js`).
- **Reserva en 3 pasos** (`hospedaje.js` reescrito): 1) Habitaciones (solo las que caben, total de todas las noches, "Ideal para N", "Quedan N"; detalle en panel lateral/hoja con **elección de número por piso**). 2) Arma tu estadía (plan Solo descanso / Con desayuno / Premium con ahorro real; itinerario día por día; experiencias del Premium con día y hora; comodidades y cochera con placa). 3) Confirma y paga (identificación por DNI en la misma pantalla, 50 %/todo, Yape/Plin/Caja con pasos numerados y botón "copiar número"). Resumen vivo con total animado (escritorio) y barra inferior con desglose (celular). Mismo cuerpo de `POST /public/bookings` que antes.
- **Después de reservar** (`estadia.js` nuevo, solo Hospedaje; Piscina/Mirador/Terraza siguen con `site.js`): pase tipo boarding pass con llave QR bloqueada hasta verificar el pago, rastreador Reserva→Pago→Check‑in→Estadía→Salida, cuenta regresiva a la llegada, "Antes de llegar", Google Maps, "Haz más de tu estadía". Estadía tipo app: progreso de la estadía, llave digital a pantalla completa, "¿Qué necesitas?" (cada pedido de ayuda pide confirmación, con nota opcional), solicitudes con estado, "Hoy en Park Plaza", pedidos a la habitación con progreso por pedido, cuenta, y **salida guiada** (cuenta → pedidos → mantener presionado para pedir la salida; con teclado, confirmación) y espera en revisión. Cierre con "tu estadía en números", calificación con comentario y "Reservar otra estadía". Barra inferior de 5 pestañas en celular.
- **Otros arreglos:** botón Atrás del navegador/celular ya navega dentro de la app (antes salía); Inter se carga de Google Fonts (antes caía a Segoe UI); favicon (quitaba un 404); horas "12:00 m." y "p. m." sin partirse de línea; precio "desde" de Piscina usa el pase adulto.
- Archivos: `customer/src/nuevo/{core,main,hospedaje,estadia,ui,site,boot}.js`, `v5.css` (nuevo), `app.css` (animación), `customer/index.html`, `customer/public/images/hs/*`.
- Verificación: `vite build` sin errores; revisión visual con Brave headless (puppeteer-core) a 1440 px y 390 px de todas las pantallas (capturas en `docs/mockups/hospedaje-v5/`, estados posteriores con API simulada solo en la prueba); regresión: Piscina/Mirador/Terraza/Eventos abren su flujo, Atrás funciona, sin errores de consola ni 404; en el contenedor real con la sesión de Nora Dass (RES-0145): estadía, llave y salida en revisión con datos reales. **No se creó ninguna reserva ni pago nuevo** (el envío de pago no se probó de punta a punta; usa el mismo endpoint y cuerpo que la versión anterior).
- Pendiente de decisión del dueño: número Yape/Plin real (`PAY_NUMBER`), descripciones reales por tipo de habitación en el catálogo (hoy se usa texto propio sin datos inventados), carta con más platos, y extender v5 a Piscina/Mirador/Terraza/Eventos.

## 2026-09-26 — Admin de Recepción remasterizado (espacio de trabajo propio)
- **Pedido del dueño:** rehacer todo el panel del Admin de recepción con criterio propio: sistema completo, formal, serio y entendible, con la paleta y el logo, sin "módulos genéricos" ni aspecto de IA. Luego se probará junto con la experiencia del cliente.
- **Armazón nuevo** (`client/src/modules/recepcion/ReceptionShell.jsx`, `recepcion.css`): reemplaza al Sidebar/Navbar genéricos solo para ADMINISTRADOR (y la vista previa del dueño en `/admin-panel/*`). Menú azul noche con logo, 5 grupos (Operación del día · Reservas y clientes · Accesos y servicios · Caja · Coordinación) y contadores en vivo; cabecera con estado del **turno** (DNI + PIN, con aviso de rendir caja antes de salir), estado de la **caja**, **buscador global** (Ctrl K: huésped, DNI, reserva de cualquier servicio, habitación), botón "Nueva" y campana de pendientes. Estilo plano, Inter, bordes finos, estados solo en etiquetas.
- **Pantallas nuevas (desde cero):**
  - **Tablero del turno** (`/admin-panel`, `DeskPage.jsx`): banda del día (ocupación, huéspedes, personas esperadas), agenda de hoy de los 5 servicios con línea de "ahora", "Requiere atención", mi caja del turno por método, estado de habitaciones, cobros por verificar, solicitudes abiertas, llegadas y salidas.
  - **Llegadas y salidas** (`/admin-panel/movimientos`, `MovementsPage.jsx`): pestañas Llegadas / En casa / Salidas. Check-in con lista de verificación (pago, habitación lista, fecha, identidad) y cobro del saldo o verificación del Yape en la misma hoja; atrasadas y "no se presentó". Salida en 3 pasos: aviso a Limpieza → cuenta (hospedaje + consumos − pagos + daños) → cobro y cierre.
  - **Habitaciones** (`/admin-panel/habitaciones`, `RoomsBoardPage.jsx`): plano por piso (en casa, sale hoy, salida vencida, llega hoy, disponible, limpieza, bloqueada) con bloqueo/habilitación por mantenimiento; **planificación de 14 días** tipo rack hotelero con ocupación diaria y detección de **cruce de reservas** (hoy lo había en la 301).
  - **Agenda de reservas** (`/admin-panel/reservas`, `BookingsPage.jsx`): los 5 servicios por fecha de uso (próximas/hoy/pasadas), próximos 7 días, ficha con pagos, historial y cobro (`ReservationDrawer.jsx`).
  - **Cobros y verificaciones** (`/admin-panel/cobros`, `ReceivablesPage.jsx`): Yape/Plin por verificar, saldos vencidos y próximos, cuentas abiertas de huéspedes en casa.
- **Pantallas anteriores** (Clientes, QR, Eventos, Piscina, Caja, Limpieza, etc.) se muestran dentro del mismo armazón con la misma identidad (capa `.rx-legacy`; se carga `ClientAccessExperience.css`, que antes solo cargaba el Superadmin y dejaba Clientes/QR desarmados). `/checkin`, `/checkout`, `/recepcion`, `/hotel*` redirigen a los módulos nuevos para Recepción. Se eliminó `AdminReceptionControlPage.jsx` (inicio anterior).
- **Servidor:** `server/src/reception-desk.js` (nuevo, funciones puras) + rutas `GET /api/reception/desk`, `/planning`, `/search`, `/reservations`, `/reservations/:type/:id` (solo Recepción y dueño; sin costos ni gastos). `reservations-overview.js`: filtro opcional `when` (hoy/próximas/pasadas por fecha de uso), no cambia lo del dueño. Cobros usan las rutas existentes con sus reglas (`/pagos`, `/service-bookings/:id/pay`, `/events/:id/payments`, `/checkin`, `/checkout/inspect`, `/checkout`, `PATCH /rooms/:id`).
- **Otros:** `AdminResourcePage` ya no pide `/proveedores`, `/products`, `/roles` si no es el dueño (daban 403 en Pagos registrados). `ClientsPage` acepta `?q=` (lo usa el buscador global).
- **Verificación real:** `vite build`; `docker compose up -d --build backend frontend`; `authz-matrix-test.js` = **148 comprobaciones OK** (nuevas: las 4 rutas abiertas a Recepción y dueño, cerradas al personal de campo, y el tablero sin costos). Prueba de punta a punta con clics reales en Brave (`docs/mockups/recepcion-v2/e2e.cjs`): iniciar turno (DNI+PIN) → abrir caja → verificar el Yape de RES-0143 (Mirador, S/ 150) → aviso de revisión a Limpieza de la 301 (RES-0141) → Limpieza sube 3 fotos y termina (por API) → cerrar salida → check-in de RES-0140 en la 301. Sin errores HTTP ni de JavaScript. Capturas 1440 y 390 px en `docs/mockups/recepcion-v2/`.
- **Datos que dejó la prueba (base demo, solo mis datos de prueba):** RES-0143 pagada por Yape (registrada a nombre de Rosa); RES-0141 (Lucía) con salida cerrada; RES-0140 (Marco) en casa en la 301; Ana Operaciones marcó entrada y salida. **Rosa Recepción quedó con turno y caja abiertos** (S/ 0 en efectivo): el servidor no deja marcar la salida sin rendir la caja; el dueño puede usar ese turno en sus pruebas o rendirla desde Mi caja y cierre.
- **No incluido (queda para después):** venta en mostrador de Piscina/Mirador/Terraza como reserva con QR (hoy solo existe el ingreso de Piscina y la reserva desde la app del cliente); el formulario de nueva reserva de hospedaje y el de eventos siguen siendo las pantallas anteriores (con la nueva identidad).

## 2026-09-26 (tarde) — Recepción: revisión módulo por módulo, sin duplicados y con una sola medida visual
- **Pedido del dueño:** recorrer todos los módulos, corregir lo descuadrado (botones y números muy grandes, falta de armonía) y quitar lo que se repite o hace casi lo mismo. Recorrido en su Brave (extensión) + capturas de página completa con Brave headless de las 23 vistas; alcance aprobado por el dueño ("procede").
- **Menú de 23 a 16 módulos** (`admin/adminReceptionNavigation.js`): Operación del día (Tablero, Llegadas y salidas, Habitaciones) · Reservas (Agenda, Eventos, Clientes) · Accesos (Control de accesos, Aforo, Cochera) · Caja (Cobros pendientes, Pagos y comprobantes, Mi caja y cierre, Devoluciones) · Coordinación (Personal en turno, Limpieza, Mantenimiento). Rutas antiguas redirigen a su reemplazo (`RECEPTION_LEGACY_REDIRECTS`).
- **Quitados/unidos:** "Reservas de hospedaje" → crear y editar desde la Agenda (`HotelReservationDrawer.jsx`, con búsqueda o registro rápido del cliente y disponibilidad). "Mirador" y "Terraza" abrían por error la pantalla de Eventos → sus reservas están en la Agenda (filtro por servicio). "Piscina" + "Validar pases QR" → **Control de accesos** (`AccessPage.jsx`, dos pestañas + ingresos validados hoy). "Pagos registrados" + "Boletas y facturas" → **Pagos y comprobantes** (`PaymentsPage.jsx`: tabla con quién registró y emisión/descarga/reintento del comprobante). "Pedidos de Restaurante y Bar" retirado (Recepción no podía operarlos: el botón daba 403; los consumos están en la cuenta del huésped). Se eliminó `finance/AdminMiCajaPage.jsx`.
- **Rehechos:** **Mi caja y cierre** (`CashPage.jsx`: efectivo del turno, cobros digitales aparte, "debe haber", diferencia con motivo obligatorio, historial de cierres) y **Cochera** (`ParkingPage.jsx`: plano de espacios, ingreso y salida).
- **Una sola medida visual** en las pantallas que conservan su lógica (Eventos, Clientes, Aforo, Devoluciones, Personal, Limpieza, Mantenimiento) vía `recepcion.css`: sin etiqueta sobre el título, títulos 22 px, botones 34 px sin sombra, números 24 px, tarjetas sin íconos de color, "Actualizar" como botón secundario, gráficos a escala, tablas sin desborde, pestañas como el resto. Tildes corregidas (Habitación, Acción, Teléfono, Programación, Método).
- **Servidor:** `POST /api/checkout` libera el espacio de cochera de la reserva; `POST /api/pagos` exige reserva, estadía o evento a Recepción (decisión: sin cobros sueltos); `/api/reception/desk` trae el detalle de la caja del turno (esperado, movimientos); la Agenda "Próximas/Hoy" oculta canceladas salvo que se filtren. `client/public/demo-evidence.svg` (las fotos de prueba salían rotas).
- **Verificación:** `vite build`; `docker compose up -d --build backend frontend`; `authz-matrix-test.js` 148 OK; prueba con clics reales (`docs/mockups/recepcion-v2/e2e2.cjs`): crear RES-0148 desde la Agenda, editarla desde su ficha, cancelarla (sin pagos); emitir boleta B001-00000001 (simulación) del pago de RES-0143; ingreso y salida de piscina (Lucía Torres); ingreso y salida en cochera P-18; cobro suelto rechazado (400); sin errores de JavaScript. Capturas 1440 y 390 px en `docs/mockups/recepcion-v2/`.
- **No probado de punta a punta:** la liberación automática de cochera al cerrar una salida (requiere cerrar la estadía de un huésped con cochera; la de NORA DASS es del dueño).

## 2026-09-26 — Restaurante (cocina) remasterizado: estación propia, 7 módulos, sin costos
- **Pedido del dueño:** hacer con el Restaurante lo mismo que con Recepción (sistema formal, misma identidad, sin módulos repetidos).
- **Estación propia** (`client/src/modules/cocina/KitchenShell.jsx`, `cocina.css` sobre `recepcion.css`): menú azul noche con logo, turno DNI + PIN (reutiliza `ShiftClockModal`, ahora parametrizable), estado del inventario del día en la cabecera, buscador de recetas y pedidos, campana (pedidos fuera de tiempo, nuevos, envíos por recibir, platos agotándose). `AppLayout` la monta para el rol RESTAURANTE.
- **Menú de 9 a 7** (`cocina/kitchenNavigation.js`): Cocina (Mi turno, Pedidos) · Recetas (Recetario, Preparación y porcionado) · Insumos (Mi stock y mermas, Pedir y recibir, Cierre del día). "Registrar merma" pasa a la fila de cada insumo; "Solicitar" y "Recibir insumos" se unen. Rutas antiguas redirigen (`KITCHEN_LEGACY_REDIRECTS`).
- **Pantallas nuevas:** Mi turno (`KitchenHomePage`: pedidos por etapa, inventario del día con "Abrir inventario", envíos por recibir, platos que se agotan con el insumo que limita); **Pedidos** (`KitchenOrdersPage`: tablero Nuevos → Aceptados → En preparación → Listos con tiempo de cada ticket, guía de pesaje por plato con lote reservado, cancelación con destino de lo preparado, entregados de hoy); **Recetario** (`RecipeBookPage`: fichas con calculadora de porciones, emplatado, equipo, alérgenos y porciones que alcanzan con el stock); **Mi stock y mermas** (`KitchenStockPage`); **Pedir y recibir** (`KitchenSupplyPage`); **Cierre del día** (`KitchenClosingPage`: 4 pasos, **conteo ciego** —no muestra lo esperado— con motivo obligatorio fuera de tolerancia, y el pedido para mañana). "Preparación y porcionado" conserva su pantalla (la usa también el dueño) con la identidad unificada.
- **Eliminadas por no usarse:** `RestaurantDashboard`, `RestaurantOrdersPage`, `RestaurantRecipesPage`, `RestaurantInventoryPage`, `OrdersAreaPage`, `OperationalRecipeManual`. (`RestaurantReceiptsPage` y `ClosingRequestSection` siguen: los usa el Bar.)
- **Servidor (regla "la cocina no ve costos ni precios"):** el recetario de cocina enviaba `costPerPortion` y `salePrice`, el inventario del turno `unitCost/varianceCost` y la guía de cada pedido `recipe_unit_cost/sale_unit_price`. Nuevo `withoutMoney` en `index.js` aplicado a `/technical-recipes/manual/:area`, `/operational-inventory/sessions(/:id)` y `/orders/:id/inventory` (el Superadmin sigue viendo todo). `operational-inventory.js`: abrir un inventario con un cierre enviado u observado ahora explica "El cierre X espera la revisión del dueño…" en vez del error genérico de índice único.
- **Verificación:** `vite build`; `docker compose up -d --build backend frontend`; `authz-matrix-test.js` **150 OK** (2 nuevas: la cocina no recibe costos ni precios); recorrido de las 7 vistas con sesión real de Carlos Cocina a 1440 y 390 px (capturas en `docs/mockups/cocina-v2/`). Carlos marcó entrada y salida.
- **No probado con clics (bloqueado por una regla de negocio real):** abrir el inventario de hoy, mover pedidos, registrar merma y el conteo/cierre. El cierre de cocina del 23/09 (`TURNO-20260923235519300`, "prueba fase 2") está **enviado y esperando la revisión del dueño**; hasta que lo apruebe el sistema no deja abrir el inventario de hoy ni aceptar pedidos (índice `uq_inventory_active_session_per_warehouse`). La cocina ahora lo ve explicado. Script listo para repetir la prueba: `docs/mockups/cocina-v2/e2e3.cjs`.

## 2026-09-26 (noche) — Restaurante: prueba de punta a punta con clics y 3 correcciones del lado del dueño
- **Aprobado como Superadmin (por pedido del dueño) el cierre de cocina del 23/09** `TURNO-20260923235519300` desde Superadmin → Restaurante → Control de consumo (34 insumos, sin diferencias). Era lo que bloqueaba el inventario de hoy.
- **Prueba con clics** (`docs/mockups/cocina-v2/e2e3.cjs`, capturas en `e2e3/`), sesión real de Carlos Cocina: abrir inventario del turno ✔, formulario de merma ✔, PED-0026 aceptar ✔ y cancelar ✔, formulario de solicitud ✔, iniciar conteo ✔, conteo ciego de 34 insumos y enviar cierre ✔ (`TURNO-20260926230849378`, queda **enviado, esperando al dueño**). Sin errores HTTP ni de JavaScript. El script ahora marca la entrada de Carlos (DNI + PIN) antes de empezar.
- **Fallas encontradas y corregidas:**
  1. El dueño no veía el cierre por aprobar si era de otro día (la pantalla filtra por la fecha de hoy). `OperationalInventoryPage.jsx`: aviso fijo "Cierres esperando tu aprobación" con todos los enviados/observados de cualquier fecha y área, con clic para abrirlos.
  2. El estado de un turno sin abrir salía en inglés ("Pending"). `StatusBadge.jsx`: `PENDING` → "Sin abrir".
  3. Cada intento de "Abrir inventario" con un cierre pendiente creaba un turno vacío nuevo (quedaron 3 del 26/09: ids 17, 18, 19). `operational-inventory.js` (`createOperationalInventory`): ahora avisa del cierre pendiente **antes** de crear, y si ya hay un turno sin abrir del mismo día lo reutiliza.
- **Verificación:** `node --check` y `vite build` OK; desplegado con permiso del dueño (`docker compose up -d --build backend frontend`); en vivo como Superadmin apareció "Cierres esperando tu aprobación (1)" y desde ahí se aprobó el cierre de hoy `TURNO-20260926230849378` (34 insumos, 0 diferencias). `authz-matrix-test.js` **150 OK** (con Carlos fuera de turno).
- **Limpieza (con permiso del dueño):** borrados los turnos vacíos 13, 14, 15, 17, 18, 19 (PENDING, sin apertura, conteos, mermas ni cierres).

## 2026-09-26 (noche) — Bar remasterizado: la misma estación que la cocina + Control de botellas
- **Pedido del dueño:** terminado el Restaurante, hacer el sistema del Bartender igual (formal, misma identidad, probado con clics en los roles reales).
- **Una sola estación para Cocina y Bar** (`client/src/modules/cocina/`): `KitchenShell` recibe el área (`<KitchenShell area="BARTENDER" />` en `AppLayout`) y las pantallas leen `useKitchen().station` (rutas, API de pedidos, recetas y textos) de `STATIONS` en `kitchenNavigation.js`. Así el Bar hereda todo lo probado en la cocina sin duplicar código.
- **Menú del Bar, 7 vistas** (`BAR_MODULES`): Barra (Mi turno, Pedidos) · Recetas (Recetario, **Control de botellas**) · Insumos (Mi stock y mermas, Pedir y recibir, Cierre del día). Rutas antiguas redirigen (`BAR_LEGACY_REDIRECTS`: `/bartender`, `/bar/estacion`, `/bartender/inventario/mermas`, `/bartender/inventario/recepciones`).
- **Pedidos del Bar en 3 etapas** (Nuevos → En preparación → Listos → Entregar), como exige el servidor para `BARTENDER`; el ticket muestra "Qué medir" en ml por bebida y lote.
- **Control de botellas nuevo** (`cocina/BarBottlesPage.jsx`): abrir botella desde un lote, registrar cada dosis (a la medida / de más / de menos), medir por volumen o por peso (tara + densidad; la medida es ciega) y cerrar con la diferencia. KPIs de botellas abiertas, servicios y fuera de medida. El Superadmin sigue usando su pantalla (`BarBottlePage`, con costos).
- **Fallas corregidas en el servidor:**
  1. **Doble descuento del pisco:** servir desde una botella y cerrar la botella movían stock, y el pedido entregado lo volvía a descontar. `bar-bottles.js`: la botella queda como control de medida (sin movimientos); el stock lo mueven el pedido ENTREGADO, las mermas y el conteo del cierre (regla del dueño). No había botellas registradas antes.
  2. **Un turno de inventario por cada marcación de entrada** (`ensureAttendanceOperationalSession` en `index.js`): con 2 bartenders o 4 cocineros, el segundo en marcar dejaba la estación en "Por abrir" con el inventario ya abierto. Ahora reutiliza el turno abierto del área o el pendiente del día. La estación además prefiere el turno abierto sobre uno sin abrir.
  3. **Precios y datos de la reserva en los pedidos de Cocina y Bar** (`GET /api/restaurante` y `/api/bartender`): llegaban precio, costo de receta, total y la reserva completa del huésped. Nuevo `forStation`: solo qué preparar, destino y nombre del cliente.
  4. **Botellas con costos para el bartender:** `/api/bar/bottles*` pasa por `withoutMoney`.
- **Eliminadas del flujo:** `BarDashboard`, `BarOrdersPage`, `BarRecipesPage`, `BarInventoryPage`, `RestaurantReceiptsPage` y `ClosingRequestSection` ya no tienen rutas (los archivos siguen en `modules/employees/`; no se borraron por falta de permiso).
- **Verificación:** `vite build`; `docker compose up -d --build backend frontend`; `authz-matrix-test.js` **156 OK** (6 nuevas: Cocina y Bar sin costos, precios ni reserva en recetas, turno, pedidos y botellas). Prueba con clics `docs/mockups/bar-v2/e2e.cjs` (capturas en `e2e/`), sesión real de Luis Bar (DNI 70000004, PIN 4444): abrir inventario ✔; pedido real de un huésped (Marco Prueba, hab. 301, PED-0027, 2 Pisco Sour) aceptar → listo → entregar ✔ y el pisco bajó 180 ml ✔; botella abrir/servir/medir/cerrar ✔ sin mover el stock ✔ y sin costos ✔; recetario ✔; pedir y recibir ✔; conteo de 15 insumos y cierre enviado ✔; celular 390 px sin desborde ✔. Sin errores HTTP ni de JavaScript. Como Superadmin: se ven las botellas con su diferencia en ml y soles, y se aprobó el cierre del Bar (sin diferencias, consumo teórico 180 ml de pisco).
- **Para la prueba se habilitó Pisco Sour** en Catálogo → Carta del cliente y al terminar **se volvió a pausar**.
- **Hallazgos para el dueño (no son del código):** ninguna bebida del Bar está habilitada para la venta (40 nunca activadas, Algarrobina pausada), así que hoy los clientes no pueden pedir bebidas; y solo 3 de 41 bebidas tienen todos sus insumos en el almacén del bar (Algarrobina, Pisco Sour, Punch de Limón).

## 2026-09-26 (noche) — Limpieza y Mantenimiento remasterizados: estaciones dentro del ERP
- **Pedido del dueño:** pasar a los operadores (Limpieza y Mantenimiento) con el mismo trabajo hecho en Recepción, Cocina y Bar.
- **Decisión:** las estaciones viven ahora **dentro del ERP** (`client/src/modules/operaciones/`) con la misma identidad y piezas (recepcion.css, rxkit, `ShiftClockModal`). Antes el ERP mandaba a estos roles a la app aparte `operations/` (puerto 4174) con otro diseño. `AppLayout` monta `<OpsShell area="LIMPIEZA|MANTENIMIENTO" />`; se quitó `OperationsRedirect` de `App.jsx`.
- **Menú (3 vistas cada una):** Mi jornada (Mi turno) · Mis tareas / Mis trabajos (Tareas o Trabajos con Por hacer / En curso, e Historial). Rutas: `/limpieza`, `/limpieza/tareas`, `/limpieza/historial`, `/mantenimiento`, `/mantenimiento/trabajos`, `/mantenimiento/historial`; las antiguas redirigen (`OPS_LEGACY_REDIRECTS`).
- **Mi turno:** jornada del día (entrada, trabajo con evidencia y salida, lo que el dueño valida), cuánto hay por empezar / en curso / urgente / finalizado hoy y "Lo que sigue".
- **Limpieza › Tareas:** tarjetas grandes para el celular; cada tarea pide sus fotos según su tipo (revisión antes de la salida: 1 por zona; pedido del huésped: 1 del trabajo; limpieza de habitación: entrada y salida por zona, la de salida después de la de entrada); "Tomar foto" abre la cámara. Reportar problema/daños con foto (a Recepción, o a Mantenimiento si es reparación). Los pedidos del huésped muestran "Espera que Recepción acepte el pedido" hasta que Recepción los asigna.
- **Mantenimiento › Trabajos:** qué reportaron (con la foto de quien reportó), foto antes y después, "Qué reparaste" obligatorio y observaciones.
- **Historial:** lista (legible en celular) con fotos, qué se hizo y reportes.
- **Servidor:** `GET /api/cleaning/tasks` pasa por `withoutMoney` (llegaba el precio de la habitación).
- **Verificación:** `vite build`; `docker compose up -d --build backend frontend`; `authz-matrix-test.js` **158 OK** (2 nuevas: Limpieza y Mantenimiento sin precios). Prueba cruzando roles `docs/mockups/operaciones-v2/e2e.cjs` (capturas en `e2e/`): el huésped Marco Prueba (hab. 301) pidió limpieza y toallas desde su app (SOL-0101/0102) → Ana marcó entrada con DNI + PIN (clic) y vio las tareas esperando a Recepción → Recepción (Rosa, por API) las aceptó y asignó → Ana atendió LIM-0082 con foto y la finalizó; en LIM-0083 reportó "la ducha gotea" con foto (SOL-0103 a Mantenimiento) y la finalizó → Jorge marcó entrada → Recepción aceptó y le asignó SOL-0103 → Jorge inició, subió foto antes y después, escribió qué reparó y finalizó (SOLUCIONADO) → historial con fotos → ambos marcaron salida. Celular 390 px sin desborde. Sin errores HTTP ni de JavaScript.
- **Pendiente (decisión del dueño):** la app aparte `operations/` (puerto 4174, dominio `OPERATIONS_DOMAIN` en producción) sigue funcionando pero ya nadie llega a ella desde el ERP; conviene retirarla o redirigirla al ERP. `client/src/config/operations.js` quedó sin uso. Los pasos de Recepción de esta prueba se hicieron por API; sus pantallas de Limpieza y Mantenimiento siguen siendo las antiguas (vestidas con `.rx-legacy`).
- **Datos de prueba creados:** SOL-0101..0103, LIM-0082/0083 (finalizadas), marcaciones de Ana y Jorge con entrada y salida.

## 2026-09-27 — Superadmin remasterizado: centro de dirección con la identidad de las estaciones
- **Pedido del dueño:** rehacer todo el Superadmin con la identidad definida (la de Recepción, Cocina, Bar y Operaciones), con todas las vistas para controlar el negocio digitalizado (cliente, sistema interno y operadores), luego borrar el sistema antiguo y arreglar el login general.
- **Armazón nuevo** `client/src/modules/admin/OwnerShell.jsx` + `owner.css` + registro de pantallas `ownerPages.js` (reemplaza a `SuperAdminShell.jsx` y sus 6 CSS). Menú lateral en 4 grupos y 14 módulos (`superAdminNavigation.js`):
  - **Dirección:** Inicio, Por aprobar.
  - **Clientes y ventas:** Clientes, Reservas, Admisión y aforo, Catálogo y precios.
  - **Operación:** Restaurante, Bar, Insumos, Limpieza y mantenimiento, Equipo.
  - **Gestión:** Dinero, Control del sistema.
  - Buscador de funciones y clientes, chip "Por aprobar N", enlace a la estación de Recepción. Los enlaces viejos (`/inventario/kardex`, `/reportes`, etc.) redirigen a la vista nueva.
- **Bandeja "Por aprobar"** (`server/src/owner-approvals.js`, `GET /api/superadmin/approvals`): cierres de inventario, pagos por verificar, solicitudes de insumos, devoluciones, cajas en revisión y días por validar, más una lista de vigilancia (mantenimiento sin técnico, limpieza sin asignar, pedidos sin entregar, platos sin venta habilitada).
- **34 pantallas nuevas** en `client/src/modules/dueno/` (kit común `kit.jsx`): pedidos en vivo, recetas, preparación, cierres, botellas, existencias (con el catálogo de insumos que no estaba en el menú), movimientos, mermas, necesidades del día, food cost, solicitudes, compras, proveedores, distribución, limpieza, mantenimiento, torre de control, personal (con la planilla semanal que no estaba en el menú), turnos, pagos, cajas, facturación, gastos, configuración, usuarios, roles, auditoría, calidad de datos, accesos, servicios y tarifas, habitaciones, carta, textos e imágenes y eventos. Se conservan las vistas azules v3 (Inicio, Clientes, Reservas, Devoluciones, Rentabilidad, Aforo).
- **Recepción y Cocina:** `recepcion/EventsDeskPage.jsx` y `recepcion/ClientsDeskPage.jsx` nuevas (reemplazan a las páginas antiguas de eventos y clientes); `cocina/PrepPage.jsx` reemplaza a `TransformationsPage`.
- **Servidor:**
  - Nuevos: `PUT /api/proveedores/:id` (editar proveedor), `POST /api/reception/tasks` (tarea de limpieza de rutina), `PATCH /api/caja/movements/:id/service` (corregir el servicio de un gasto), `availableFor` editable en la carta.
  - `workforce.js`: las evidencias de los técnicos (`SOLUCION`, `resolvedAt`) no se contaban y su día nunca se validaba solo.
  - `GET /api/cleaning/tasks` sin dinero.
- **Sistema antiguo eliminado** (respaldo en `backups/legacy-2026-09-27/`):
  - 86 archivos de `client/src` sin ninguna ruta: páginas viejas de admin, inventario, finanzas, hotel, recepción, clientes, eventos y empleados, `Sidebar`, `Navbar`, `WorkerStationLayout`, `constants/menu.js`, `config/operations.js` y `components/ui/*`.
  - `App.jsx` y `AppLayout.jsx` reescritos: solo rutas vigentes; cada rol va a su estación (`constants/roles.js` → `HOME_BY_ROLE`).
  - `styles.css`: de 416 a unas 150 líneas, sin las clases del diseño antiguo (erp-v6, reception-v6, superadmin-home, catalog-modern, hotel-*).
  - **App `operations/` (puerto 4174) retirada:** carpeta, contenedor, servicios en ambos docker-compose, bloque `OPERATIONS_DOMAIN` del Caddyfile, `package.json`, `.env.example`, preflight de producción, `VITE_OPERATIONS_URL` y el origen CORS 4174. En producción ya no hace falta `OPERATIONS_DOMAIN`.
- **Login general** (`pages/Login.jsx`) con la identidad: panel azul noche con las estaciones, la hora de Lima y el acceso a marcar asistencia; formulario sobrio. Adiós al verde, el dorado y la tipografía con serifas.
- **Reloj de asistencia** (`/reloj`) rehecho con la misma identidad y teclado numérico para tablet; la lógica de DNI y PIN no cambió. El dueño lo abre desde Equipo › Turnos y asistencia.
- **Pantallas de sistema:** acceso denegado, error general, error de una vista y carga usan `client/src/access.css`.
- **Otros:** nombres con tildes en Roles y permisos, etiqueta del rol OPERATIVO. En celular, las tablas de las vistas v3 ya se desplazan en su propio ancho (antes una regla heredada las forzaba a 680 px) y las franjas de 4 KPIs pasan a 2 columnas.
- **Pruebas actualizadas:** `client/scripts/access-contract-test.mjs` y `scripts/shift-ui-contract.mjs` reescritas para las estaciones actuales; `scripts/navigation-contract.mjs` reconoce las rutas `/superadmin/:modulo/:vista`.
- **Verificación:**
  - `vite build`; `docker compose up -d --build backend frontend`; `authz-matrix-test.js` **158 OK**.
  - `docs/mockups/superadmin-v2/shots.cjs`: 50 vistas del dueño sin errores en escritorio y en celular (390 px).
  - `stations-smoke.cjs`: `/login` y `/reloj` en escritorio y celular, más todas las pantallas de Recepción, Limpieza y Mantenimiento, y el aterrizaje de cada rol.
  - `clock-e2e.cjs`: con clics en el teclado de `/reloj` se marcó la entrada de Carlos y Luis, se recorrieron las 6 pantallas de Cocina y las 6 de Bar con el turno abierto y se marcó la salida. Todo OK.
  - Contratos de accesos y turnos OK. El contrato de navegación pasa en el ERP, pero falla en la portada del app de clientes (`customer/src/RefugioWelcome.jsx`), que no es de este trabajo.
- **Datos de prueba creados:** marcaciones de 16 s de Carlos y Luis (entrada y salida) el 2026-09-27.

## 2026-09-27 (tarde) — App del cliente v6: una sola app, portada nueva y todo conectado
- **Pedido del dueño:** quedarse con mi propuesta de experiencia del cliente, eliminar todo lo de la otra IA, darle mucho más diseño a la portada y a los servicios, y verificar que todo esté conectado.
- **App de la otra IA eliminada** (respaldo en `backups/legacy-2026-09-27/customer-otra-ia/`):
  - Todos sus archivos de `customer/src` (App.jsx, *Experience.jsx, RefugioWelcome, ExperienceFlows, sus CSS y utilidades), sus pruebas `customer/scripts/`, la ruta `/clasico` y el enlace "versión clásica".
  - Las fotos PNG de `public/images/landing` y `experiences` (~25 MB); en su lugar, `images/v6/` en WebP (~1 MB).
  - React y sus dependencias fuera del cliente (`package.json` solo con `vite` y `firebase`; `package-lock.json` sincronizado). Las variables `VITE_YAPE/PLIN_QR_URL` del Dockerfile del cliente se quitaron.
- **Mi app pasa a `customer/src/app/`** (antes `nuevo/`), cargada por `customer/src/main.js`; `index.html` nuevo.
- **Portada v6** (`portada.js` + `portada.css`):
  - Foto a todo lo ancho con titular a dos tonos.
  - Debajo, las secciones: Hoy en Park Plaza (en vivo), cinco experiencias, un día aquí (con la hora real de Pucallpa), el atardecer de hoy con cuenta regresiva, habitaciones, sabores (carta habilitada y bar), eventos (espacios reales), todo desde tu celular y visítanos.
  - Aparición al bajar, paralaje, y una cabecera que se vuelve sólida al bajar.
- **Servicios:**
  - Piscina, Mirador, Terraza y Eventos con cabecera fotográfica y pasos iguales a Hospedaje.
  - Tira de próximos días con los cupos reales; los turnos de hoy que ya pasaron no se ofrecen.
  - Cada espacio de evento con su foto.
  - "Es mañana" en vez de "Faltan 1 día".
- **Conexiones nuevas:**
  - `GET /api/public/catalog` ahora trae `hotel`: nombre, dirección, teléfono, correo, números de Yape y Plin, y titular.
  - La app los muestra; se quitaron el número `999 100 001` fijo en el código y la dirección inventada "Av. Centenario 123".
  - Configuración general del dueño: nueva tarjeta **Cobros por Yape y Plin** (`yapeNumber`, `plinNumber`, `payHolder`; validación de celular de 9 dígitos en el servidor y en la página). Sin número, la app pide pagar en caja.
  - La portada usa los **Textos e imágenes** que edita el dueño (`experienceMedia`). Los textos por defecto del servidor se reescribieron y los guardados (de la otra IA) se restauraron a esos por defecto desde el panel.
  - Las vistas previas del panel usan las fotos nuevas (`client/public/images/v6`).
- **Error corregido en el panel del dueño:** Configuración general salía con todos los campos vacíos, porque `GET /api/configuracion` responde una lista y la página esperaba un objeto.
- **Datos demo:** Yape y Plin `999100001`, titular "Hotel Park Plaza". El dueño debe poner los reales en Configuración general.
- **Verificación:**
  - `e2e-conexion.cjs`, 12/12 OK:
    - la reserva de Mirador RES-0149 hecha con clics llega a *Por aprobar*;
    - aprobada con la ruta de Recepción, la app pasa sola a Confirmada con el QR activo;
    - las toallas de Marco llegan a Limpieza (LIM-0084) y a Recepción;
    - la falla SOL-0105 llega a Recepción, que la asigna a Jorge (entra y sale con el reloj), y aparece en su estación;
    - el pedido PED-0028 llega a Cocina.
  - `navigation-contract.mjs` OK: 41 rutas del ERP; en el cliente, 20 pantallas, 88 botones con su acción y 14 rutas del servidor.
  - `authz-matrix-test.js` 158 OK; 50 vistas del dueño OK; contratos de accesos y turnos OK.
  - Capturas en escritorio y celular en `docs/mockups/cliente-v6/`; revisión de Hospedaje v5 sin errores.
- **Documentación:** `docs/EXPERIENCIA_CLIENTE_NUEVA.md` reescrito para la v6.

## 2026-09-28 — App del cliente v7: portada de una sola pantalla + pantalla de Servicios
- **Pedido del dueño:** "la portada parece una landing page sin armonía; solo es una portada, cuando haga clic vea los servicios". Se quitó la página larga de 10 secciones.
- **Portada (`home`)**: una sola pantalla sin scroll. Fotos de los 5 servicios que pasan solas cada 6,5 s (empieza por el servicio que va con la hora de Pucallpa), la marca "Park Plaza" grande, un botón **Explorar experiencias**, hora real y atardecer de hoy, barras de tiempo con los 5 servicios, "Cómo llegar" (Google Maps con la dirección de Configuración general) y acceso directo a la reserva activa. Entra a Servicios con el botón, tocando la foto, con la rueda del mouse o deslizando hacia arriba. En escritorio, cursor "Entrar" sobre la foto. Animación de entrada solo la primera vez de la sesión.
- **Servicios (`servicios`, nueva)**: los 5 servicios como paneles que se abren (en fila en escritorio, apilados en celular). El panel abierto muestra foto, textos de Catálogo › Textos e imágenes, dato en vivo de hoy (habitaciones libres, cupos de piscina/mirador, atardecer, terraza abierta, espacios de eventos), horario, precio "desde" y su botón de reserva. Hospedaje trae el buscador de fechas y huéspedes con "Esta noche / Fin de semana / 3 noches". Flechas del teclado cambian de panel; en escritorio se abren al pasar el mouse.
- Transición animada portada → servicios (View Transitions; sin ella, cambio directo). Respeta "reducir movimiento".
- **Navegación**: Atrás desde habitaciones, piscina/mirador/terraza y eventos vuelve a Servicios; `?exp=MIRADOR` abre Servicios con ese panel; "Reservar otra vez" (hospedaje) va a Servicios. Elegir Hospedaje desde "Mis reservas" abre el calendario directo.
- Archivos: `customer/src/app/portada.js` y `portada.css` (reescritos), `main.js`, `core.js` (`refresh`/`soft` por pantalla, cabecera oscura en ambas pantallas), `hospedaje.js`, `visits.js`, `events.js`, `estadia.js`, `v5.css` (se quitaron los estilos de la portada anterior), `customer/index.html` (Inter 200–850 para los títulos finos).
- Pruebas actualizadas: `scripts/navigation-contract.mjs` (ya no exige las 9 secciones; exige portada → servicios y los 5 servicios con botón) y `docs/mockups/cliente-v6/e2e-conexion.cjs` (entra por la portada nueva; `WEB` configurable).
- **Verificación:** contrato OK (21 pantallas, 86 acciones); e2e 12/12 OK (creó la reserva de prueba RES-0150 y sus tareas LIM-0085, SOL-0107, PED-0029); capturas en 1440, 1024, 390 y 360 px sin scroll horizontal ni errores de JS; contenedor `park_plaza_customer` reconstruido.

## 2026-09-28 — Auditoría de escalabilidad (sin cambios en la app)
- **Pedido del dueño:** "mira si el sistema es escalable; si no, no sirve".
- Informe completo: `ESCALABILIDAD_AUDITORIA_2026-09-28.md`. Veredicto: **hoy no es escalable**. La causa es que todo el sistema vive en una sola fila JSON (`app_state`), que se bloquea incluso para leer. Techos medidos: ~45 lecturas y ~9 escrituras por segundo. Con 90 días de datos simulados (43 MB), 1 persona espera 2,2 s por pantalla y con 50 a la vez el 83 % de los pedidos se cae.
- Plan en 3 fases: quitar el bloqueo de lecturas y sacar la auditoría del JSON (días) → pasar reservas, pagos y pedidos a tablas (semanas) → varias copias del servidor e infraestructura en la nube.
- Se agregaron los scripts de prueba `scripts/carga/carga.mjs` e `inflar.mjs`. Se probó sobre una copia de la base (`pp_carga`), borrada al terminar; la base real no se tocó.

## 2026-09-28 — Escalabilidad Fase 0: lecturas sin bloqueo, copia en memoria y auditoría en su tabla
- **Qué:**
  - `readState` sin `FOR UPDATE`, con copia en memoria congelada que se renueva por `version`.
  - Migración `018_app_state_version_audit_log`: columna `version` + disparador que la sube en cada escritura; archiva la auditoría en `audit_log` y deja 200 registros en el JSON.
  - `mutateState` reutiliza la copia.
  - `/api/auditoria`, la verificación de la cadena y el historial de reservas leen `audit_log`.
  - Avisos en tiempo real agrupados cada 250 ms, sin avisar en login ni identificación.
  - Catálogo público en caché de 20 s.
  - El ERP sondea como mucho cada 30 s con el tiempo real conectado.
  - `ensureOrderDeadlines` ya no modifica pedidos al leer.
- **Por qué:** auditoría de escalabilidad (`ESCALABILIDAD_AUDITORIA_2026-09-28.md`); el dueño aprobó la Fase 0.
- **Archivos:**
  - `server/src/db.js`, `server/src/index.js`, `server/src/order-operations.js`, `server/migrations/018_*`.
  - `client/src/hooks/useFetch.js`.
  - `scripts/carga/recorrido-lecturas.mjs` (nuevo); `docs/mockups/cliente-v6/e2e-conexion.cjs` (`API` configurable).
- **Resultado:** lecturas de ~45/s a ~700/s; con 200 personas a la vez, espera típica de 4,8 s a 0,26 s; escrituras de ~9/s a ~14/s; estado real de 661 KB a 467 KB.
- **Límite que queda:** con 30 días de historia simulada vuelve a ~38 lecturas/s y ~0,8 s por escritura. La Fase 1 es obligatoria.
- **Verificación:** 1 080 lecturas sin errores; e2e 12/12 (creó RES-0151, LIM-0086, SOL-0109, PED-0030 en la base real); 7 pruebas del servidor OK; cadena de auditoría intacta; panel del dueño sin errores. Respaldo previo en `backups/antes-fase0-2026-09-28.dump`.

## 2026-09-28 — Escalabilidad Fase 1: estado operativo + historial en tablas

**Qué se cambió**
- Migración `019_history_records`: tabla de historial con índices por fecha, cliente y código.
- Módulo nuevo `server/src/history.js`:
  - reglas de qué se archiva;
  - vigilante que archiva cada minuto;
  - lectura con historia por rango, por cliente o por registro;
  - restauración al actuar sobre algo archivado.
- `server/src/index.js`: estas pantallas ahora leen el historial:
  - Inicio del dueño;
  - listados y detalle de reservas;
  - clientes;
  - "Mis reservas" y comprobantes del cliente;
  - listas de pagos, eventos, pedidos, solicitudes, tareas, accesos, caja, devoluciones y movimientos de inventario;
  - planilla y torre de control.
- `server/src/owner-home.js`: exporta `ownerHomeWindow`.
- `server/src/inventory-relational.js`: la comparación de movimientos pasó de cuadrática a lineal.
- Scripts: nuevo `scripts/carga/comparar-rutas.mjs`; `inflar.mjs` rehecho con fechas pasadas y estados cerrados.

**Por qué**
Con la Fase 0 el sistema seguía degradándose al acumular historia: con 30 días de datos, cada escritura tardaba ~0,8 s. El dueño aprobó la Fase 1.

**Resultado con 90 días de datos simulados**

| | Antes | Después |
|---|---|---|
| Estado en memoria | ~26 MB | 0,5 MB |
| Lecturas por segundo | 32 | 469 |
| Escrituras por segundo | 1, con caídas | 37, sin errores |
| Mixto (pedidos por segundo) | 7 | 94 |

**Cambios visibles**
- Las listas de pagos, eventos, accesos, caja, tareas, solicitudes, devoluciones y reservas por servicio muestran por defecto los últimos 90 días. El servidor acepta `?from=&to=` para pedir otro rango.
- Las estaciones de cocina, bar y limpieza ya no muestran lo cerrado de días anteriores.

**Verificación**
- Comparación ruta por ruta contra la Fase 0: solo diferencias esperadas.
- Recorrido de lecturas: 0 errores.
- Flujo de punta a punta: 12/12. Creó en la base real RES-0152, LIM-0087, SOL-0111 y PED-0031.
- 6 pruebas del servidor OK.
- Restauración probada: una reserva archivada se encuentra al actuar sobre ella, y un pago archivado se pudo facturar.

Respaldo previo: `backups/antes-fase1-2026-09-28.dump`. Detalle en `ESCALABILIDAD_AUDITORIA_2026-09-28.md` §8.

## 2026-09-28 — Selector de período en las listas con historial

**Qué se cambió**
- Las pantallas con período ahora le piden al servidor solo ese tramo, en lugar de descargar todo y filtrarlo en el navegador:
  - Ingresos y pagos: agrega la opción "1 año".
  - Gastos: su opción "Año" mostraba solo 90 días desde la Fase 1; se corrigió.
  - Accesos con QR.
- Las pestañas de Piscina, Mirador, Terraza y Eventos en Reservas tienen un selector nuevo: "90 días / 1 año / Toda la historia".
- En Pagos de recepción, la opción "Todo" pasó a llamarse "90 días", que es lo que realmente muestra.
- Servidor: `listWindow` (en `history.js`) acepta `?range=N` y `?range=todas`, además de `?from=&to=`.

**Archivos**
- `server/src/history.js`
- `client/src/modules/dueno/PaymentsLedgerPage.jsx`, `ExpensesPage.jsx`, `AccessLogPage.jsx`
- `client/src/modules/recepcion/PaymentsPage.jsx`
- `client/src/modules/admin/SuperAdminReservationsPage.jsx`

**Verificación**
- En el ERP real, con el navegador: "1 año" pide `/pagos?from=2025-09-29` y "Toda la historia" pide `range=todas`, sin errores.
- Recorrido de lecturas: 0 errores.
- Contrato de navegación: OK.

## 2026-09-28 — Escalabilidad Fase 2: varias copias del servidor, límites por persona, respaldos y monitoreo

### Qué
- **Tiempo real entre copias:** los avisos pasan por Postgres LISTEN/NOTIFY (`server/src/realtime-bus.js`).
- **Arranque y tareas:** candado de migraciones al arrancar (`db.js`), y las tareas de cada minuto las hace una sola copia a la vez (`asLeader`).
- **Límites de intentos compartidos y por persona:** migración `020_shared_rate_limits` y `server/src/rate-limit.js`. `TRUST_PROXY` ahora es un número de saltos: `"2"` en producción, `"1"` en local.
- **Métricas y alertas:** `server/src/metrics.js`, la ruta `GET /api/superadmin/system-health` y la pantalla nueva `client/src/modules/dueno/SystemHealthPage.jsx` (Control del sistema › Salud del sistema).
- **ERP:** el tiempo real se conecta solo por websocket.
- **Producción:** `deploy.replicas` (2 por defecto) y un servicio `backup` diario que guarda 14 días.
- **Scripts:** `scripts/carga/carga.mjs` acepta varias direcciones del servidor (reparte los pedidos por turno).

### Por qué
Para crecer con más copias del servidor. Además, en la revisión apareció un fallo grave: el cliente número 11 que se identificaba en 15 minutos quedaba bloqueado, porque todos los clientes compartían un contador por IP en memoria. Se reprodujo en el sistema real.

### Resultado
- Con 2 copias, las lecturas pasan de ~716/s a ~1 444/s y el uso mixto de 225/s a 434/s, con 0 errores.
- El tiempo real llega de una copia a la otra en ~270 ms.

### Verificación
- Flujo completo repartido entre copias: 12/12.
- Límites de intentos:
  - 15 clientes distintos: pasan todos.
  - Mismo DNI: bloqueado en el intento 11, aunque se repartan entre las copias.
- Respaldo generado y restaurado con éxito.
- Sistema real:
  - 0 errores en 1 088 lecturas.
  - Flujo completo 12/12.
  - 15 identificaciones sin bloqueo.
  - Pantalla de salud sin errores.

Respaldo previo: `backups/antes-fase2-2026-09-28.dump`. Detalle en `ESCALABILIDAD_AUDITORIA_2026-09-28.md` §9.

## 2026-09-28 — Cierre local de la escalabilidad: 2 copias en la PC, respaldo local, monitoreo conjunto y ensayo de producción

**Qué**
- `docker-compose.yml`: agrega `backend_2` (alias `backend`, así nginx reparte entre las dos copias) y el servicio `park_plaza_backup` (respaldo diario, guarda 7 días).
- Migración `021_server_metrics`: métricas por minuto y latido de cada copia. Salud del sistema suma todas las copias y lista cada una.
- `db.js`: la copia en memoria se recarga ante cualquier cambio de versión, también hacia atrás (al restaurar un respaldo).
- Guía nueva `DESPLIEGUE_NUBE_PRUEBA.md`.
- `.env.production.example` sin `OPERATIONS_DOMAIN` y con la opción sslip.io.
- `e2e-conexion.cjs` y `recorrido-lecturas.mjs` aceptan `STAFF_PASSWORD` (y el primero, `BROWSER_ARGS`).

**Por qué**
El dueño seguirá en local y mañana probará en una nube de prueba. La PC debe funcionar con la misma arquitectura escalable, y la configuración de producción tenía que quedar probada antes.

**Verificación**
- **Ensayo completo de `docker-compose.production.yml` en la PC** (proyecto `pp_prodtest`, ya borrado):
  - HTTPS con Caddy;
  - 2 copias repartidas por nginx;
  - IP real del cliente en los límites de intentos;
  - respaldo automático;
  - restauración en caliente en ambos sentidos;
  - 0 errores en 1 088 lecturas;
  - flujo completo 12/12;
  - ~950 pedidos/s sin errores.
- **Instalación local final:** 0 errores en 1 088 lecturas por nginx, tiempo real entre copias 6/6, flujo completo 12/12 dos veces, contrato de navegación OK.
- **Respaldo previo:** `backups/antes-dos-copias-local-2026-09-28.dump`.
- **Detalle:** `ESCALABILIDAD_AUDITORIA_2026-09-28.md` §10.

## 2026-09-28 — Centro de dirección del dueño v3: menú plano, Tablero en vivo y gráficos a tamaño real

**Pedido del dueño:** "el Superadmin está cabeceando". Tenía submódulos que los otros paneles no tienen, y cuadros con gráficos de barras enormes que ocupaban todo. Quería una propuesta propia, con la armonía de Recepción, Cocina y Operaciones, todo conectado, nada vacío y en tiempo real.

### La propuesta
- **Menú plano como el de Recepción.** Pasa de 14 módulos con 51 subpantallas desplegables (y un "Panel del módulo" intermedio en cada uno) a **17 entradas en 5 grupos**, ordenadas según lo que el dueño quiere saber:

  | Grupo | Entradas |
  |---|---|
  | Ahora | Tablero · Por aprobar · Dentro del hotel |
  | Ventas | Reservas · Clientes · Lo que ve el cliente |
  | Operación | Cocina · Bar · Inventario · Compras · Limpieza y mantenimiento · Equipo |
  | Dinero | Cobros y caja · Gastos · Rentabilidad |
  | Sistema | Configuración · Seguridad y salud |

  Cuando un tema tiene varias vistas, se eligen con **pestañas dentro de la página**, no con submenús.
- **Insumos se dividió en dos:** Inventario (existencias, movimientos, mermas, food cost) y Compras (necesidades del día, solicitudes, órdenes, proveedores, distribución).
- **"Lo que ve el cliente"** reúne todo lo que el dueño publica en la app del cliente: servicios y tarifas, habitaciones, carta, textos e imágenes.
- **Seguridad y salud** reúne salud del sistema, auditoría y calidad de datos.
- **Tablero nuevo** (`admin/OwnerBoard.jsx`), con la forma del tablero de Recepción:
  - un bloque oscuro con la fecha, el estado del hotel en una línea, el selector de período (Hoy / 7 días / Mes), las cifras clave (vendido, utilidad, personas dentro, por cobrar) y accesos a Por aprobar y a la app del cliente;
  - debajo, tarjetas compactas:
    - ventas y gastos;
    - requiere tu decisión;
    - personas dentro;
    - resultado por servicio;
    - cobros por medio y por canal;
    - agenda de hoy de los cinco servicios;
    - habitaciones con la ocupación de 14 días;
    - actividad en vivo;
    - Cocina y Bar.

  Todo se actualiza solo en tiempo real. El servidor ahora entrega la dirección de la app del cliente (`links.customerApp`).
- **Gráficos a tamaño real** (`OwnerCharts.jsx`): cada gráfico mide su tarjeta y se dibuja a 1 unidad = 1 píxel. Antes se estiraban, y en una tarjeta ancha las letras llegaban a 28 px y las barras eran enormes. Ahora la letra más grande de todo el panel mide 13 px. El ranking de utilidad de Rentabilidad usa el mismo adaptador.
- **Tablas y listas de alto acotado**, con encabezado fijo y desplazamiento propio. Existencias pasó de 6 083 px de alto a 1 196 px, y una lista de 40 alertas ya no deja vacía la tarjeta vecina.
- **Nada vacío:** el Perfil 360° ya no es una pestaña. Se abre desde el directorio o el buscador, y sin cliente elegido muestra el directorio.
- **Tiempo real:**
  - se activó en las pantallas con datos que cambian por la operación: comprobantes, pagos, auditoría, existencias, movimientos, mermas, food cost, compras, proveedores, distribución, planilla, habitaciones y salud;
  - las pantallas con la opción apagada tampoco se refrescaban cada cierto tiempo, y por eso Salud no se actualizaba;
  - el botón "Actualizar" de la cabecera ahora recarga todas las pantallas abiertas (evento `parkplaza:refresh` en `useFetch`);
  - el tiempo real sigue apagado solo en los formularios de configuración, para no borrar lo que el dueño está escribiendo.
- **Compatibilidad:**
  - todos los enlaces anteriores (`insumos:*`, `dinero:gastos`, `sistema:auditoria`, `…/panel`, rutas antiguas) llegan a su pantalla nueva mediante `resolveSuperAdminTarget` y `findSuperAdminDestination`;
  - los avisos del servidor (`go: [...]` de Por aprobar y del Inicio) siguen funcionando.

### Archivos
- `client/src/modules/admin/`: `superAdminNavigation.js`, `ownerPages.js`, `OwnerShell.jsx`, `OwnerBoard.jsx` (nuevo), `OwnerCharts.jsx`, `ProfitabilityPage.jsx`, `ClientsHub.jsx`, `owner.css`.
- `client/src/hooks/useFetch.js`.
- 12 pantallas de `client/src/modules/dueno/`, para activar el tiempo real.
- `server/src/index.js`: `links.customerApp` en `/api/superadmin/home`.
- `docs/mockups/superadmin-v3/shots.cjs` (nuevo): recorre las 50 vistas del menú y mide pantallas caídas, errores, desborde, altura, letra de los gráficos y submenús.

### Verificación
- **`shots.cjs` sobre las 50 vistas:** 0 caídas, 0 errores HTTP/JS, 0 desbordes, 0 submenús.
  - La letra de gráfico más grande mide 13 px (antes 28).
  - La página más alta mide 2 259 px (antes 6 083).
- **Celular (390 px):** 50 vistas sin caídas ni desbordes.
- **Tiempo real** (`docs/mockups/superadmin-v3/tiempo-real.cjs`): una solicitud creada desde la app del cliente apareció en "Actividad en vivo" del Tablero en **0,97 s**, sin recargar (SOL-0120, dato de prueba).
- **Otras pruebas:**
  - contrato de navegación OK;
  - contrato de accesos OK (38 rutas);
  - matriz de permisos 158 OK;
  - humo de todas las estaciones OK, incluido el enlace antiguo `/inventario/kardex` → `/superadmin/inventario/movimientos`.
- **Capturas revisadas:** Tablero (computadora y celular), Reservas, Torre de control y Perfil.
- **Detalle adicional:** las listas largas dentro de una tarjeta tienen alto máximo con desplazamiento propio (la de 40 alertas en la Torre de control ya no deja vacía la tarjeta vecina).

## 2026-09-28 — Limpieza total antes de las pruebas del dueño: día cero, 4 contenedores, sin archivos del sistema anterior

**Pedido del dueño:** dejar el sistema limpio y sin clientes, volver a los contenedores de siempre y eliminar todo lo del sistema anterior (documentos, pruebas viejas, respaldos). Solo se conserva lo que el sistema usa: fotos de platos, cuartos, etc. Nada de nube por ahora.

- **Respaldo de todo lo eliminado:** `C:\Dev\Clientes\park_plaza_ejem\respaldo-antes-de-limpiar-2026-09-28\`, fuera del proyecto. Contiene:
  - la base completa;
  - las fotos subidas;
  - `archivos-del-sistema-anterior.tar.gz`, con 651 archivos;
  - los respaldos anteriores;
  - `reset-demo.js`.
- **Docker:** vuelve a 4 contenedores (`postgres`, `backend`, `frontend`, `customer`).
  - Se quitaron `backend_2` y `backup` de `docker-compose.yml`.
  - El código sigue soportando varias copias; esa configuración queda en `docker-compose.production.yml`.
  - Se borraron las imágenes viejas: app `operations` (4174), `park_plaza_production-*`, `park_plaza_phase4_test-*`, `pp_prodtest-*`, `backend_2` y `caddy`.
  - No se tocaron las imágenes ni los volúmenes del proyecto `credisel-system`.
- **Archivos eliminados del proyecto:**
  - 36 documentos `.md` del sistema anterior;
  - logs y QR viejos;
  - las carpetas `scratch/`, `.codex/`, `uploads/`, `server/uploads/` y `scripts/dev/`;
  - los scripts de prueba antiguos (`demo-integral`, `pilot-flow`, `checkin-cleaning-flow`, `guest-operations-checkout-flow`, `system-connectivity`, `mobile-performance`, `smoke-phase1`);
  - `server/get-users.js` y `server/scripts/reset-demo.js`, que borraba la base entera;
  - todo `docs/` salvo `docs/tesina/`, que es de la tesina del dueño.
- **Pruebas vigentes:** pasaron a `scripts/pruebas/` (`flujo-completo`, `capturas-dueno`, `estaciones`, `tiempo-real`), con comandos `npm run prueba:*`. Sus capturas se guardan en `scripts/pruebas/capturas/`, ignorada por git.
- **`package.json`:** sin los comandos de los scripts eliminados. `db:reset-demo` se reemplazó por `db:limpiar-operacion`.
- **`README.md` nuevo:** cómo encender, direcciones, usuarios con DNI y PIN del reloj (verificados), cómo volver a día cero y cómo probar.
- **Script de limpieza actualizado** (`server/scripts/clean-operational-demo.js`): también vacía el historial, la auditoría completa, los límites de intentos y las métricas; conserva `externalProviders`, que es configuración.
- **Datos: día cero.**
  - Quedaron en 0: clientes, reservas, estadías, eventos, pagos, pases, pedidos, solicitudes, tareas, marcaciones, turnos, cajas, comprobantes, devoluciones, auditoría e historial.
  - Se conservan: la configuración, 7 usuarios, 7 empleados, 33 habitaciones (todas libres), 6 servicios, 96 platos de la carta, las recetas, 70 insumos con su stock, 2 proveedores, la cochera y las 89 fotos de platos.
  - Se borraron las 25 fotos de evidencias de limpieza de las pruebas.
- **Verificación (antes de la limpieza final):**
  - flujo completo 12/12;
  - estaciones OK;
  - tiempo real 1,1 s;
  - contratos de navegación y turnos OK;
  - 1 088 lecturas sin errores;
  - con los datos vacíos, las 50 vistas del dueño y todas las estaciones cargan sin errores;
  - los PIN del reloj (2222 a 6666) funcionan.

  Después se limpió de nuevo, para no dejar rastros de estas verificaciones.
- **Pendiente del dueño antes de probar:**
  - solo 2 platos son visibles para el cliente: hay 89 sin venta habilitada y 53 insumos bajo el mínimo;
  - los números de Yape y Plin son de demostración (999100001).

- **Complemento (misma noche):** a pedido del dueño se borraron también `park_plaza_ejem.zip` (150 MB) y `park_plaza_cambios_completos_2026-09-04.zip` de la carpeta superior, las carpetas viejas `docs/` y `.font-cache/` de esa carpeta, y 4 volúmenes de Docker sin nombre (vacíos, creados por pruebas). **No** se tocaron `credisel-system_credisel_postgres_data` ni el volumen que usa `credisel-postgres` (son del otro proyecto). Queda solo `respaldo-antes-de-limpiar-2026-09-28/` como red de seguridad.

## 2026-09-28 (22:05) — Corrección: "Error de comunicación con el servidor" al ingresar

**Síntoma:** el ERP mostraba "Error de comunicación con el servidor" al iniciar sesión.

**Causa:** tras un reinicio de Docker, el contenedor `park_plaza_backend` quedó **sin red**. Era el contenedor creado cuando `docker-compose.yml` todavía tenía `backend_2` (con alias `backend`); al quitar ese servicio, el contenedor no se recreó. Sin red no resolvía el nombre `postgres` (`getaddrinfo EAI_AGAIN postgres`), el servidor se caía al arrancar, se reiniciaba en bucle, y nginx respondía 502.

**Corrección:**
- se recrearon los 4 contenedores desde la configuración vigente con `docker compose down` y `docker compose up -d`, sin `-v`, así que se conservan los datos y las fotos;
- se simuló un reinicio (`docker compose restart`): los 4 siguieron en marcha, sin reinicios y en la misma red.

**Regla:** después de quitar o agregar servicios en `docker-compose.yml`, recrear con `docker compose up -d --force-recreate` (o `down` y `up`), no solo con `--remove-orphans`.

**Verificación:**
- ingresan superadmin, recepción, restaurante, bar, limpieza y mantenimiento. `admin@parkplaza.com` está deshabilitada a propósito (INACTIVO) y se aclaró en el README;
- el catálogo de la app del cliente responde;
- los datos siguen en día cero: 0 clientes, 96 platos y 89 fotos.

## 2026-10-12 — Auditoría integral, facturación electrónica y despliegue en aaPanel
**Pedido del dueño:** auditar todo el sistema, corregir fallas, botones vacíos y lógica inconclusa ("que todo tenga principio y fin"), agregar boleta y factura electrónica lo más parecidas a SUNAT y dejarlo listo para un demo en la nube con aaPanel.

**Cómo se auditó:** una prueba nueva recorre el negocio completo por la API sin depender de datos previos (`scripts/pruebas/recorrido-negocio.mjs`, 120 comprobaciones), otra revisa en el navegador que ningún botón esté vacío (`scripts/pruebas/botones.cjs`, 85 pantallas, ~2 800 botones y enlaces) y se cruzaron todas las llamadas del ERP y de la app del cliente con las rutas del servidor (274 rutas, ninguna llamada a una ruta inexistente). Además se levantó una instalación NUEVA con el compose de aaPanel, que destapó fallas que la base local escondía.

**Fallas corregidas (servidor):**
- **Eventos con precio del navegador:** la app reservaba un evento con el total que mandaba el navegador (se probó por S/ 1). Ahora `calculateEventPrice` lo calcula con las tarifas del dueño (espacio + catering + equipo + cochera) y valida fecha, horas e invitados. La edición de eventos ya no cambia el adelanto sin un pago y no cae (500) si falta el espacio.
- **Hospedaje — salida:** al terminar la revisión de Limpieza la habitación quedaba LIBRE con el huésped dentro, y tras el check-out no se creaba la limpieza. Ahora sigue OCUPADA durante la revisión; el check-out la pasa a EN_LIMPIEZA con su tarea de limpieza (`createPostCheckoutCleaningTask`) y vuelve a LIBRE al terminarla.
- **Terraza sin cierre:** decía "tu pedido lo toma el personal y pagas al final", pero no existía ese paso. Ahora el cliente pide y paga desde su mesa (toda la carta de Cocina y Bar), igual que en Piscina.
- **Cocina y Bar bloqueados en día cero:** sin un cierre anterior, abrir el inventario del turno exigía un conteo que la pantalla no permitía; ningún pedido podía aceptarse. La estación ahora abre con el saldo del sistema (`useSystemBalance`); el conteo del cierre corrige diferencias.
- **Instalación nueva (nube):** la caja de Recepción se abría con id `null` (contador `cashSession` inexistente → NaN) y no se podía rendir ni marcar salida; los pedidos fallaban por "stock insuficiente" (el stock inicial quedaba sin lote y la reserva FEFO solo usa stock con lote); Jorge (Mantenimiento) no existía como trabajador y su DNI no era el del README. Corregido en `nextId`, `db.js` (contadores, fichas de trabajador, DNI 70000000/70000007) y `assignOpeningLots` (lote de apertura después de cargar el stock, idempotente).
- **Cierre diario de reservas (nuevo, `closeExpiredReservations`):** las visitas de Piscina/Mirador/Terraza quedaban "en servicio" para siempre (el cliente podía seguir pidiendo días después), las reservas no usadas nunca vencían y retenían la cochera, y los eventos pasados no se cerraban. Ahora, cada día: visita usada → FINALIZADA; no usada → NO_SHOW con pase VENCIDO (el saldo no cobrado pasa a `uncollectedBalance`); hospedaje sin check-in con la salida vencida → NO_SHOW; eventos realizados → FINALIZADO y cotizaciones o reservas sin pago → CANCELADO. Siempre libera la cochera; no toca lo que tiene una devolución en trámite.
- **Devolución completa:** además de cancelar la reserva, libera la cochera, cancela los pedidos programados pendientes y anula cada boleta o factura con su nota de crédito.

**Facturación electrónica (rehecha, `server/src/electronic-billing.js`):** boleta (03), factura (01) y nota de crédito (07) con el formato de SUNAT. Modo `demo` por defecto: todo es real menos el envío.
- XML **UBL 2.1** (Invoice/CreditNote con emisor, receptor, IGV, totales, `DiscrepancyResponse` y `BillingReference` en la nota) con firma y **hash SHA-256** (DigestValue); **CDR** como ZIP `R-…zip` con `ApplicationResponse`; **PDF A4** con recuadro de RUC, detalle, op. gravada, IGV, **importe en letras**, **QR** con el formato de SUNAT y el hash.
- Reglas: RUC con dígito verificador, factura solo a RUC con dirección fiscal, boleta sin documento solo por menos de S/ 700, detalle real del pago (ítems del pedido, noches y habitación, visita o evento; "pago a cuenta" si es parcial), IGV de la configuración.
- Numeración por serie en `state.billingCounters` (B001, F001, BC01, FC01): no se repite aunque el historial archive los comprobantes (ahora archivables). Rechazado o anulado → se puede volver a emitir; anulado por devolución → no.
- Emisor desde Configuración general (RUC, razón social, dirección fiscal, ubigeo, series); sin RUC válido usa uno de prueba marcado como tal.
- Rutas nuevas: `POST /api/facturacion/preview`, `GET /api/facturacion/:id/view`, `POST /api/facturacion/:id/credit-note` (solo el dueño). Descargas con historial.
- Pantallas: componente `client/src/modules/recepcion/ElectronicDocument.jsx` (representación impresa con QR, emisión con detalle, PDF/XML/CDR, reintento, nota de crédito) usado por Recepción (Caja › Pagos y comprobantes) y el dueño (Dinero › Boletas y facturas, con pestaña **Registro de ventas** exportable a CSV). Configuración general: tarjeta *Facturación electrónica*. App del cliente: bloque **Comprobantes** con su PDF en visitas, hospedaje y eventos.

**Despliegue en aaPanel:** `docker-compose.aapanel.yml` (sin Caddy; ERP y cliente solo en 127.0.0.1:8081/8082), `.env.aapanel.example`, `deploy/aapanel/nginx-sitio.conf` (bloque para cada sitio, con websocket) y `DESPLIEGUE_AAPANEL.md`. `preflight.mjs` acepta el modo `aapanel`. Script `server/scripts/preparar-demo.mjs` (`npm run demo:preparar`) que habilita la venta de lo que tiene receta y stock: la carta del cliente pasó de 2 a 14 productos.

**Pruebas actualizadas:** `flujo-completo.cjs` y `tiempo-real.cjs` crean sus propios clientes (antes dependían de datos borrados en día cero); `electronic-billing-test.js` (37 comprobaciones); `authz-matrix-test.js` omite con aviso el caso que necesita una reserva pagada.

**Verificación (2026-10-12):** recorrido de negocio 120/120 en local, 120/120 en una instalación nueva estilo aaPanel detrás de Nginx y 120/120 con la base local restaurada en ese entorno (fotos servidas por el proxy); `flujo-completo` 12/12 con clics; `test:acceptance` OK; `authz-matrix` 158 OK; lecturas 1 096 sin errores 500; 50 vistas del dueño (escritorio y celular) y todas las estaciones sin errores; 85 pantallas sin botones vacíos; tiempo real < 1 s; contrato del cliente 87 acciones conectadas. Al terminar se dejó la base local en día cero (`db:limpiar-operacion`) con la venta habilitada (`demo:preparar`).

**Incidente propio:** un reemplazo por script duplicó media `server/src/index.js` (la secuencia `` $` `` de una expresión regular se interpretó como "texto anterior"). Se detectó en la misma sesión y se reconstruyó el archivo exacto antes de seguir.

## 2026-10-12 (tarde) — Ingreso por usuario y subida al aaPanel de Grupo Amayo
**Pedido del dueño:** entrar sin correo ("marea al cliente"), cada cuenta con usuario = clave (superadmin/superadmin…), y subir esta versión al servidor aaPanel como nueva, con respaldos y sin tumbar los demás sistemas del servidor.
- **Ingreso:** `POST /api/auth/login` acepta `username` (o el correo, por compatibilidad). Pantalla de ingreso con campo **Usuario**. Al arrancar, una sola vez (`settings.staffCredentialsVersion = 2`), se asignan usuario y clave: `superadmin`, `recepcion`, `cocina`, `bar`, `limpieza`, `mantenimiento` (y `admin`, que sigue deshabilitada). Si después se cambia una clave en Usuarios, no se pisa. Clave mínima: 3 caracteres (decisión del dueño). Usuarios: el **usuario** es obligatorio y único; el correo pasa a ser opcional.
- **Despliegue al lado de la versión anterior:** proyecto `parkplaza_v2`, puertos `127.0.0.1:18081/18082` (no chocan con `park_plaza_*` de septiembre: 5173/4173/4174/3000/5433). Scripts en `deploy/aapanel/`: `1-revisar-servidor.sh` (solo lectura), `2-respaldar-version-anterior.sh` (base, fotos, carpeta y Nginx en `/www/backup/parkplaza/<fecha>/`), `3-instalar-version-nueva.sh` (genera claves, levanta, carga `datos/`), `4-verificar.sh`, `6-apagar-version-anterior.sh` (solo `docker stop`, y se niega si los dominios aún no muestran la nueva) y `7-volver-atras.sh`. Guía `DESPLIEGUE_AAPANEL.md` reescrita para este servidor.
- **Paquete:** `C:\Dev\Clientes\park_plaza_ejem\subir-aapanel\parkplaza-v2.zip` (12 MB, sin `node_modules` ni archivos `.env`) con `datos/parkplaza.dump` (base local en día cero, carta real con 14 productos a la venta) y `datos/uploads.tgz` (fotos).
- **Pruebas actualizadas** a las credenciales nuevas (todas las de `scripts/` y `server/scripts/`).
- **Verificación:** las 6 cuentas entran con usuario = clave y la clave antigua se rechaza; batería completa en verde (acceptance, permisos 158, negocio 120/120, flujo con clics 12/12, lecturas sin 500, tiempo real 1 s, estaciones, 50 vistas del dueño, 85 pantallas sin botones vacíos). Servidor simulado (contenedor Linux con el Docker de la PC, el zip descomprimido tal cual): pasos 1-4 OK, recorrido 120/120 contra la instalación nueva, el paso 6 se negó a apagar nada porque los dominios reales aún muestran la versión anterior (el paso 4 lo detectó consultando `parkplaza.grupoamayo.com`). El entorno simulado se borró al terminar.
