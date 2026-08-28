# Traspaso controlado: conexión completa del ERP interno

## Objetivo

Completar la reestructuración y conexión del ERP interno de Park Plaza sin modificar ni romper todavía la experiencia del cliente.

Roles internos incluidos:

- Superadmin: dueño y autoridad total.
- Admin de Recepción: segundo al mando, operación hotelera y rendición al Superadmin.
- Restaurante: pedidos, recetas, producción, inventario asignado y cierre operativo.
- Bartender: pedidos, recetas, botellas, inventario asignado y cierre operativo.

Limpieza y mantenimiento no tienen ERP propio. El Admin de Recepción recibe evidencias por WhatsApp, las registra y cierra la tarea. El Superadmin supervisa.

## Regla de seguridad principal

No modificar `customer/`, el puerto 4173, las rutas públicas, el registro con Google/Firebase, el pago, los QR, los accesos ni los contratos de API consumidos por la experiencia del cliente durante esta fase.

Antes de cambiar código:

1. Leer este documento y `git status`.
2. No borrar ni sobrescribir cambios existentes del usuario.
3. Levantar y comprobar PostgreSQL, backend y ERP.
4. Crear una línea base verificable de endpoints y flujos.
5. Presentar diagnóstico y plan; no implementar hasta recibir aprobación explícita.

## Estado verificado el 26-08-2026

- Backend operativo en `http://localhost:3000`.
- ERP interno operativo en `http://localhost:5173`.
- Experiencia del cliente operativa en `http://localhost:4173`.
- PostgreSQL conectado.
- Superadmin, Admin de Recepción, Restaurante y Bartender autentican correctamente.
- Los cuatro roles usan el mismo backend y la misma base de datos.
- Restaurante y Bar usan Socket.IO y son los módulos internos más completos.
- Superadmin V6 y Admin de Recepción V6 leen datos reales, pero actualizan por consulta cada 15 segundos y no están suscritos a Socket.IO.
- Varias acciones del Superadmin V6 solo ejecutan `hotelReducer`: cambian memoria local y no PostgreSQL.
- Admin de Recepción V6 tiene lectura real y cierre de caja real; varias vistas muestran `Falta conectar`.
- Restaurante y Bar no pueden modificar pedidos del área ajena, pero sus endpoints de lectura permiten consulta cruzada.
- Existen dos declaraciones de `GET/POST /api/shifts` en el backend.
- La caja actual permite un cierre por día; la operación real necesita cierre por empleado y turno.

## Flujo de pedidos e inventario que debe conservarse

1. Un pedido pagado se separa por área: `RESTAURANTE` o `BARTENDER`.
2. El backend consulta la versión vigente de la receta.
3. Reserva gramos, mililitros o unidades mediante FEFO.
4. El área necesita un turno operativo abierto para aceptar el pedido.
5. Cocina/Bar avanza por estados permitidos.
6. Al marcar `ENTREGADO`, descuenta el inventario exactamente una vez.
7. Registra costo teórico, venta, margen, responsable y auditoría.
8. Una cancelación temprana libera la reserva.
9. Una cancelación después de preparar exige motivo y registra merma, pérdida o consumo interno.

No cambiar este comportamiento sin una prueba automatizada que demuestre equivalencia o mejora.

## Arquitectura objetivo

```text
PostgreSQL
    ↑
Backend único + RBAC + auditoría + Socket.IO
    ├── Superadmin V6
    ├── Admin de Recepción V6
    ├── Restaurante
    └── Bartender
```

Cada escritura debe seguir:

```text
Interfaz → endpoint autorizado → transacción → PostgreSQL → auditoría → state:changed → actualización de paneles
```

Está prohibido considerar terminada una función si solo modifica el reducer o estado local.

## Orden obligatorio de implementación

### Fase 0 — Línea base

- Documentar endpoints usados por cada rol.
- Probar login y permisos.
- Probar lectura de pedidos, inventario, turnos, caja y auditoría.
- Ejecutar builds sin errores.
- No modificar funcionalidad.

### Fase 1 — Tiempo real V6

- Conectar Superadmin V6 y Admin de Recepción V6 a `state:changed` mediante Socket.IO.
- Mantener polling como respaldo, no como mecanismo principal.
- Verificar que un cambio de Restaurante/Bar aparezca sin F5.

### Fase 2 — Superadmin persistente

- Inventariar todos los botones que llaman `execute()` o `dispatch()` local.
- Clasificarlos: lectura, escritura existente, endpoint faltante o función descartada.
- Conectar una vista por vez al backend.
- Después de cada escritura, recargar desde API y demostrar persistencia tras reiniciar la página.

