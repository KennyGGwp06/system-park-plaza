# Guía de demostración — Hotel Park Plaza

## Recorrido principal del cliente

1. Abre http://localhost:4173 y entra con credencial o simula el QR exterior.
2. Registra una identidad nueva con DNI o carné de extranjería.
3. Reserva hospedaje, elige fechas, habitación libre, cantidad de huéspedes, extras y cochera.
4. Elige pago al 50 %. En `Mi pase`, el hospedaje queda pendiente y restaurante/bar permanecen bloqueados.
5. Compra piscina o mirador por separado y paga completo. El mismo QR incorpora el nuevo permiso.
6. En el ERP de Recepción abre `Control de accesos`, selecciona el servicio y valida la cantidad del grupo.
7. Repite la validación: el sistema debe rechazar la reutilización de ese servicio.
8. En la PWA completa el saldo del hospedaje. Ahora quedan habilitados restaurante y bartender.
9. Realiza un pedido y revisa su tiempo estimado y cambios de estado.

## Demostración por rol

Contraseña común: `ParkPlaza123*`.

### Recepción — `recepcion@parkplaza.com`

- Registra clientes que no usan QR.
- Crea una reserva y cobra adelanto o pago total.
- Realiza check-in y verifica que la habitación cambie a ocupada.
- Registra consumos o pagos pendientes.
- Finaliza check-out: se genera automáticamente una tarea de limpieza.
- Valida accesos QR de piscina, mirador, hospedaje o eventos.

### Restaurante — `restaurante@parkplaza.com`

- Abre un pedido pendiente.
- Acepta, inicia preparación, marca listo y confirma entrega.
- Revisa cantidades exactas del pedido y reporta falta de insumo o equipo.
- Al entregar, el inventario descuenta las cantidades definidas por receta.

### Bartender — `bartender@parkplaza.com`

- Atiende pedidos pendientes, preparación y entrega.
- Consulta productos del bar y reporta incidencias.
- El inventario reserva insumos al recibir el pedido y los descuenta al entregar.

### Limpieza — `limpieza@parkplaza.com`

Abre la estación de Operaciones: http://localhost:4174

- Revisa habitaciones pendientes y prioridad.
- Inicia la tarea, adjunta evidencia de entrada/salida y reporta daños.
- Finaliza la tarea y confirma que la habitación vuelve a estar libre.

### Mantenimiento — `mantenimiento@parkplaza.com`

Abre la estación de Operaciones: http://localhost:4174

- Revisa incidencias creadas por clientes, limpieza, cocina o bar.
- Inicia reparación, registra diagnóstico/costo/evidencia y finaliza el trabajo.

### Superadmin — `superadmin@parkplaza.com`

- Supervisa dashboard, reservas, caja, accesos, pedidos, limpieza e incidencias.
- Crea trabajadores, cambia roles y administra permisos.
- Programa turnos rotativos para cualquier empleado.
- Registra ingreso y salida; la planilla semanal paga solo días con ambas marcas.
- Gestiona eventos, cochera, inventario, compras, proveedores, facturación y auditoría.

## Comandos útiles

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f backend
docker compose down
```

PostgreSQL conserva la información al reiniciar. `docker compose down -v` elimina la base demo y debe usarse solo para reiniciar todos los datos.
