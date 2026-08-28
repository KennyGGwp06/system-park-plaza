# Handoff de cierre del ERP interno para Antigravity

## 1. Objetivo único

Terminar y estabilizar el sistema interno ERP de Park Plaza, compuesto por:

- Superadmin.
- Admin de recepción (segundo al mando y responsable de recepción/caja de su turno).
- Restaurante.
- Bar/Bartender.

El resultado debe conservar la arquitectura visual verde oscuro, blanco y dorado ya adoptada en el ERP, persistir en PostgreSQL, actualizarse en tiempo real y respetar los permisos de cada rol.

En este trabajo **no se rediseña ni se modifica la Experiencia del Cliente** (`customer/`, puerto 4173). Solo se ejecutan pruebas de humo de lectura para comprobar que sigue funcionando con los contratos públicos actuales.

Este documento reemplaza, para el cierre actual, al handoff histórico `docs/HANDOFF_ERP_INTERNO.md`. La carpeta externa `../prototipo V6` queda fuera del trabajo: fue una referencia visual, no es la fuente de verdad y no debe editarse, compilarse ni copiarse.

## 2. Contexto técnico que no debes reinterpretar

- Repositorio autorizado: `C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem`.
- ERP web: `client/`, puerto 5173.
- API: `server/`, puerto 3000.
- Experiencia del cliente protegida: `customer/`, puerto 4173.
- Base de datos: PostgreSQL 16 en Docker, puerto externo 5433.
- Contenedores actuales: `park_plaza_postgres`, `park_plaza_backend`, `park_plaza_frontend`, `park_plaza_customer`.
- Stack: React 19, Vite, Express, PostgreSQL, JWT y Socket.IO.
- La operación gastronómica ya incluye catálogo, recetas técnicas, transformaciones, inventario operacional, botellas, solicitudes de stock, transferencias, cierres, RBAC y pruebas específicas.
- Existe una cantidad importante de cambios sin commit. Todos pertenecen al usuario y deben preservarse.

## 3. Modelo operativo definitivo

### Superadmin

Es el dueño y controla todo el negocio:

- Tablero ejecutivo, alertas y aprobaciones.
- Experiencias, servicios, tarifas, habitaciones, carta e imágenes publicadas al cliente.
- Reservas, accesos, pagos y operación hotelera.
- Personal, horarios y permisos.
- Compras, inventario central y asignación diaria separada a Restaurante y Bar.
- Finanzas, cajas, cierres, anulaciones, descuentos y rendición de cuentas.
- Auditoría, seguridad, sesiones y configuración.

### Admin de recepción

Es segundo al mando y trabaja en recepción. Puede operar el hotel cuando el dueño no está, pero rinde cuentas al Superadmin:

- Reservas, clientes, llegadas, salidas, accesos y servicios.
- Cobros presenciales y caja propia por empleado/turno.
- Coordinación y registro de limpieza/mantenimiento con evidencias recibidas externamente.
- Seguimiento de pedidos e incidencias.
- Coordinación de personal del turno dentro de límites autorizados.
- No cambia permisos del dueño, precios globales, inventario central, registros de auditoría ni cierres aprobados.

### Restaurante y Bar

Son sistemas operativos independientes. No deben mezclar pedidos, recetas, existencias, mermas ni cierres:

- Cada área solicita insumos al Superadmin.
- El Superadmin compra/recibe en inventario central y asigna stock diario por transferencia.
- Al iniciar turno se confirma la entrega/stock inicial.
- Pedido pagado: pendiente -> aceptado/rechazado -> preparación con tiempo -> listo -> entregado.
- Solo al entregar se descuenta la receta técnica de forma atómica e idempotente.
- Se registran mermas con motivo/evidencia y ajustes solo con autorización.
- El cierre compara inicial + entradas - consumo teórico - mermas con conteo físico y calcula diferencias.
- Toda diferencia relevante genera alerta y aprobación del Superadmin.

## 4. Reglas no negociables