### Fase 3 — Admin de Recepción operativo

Conectar, usando endpoints existentes cuando sea posible:

- Reservas.
- Check-in y check-out.
- Estados de habitaciones.
- Validación de accesos.
- Cochera.
- Eventos.
- Asignación de limpieza/mantenimiento por WhatsApp.
- Evidencias de entrada y salida.
- Inicio, finalización y cierre de tareas e incidencias.

No dar permisos financieros, de precios, inventario central, usuarios o auditoría global al Admin de Recepción.

### Fase 4 — Caja por turno

- Sustituir conceptualmente el único cierre diario por sesiones de caja.
- Registrar empleado, turno, apertura, fondo, movimientos, efectivo esperado, contado, diferencia y observación.
- El Admin de Recepción rinde; el Superadmin aprueba, observa o rechaza.
- No eliminar el histórico actual; migrarlo o mantener compatibilidad.

### Fase 5 — Seguridad y turnos

- Impedir que Restaurante consulte pedidos de Bar y viceversa.
- Unificar las rutas duplicadas de `/api/shifts`.
- Mantener a Superadmin como autoridad total y a Admin de Recepción como segundo al mando limitado.
- Probar explícitamente respuestas `403` de operaciones no autorizadas.

### Fase 6 — Prueba integral interna

Probar sin F5:

1. Superadmin programa empleados.
2. Restaurante y Bar abren turnos.
3. Aparece un pedido ya pagado de prueba.
4. El área correcta lo acepta, prepara, deja listo y entrega.
5. Se descuenta la receta exacta una sola vez.
6. Admin de Recepción observa el pedido y coordina incidencias.
7. Restaurante/Bar realizan conteo y envían cierre.
8. Admin de Recepción cierra y rinde su caja de turno.
9. Superadmin revisa inventario, caja, diferencias y auditoría.

## Condiciones de aceptación

- Ninguna operación importante depende exclusivamente del estado local.
- Los cambios aparecen en otros paneles sin F5.
- Todo cambio persiste después de recargar.
- Cada escritura registra responsable y auditoría.
- Restaurante y Bar están aislados por área.
- Admin de Recepción no puede aprobar su propia rendición.
- Superadmin puede ver y controlar todo.
- `customer/` continúa compilando y sus contratos de API no cambian.
- No hay datos simulados presentados como reales; usar `Falta conectar` para funciones pendientes.

## Archivos clave

- Backend y rutas: `server/src/index.js`
- Pedidos e inventario: `server/src/order-inventory.js`
- Inventario operativo: `server/src/operational-inventory.js`
- Tiempo real del ERP clásico: `client/src/hooks/useFetch.js`
- Restaurante: `client/src/modules/employees/KitchenStationPage.jsx`
- Bar: `client/src/modules/employees/BarStationPage.jsx`
- Proveedor V6: `../prototipo V6/prototipo V6/prototipo PP/src/state/HotelContext.jsx`
- Adaptador V6: `../prototipo V6/prototipo V6/prototipo PP/src/state/apiAdapter.js`
- Admin de Recepción V6: `../prototipo V6/prototipo V6/prototipo PP/src/components/views/reception/ReceptionViews.jsx`

## Prompt inicial para otra IA

```text
Actúa como arquitecto de software senior y mantenedor conservador del ERP Park Plaza. Lee completamente docs/HANDOFF_ERP_INTERNO.md y luego inspecciona el repositorio actual.

En esta primera respuesta NO modifiques código, base de datos, Docker ni datos. Entrega únicamente:
1. evidencia de que entendiste la arquitectura actual;
2. matriz por rol, endpoint, lectura, escritura, permiso y tiempo real;
3. inventario exacto de acciones V6 que solo cambian estado local;
4. riesgos de regresión sobre customer/;
5. plan de archivos a modificar para la Fase 1;
6. pruebas que ejecutarás antes y después.

Restricciones: no tocar customer/, no cambiar contratos públicos, no borrar datos, no reemplazar el diseño V6, no inventar endpoints existentes, no afirmar que algo está conectado sin demostrar persistencia en PostgreSQL. Espera mi aprobación antes de programar.
```

## Prompt de implementación para cada fase

```text
Implementa únicamente la Fase N aprobada en docs/HANDOFF_ERP_INTERNO.md. Antes de editar, muestra los archivos exactos y las pruebas de línea base. Conserva cambios ajenos. Haz cambios mínimos y compatibles. No toques customer/.

Al terminar entrega:
- archivos modificados y razón;
- endpoints y permisos afectados;
- pruebas ejecutadas con resultado;
- evidencia de persistencia y actualización sin F5;
- riesgos o funciones que siguen marcadas como Falta conectar.

Si descubres que necesitas ampliar el alcance, detente y pide aprobación. No continúes con la siguiente fase automáticamente.
```

