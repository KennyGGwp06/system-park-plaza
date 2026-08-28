# Informe de Fase 0 — Congelamiento y mapa real (v4 — post-auditoría P1/P2/P3)

## 1. Veredicto de Fase 0

| Campo | Valor |
|---|---|
| **Estado** | **COMPLETA** |
| **Versión** | 4 — correcciones post-auditoría Claude |
| **Objetivo** | Línea base verificable sin modificar código, Docker, BD ni customer/ |
| **Auditoría previa** | `docs/reports/REVISION_FASE_00_CLAUDE.md` — Aprobada con P1/P2/P3 |
| **P1 resueltos** | ✅ Transferencias reclasificada · ✅ Inventario customer/ completo |
| **P2 resueltos** | ✅ CASH_COUNT documentado · ✅ Funciones descartadas añadidas · ✅ product-catalog.js reclasificado |
| **P3 resueltos** | ✅ Ruta /reloj añadida · ✅ Operaciones simuladas recuperadas |

---

## 2. Línea base del Entorno Autorizado

```
Repositorio: C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem
git rev-parse --show-toplevel: confirmado en la carpeta autorizada

Contenedores Docker activos:
park_plaza_backend   park_plaza_ejem-backend   0.0.0.0:3000->3000/tcp
park_plaza_frontend  park_plaza_ejem-frontend  0.0.0.0:5173->80/tcp
park_plaza_customer  park_plaza_ejem-customer  0.0.0.0:4173->80/tcp
park_plaza_postgres  postgres:16-alpine        0.0.0.0:5433->5432/tcp
```

**Estado Git al inicio de Fase 0 (`git status --short`):**
Los siguientes archivos tenían cambios previos a Fase 0 (no introducidos por ella):
```
M  client/src/App.jsx
M  client/src/constants/menu.js
M  client/src/context/AuthContext.jsx
M  client/src/layouts/AppLayout.jsx
M  client/src/layouts/Navbar.jsx
M  client/src/layouts/Sidebar.jsx
M  client/src/modules/admin/AdminCleaningPage.jsx
M  client/src/modules/admin/AdminCommandCenter.jsx
M  client/src/modules/admin/UsersPage.jsx
M  client/src/modules/admin/WorkforcePage.jsx
M  client/src/modules/employees/BarStationPage.jsx
M  client/src/modules/employees/KitchenStationPage.jsx
M  client/src/styles.css
M  customer/src/App.jsx              ← cambio PREEXISTENTE, no de Fase 0
M  customer/src/ModernExperience.jsx ← cambio PREEXISTENTE, no de Fase 0
M  customer/src/styles.css           ← cambio PREEXISTENTE, no de Fase 0
M  server/package.json
M  server/scripts/operational-inventory-test.js
M  server/scripts/rbac-security-test.js
M  server/src/db.js
M  server/src/index.js
M  server/src/operational-inventory.js
M  server/src/transfers.js
?? SUPERADMIN_ANALISIS_FUNCIONAL.md
?? biometric-bridge/
?? client/public/
?? client/src/modules/admin/AdminReceptionV6Page.jsx
?? client/src/modules/admin/BiometricSetupPage.jsx
?? client/src/modules/admin/SuperAdminPendingPage.jsx
?? client/src/modules/admin/SuperAdminV6Page.jsx
?? customer/public/images/landing/
?? docs/
...
```

---

## 3. Inventario completo de customer/ (hash SHA-256)

Generado con `Get-ChildItem -Path customer -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules|\\dist\\' }`.
Excluye `node_modules/` y `dist/`. Los tres archivos marcados `(*)` tenían cambios preexistentes antes del inicio de Fase 0; ningún otro fue modificado durante la fase.

