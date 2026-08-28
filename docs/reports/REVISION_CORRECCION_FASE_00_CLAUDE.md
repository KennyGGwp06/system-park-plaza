# Revisión de Correcciones de Fase 0

**Fecha:** 2026-08-28T10:26 (−05:00)
**Revisor:** Claude Sonnet 4.6 (solo lectura)
**Artefacto revisado:** `docs/reports/FASE_00_DIAGNOSTICO.md` (v4)
**Documento previo:** `docs/reports/REVISION_FASE_00_CLAUDE.md`

---

## Veredicto

### RECHAZADA — P2 activo

Se encontró un error de hecho en la sección de iframes que afecta directamente
el diseño de la Fase 1. No puede iniciarse la Fase 1 hasta corregirlo.
Los demás puntos verificados son correctos.

---

## Resultados por punto

### ✅ Punto 1 — Transferencias

**Resultado: CORRECTO**

Verificado contra `server/src/transfers.js`:
- `transaction()` usa `BEGIN/COMMIT/ROLLBACK` vía `db.connect()`.
- `postTransferMovement()` llama a `post_inventory_movement()` (función SQL PG).
- `readTransfers()` consulta `inventory_transfers`, `inventory_transfer_lines`,
  `inventory_transfer_alerts`.
- `syncLegacyProducts()` actualiza `app_state` en dirección PG → `app_state`,
  no al revés.

El diagnóstico lo clasifica como **"Híbrido/puente de sincronización (PG canónico;
app_state = espejo legado de solo lectura)"** con las 6 tablas PG documentadas.
Clasificación correcta.

---

### ✅ Punto 2 — Inventario de customer/

**Resultado: CORRECTO**

Verificado contra la salida real del comando `Get-ChildItem -Recurse -File`
con exclusión de `node_modules` y `dist`:
- 34 archivos en la tabla (5 raíz, 2 public/brand+manifest, 4 experiences,
  5 landing, 5 menu, 5 rooms, 4 src, 2 config, 2 config/).
- Los 3 archivos preexistentes están marcados con `(*)` y anotados
  como "cambio PREEXISTENTE, no de Fase 0".
- Hashes SHA-256 reales, generados por comando, no inventados.

Inventario completo y correcto.

---

### ❌ Punto 3 — Iframes y Socket.IO

**Resultado: ERROR P2 — nombre de evento incorrecto**

**Evidencia del servidor** (`server/src/index.js`, función middleware de respuesta):
```js
io.emit("state:changed", { path: req.path, method: req.method, ... });
```

**Evidencia del bundle** (`client/public/superadmin-v6/assets/index-D_xaARKU.js`,
índice 392268):
```js
s.on(`state:changed`, () => { e && a(`socket`) })
```

El bundle escucha exactamente **`state:changed`**, no `state-update`.

El diagnóstico en la tabla de iframes (§6.1, columna "Socket recibido") dice:
> `state-update` (broadcast)

Esto es **incorrecto**. El nombre `state-update` no aparece en ningún lugar
del bundle ni del servidor (búsqueda exhaustiva con `IndexOf` en ambos archivos).

**Corrección mínima requerida:**
En la tabla de iframes §6.1, columna "Socket recibido", cambiar:
- `state-update (broadcast)` → `state:changed (io.emit broadcast)`

Y añadir la nota: el bundle también escucha `realtime:ready` al conectar
(`socket.emit("realtime:ready", { connected: true })`). El poll de respaldo
es cada 15 000ms via `setInterval`.

**Riesgo si no se corrige:** La Fase 1 puede montar el listener Socket.IO
con el nombre equivocado y el iframe nativo nunca recibiría actualizaciones
en tiempo real, fallando silenciosamente.

---

### ✅ Punto 4 — CASH_COUNT

**Resultado: CORRECTO en fondo, pero requiere ampliación**

Se encontraron 3 ocurrencias de `CASH_COUNT` en el bundle:

**Ocurrencia 1 (validador, idx 337185):**
```js
case`CASH_COUNT`:case`CASH_CLOSE`: {
  let n = ri(e), r = Number(t.countedAmount);
  return { ok: !!(n && Number.isFinite(r) && r >= 0), message: ... }
}
```
→ Validación previa al dispatch (guarda el estado si hay caja abierta).

**Ocurrencia 2 (reducer, idx 381297):**
```js
case`CASH_COUNT`: {
  let n = ri(e),
      r = e.cashMovements.filter(e => e.sessionId === n.id),
      i = n.openingAmount + r.reduce(...),   // expectedAmount
      a = Number(t.countedAmount),
      o = e.cashSessions.map(e => e.id === n.id ?
            { ...e, countedAmount: a, expectedAmount: i, difference: a-i, ... }
            : e);
```
→ **Modifica `app_state.cashSessions` en memoria local del iframe.**
No llama a ningún endpoint HTTP. Es una actualización optimista local.