1. Trabaja una sola fase por ejecución. Al terminar, detente y entrega su informe Markdown. No inicies la fase siguiente.
2. Antes de editar ejecuta y registra `git status --short`, `git diff --stat`, contenedores, migraciones y pruebas base. El árbol ya está sucio.
3. Prohibidos `git reset --hard`, `git checkout --`, `git clean`, borrados recursivos, restauraciones masivas y cualquier comando que descarte cambios.
4. No edites `customer/`, `customer/public/`, su Dockerfile ni sus dependencias. No cambies contratos que consume el cliente. Si un contrato necesita evolucionar, debe ser aditivo y retrocompatible.
5. No leas ni edites `../prototipo V6`. No vuelvas a copiar su `dist`. No edites archivos minificados o compilados dentro de `client/public/superadmin-v6` a mano.
6. Primero identifica la fuente editable real de cada pantalla. Si una vista solo existe como build estático, detente y repórtalo; no parches el bundle.
7. No sustituyas datos reales por mocks, `localStorage`, arreglos en memoria o éxitos optimistas falsos. Si una función no persiste, debe quedar deshabilitada y mostrar `Falta conectar` hasta que su backend exista.
8. Toda escritura crítica debe usar PostgreSQL, transacción, validación, autorización en servidor, auditoría e idempotencia cuando corresponda.
9. Socket.IO es una notificación de actualización; PostgreSQL es la fuente de verdad. Tras recibir un evento, la UI vuelve a consultar al backend.
10. Ninguna regla de acceso puede depender solo del menú o frontend. Toda ruta sensible valida rol, área y propiedad en backend.
11. Restaurante no accede a Bar y Bar no accede a Restaurante. Superadmin ve ambos. Admin de recepción solo consulta/coordina lo expresamente autorizado.
12. No inventes precios, imágenes, ingredientes, gramajes, conversiones, empleados, credenciales ni saldos. Si falta un dato de negocio, crea el campo/flujo para que el Superadmin lo complete y marca el dato como pendiente.
13. Las unidades canónicas son g para sólidos, ml para líquidos y unidad para piezas. Conserva unidad de compra y factor de conversión. No conviertas “dash”, “al gusto”, “tiempos” u otros datos ambiguos sin aprobación humana.
14. No se borra historial financiero, de inventario ni de auditoría. Corrige con reversos/anulaciones vinculadas al original.
15. Las migraciones son aditivas y versionadas, con archivo `.up.sql` y `.down.sql` seguro. Nunca elimines o renombres columnas con datos sin una migración de compatibilidad.
16. No registres tokens, contraseñas, secretos ni contenido sensible en logs o informes.
17. No agregues dependencias sin justificar necesidad, licencia, mantenimiento e impacto de imagen Docker.
18. No cambies la paleta ni recuperes interfaces antiguas azul marino. Usa los componentes/tokens existentes del ERP nuevo.
19. Responsive obligatorio en 375 px, 768 px, 1024 px y 1440 px. Sin doble sidebar, iframe anidado, scroll horizontal ni encabezados duplicados.
20. No declares una función “conectada” solo porque responde 200. Debe persistir tras recarga y reinicio, respetar RBAC, auditarse y reflejarse en las vistas consumidoras.

## 5. Estrategia con las dos cuentas

No permitas dos agentes escribiendo simultáneamente sobre esta carpeta.

- **Gemini 3.1 Pro High:** implementador. Ejecuta exactamente una fase y genera el informe.
- **Claude Sonnet 4.6:** auditor de solo lectura. Revisa el diff y las pruebas de esa fase. No corrige código.
- Si Claude encuentra un bloqueo P0/P1, Gemini recibe un prompt de reparación limitado a esos hallazgos. Luego Claude vuelve a auditar.
- Solo después de revisión humana se autoriza la fase siguiente.

## 6. Fases de ejecución

### Fase 0 — Congelamiento y mapa real (sin cambios de producto)

Objetivo: obtener una línea base verificable y descubrir la fuente de verdad actual.

Entregables:

- Inventario de rutas del ERP por rol y componente que las renderiza.
- Mapa de endpoints, tablas, eventos Socket.IO y consumidores.
- Lista de vistas que aún usan build estático, iframe, estado local, `app_state` o rutas heredadas.
- Lista de operaciones sin handler real, éxitos falsos y botones sin persistencia.
- Inventario exacto de cambios ya existentes en `customer/` para poder demostrar que las fases no los modifican.
- Resultado de build, pruebas disponibles, salud Docker y errores actuales de consola/API.
- Propuesta de orden de corrección si la realidad difiere de este documento.

No editar código en esta fase. Crear `docs/reports/FASE_00_DIAGNOSTICO.md` y detenerse.

### Fase 1 — Fuente única del ERP y retiro seguro de legado

Objetivo: que Superadmin, Admin de recepción, Restaurante y Bar tengan código fuente editable dentro de `client/`, sin depender de la carpeta externa V6 ni editar bundles compilados.

Alcance:

- Consolidar una fuente de verdad dentro del repositorio principal, preservando URLs, sesión, diseño y comportamiento observable.
- Eliminar encabezados/sidebar duplicados e iframes solo cuando exista equivalencia comprobada.
- Catalogar y retirar de navegación/código activo las ideas descartadas: mascotas, biometría de empleados y los QR de consumo por ambiente. Esto incluye explícitamente **QR de Barra** y **QR de Terraza/Restaurante**. No deben volver a aparecer como vistas, botones, menús, flujos de pedido ni contratos nuevos: el acceso del cliente proviene de los servicios pagados y habilitados, no de un QR por mesa o ambiente.
- No reescribir funcionalidades ni cambiar contratos de negocio en esta fase.
- Mantener una ruta de rollback documentada.

DoD adicional: comparación visual antes/después de cuatro roles, build limpio y pruebas de login/navegación. Informe `FASE_01_FUENTE_UNICA.md`. Detenerse.

### Fase 2 — Integridad de conexiones y contratos

Objetivo: que ningún botón visible afirme éxito sin persistencia real.

Alcance:

- Crear una matriz acción -> endpoint -> tabla -> auditoría -> evento -> vistas consumidoras.
- Corregir handlers faltantes de funciones visibles y necesarias.
- Ocultar o deshabilitar funciones obsoletas/no autorizadas con explicación clara.
- Unificar manejo de carga, error, conflicto, reintento e idempotencia.
- Mantener compatibilidad con el cliente sin editar `customer/`.

DoD: recarga y reinicio conservan cambios; segunda sesión ve actualización; fallos de red no aplican estado falso. Informe `FASE_02_CONEXIONES.md`. Detenerse.

### Fase 3 — Gobierno y seguridad del Superadmin

Objetivo: reemplazar matrices informativas y auditoría en memoria por control real.

Alcance:

- Usuarios, roles, permisos efectivos y áreas.
- Activar/desactivar usuario, restablecimiento seguro y revocación de sesiones.
- Matriz de permisos generada desde políticas reales del backend.
- Auditoría inmutable con actor, rol, acción, recurso, antes/después, fecha, IP/correlación y resultado.
- Aprobación de operaciones críticas; nadie aprueba su propia operación cuando aplique.
- Superadmin protegido contra degradación/borrado accidental del último dueño activo.

DoD: pruebas 200/403 por rol, intento de escalamiento bloqueado y auditoría consultable. Informe `FASE_03_GOBIERNO.md`. Detenerse.

### Fase 4 — Centro de publicación y control comercial

Objetivo: permitir al Superadmin administrar lo que verá el cliente sin rediseñar el frontend del cliente.

Alcance:

- Módulo padre `Experiencia y publicación`.
- Servicios/planes, habitaciones/tarifas, carta pública, textos e imágenes.
- Biblioteca multimedia con subida validada, nombre/alt, dimensiones, peso y variantes responsive.
- Borrador -> vista previa -> publicar; historial de versiones y rollback.
- Publicación transaccional: el cliente solo consume la última versión publicada completa.
- Preview móvil/tablet/escritorio dentro del ERP, usando el mismo contrato público.
- Conservar URLs/esquemas actuales o agregar versión compatible; no editar `customer/`.