```text
SHA256                                                             Ruta relativa
──────────────────────────────────────────────────────────────    ───────────────────────────────────────────────────────
72E89496E6FA10707B3664A58B38F67550BE4DB194B11C059415419DC5559D34  customer\Dockerfile
A1A0CC5570AE2F7153B691BFED773E0DFB2802772F3ED1AB2A97EDB457C1325E  customer\index.html
403B157834C8840242B5CF743E1BBE789C8551D73CDC56211833518C15FE66FC  customer\nginx.conf
DFDFE87A9211D87BECCB8FBD5417EA7043D567269F726E0B2279153C043FDA86  customer\package.json
4C176A81060F72365D86A18A1F399FB37A00A80FB68DC8FFE38E60C5F2FA7CF3  customer\vite.config.js
EA8941DA9AC2E530A394A9CFD2EFBC449EB250E79D3E885D1D4DEF968F2DAAD5  customer\public\manifest.webmanifest
B9F70752B2D7712A1E7B42FB9617271E02FB0488E12E65B00173D549A2356126  customer\public\brand\park-plaza-mark.svg
7DC0F7251032266A4D7DE3EE7F55C2AC86593047EBFD94687C5DEC48D9961418  customer\public\images\experiences\eventos.webp
BF5A0911528049203782883156A9A0807F9483F57903019F41EF503CB3E3D433  customer\public\images\experiences\hospedaje.webp
C2F66D1116303E995D4E1360954A6E45BBEEE79D6780967CE97127F0ED26369F  customer\public\images\experiences\mirador.webp
06F63D2F8F83E9F2A52AEDC4151B1A1869F05782674A2B3DF2761F7B9431A381  customer\public\images\experiences\piscina.webp
7C3214A301FDCA3C2BB1D3B163636C48C13001BBA6CC5BDF3524F3A130A4B469  customer\public\images\landing\park-plaza-bar-v1.png
EB4B4C2D026979C508A9A8B05A16BCC5E27251BB2B4C0031FDB7B712DD1FFE3B  customer\public\images\landing\park-plaza-hero-desktop-v1.png
4215B28D11710CE1A4BF144AC85F2162984513CCA186AE58C3AF458FE80D3364  customer\public\images\landing\park-plaza-hero-mobile-v1.png
1DD7AD812196DAE91827A73AC51C25866CE108B534248E63136110737D147636  customer\public\images\landing\park-plaza-hero-tablet-v1.png
D258C4C50F19D39D5EB884E197FA2A5EE28D49B6B908A73DE83E33210F192127  customer\public\images\landing\park-plaza-terraza-v1.png
6486179ADCF17B5241A67A171E1EBC66C9C0B4F5F37F090AF6DB91B3F6B0702B  customer\public\images\menu\ceviche.webp
176629CD3678137A65A43B04FAF60A7D38F5F488AA3033BC37840EAB3B9CFE0A  customer\public\images\menu\juane.webp
45C18030A9F339E546AADFFFA0492CB768FCC9B9086A02A4EC05936EDF66507B  customer\public\images\menu\lomo.webp
2985F72EA391E153E4599D24671DD2575FD2BC74F51E92ABED5D1CEF29DAC4D6  customer\public\images\menu\pisco.webp
561321F504C0A3CAB45B7984016A3C7015B5FFBFF43CB6EC41CB12EA36F59F5C  customer\public\images\menu\selva.webp
1F94AEF811E84495F42E736C52D5C2DBD31BC5EA182E67EDD4D77FE1DC984014  customer\public\images\rooms\doble.webp
866F9D25FFF758C1411BBA0364D34DE12AA038FD7071513C80924E570811909F  customer\public\images\rooms\matrimonial.webp
F2078CF9FD927F115F0D78E289A04D44C1BF687191853DC1B7C3F2EC03ED29BD  customer\public\images\rooms\simple.webp
E49676550B34F91D5C0E074542DBD413A923CC02B3664B45926CF5DBD1B66FC1  customer\public\images\rooms\suite.webp
99AC3A93EEA97E545AA48AE4887075FED22B3787278A55A52BF7DA2FBDFADD19  customer\public\images\rooms\triple.webp
5D3F3199DDD4E5E2C44DDCFBF94301C1EB1B2C52F0D2CB2DF32A33484B103846  customer\src\App.jsx           (*) PREEXISTENTE
1002CB3BA2FDF38752F04AD2E9EA69123E2E7564EBF289069B170DE44B461284  customer\src\CustomerErrorBoundary.jsx
04A969DB567BFE5E4E00F464C97C0026DE4324E0E4529586CF2C758BAC060020  customer\src\ExperienceFlows.jsx
60908DD334D6A4201BE90E3CCB26CCDB9D46043178C757F7992E359A83FA7A98  customer\src\main.jsx
549AFE066EFC40DECE84839D2D1B96BA5B0F9D8BACFB3E17328DADA0D2E1A42E  customer\src\ModernExperience.jsx  (*) PREEXISTENTE
020C0CA66C389F32681E91C45809A8F92C113C55D7582A5CCC69A910C5B76DA2  customer\src\styles.css            (*) PREEXISTENTE
EA5E2AAD3829EDB7AF952448B5C66CBDD04584CBE3F4E4968603987538DC2B2E  customer\src\config\api.js
FB82F560C4B28ABBAE87B2E08C5C05F6C8EF993E30B93708115672516D817E45  customer\src\config\firebase.js
```

