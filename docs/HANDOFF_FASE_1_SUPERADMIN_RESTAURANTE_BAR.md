# Fase 1 — Super Admin, Restaurante y Bar

Fecha de cierre: 31 de agosto de 2026
Estado: completada y verificada

## Objetivo de esta fase

Convertir los flujos diarios más importantes en acciones comprensibles para una persona que nunca ha usado un ERP, sin cambiar la lógica contable ni la separación de permisos.

Esta fase abarca los tres sistemas bajo responsabilidad directa:

- Super Admin
- Restaurante
- Bar

También se verificó su conexión con la experiencia del cliente, Recepción, Limpieza y Mantenimiento.

## Resultado funcional

### Restaurante

- La pantalla de pedidos ahora representa el trabajo en cuatro columnas:
  1. Nuevos
  2. Aceptados
  3. Preparando
  4. Listos
- Cada pedido avanza únicamente al estado permitido por el backend.
- Se muestra tiempo transcurrido, punto de entrega, productos, cantidades y notas.
- El botón final se llama **Confirmar entrega** y explica que en ese momento se registra el consumo real del inventario.
- Las rutas **Mi stock**, **Registrar merma** y **Cerrar turno** abren su contenido correcto. Antes las tres podían abrir la pestaña Stock.
- El inicio de Restaurante incorpora accesos directos a Pedidos, Recetas y Stock.
- El recetario usa el contrato real del backend:
  - nombres correctos de productos;
  - cantidad requerida por porción;
  - unidad base;
  - rendimiento;
  - porciones disponibles;
  - ingrediente limitante;
  - resultado esperado y pasos de preparación.

### Bar

- Los pedidos se muestran en tres etapas:
  1. Nuevos
  2. Preparando
  3. Listos
- El botón inicial dice **Aceptar y preparar**.
- El botón final dice **Confirmar entrega** y avisa que allí se descuenta el inventario del Bar.
- Las rutas Stock, Merma y Cierre abren la pestaña correspondiente.
- El inicio de Bar muestra cuántos pedidos están nuevos, preparando y listos.
- El manual de bebidas ahora muestra medidas por porción, rendimiento, disponibilidad y preparación.
- Se agregó **Control de botellas** al menú del Bartender.
- La ruta de botellas permite los roles Super Admin y Bartender. El backend continúa aplicando su autorización propia.

### Super Admin

- La tarjeta Hospedaje del resumen abre el inicio real del Hotel.
- La tarjeta Mirador abre el validador de accesos.
- Una alerta por pedidos demorados abre el monitor de Restaurante o Bar según el área del pedido.
- El flujo genérico de pedidos ya no salta de `EN_COCINA` a `LISTO`; ahora respeta `PREPARANDO`.
- Se agregó guía inicial específica para Super Admin.
- Las guías de Restaurante y Bar fueron activadas y sus botones apuntan a rutas que sí existen.
- Las páginas iniciales por rol ahora son `/restaurante/dashboard` y `/bartender/dashboard`.

### Experiencia del cliente y conexión transversal

- La carta del cliente prioriza la imagen guardada en base de datos. Las imágenes locales quedan únicamente como respaldo.
- Se corrigió un error horario serio en asistencia: después de las 7 p. m. de Lima, el servidor podía guardar el registro con fecha UTC del día siguiente y luego considerar que el trabajador no había iniciado turno.
- Asistencia y sesiones operativas usan ahora la fecha del hotel.
- La prueba integral abre asistencias secuencialmente para evitar condiciones artificiales de carrera en la simulación.

## Archivos modificados en esta fase

- `client/src/modules/employees/RestaurantOrdersPage.jsx`
- `client/src/modules/employees/RestaurantInventoryPage.jsx`
- `client/src/modules/employees/RestaurantRecipesPage.jsx`
- `client/src/modules/employees/RestaurantDashboard.jsx`
- `client/src/modules/employees/BarPages.jsx`
- `client/src/components/TrainingAssistant.jsx`
- `client/src/constants/menu.js`
- `client/src/App.jsx`
- `client/src/modules/admin/SuperAdminControlPage.jsx`
- `client/src/modules/admin/AdminResourcePage.jsx`
- `customer/src/App.jsx`
- `server/src/index.js`
- `scripts/system-connectivity.mjs`

El repositorio ya tenía cambios sin confirmar antes de iniciar esta fase. No deben descartarse ni restaurarse en bloque.

## Verificación ejecutada

Compilaciones:

- ERP interno: aprobada
- Experiencia del cliente: aprobada
- Operaciones: aprobada

Pruebas automatizadas: **74 aprobadas**.

- Pedidos e inventario: 12
- Inventario operativo por turno: 12
- Panel administrativo de inventario: 3
- Seguridad y permisos: 11
- Conectividad completa: 7
- Compras y recepción: 9
- Transferencias: 10
- Recetas técnicas: 10

La conectividad final confirmó:

`Cliente → Recepción → Limpieza/Mantenimiento → Cliente → Super Admin`

También confirmó:

`Cliente → pedido → Restaurante/Bar → preparación → listo → entrega → consumo de inventario`

## Cómo revisar manualmente el producto

1. Reiniciar el backend activo en el puerto 3000 para que cargue la corrección horaria de `server/src/index.js`.
2. Entrar como Super Admin y revisar:
   - `/superadmin`
   - tarjetas Hospedaje y Mirador;
   - alerta de pedidos demorados;
   - asistente “¿Qué hago aquí?”.
3. Entrar como Restaurante y revisar:
   - `/restaurante/dashboard`
   - `/restaurante/pedidos`
   - `/restaurante/inventario/recetas`
   - `/restaurante/inventario/insumos`
   - `/restaurante/inventario/mermas`
   - `/restaurante/inventario/cierre`.
4. Entrar como Bartender y revisar:
   - `/bartender/dashboard`
   - `/bartender/pedidos`
   - `/bartender/inventario/recetas`
   - `/bartender/botellas`
   - Stock, Merma y Cierre.
5. Desde el cliente, habilitar un producto con imagen de base de datos y confirmar que esa imagen sea la mostrada.

## Pendientes recomendados para la Fase 2

Prioridad alta:

1. Crear una bandeja simple de solicitudes de stock para Restaurante y Bar:
   - operador solicita;
   - Super Admin aprueba y despacha;
   - operador confirma recepción.
2. Ejecutar pruebas E2E visuales con los tres roles y resoluciones móvil/escritorio.
3. Revisar botones sin acción útil en Facturación y Eventos; ocultarlos o conectarlos.
4. Hacer funcionales los buscadores de las vistas administrativas de Limpieza y Mantenimiento.
5. Añadir estados vacíos con una acción concreta en todas las bandejas.

Antes de producción:

1. Sustituir credenciales de demostración.
2. Configurar pagos reales o identificar claramente el modo simulado de Yape/Plin.
3. Configurar respaldo, monitoreo, variables de entorno y HTTPS.
4. Reducir el paquete principal del cliente, actualmente con advertencia por superar 500 kB.
5. Ejecutar una prueba piloto con datos reales sin reutilizar la base de demostración.

## Regla para continuar

La Fase 2 debe partir de este estado y corregir sobre él. No rehacer los tableros ni restaurar archivos completos. Antes de editar, revisar el diff existente porque hay trabajo paralelo del equipo en Catálogo, Hotel, Compras, Transferencias y experiencia del cliente.