**Ocurrencia 3 (tabla de acciones, idx 389038):**
```js
CASH_COUNT: e => ea(e.payload || e)
```
→ Mapeo de la acción a su función de dispatch local.

**Diferencias clave:**

| Acción | Efecto | Persiste en backend |
|---|---|---|
| `CASH_COUNT` | Calcula y guarda arqueo en `app_state` local del iframe | **NO** |
| `CASH_CLOSE` | Cierra sesión en `app_state` local del iframe | **NO** |
| `POST /api/cash-sessions/:id/submit` | Actualiza `app_state.cashSessions` en servidor (status → `EN_REVISION`) | **SÍ** |

**Conclusión:** `CASH_COUNT` es un tipo de acción que **solo modifica el estado
local en memoria del iframe**. No llama a ningún endpoint. Es una previsualización
local del arqueo. La persistencia real requiere que el componente nativo llame a
`POST /api/cash-sessions/:id/submit`. Si la Fase 1 no implementa esa llamada,
el arqueo se perderá al recargar.

El diagnóstico documenta esto correctamente en §6.2 ("Falta conectar correctamente").
✅ Clasificación correcta.

---

### ✅ Punto 5 — product-catalog.js

**Resultado: CORRECTO**

Verificado contra el archivo completo (343 líneas):
- L85-93: `INSERT INTO inventory_presentations` con `ON CONFLICT DO UPDATE`.
- L100-104: `INSERT INTO inventory_product_conversions`.
- L108: `SELECT data FROM app_state WHERE id = 1 FOR UPDATE` → proyección legacy.
- L137: `UPDATE app_state SET data=...` → escribe proyección a `app_state`.
- L178-198: `listCatalogProducts` consulta 6 tablas PG con JOINs.
- L223-235: `createCatalogProduct` usa `transaction()` PG.
- L296-313: `receiveCatalogCost` escribe a `inventory_stock_balances`,
  llama a `post_inventory_movement()`, actualiza `app_state` solo como espejo.

Clasificado en el diagnóstico como **"Híbrido/puente de sincronización
(PG canónico; app_state = proyección legacy)"** con tablas documentadas.
✅ Correcto.

---

### ✅ Punto 6 — Funciones descartadas

**Resultado: CORRECTO**

El diagnóstico §7 incluye tabla con los 4 elementos:

| Función | Estado en diagnóstico | Evidencia verificada |
|---|---|---|
| QR de Barra | DESCARTADO | Componente `V` en bundle (búsqueda confirmada) |
| QR de Terraza | DESCARTADO | Componente `H` en bundle (búsqueda confirmada) |
| Mascotas | DESCARTADO | No presente en código fuente ni bundle |
| Biometría empleados | DESCARTADO | `BiometricSetupPage.jsx` sin ruta en `App.jsx`; endpoints activos en servidor |

Todos marcados explícitamente como "NO deben migrarse, recrearse ni mostrarse".
✅ Correcto.

---

### ✅ Punto 7 — Ruta /reloj

**Resultado: CORRECTO**

Verificado en `client/src/App.jsx` L155:
```jsx
<Route path="/reloj" element={<AttendanceClockPage />} />
```
Esta ruta está fuera del árbol `RequireAuth`/`RequirePermission`.

El diagnóstico la lista como fila #1 de la tabla con:
- Permiso: "Ninguno (pública)"
- Restricción: "Sin RequireAuth"
- Nota de revisión de seguridad pendiente en Fase 3.

**Evaluación de riesgo de seguridad:**
La ruta `AttendanceClockPage` acepta un PIN de 4 dígitos y llama a
`POST /api/attendance/clock`. No expone datos confidenciales en la UI.
El endpoint debe validar el PIN en el servidor (riesgo de fuerza bruta
de PINs cortos). Este riesgo está correctamente marcado como "revisar en
Fase 3" en el diagnóstico.
✅ Correcto.

---

## Corrección mínima requerida para aprobar

**Solo una corrección de P2:**

En `docs/reports/FASE_00_DIAGNOSTICO.md`, sección §6.1 (tabla de iframes),
columna "Socket recibido", reemplazar en las 4 filas:

```
state-update (broadcast)
```
por:
```
state:changed (io.emit broadcast); poll de respaldo cada 15 000 ms
```

No se requiere ninguna otra corrección. Todos los demás puntos son correctos.

---

## Resumen

| Punto | Estado | Prioridad |
|---|---|---|
| 1 — Transferencias | ✅ CORRECTO | — |
| 2 — Inventario customer/ | ✅ CORRECTO | — |
| 3 — Socket.IO evento | ❌ INCORRECTO (`state-update` ≠ `state:changed`) | **P2** |
| 4 — CASH_COUNT | ✅ CORRECTO | — |
| 5 — product-catalog.js | ✅ CORRECTO | — |
| 6 — Funciones descartadas | ✅ CORRECTO | — |
| 7 — Ruta /reloj | ✅ CORRECTO | — |