No inventar contenido. Los campos sin datos quedan pendientes para el dueño. Informe `FASE_04_PUBLICACION.md`. Detenerse.

### Fase 5 — Finanzas, caja y rendición de cuentas

Objetivo: dar al dueño control completo del dinero sin permitir alteraciones silenciosas.

Alcance:

- Consolidado por servicio, método, canal, empleado, sesión y turno.
- Caja del Admin de recepción: apertura, movimientos, arqueo, cierre y rendición al Superadmin.
- Diferencia esperada vs contada, justificación y aprobación.
- Anulaciones, descuentos, devoluciones y cortesías con permisos, motivos y reversos.
- En esta fase no se integra Culqi; se preserva el adaptador/contrato para futura pasarela.

DoD: cada sol puede trazarse desde pago hasta sesión/cierre; no se editan comprobantes históricos. Informe `FASE_05_FINANZAS.md`. Detenerse.

### Fase 6 — Cierre operativo por rol

Objetivo: terminar vistas y flujos de Admin de recepción, Restaurante y Bar sobre la arquitectura común.

Dividir internamente en tres checkpoints, sin mezclar áreas:

1. Admin de recepción: reservas, accesos, caja, evidencias, incidencias, coordinación y rendición.
2. Restaurante: pedidos, cronómetro, recetas, stock asignado, mermas, conteo y cierre.
3. Bar: pedidos, recetas/bebidas, botellas, stock asignado, mermas, conteo y cierre.

Reglas:

- No duplicar el Superadmin dentro de estos roles.
- El stock se descuenta al entregar, una sola vez.
- Rechazar/cancelar antes de entregar no consume; reversar después genera movimiento compensatorio auditado.
- Cierres bloquean cambios silenciosos y elevan diferencias al Superadmin.

Informe `FASE_06_ROLES_OPERATIVOS.md`. Detenerse.

### Fase 7 — Históricos, resiliencia y aceptación final

Objetivo: demostrar que el ERP está listo para prueba integral.

Alcance:

- Reportes históricos reales por rango de fechas y exportación CSV.
- Salud de API, BD, Socket.IO y almacenamiento de imágenes.
- Procedimiento comprobable de respaldo PostgreSQL y restauración en una base temporal, sin tocar la base activa.
- Pruebas E2E de los cuatro roles, concurrencia/idempotencia, responsive y reinicio Docker.
- Smoke test de 4173 únicamente para confirmar que sigue cargando/leyendo; prohibido corregirlo aquí.
- Inventario final de pendientes reales, sin ocultarlos ni sustituirlos por mocks.

Informe final `FASE_07_ACEPTACION.md`. Detenerse.

## 7. Definition of Done global

Una fase no está completa hasta cumplir todo lo aplicable:

- Compila local y dentro de Docker.
- Persistencia confirmada después de recargar navegador y reiniciar contenedores.
- Eventos en tiempo real comprobados con dos sesiones/roles.
- Casos felices, errores, 401, 403, duplicación e idempotencia probados.
- Migraciones aplicadas en una base de prueba y rollback validado cuando sea seguro.
- No hay errores nuevos en consola, API o logs de contenedores.
- No hay mocks, estado solo local ni datos inventados en el flujo terminado.
- No hay acceso cruzado Restaurante/Bar.
- El cambio queda auditado.
- Responsive verificado en 375, 768, 1024 y 1440 px.
- `customer/` tiene exactamente el mismo contenido que al inicio de la fase.
- Se entrega informe con comandos y resultados reales, no frases como “todo funciona”.

## 8. Prompt para Gemini 3.1 Pro High (implementador)

Copiar y pegar, sustituyendo `[N]` y `[NOMBRE]`:

```text
Trabaja como ingeniero senior responsable de una fase crítica del ERP Park Plaza.

Lee COMPLETO primero:
C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem\docs\HANDOFF_CIERRE_ERP_ANTIGRAVITY.md

Repositorio autorizado:
C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem

Ejecuta ÚNICAMENTE la Fase [N] — [NOMBRE]. No avances a otra fase aunque termines pronto.

Obligaciones:
1. Antes de editar, registra estado Git, diff, Docker, migraciones, pruebas y archivos ya modificados.
2. Conserva todos los cambios existentes del usuario. No uses reset, checkout, clean ni borrados masivos.
3. No leas ni edites ../prototipo V6.
4. No edites customer/ ni rompas sus contratos. Solo se permite smoke test de lectura cuando la fase lo pida.
5. No edites bundles compilados/minificados. Identifica la fuente editable.
6. No uses mocks, localStorage ni éxito local para una operación de negocio.
7. Implementa backend, BD, RBAC, auditoría, tiempo real y UI necesarios dentro del alcance.
8. No inventes datos de negocio. Si falta uno, deja un campo configurable y documenta el pendiente.
9. Ejecuta pruebas proporcionales y registra salidas exactas.
10. Al finalizar crea el informe exigido por la fase usando docs/PLANTILLA_INFORME_FASE.md.
11. Detente después del informe y espera auditoría. No hagas la fase siguiente.

Si encuentras una contradicción o una acción destructiva necesaria, no improvises: detente, documenta el bloqueo y solicita decisión.
```

## 9. Prompt para Claude Sonnet 4.6 (auditor de solo lectura)

```text
Actúa como auditor senior independiente. NO MODIFIQUES CÓDIGO, MIGRACIONES, DATOS NI CONFIGURACIÓN.

Lee completo:
C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem\docs\HANDOFF_CIERRE_ERP_ANTIGRAVITY.md

Audita únicamente la Fase [N] — [NOMBRE] implementada por otro agente en:
C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem

Revisa el informe de fase, git diff, código fuente, migraciones, endpoints, RBAC, auditoría, Socket.IO, UI y pruebas. Ejecuta verificaciones de solo lectura o pruebas que no destruyan datos. No confíes en el resumen del implementador: confirma cada afirmación.

Prioridades:
- P0: pérdida/corrupción de datos, secreto expuesto, bypass crítico o sistema inutilizable.
- P1: función principal falsa/rota, acceso indebido, doble descuento/cobro o customer afectado.
- P2: defecto relevante con alternativa temporal.
- P3: mejora menor.

Comprueba especialmente:
1. Que customer/ no cambió durante la fase.
2. Que no se editó ../prototipo V6 ni un bundle compilado.
3. Que persiste después de recarga/reinicio.
4. Que Restaurante y Bar permanecen aislados.
5. Que las escrituras tienen autorización y auditoría en backend.
6. Que el tiempo real vuelve a consultar la fuente de verdad.
7. Que no hay mocks, éxitos optimistas falsos o datos inventados.
8. Que los comandos y resultados del informe son reproducibles.

Crea docs/reports/REVISION_FASE_[N]_CLAUDE.md con veredicto APROBADA, APROBADA CON P2/P3 o RECHAZADA. Incluye hallazgos con archivo/línea/evidencia, pruebas ejecutadas, riesgos y la reparación mínima. Después detente; no corrijas nada.
```

## 10. Prompt de reparación cuando la auditoría rechaza

```text
Lee el handoff y la revisión de Claude de la Fase [N]. Corrige exclusivamente los hallazgos P0/P1 enumerados, sin ampliar alcance ni iniciar otra fase. Conserva todos los cambios existentes, no edites customer/ ni ../prototipo V6 y no descartes trabajo con Git. Repite las pruebas afectadas, actualiza el informe de fase con una sección “Correcciones posteriores a auditoría” y detente.
```

## 11. Criterio para autorizar la siguiente fase

Avanzar solo cuando:

- Gemini entregó código + informe.
- Claude entregó auditoría reproducible.
- No quedan P0/P1.
- Las diferencias P2/P3 fueron aceptadas explícitamente o programadas.
- El usuario o su revisor autoriza por escrito la fase siguiente.