---

## 4. Mapa Completo Real de Rutas (`client/src/App.jsx`, L68-L138 + L155)

Notas de columnas:
- **Tipo**: Iframe = componente carga un `<iframe>` al bundle estático; Nativa = componente React en `client/src/`
- **Estado detallado**: indicado con evidencia de archivo y línea donde aplique

| # | Ruta | Permiso | Restricción Rol | Componente | Tipo | Endpoint(s) | Fuente de datos | Estado |
|---|---|---|---|---|---|---|---|---|
| 1 | `/reloj` | *Ninguno (pública)* | *Sin RequireAuth* | `AttendanceClockPage` | Nativa | `POST /api/attendance/clock` | app_state (asistencia) | Conectado — revisar seguridad en **Fase 3** |
| 2 | `/dashboard` | DASHBOARD:VER | — | `Dashboard` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 3 | `/admin-panel` | ADMINISTRADOR:VER | ADMINISTRADOR | `AdminReceptionV6Page` | **Iframe** | GET `/api/admin-reception/v6-state` | JSONB app_state legado | Conectado |
| 4 | `/superadmin` | ADMINISTRADOR:VER | SUPERADMIN | `SuperAdminV6Page` | **Iframe** | GET `/api/superadmin/v6-state` | JSONB app_state legado | Conectado |
| 5 | `/admin-panel/caja-central` | ADMINISTRADOR:VER | ADMINISTRADOR | `CentralCashRegister` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 6 | `/admin/comercial` | INVENTARIO:VER | ADMINISTRADOR | `CommercialSettingsPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 7 | `/admin/alimentos-bebidas` | INVENTARIO:VER | ADMINISTRADOR | `FoodBeverageControlPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 8 | `/clientes` | CLIENTES:VER | — | `ClientsPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 9 | `/habitaciones` | HABITACIONES:VER | — | `RoomsPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 10 | `/reservas` | RESERVAS:VER | — | `ReservationsPage` | Nativa | `/clients/search`, `/rooms/:id/check-availability`, (`POST /reservations`) | **Estado local simulado** — búsqueda usa debounce 250ms real; carga inicial usa useFetch; acciones de escritura verificar | Híbrido — lectura conectada, escritura a verificar |
| 11 | `/checkin` | CHECK_IN:VER | — | `CheckInPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 12 | `/checkout` | CHECK_OUT:VER | — | `CheckOutPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 13 | `/recepcion` | RECEPCION:VER | ADMINISTRADOR | `ReceptionPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 14 | `/operaciones` | RECEPCION:CREAR | ADMINISTRADOR | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 15 | `/consumos` | PEDIDOS:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 16 | `/restaurante` | RESTAURANTE:VER | — | `KitchenStationPage` | **Iframe** | GET `/api/restaurante/v6-state` | JSONB app_state legado | Conectado |
| 17 | `/bartender` | BARTENDER:VER | — | `BarStationPage` | **Iframe** | GET `/api/bartender/v6-state` | JSONB app_state legado | Conectado |
| 18 | `/admin/restaurante/resumen` | RESTAURANTE:VER | — | `AdminRestaurantPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 19 | `/admin/restaurante/pedidos` | RESTAURANTE:VER | — | `AdminRestaurantPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 20 | `/admin/restaurante/cocina` | RESTAURANTE:VER | — | `AdminRestaurantPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 21 | `/admin/restaurante/preparando` | RESTAURANTE:VER | — | `AdminRestaurantPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 22 | `/admin/restaurante/listos` | RESTAURANTE:VER | — | `AdminRestaurantPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 23 | `/admin/restaurante/entregados` | RESTAURANTE:VER | — | `AdminRestaurantPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 24 | `/admin/restaurante/incidencias` | RESTAURANTE:VER | — | `AdminRestaurantPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 25 | `/admin/bartender/resumen` | BARTENDER:VER | — | `AdminBartenderPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 26 | `/admin/bartender/pedidos` | BARTENDER:VER | — | `AdminBartenderPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 27 | `/admin/bartender/historial` | BARTENDER:VER | — | `AdminBartenderPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 28 | `/admin/bartender/incidencias` | BARTENDER:VER | — | `AdminBartenderPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 29 | `/piscina/ingresos` | RECEPCION:VER | ADMINISTRADOR | `PoolPage` | Nativa | `POST /pool`, `/pool/client-search` (debounce L38) | **Estado local simulado** — operaciones reales vía `/pool/*` | Híbrido — lectura simulada, escritura con backend |
| 30 | `/piscina/validar-qr` | RECEPCION:VER | ADMINISTRADOR | `PoolPage` | Nativa | (mismo PoolPage) | Estado local simulado | Pendiente/Híbrido |
| 31 | `/piscina/clientes-activos` | RECEPCION:VER | ADMINISTRADOR | `PoolPage` | Nativa | (mismo PoolPage) | Estado local simulado | Pendiente/Híbrido |
| 32 | `/piscina/reportes` | RECEPCION:VER | ADMINISTRADOR | `PoolPage` | Nativa | (mismo PoolPage) | Estado local simulado | Pendiente/Híbrido |
| 33 | `/eventos/calendario` | EVENTOS:VER | — | `EventsPage` | Nativa | `/clients/search` (debounce L61), `GET/POST /events/*` | **Estado local simulado** — búsqueda de clientes debounce real; resto a verificar | Híbrido — parcialmente conectado |
| 34 | `/eventos/reservas` | EVENTOS:VER | — | `EventsPage` | Nativa | (mismo EventsPage) | Estado local simulado | Híbrido |
| 35 | `/eventos/terraza` | EVENTOS:VER | — | `EventsPage` | Nativa | (mismo EventsPage) | Estado local simulado | Híbrido |
| 36 | `/eventos/mirador` | EVENTOS:VER | — | `EventsPage` | Nativa | (mismo EventsPage) | Estado local simulado | Híbrido |
| 37 | `/eventos/contratos` | EVENTOS:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 38 | `/eventos/pagos` | PAGOS:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 39 | `/cochera` | COCHERA:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 40 | `/admin/limpieza/resumen` | RECEPCION:VER | ADMINISTRADOR | `AdminCleaningPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 41 | `/admin/limpieza/pendientes` | RECEPCION:VER | ADMINISTRADOR | `AdminCleaningPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 42 | `/admin/limpieza/finalizadas` | RECEPCION:VER | ADMINISTRADOR | `AdminCleaningPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 43 | `/admin/limpieza/evidencias` | RECEPCION:VER | ADMINISTRADOR | `AdminCleaningPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 44 | `/admin/limpieza/incidencias` | RECEPCION:VER | ADMINISTRADOR | `AdminCleaningPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 45 | `/incidencias` | REPORTES:VER | ADMINISTRADOR | `AdminMaintenancePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 46 | `/incidencias/abiertas` | REPORTES:VER | ADMINISTRADOR | `AdminMaintenancePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 47 | `/incidencias/seguimiento` | REPORTES:VER | ADMINISTRADOR | `AdminMaintenancePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 48 | `/incidencias/cerradas` | REPORTES:VER | ADMINISTRADOR | `AdminMaintenancePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 49 | `/inventario` | INVENTARIO:VER | — | `InventoryPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 50 | `/admin/inventario` | INVENTARIO:VER | ADMINISTRADOR | `InventoryAdminDashboardPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 51 | `/admin/integridad` | INVENTARIO:VER | ADMINISTRADOR | `DataIntegrityPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 52 | `/inventario/kardex` | INVENTARIO:VER | ADMINISTRADOR | `InventoryPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 53 | `/inventario/turnos` | INVENTARIO:VER | ADMINISTRADOR | `OperationalInventoryPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 54 | `/inventario/recetas` | INVENTARIO:VER | ADMINISTRADOR | `TechnicalRecipesPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 55 | `/inventario/produccion` | INVENTARIO:VER | ADMINISTRADOR | `TransformationsPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 56 | `/inventario/catalogo` | INVENTARIO:VER | ADMINISTRADOR | `ProductCatalogPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 57 | `/transferencias` | INVENTARIO:VER | ADMINISTRADOR | `TransfersPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 58 | `/compras` | COMPRAS:VER | ADMINISTRADOR | `PurchasesPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 59 | `/proveedores` | PROVEEDORES:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 60 | `/pagos` | PAGOS:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 61 | `/facturacion` | FACTURACION:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 62 | `/caja` | CAJA:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 63 | `/usuarios` | USUARIOS:VER | — | `UsersPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 64 | `/roles` | ROLES:VER | — | `RolesPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 65 | `/reportes` | REPORTES:VER | ADMINISTRADOR | `ReportsPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 66 | `/auditoria` | AUDITORIA:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 67 | `/configuracion` | CONFIGURACION:VER | — | `AdminResourcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 68 | `/accesos` | ACCESOS:VER | — | `AccessControlPage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 69 | `/empleados` | EMPLEADOS:VER | — | `WorkforcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 70 | `/turnos` | TURNOS:VER | — | `WorkforcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |
| 71 | `/planilla` | TURNOS:VER | — | `WorkforcePage` | Nativa | NO VERIFICADO | Pendiente sin backend | Pendiente |

