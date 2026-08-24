# Hotel Park Plaza — demo integral

Sistema local para demostrar la experiencia conectada del cliente y la operación del hotel. Incluye una PWA para huéspedes, un ERP por roles, una API Express y persistencia PostgreSQL.

## Servicios

- Experiencia del cliente: http://localhost:4173
- ERP del personal: http://localhost:5173
- Estado de la API: http://localhost:3000/api/health
- PostgreSQL: `localhost:5433`

## Levantar con Docker Desktop

Desde esta carpeta:

```powershell
docker compose up -d --build
docker compose ps
```

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

Esto inicia API, ERP y experiencia del cliente simultáneamente.

## Cuentas del personal

Todas usan la contraseña `ParkPlaza123*`.

| Rol | Correo | Vista inicial |
|---|---|---|
| Administrador | `admin@parkplaza.com` | Dashboard general |
| Recepción | `recepcion@parkplaza.com` | Operación de recepción |
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