## Prompt ejecutor completo para Antigravity

Copiar y pegar este prompt cuando se quiera que la IA lea el proyecto y programe de verdad:

```text
Actúa como arquitecto de software senior, desarrollador full stack y responsable de estabilización del ERP Park Plaza. Tienes acceso al repositorio completo y debes implementar los cambios, no limitarte a dar recomendaciones.

UBICACIÓN DEL PROYECTO
C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem

DOCUMENTO OBLIGATORIO
Lee completamente antes de actuar:
docs/HANDOFF_ERP_INTERNO.md

También inspecciona el código real del proyecto principal y el diseño V6 ubicado en:
C:\Users\useru\OneDrive\Documents\park_plaza_ejem\prototipo V6\prototipo V6\prototipo PP

OBJETIVO
Dejar completamente comunicado y conectado el sistema ERP interno formado por:
- Superadmin.
- Admin de Recepción.
- Restaurante.
- Bartender.

El Superadmin es el dueño y controla todo. El Admin de Recepción es el segundo al mando, gestiona la operación hotelera y rinde cuentas al Superadmin. Restaurante y Bartender conservan sus estaciones operativas, pedidos, inventario asignado, recetas y cierres. Limpieza y mantenimiento no tienen un ERP propio: el Admin de Recepción registra las asignaciones, evidencias recibidas por WhatsApp y finalización; el Superadmin supervisa.

ALCANCE AUTORIZADO
Debes programar y completar la conexión del ERP interno. Puedes modificar frontend interno, V6, backend, permisos, servicios, Socket.IO, pruebas y migraciones necesarias para ese objetivo.

ALCANCE PROHIBIDO EN ESTA ETAPA
No rediseñes ni modifiques customer/, la experiencia del cliente del puerto 4173, Firebase/Google, los QR del cliente, el proceso público de compra, los pagos públicos ni sus contratos de API. Si un cambio interno exige modificar un contrato utilizado por customer/, conserva compatibilidad hacia atrás o detente y explícame el bloqueo.

REGLAS DE TRABAJO
1. Ejecuta `git status` y conserva todos los cambios existentes.
2. No uses reset, checkout destructivo, borrado de datos ni limpieza masiva.
3. No reemplaces la arquitectura visual V6 por el diseño antiguo.
4. Mantén la paleta, sidebar padre/hijos, encabezados, tarjetas y estructura visual del Superadmin V6.
5. No uses datos simulados para aparentar conexión.
6. Una función solo cuenta como conectada si escribe mediante backend, persiste en PostgreSQL, registra auditoría y actualiza los paneles correspondientes sin F5.
7. Si falta un endpoint, créalo con validación, transacción, RBAC y auditoría.
8. Si el endpoint ya existe, reutilízalo; no dupliques lógica.
9. Restaurante no puede consultar ni modificar pedidos de Bar; Bar no puede consultar ni modificar pedidos de Restaurante.
10. Admin de Recepción no puede aprobar su propia rendición ni acceder a precios globales, usuarios, seguridad, inventario central o auditoría global.
11. Superadmin puede consultar, aprobar y supervisar toda la operación.
12. No continúes ocultando errores con mocks o valores predeterminados.

MODO DE EJECUCIÓN
Trabaja por fases en el orden indicado abajo. Dentro de cada fase:
- inspecciona primero la implementación existente;
- realiza el cambio mínimo compatible;
- ejecuta pruebas;
- corrige los errores encontrados;
- verifica persistencia después de recargar;
- verifica actualización entre paneles sin F5;
- entrega un resumen antes de comenzar la siguiente fase.

FASE 0 — LÍNEA BASE Y PROTECCIÓN
- Verifica Docker, PostgreSQL, backend 3000 y ERP 5173.
- Prueba los cuatro inicios de sesión.
- Registra qué endpoints y pantallas funcionan antes del cambio.
- Compila el ERP interno.
- No alteres datos productivos para las pruebas.

FASE 1 — TIEMPO REAL V6
- Integra Socket.IO en HotelContext.jsx.
- Superadmin y Admin de Recepción deben reaccionar a `state:changed`.
- Conserva el polling como respaldo.
- Evita bucles de solicitudes y desmonta correctamente los listeners.
- Demuestra que un cambio de Restaurante o Bar aparece en ambos paneles sin F5.

FASE 2 — SUPERADMIN REAL Y PERSISTENTE
- Localiza cada botón que use execute(), dispatch() o hotelReducer para modificar información.
- Sustituye las escrituras locales por servicios HTTP reales.
- Conecta una vista por vez.
- Después de cada acción, vuelve a consultar la API.
- Demuestra que la información continúa después de recargar la página.
- Conserva como lectura las vistas que todavía no deban operar y márcalas claramente como `Falta conectar` si requieren una decisión de negocio.

FASE 3 — ADMIN DE RECEPCIÓN OPERATIVO
Conecta sus vistas con el backend para:
- crear y editar reservas;
- check-in y check-out;
- cambiar estados de habitaciones;
- validar accesos;
- registrar entrada y salida de cochera;
- gestionar eventos dentro de sus permisos;
- asignar limpieza o mantenimiento comunicados por WhatsApp;
- registrar evidencia de entrada y salida;
- iniciar, finalizar y cerrar tareas;
- coordinar incidencias;
- consultar pedidos de Restaurante y Bar sin alterar su producción.

Mantén su responsabilidad como segundo al mando, pero exige trazabilidad y rendición al Superadmin.

FASE 4 — CAJA POR EMPLEADO Y TURNO
- No elimines el histórico del cierre diario existente.
- Diseña sesiones de caja vinculadas al empleado y turno.
- Registra apertura, fondo inicial, efectivo, pagos digitales, egresos autorizados, esperado, contado, diferencia, observaciones y responsable.
- El Admin de Recepción envía la rendición.
- El Superadmin aprueba, observa o rechaza.
- Nadie puede editar o borrar silenciosamente un cierre enviado.

FASE 5 — SEGURIDAD Y TURNOS
- Protege las lecturas y escrituras por área.
- Unifica las definiciones duplicadas de GET/POST `/api/shifts` sin romper consumidores actuales.
- Conserva compatibilidad con los campos ya utilizados.
- Añade pruebas positivas y respuestas 403 para roles incorrectos.

FASE 6 — VERIFICACIÓN INTEGRAL
Ejecuta el recorrido completo:
1. Superadmin asigna personal y horarios.
2. Restaurante y Bar abren sus turnos.
3. Un pedido de prueba ya pagado llega al área correcta.
4. El trabajador acepta, prepara, marca listo y entrega.
5. La receta descuenta cantidades exactas una sola vez.
6. Admin de Recepción observa y coordina sin controlar la producción.
7. Restaurante y Bar cuentan inventario y envían su cierre.
8. Admin de Recepción cierra su caja de turno y rinde cuentas.
9. Superadmin revisa y aprueba caja, inventario y diferencias.
10. Auditoría muestra quién hizo cada acción.

PRUEBAS OBLIGATORIAS
- Build del frontend interno.
- Pruebas de autenticación y RBAC.
- Prueba de Socket.IO sin F5.
- Pruebas de pedido e inventario.
- Prueba de idempotencia al entregar.
- Prueba de cierre y aprobación.
- Prueba de persistencia tras recarga.
- Smoke test de las rutas públicas para demostrar que la experiencia del cliente no fue alterada.

FORMATO DE ENTREGA
Al finalizar cada fase informa:
1. resultado logrado;
2. archivos modificados;
3. endpoints creados o reutilizados;
4. migraciones realizadas;
5. permisos aplicados;
6. pruebas ejecutadas y resultado exacto;
7. qué falta conectar;
8. riesgos pendientes.

No afirmes que todo está conectado solo porque compila. Debes demostrar escritura, persistencia, auditoría, permisos y actualización sin F5. Si una prueba falla, corrígela antes de declarar completada la fase. No pases a la experiencia del cliente: esa reestructuración se hará después.
```

### Prompt corto para continuar después de una pausa

```text
Lee completamente docs/HANDOFF_ERP_INTERNO.md, revisa `git status` y determina la última fase realmente terminada mediante código y pruebas. Continúa programando únicamente desde la siguiente fase incompleta. Conserva los cambios existentes, no toques customer/ y no declares una conexión terminada sin demostrar backend, PostgreSQL, auditoría, RBAC y actualización sin F5.
```

## Distribución recomendada entre modelos

- Claude Opus 4.6: arquitectura, revisión de riesgos y revisión final de cambios complejos.
- Gemini 3.1 Pro High: implementación por fases pequeñas y bien especificadas.
- Claude Sonnet 4.6: pruebas, revisión de diffs, RBAC y búsqueda de regresiones.

No permitir que dos modelos editen simultáneamente el mismo árbol de trabajo. Un modelo implementa; otro revisa el diff sin modificarlo; el usuario aprueba antes de continuar.