### Operaciones simuladas identificadas con evidencia de archivo

| Módulo | Archivo | Línea | Comportamiento actual | Riesgo |
|---|---|---|---|---|
| Reservas — búsqueda de clientes | `client/src/modules/reservations/ReservationsPage.jsx` | L87-94 | `setTimeout` 250ms debounce; llama a `/clients/search` real | Bajo — es debounce válido |
| Reservas — disponibilidad | `client/src/modules/reservations/ReservationsPage.jsx` | L111-118 | `setTimeout` 250ms debounce; llama a `/rooms/:id/check-availability` real | Bajo — es debounce válido |
| Eventos — búsqueda clientes | `client/src/modules/events/EventsPage.jsx` | L61-64 | `setTimeout` 250ms debounce; llama a `/clients/search` real | Bajo — es debounce válido |
| Piscina — búsqueda clientes | `client/src/modules/employees/PoolPage.jsx` | L38-41 | `setTimeout` 250ms debounce; llama a `/pool/client-search` real | Bajo — es debounce válido |
| Reloj asistencia — feedback UI | `client/src/modules/employees/AttendanceClockPage.jsx` | L32 | `setTimeout` 5 000ms para limpiar mensaje de éxito en pantalla | No es simulación de datos — es UX de limpieza de estado |

