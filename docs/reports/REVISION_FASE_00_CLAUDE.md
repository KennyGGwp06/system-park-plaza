# Revisión de Fase 0 — Auditoría de solo lectura

**Fecha:** 2026-08-28T10:07 (−05:00)
**Auditor:** Claude Sonnet 4.6 (solo lectura)
**Implementador revisado:** Gemini 3.1 Pro High
**Artefacto revisado:** `docs/reports/FASE_00_DIAGNOSTICO.md`
**Repositorio verificado:** `C:\Users\useru\OneDrive\Documents\park_plaza_ejem\park_plaza_ejem`

---

## Veredicto

### APROBADA CON P1 / P2 / P3

La Fase 0 cumplió su propósito de diagnóstico sin editar código ni datos.
Sin embargo, se encontraron tres deficiencias que deben corregirse en el
informe **antes** de autorizar la Fase 1, porque dos de ellas contienen
clasificaciones incorrectas que podrían derivar en decisiones de migración
erróneas.

---

## Pruebas ejecutadas (solo lectura)

| Verificación | Resultado |
|---|---|
| `git status --short` | Confirmado: cambios en `customer/` preexistentes (sin inicio en Fase 0) |
| `git diff --name-only HEAD -- customer/` | `customer/src/App.jsx`, `ModernExperience.jsx`, `styles.css` — todos preexistentes |
| Hash de archivos `customer/src` y `customer/public` | Archivos verificados, imágenes nuevas en `customer/public/images/landing/` |
| Lectura de `client/src/App.jsx` L68-L138 | 71 rutas contadas manualmente |
| Lectura de `server/src/transfers.js` | Completa |
| Lectura de `server/src/operational-inventory.js` | Completa (100 L de 196) |
| Lectura de `server/src/technical-recipes.js` | Completa |
| Lectura de `server/src/product-catalog.js` | Completa (80 L de 343) |
| Lectura de `server/src/purchasing.js` | Completa (80 L de 283) |
| Lectura de `server/src/index.js` L499-680 | Endpoints v6-state y biometría |
| Grep `LOCAL_ONLY` en `client/src` | Sin resultados |
| Grep `CASH_COUNT` en bundle `superadmin-v6` | Encontrado: tipo `CASH_COUNT` activo en bundle |
| Grep `mascotas`, `QR.*bar`, `QR.*terraza` en `client/src` | QR de barra/terraza presentes en bundle; `BiometricSetupPage.jsx` sin ruta |
| Lectura de `client/public/superadmin-v6/index.html` | Build estático confirmado |
| Docker: estructura de contenedores | Confirmada (backend 3000, frontend 5173, customer 4173, postgres 5433) |

---

## Hallazgos

### P1 — Clasificación errónea: `transfers.js` declarado como "JSONB app_state legado"

**Archivo:** `server/src/transfers.js`
**Evidencia:**
- L15-26: función `transaction()` usa `BEGIN/COMMIT/ROLLBACK` vía `db.connect()`
- L69-77: `postTransferMovement()` llama a `post_inventory_movement()` (función SQL), inserta en `inventory_movements`
- L91-108: `readTransfers()` consulta `inventory_transfers`, `inventory_transfer_lines`, `inventory_transfer_alerts`
- L154: `syncLegacyProducts()` sincroniza balances desde PG a `app_state` (no al revés)
- L29/32: `lockState`/`saveState` solo actualizan el log de auditoría en `app_state`; los movimientos de stock van a PG

**Diagnóstico incorrecto:** El informe clasifica Transferencias como `JSONB app_state legado`. En realidad es el módulo con mayor madurez relacional del sistema: tablas `inventory_transfers`, `inventory_transfer_lines`, `inventory_transfer_alerts`, `inventory_reservations`, `inventory_movements` y `inventory_audit_events`.

**Clasificación correcta:** `Híbrido/puente de sincronización` (primario en PG; `app_state` solo recibe el mirror de stock y el log de auditoría legacy).

**Impacto:** Si la Fase 1 parte de la premisa de que Transferencias vive en `app_state`, puede intentar migrarla innecesariamente, rompiendo la integridad de movimientos ya en PG.

**Corrección mínima:** Actualizar la fila de Transferencias en la sección 5 del diagnóstico indicando fuente canónica = `inventory_transfers` / PG, con sincronización unidireccional hacia `app_state`.

---

### P1 — customer/ tiene cambios preexistentes no documentados en el inventario

