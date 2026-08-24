# ADMIN PANEL AUDIT - ERP Hotel Park Plaza

Fecha: 2026-08-09

## Alcance Revisado

- Frontend: `Dashboard.jsx`, `Sidebar.jsx`, `Navbar.jsx`, `constants/menu.js`.
- Componentes reutilizados: `LoadingSpinner`, `EmptyState`, `StatusBadge`, `Button`, `useFetch`.
- Graficos existentes: `recharts` ya estaba instalado y utilizado.
- Fuente de datos principal: endpoint existente `/dashboard`.
- Modulos disponibles para administrador: dashboard, recepcion, reservas, clientes, habitaciones, check-in, check-out, piscina, restaurante, bartender, limpieza, eventos, cochera, inventario, compras, proveedores, caja, reportes, usuarios, roles, auditoria y configuracion.

## Datos Reales Disponibles

Desde `/dashboard`:

- Habitaciones ocupadas/libres.
- Reservas de hoy.
- Check-ins y check-outs del dia.
- No-show.
- Huespedes hospedados.
- Ingresos del dia por pagos registrados.
- Ventas por area.
- Productos con stock bajo.
- Eventos proximos.
- Actividad reciente.
- Pedidos operativos.
- Tareas de limpieza pendientes/en proceso.
- Incidencias abiertas y de alta prioridad.

## Decisiones

- No se modifico backend porque el dashboard ya entrega datos suficientes.
- No se modifico PostgreSQL, Docker, autenticacion, permisos ni variables de entorno.
- No se agregaron datos ficticios del mockup.
- No se creo busqueda global real porque no existe endpoint global; la topbar conserva busqueda visual informativa.

## Cambios Aplicados

- `Dashboard.jsx` se reorganizo como panel de supervision general inspirado en el mockup.
- El dashboard ahora muestra bloque de bienvenida, ultima actualizacion, KPIs principales, graficos, ocupacion, atencion requerida, resumen operativo, proximos eventos, pedidos y actividad reciente.
- `constants/menu.js` separa el menu del administrador en `Principal`, `Alojamiento`, `Operaciones`, `Administracion` y `Sistema`.
- El menu administrador ahora expone tambien `Pagos` y `Facturacion` dentro de `Administracion`.
- `RolesPage` agrega metricas, busqueda por modulo y aviso de cambios pendientes sin modificar el sistema de permisos.
- `AdminResourcePage` extiende busqueda/filtros a compras, proveedores, caja, usuarios y auditoria reutilizando el bloque existente.
- `ReportsPage` mejora el buscador y el drawer de detalle para alinearse con el lenguaje visual del administrador.
- `ReportsPage` compacta su tabla principal agrupando reporte, origen y detalle operativo para reducir ancho y mejorar lectura.
- `ReservationsPage` compacta su tabla principal agrupando reserva, cliente, estadia e importes.
- `EventsPage` compacta la tabla de eventos agrupando evento, cliente, programacion e importes.
- `Configuracion` deja de mostrarse como tabla generica y pasa a secciones visuales de datos del hotel y sistema, usando los campos reales de `HotelSettings`.
- `Configuracion` incorpora identidad visual, URL de logo, IGV/impuesto y formato de fecha usando campos reales del modelo.
- `Navbar.jsx` se ajusta al lenguaje visual del panel administrador con buscador visual, fecha y bloque de usuario mas claro.
- `Operaciones` se convierte en un centro operativo con KPIs, accesos por area, limpieza pendiente y pedidos activos usando datos reales de `/dashboard`.
- `Contratos de eventos` y `Pagos de eventos` agregan busqueda/filtros; pagos de eventos ahora muestra solo pagos vinculados al area de eventos.
- `PoolPage` agrega metricas, filtros por tipo de ingreso y limpieza visual sin cambiar endpoints.
- `OrdersAreaPage` agrega navegacion por estados dentro de restaurante/bartender y normaliza textos/controles.

## Pendientes

- Si se requiere ocupacion por tipo de habitacion, hace falta exponer ese resumen desde backend.
- Si se requiere grafico historico de ingresos por varios dias, hace falta endpoint historico; actualmente se usa ingreso real del dia.
- La topbar puede incorporar busqueda global solo si se define endpoint o estrategia real de busqueda.
- Crear pedidos desde restaurante/bartender no se implemento porque el backend actual solo lista y cambia estado de pedidos.