> **Aclaración:** Los `setTimeout` encontrados son debounces de búsqueda en tiempo real y limpieza de mensajes de UI. **No son éxitos falsos de escritura.** No simulan persistencia. El riesgo real (Fase 2) es verificar que las operaciones de escritura de cada módulo (crear reserva, cerrar evento, etc.) tengan handlers backend reales con auditoría.

---

## 5. Matriz Correcta de Persistencia por Dominio

Categorías usadas: PostgreSQL relacional canónico · JSONB app_state legado · Híbrido/puente de sincronización · Estado local simulado · Pendiente sin backend

| Dominio | Archivo Backend | Tablas / Fuentes principales | Categoría correcta |
|---|---|---|---|
| Autenticación / Bootstrap | `server/src/db.js` (L119-123) | `app_state` (data JSONB); colecciones: clients, bookings, cashSessions, etc. | JSONB app_state legado |
| Inventario Relacional (catálogo y kardex) | `server/src/inventory-relational.js` | `inventory_products`, `inventory_recipes`, `inventory_recipe_items`, `inventory_audit_events` | **PostgreSQL relacional canónico** |
| Inventario Operativo (turnos y cierres) | `server/src/operational-inventory.js` | `inventory_shift_sessions`, `inventory_shift_opening_lines`, `inventory_closings`, `inventory_movements`, `inventory_audit_events`; lee `app_state.users` solo para resolver actores | **Híbrido/puente de sincronización** |
| Recetas Técnicas | `server/src/technical-recipes.js` (L45) | PG canónico para recetas/versiones; sincroniza proyección a `app_state.menuItems` (`syncMenuProjection`) | **Híbrido/puente de sincronización** |
| Transferencias | `server/src/transfers.js` | **`inventory_transfers`, `inventory_transfer_lines`, `inventory_transfer_alerts`, `inventory_reservations`, `inventory_movements`, `inventory_audit_events`** (PG); `app_state` recibe espejo de stock (`syncLegacyProducts`) y log de auditoría legacy — fuente **NO** es app_state | **Híbrido/puente de sincronización** (PG canónico; app_state = espejo legado de solo lectura) |
| Catálogo de Productos | `server/src/product-catalog.js` | `inventory_products`, `inventory_categories`, `inventory_units`, `inventory_presentations`, `inventory_product_conversions`, `inventory_stock_balances`, `inventory_lots`, `inventory_movements`, `inventory_product_cost_history`, `inventory_audit_events` (PG); `app_state.inventory` recibe proyección legacy (`addLegacyProjection` L107, `updateLegacyProjection` L142) | **Híbrido/puente de sincronización** (PG canónico; app_state = proyección legacy) |
| Compras y Recepciones | `server/src/purchasing.js` | `inventory_purchase_orders`, `inventory_purchase_order_lines`, `inventory_goods_receipts`, `inventory_goods_receipt_lines`, `inventory_movements`, `inventory_audit_events` (PG); `lockState`/`saveState` para auditoría y counters legacy | **Híbrido/puente de sincronización** |
| Caja / Sesiones de Caja | `server/src/index.js` (L1293-L1380) | `app_state.cashSessions`, `app_state.cashMovements`, `app_state.cashClosings` — sin tabla PG dedicada | **JSONB app_state legado** |

