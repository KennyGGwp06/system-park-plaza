# Hotel Park Plaza — demo integral

Sistema local para demostrar la experiencia del cliente, el ERP por roles y las estaciones de operaciones. Usa una sola API Express y una sola base PostgreSQL para que los tres portales trabajen con los mismos datos.

## Servicios

- Experiencia del cliente: http://localhost:4173
- ERP del personal: http://localhost:5173
- Operaciones (Limpieza y Mantenimiento): http://localhost:4174
- Estado de la API: http://localhost:3000/api/health
- PostgreSQL: `localhost:5433`

## Levantar con Docker Desktop

Requisitos: Docker Desktop abierto y Git. Desde PowerShell, después de clonar el repositorio:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
```

La primera ejecución crea las tablas, aplica las migraciones y carga los datos de demostración automáticamente. No copies tu archivo `.env` personal al repositorio: cada equipo crea el suyo desde `.env.example`.

Para ver registros:

```powershell
docker compose logs -f backend
```

Para detener sin borrar datos:

```powershell
docker compose down
```

Solo si deseas borrar toda la base de demostración y comenzar nuevamente:

```powershell
docker compose down -v
docker compose up -d --build
```

## Ejecución manual

Requiere Node.js 20+, npm y PostgreSQL. Configura `.env`, instala dependencias y ejecuta:

```powershell
npm install
npm run dev
```

Esto inicia API, ERP, experiencia del cliente y Operaciones simultáneamente. Para una instalación manual también se requiere PostgreSQL y un archivo `.env` configurado.

## Cuentas del personal

Todas usan la contraseña `ParkPlaza123*`.

| Rol | Correo | Vista inicial |
|---|---|---|
| Superadmin | `superadmin@parkplaza.com` | Control total del negocio |
| Admin de recepción | `recepcion@parkplaza.com` | Operación, cobros y rendición de caja |
| Restaurante | `restaurante@parkplaza.com` | Pedidos de cocina |
| Bartender | `bartender@parkplaza.com` | Pedidos del bar |
| Limpieza | `limpieza@parkplaza.com` | Habitaciones asignadas |
| Mantenimiento | `mantenimiento@parkplaza.com` | Trabajos e incidencias |

Piscina no es un rol humano separado. Sus accesos son validados desde Recepción o desde el punto de control usando el QR único del cliente.

## Flujos conectados

- Registro por QR exterior, credencial o recepción.
- Hospedaje con selección de habitación, huéspedes, extras, cochera y pago total o 50 %.
- Un solo QR por cliente con permisos independientes para hospedaje, piscina, mirador y eventos.
- Control de aforo por cantidad reservada y bloqueo de reutilización del acceso.
- Restaurante y bartender habilitados únicamente con hospedaje pagado por completo.
- Pedido con tiempo estimado, estados de preparación, receta y descuento de inventario al entregar.
- Reserva, check-in, cuenta, check-out, liberación a limpieza y habitación disponible.
- Eventos con agenda, aforo, conflictos de horario, adelantos y pagos.
- Incidencias conectadas con mantenimiento y evidencias operativas.
- Empleados, horarios rotativos, ingreso/salida y pago semanal por días efectivamente asistidos.
- Compras, proveedores, recepción de mercadería, kardex, caja, pagos, facturación, auditoría y configuración.

Consulta [DEMO_GUIDE.md](./DEMO_GUIDE.md) para el recorrido recomendado de presentación.

## Para trabajar desde otra laptop

```powershell
git clone https://github.com/KennyGGwp06/system-park-plaza.git
cd system-park-plaza
Copy-Item .env.example .env
docker compose up -d --build
```

Luego abre los tres portales en los enlaces de arriba. Para detenerlos sin perder los datos, usa `docker compose down`. No uses `docker compose down -v` salvo que quieras borrar por completo la base de demostración.