**Archivo:** `git diff HEAD -- customer/`
**Evidencia:**
```
customer/src/App.jsx          (M)
customer/src/ModernExperience.jsx  (M)
customer/src/styles.css       (M)
```
Además, el directorio `customer/public/images/landing/` es nuevo (marcado `??` en `git status`), con al menos 4 archivos PNG/webp.

**Diagnóstico incorrecto:** La sección 3 del informe lista solo 8 archivos de `customer/src/` y `customer/public/` y asegura que el inventario es completo. Faltan:
- `customer/src/CustomerErrorBoundary.jsx`
- `customer/src/ExperienceFlows.jsx`
- `customer/src/config/api.js`
- `customer/src/config/firebase.js`
- Todo `customer/public/images/` (experiences, landing, menu, rooms)
- `customer/public/manifest.webmanifest`
- `customer/public/brand/park-plaza-mark.svg`

**Impacto:** El inventario de protección no cubre todos los archivos. Si en fases posteriores se quiere comprobar que `customer/` no cambió, el hash de referencia es incompleto. Los 3 archivos con `M` confirman que existían cambios antes de la Fase 0; su contenido no fue documentado ni comparado.

**Corrección mínima:** Ampliar el inventario con todos los archivos de `customer/` (excluyendo `node_modules` y `dist`) y anotar que los 3 archivos modificados son cambios preexistentes al inicio de Fase 0, no introducidos por ella.

---

### P2 — CASH_COUNT existe en el bundle y no aparece en el diagnóstico

**Archivo:** `client/public/superadmin-v6/assets/OperationalViews-Dhx9DZn9.js` (minificado)
**Evidencia:** El bundle contiene el tipo `CASH_COUNT` usado en la función `J` del formulario de arqueo de caja (componente visible con botón "Guardar arqueo"). Hay también `CASH_OPEN`, `CASH_MOVEMENT` y `CASH_CLOSE`.

El informe (sección 6, columna "Acciones") dice `NO VERIFICADO` para todos los iframes. La petición de auditoría solicitó expresamente identificar `CASH_COUNT` como acción con riesgo.

**Impacto:** No se sabe si `CASH_COUNT` en el bundle tiene backend. Si el handler es un éxito falso, el diseño de Fase 1 puede reproducirlo. Si tiene handler real, la Fase 1 debe preservar su contraro.

**Corrección mínima:** Verificar en `server/src/index.js` si existe un endpoint o acción de estado que procese `CASH_COUNT` y documentarlo en la sección 6 del informe.

---

### P2 — QR de barra y terraza existen en el bundle y el handoff los declara descartados

**Archivo:** `client/public/superadmin-v6/assets/OperationalViews-Dhx9DZn9.js`
**Evidencia:** El bundle contiene componentes `V` ("QR de la barra") y `H` ("QR de la terraza"), con flujos completos de pedidos.

**Handoff (`docs/HANDOFF_CIERRE_ERP_ANTIGRAVITY.md` L126):** "Catalogar y retirar de navegación/código activo las ideas descartadas: mascotas, QR por bar/terraza y biometría de empleados."

**Diagnóstico:** El informe no menciona ninguno de estos tres elementos en su inventario de funciones obsoletas/descartadas, a pesar de que están presentes en el build activo.

**Impacto:** La Fase 1 debe retirarlos de navegación y código. Si el diagnóstico no los documenta, el implementador no tiene referencia del alcance de retiro.

**Corrección mínima:** Añadir en el informe una sección "Funciones descartadas confirmadas en build" con: (a) QR de barra, (b) QR de terraza, (c) `BiometricSetupPage.jsx` (existe como archivo, pero sin ruta en `App.jsx`). Indicar que las dos primeras sí están en el bundle activo y deben ser retiradas en Fase 1.

---

### P3 — Ruta `/reloj` no aparece en el mapa de rutas

**Archivo:** `client/src/App.jsx` L155
**Evidencia:**
```jsx
<Route path="/reloj" element={<AttendanceClockPage />} />
```
Esta ruta está fuera de `protectedRoutes` (no tiene permiso, no pasa por `RequireAuth`) y tampoco aparece en la tabla del diagnóstico.

**Impacto:** Es un detalle de documentación; la ruta existe y funciona públicamente (sin autenticación). Puede ser un vector de acceso sin sesión si no se revisa en Fase 3.