---

## 6. Iframes — Documentación técnica completa

### 6.1 Tabla de iframes

| Campo | `SuperAdminV6Page` | `AdminReceptionV6Page` | `KitchenStationPage` | `BarStationPage` |
|---|---|---|---|---|
| **URL iframe** | `/superadmin-v6/index.html` | `/superadmin-v6/index.html?mode=reception#/recepcion-dashboard` | `/superadmin-v6/index.html?mode=restaurant` | `/superadmin-v6/index.html?mode=bar` |
| **Componente contenedor** | `client/src/modules/admin/SuperAdminV6Page.jsx` | `client/src/modules/admin/AdminReceptionV6Page.jsx` | `client/src/modules/employees/KitchenStationPage.jsx` | `client/src/modules/employees/BarStationPage.jsx` |
| **Endpoint lectura** | GET `/api/superadmin/v6-state` | GET `/api/admin-reception/v6-state` | GET `/api/restaurante/v6-state` | GET `/api/bartender/v6-state` |
| **Fuente de datos** | `app_state` JSONB | `app_state` JSONB | `app_state` JSONB | `app_state` JSONB |
| **Socket recibido** | `state:changed` (io.emit broadcast); poll de respaldo cada 15 000 ms | `state:changed` (io.emit broadcast); poll de respaldo cada 15 000 ms | `state:changed` (io.emit broadcast); poll de respaldo cada 15 000 ms | `state:changed` (io.emit broadcast); poll de respaldo cada 15 000 ms |
| **Funcionalidad a preservar en nativa** | Dashboard ejecutivo, alertas, aprobaciones, configuración global | Dashboard de recepción, reservas, check-in/out, asignación | Gestión de comandas cocina, preparación, cronómetro | Gestión de comandas bar, bebidas, preparación |

> **Nota de Socket.IO:** El cliente emite `realtime:ready` al conectarse.

### 6.2 Acciones del bundle v6 — `CASH_COUNT`

**Evidencia:** `client/public/superadmin-v6/assets/OperationalViews-Dhx9DZn9.js` (bundle minificado, línea 1)

El bundle V6 expone el tipo de acción `CASH_COUNT` dentro del componente de arqueo de caja (función `J`). Este tipo es procesado en el iframe por el dispatch interno del bundle.

**Verificación backend (`server/src/index.js`):**
- No existe ningún endpoint ni handler que procese el tipo `CASH_COUNT`.
- Los endpoints reales de caja son: `POST /api/cash-sessions` (abrir), `PATCH /api/caja/movements` (movimientos), `POST /api/cash-sessions/:id/submit` (rendir), `PATCH /api/cash-sessions/:id/status` (aprobar/rechazar).
- El arqueo (`submit`) usa `actualCash` y persiste en `app_state.cashSessions` como `EN_REVISION`.

**Conclusión:** `CASH_COUNT` es un tipo de acción **interno del bundle V6** que no tiene handler dedicado en el backend actual. El flujo de arqueo del iframe pasa por `/api/cash-sessions/:id/submit`, no por un endpoint `CASH_COUNT`. Esta acción **no debe ser migrada como tipo de acción nuevo**; la Fase 1 debe mapear el formulario de arqueo al endpoint `submit` existente.

**Riesgo:** Si la Fase 1 intenta crear un handler `CASH_COUNT` en lugar de mapear al `submit`, duplicaría lógica. Marcar como **Falta conectar correctamente** hasta que el componente nativo use el endpoint `submit`.

---

## 7. Funciones descartadas por decisión de negocio

Estas funciones **NO deben migrarse, recrearse ni mostrarse** en menús, botones, rutas ni contratos nuevos. En Fase 1 se retirarán del código activo cuando exista reemplazo nativo seguro.

| Función | Estado | Evidencia | Acción en Fase 1 |
|---|---|---|---|
| **QR de Barra** | DESCARTADO | Componente `V` presente en `OperationalViews-Dhx9DZn9.js` (bundle V6, minificado); función `B` con `sourceFilter='Barra'` | Retirar de navegación; no incluir en componente nativo del bartender |
| **QR de Terraza/Restaurante** | DESCARTADO | Componente `H` presente en bundle V6 con `sourceFilter='Terraza'` | Retirar de navegación; no incluir en componente nativo del restaurante |
| **Mascotas** | DESCARTADO | No encontrada en bundle V6 ni en `client/src` (búsqueda realizada); mencionada en el handoff como descartada | Confirmar ausencia; no crear ruta ni campo |
| **Biometría de empleados** | DESCARTADO | `client/src/modules/admin/BiometricSetupPage.jsx` existe como archivo sin ruta en `App.jsx`; endpoints `/api/biometric/*` activos en `server/src/index.js` L584-623 y `biometric-bridge/` presente en raíz | Retirar `BiometricSetupPage.jsx` de navegación y menús; evaluar desactivar endpoints `/api/biometric/*` en Fase 3 |

> **Referencia de handoff:** `docs/HANDOFF_CIERRE_ERP_ANTIGRAVITY.md` L126 — "Catalogar y retirar de navegación/código activo las ideas descartadas: mascotas, QR por bar/terraza y biometría de empleados."

---

## 8. Plan de Fase 1 (No Iniciar)

La Fase 1 **NO es un rediseño visual**. Su objetivo es:
- Mover la fuente editable de los 4 iframes a componentes nativos `client/src/`.
- Eliminar la dependencia del bundle estático `client/public/superadmin-v6/`.
- Preservar URLs, sesión, diseño verde oscuro/blanco/dorado y comportamiento observable.
- No reescribir funcionalidades ni cambiar contratos de negocio.
- **No adoptar `app_state` como nueva fuente de verdad** para datos que ya están en PG.

Se divide en 4 checkpoints con prueba y rollback no destructivo en cada uno, sin inicio automático del siguiente:

1. **Checkpoint 1 — Superadmin** (`/superadmin`, rol SUPERADMIN)
2. **Checkpoint 2 — Admin de recepción** (`/admin-panel`, rol ADMINISTRADOR)
3. **Checkpoint 3 — Restaurante** (`/restaurante`, rol RESTAURANTE)
4. **Checkpoint 4 — Bar/Bartender** (`/bartender`, rol BARTENDER)

Durante cada checkpoint se deben retirar de navegación/código activo las funciones descartadas correspondientes al rol en cuestión.