**Corrección mínima:** Añadir `/reloj` al mapa de rutas con permiso = "Ninguno (pública)" y nota "Accesible sin autenticación — revisar en Fase 3".

---

### P3 — Los 71 módulos nativos marcados "NO VERIFICADO" dejan puntos ciegos importantes

**Evidencia:** De los 71 ítems del mapa, 67 tienen `Endpoints Reales = NO VERIFICADO`.

El informe anterior (Versión 2) sí incluía evidencia de `setTimeout` en Reservas, Eventos, Piscina y Asistencia. Esa información se perdió al reescribir.

**Impacto:** La planificación de Fase 2 (conexiones) necesita saber cuáles módulos tienen backend real vs. cuáles usan setTimeout/estado local. La pérdida de esa evidencia es un retroceso.

**Corrección mínima:** Recuperar al menos las 4 operaciones simuladas documentadas anteriormente (Reservas L87/L111, Eventos L61, Piscina L38, Reloj de asistencia L32) y añadirlas como notas en la columna Estado del mapa.

---

## Verificaciones adicionales positivas

| Verificación | Resultado |
|---|---|
| ¿Se editó código durante Fase 0? | No. Solo `docs/reports/FASE_00_DIAGNOSTICO.md` (nuevo archivo). |
| ¿Se editó `customer/`? | No hay cambios nuevos. Los 3 archivos `M` son preexistentes. |
| ¿Se editó Docker? | No. |
| ¿Los 4 iframes y endpoints v6-state son correctos? | Sí. URLs, componentes y endpoints confirmados contra código fuente. |
| ¿RBAC de iframes es correcto? | Parcialmente. Ver corrección de `product-catalog.js` abajo. |
| ¿`inventory-relational.js` es PostgreSQL canónico? | Sí. Confirmado (tablas `inventory_products`, `inventory_recipes`, etc.). |
| ¿`operational-inventory.js` es híbrido? | Sí. Usa `inventory_shift_sessions`, `inventory_movements` en PG; lee `app_state` solo para resolver `users`. |
| ¿`technical-recipes.js` es híbrido? | Sí. PG canónico para recetas (L36-57); sincroniza a `app_state.menuItems` en L45 (`syncMenuProjection`). |
| ¿`purchasing.js` es híbrido? | Sí. `inventory_purchase_orders` en PG (L60+); usa `lockState`/`saveState` para auditoría legacy. |
| ¿`product-catalog.js` es solo app_state? | **No confirmado.** Solo se leyeron 80 líneas; contiene transacciones PG (L17-28). Necesita reclasificación. |

### Nota sobre `product-catalog.js`

El informe lo clasifica como `JSONB app_state legado`. Sin embargo, las primeras 80 líneas muestran transacciones SQL con tablas `inventory_presentations`, `inventory_categories`, etc. Es probable que sea `Híbrido/puente`, igual que `transfers.js`. Se marca como P2 (dato incompleto) porque no se pudo confirmar sin leer el archivo completo.

---

## Resumen de correcciones requeridas antes de Fase 1

| # | Prioridad | Corrección |
|---|---|---|
| 1 | P1 | Reclasificar `transfers.js` de "JSONB legado" a "Híbrido/puente". |
| 2 | P1 | Ampliar inventario de `customer/` con todos los archivos fuente y anotar cambios preexistentes. |
| 3 | P2 | Documentar `CASH_COUNT` y verificar si tiene handler en backend. |
| 4 | P2 | Añadir sección "Funciones descartadas en build": QR barra, QR terraza, biometría. |
| 5 | P2 | Verificar y reclasificar `product-catalog.js` (probable híbrido). |
| 6 | P3 | Añadir ruta `/reloj` (pública, sin `RequireAuth`) al mapa. |
| 7 | P3 | Recuperar las 4 operaciones simuladas con `setTimeout` en el mapa de rutas. |

---

## Conclusión

La Fase 0 no introdujo cambios de producto. El mapa de rutas cubre las 71
rutas de `protectedRoutes` (más la ruta pública `/reloj` omitida). Los
cuatro iframes y sus endpoints son correctos.

Los dos hallazgos P1 son clasificaciones incorrectas en la matriz de
persistencia que pueden confundir al implementador de Fase 1 sobre qué
módulos necesitan migración. Deben corregirse en el informe antes de
autorizar la siguiente fase.

No iniciar Fase 1 hasta que el implementador corrija los puntos P1
listados y el usuario o su revisor autorice por escrito.
