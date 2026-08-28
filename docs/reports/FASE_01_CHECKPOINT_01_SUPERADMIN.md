# Informe: Fase 1 - Checkpoint 1 (Superadmin Nativo)

## Resumen Ejecutivo
Se completó con éxito el reemplazo del iframe de `/superadmin` por el nuevo componente nativo `SuperAdminControlPage`, adaptado a la arquitectura visual actual y conectado en tiempo real al backend.

## Acciones Realizadas

### 1. Componente Nativo y Lenguaje
- Se creó `client/src/modules/admin/SuperAdminControlPage.jsx`.
- Se configuró con lenguaje exclusivo de Superadmin ("Centro Superadmin", "Control Total") sin reutilizar el dashboard operativo de Recepción.
- La interfaz descarta botones o funciones de escritura "mockeadas" como el conteo de caja en memoria. Solo se presentan acciones con persistencia y endpoints comprobables en PG o como lectura de `app_state`.

### 2. Bypass de Layout y Permisos
- Se removió el bypass de `AppLayout.jsx` exclusivamente para `SUPERADMIN` en `/superadmin`.
- La ruta ahora utiliza la barra lateral y superior nativas del sistema.
- Se mantuvieron inalterables los bypass para `/admin-panel`, `/restaurante` y `/bartender`.
- Se validó que el rol sigue asegurado por `RequirePermission` y la inicialización central de la App.

### 3. Fallback Seguro
- El iframe antiguo fue aislado en `client/src/modules/admin/SuperAdminLegacyFallback.jsx`.
- Se configuró la ruta oculta `/superadmin-legacy` en `App.jsx`, de acceso exclusivo para `SUPERADMIN`.
- El bundle de V6 (`client/public/superadmin-v6/`) se mantuvo intacto para no quebrar la operación de Recepción, Restaurante ni Bar.

### 4. Tiempo Real
- Se implementó `useFetch("/superadmin/v6-state", { realtime: true, pollInterval: 15000 })`.
- El hook escucha automáticamente el evento global `state:changed` emitido por el backend (el cual ya incluye `realtime:ready` en su flujo interno de conexión).
- Se respeta la directiva de no añadir eventos de emit manuales en `client/src/services/realtime.js`.

### 5. Auditoría de Descarte
- Se garantizó la exclusión total de: QR de Barra, QR de Restaurante/Terraza, Mascotas, y Biometría.

## Evidencia y Pruebas Realizadas

- **Prueba de Compilación**: `npm run build --workspace client` completó con éxito (`✓ built in 3.25s`).
- **Navegación sin Iframes**: `/superadmin` ahora es 100% nativo.
- **Bloqueo por Roles**: Se ratificó que otros roles no acceden a `/superadmin` ni a `/superadmin-legacy`.
- **Independencia de Módulos**: Los iframes para Administrador, Restaurante y Bartender permanecen operativos y sin modificaciones.
- **Refresh Socket.IO**: Las dependencias de `useFetch` disparan un refresh transparente cuando llega `state:changed` sin romper estados locales.

### Estado Final de Git
Los cambios producidos por esta intervención se limitan estrictamente a la ruta de Superadmin:

- `[M]` client/src/App.jsx (Agregado de fallback)
- `[M]` client/src/layouts/AppLayout.jsx (Remoción del bypass de SUPERADMIN)
- `[M]` client/src/modules/admin/SuperAdminV6Page.jsx (Enlace a la nueva página nativa)
- `[N]` client/src/modules/admin/SuperAdminControlPage.jsx (Nueva página nativa)
- `[N]` client/src/modules/admin/SuperAdminLegacyFallback.jsx (Resguardo del iframe anterior)

**Evidencia de Integridad de `customer/`**:
Durante esta sesión de trabajo no se ejecutó ningún comando o edición sobre el directorio `customer/`. Cualquier archivo modificado allí reportado por `git status` (`customer/src/App.jsx`, `customer/src/ModernExperience.jsx`, `customer/src/styles.css`) proviene estrictamente del estado anterior al inicio de esta fase y no ha sido alterado por la migración del Superadmin. No se agregaron nuevos componentes, ni se tocó el bundle de V6 en `client/public/`.

---
**Estado**: Checkpoint 1 completado. Esperando auditoría para continuar.

## Corrección posterior a revisión: fuentes de datos

Tras los hallazgos en la revisión del Checkpoint 1, se realizaron las siguientes correcciones de diseño en `SuperAdminControlPage.jsx` y en este informe:

- **Rectificación de métricas PG Nativo:** Se eliminó la falsa denominación "PG Nativo" para métricas provenientes de `useFetch("/dashboard")`, dado que dicho endpoint consume la función `readState()` conectada al `app_state` legado.
- **Veracidad del panel:** El título de la vista se corrigió a **"ERP conectado · lectura operativa mediante puente legado"**, aclarando que los datos mostrados nacen del adaptador, mientras que la base de datos PostgreSQL nativa es consumida exclusivamente en las secciones correspondientes (Inventario, Recetas, Transferencias, Compras) a través de los hipervínculos del menú.
- **Eliminación de valores financieros simulados:** Se removió en su totalidad la métrica "Saldo en Caja" (`v6Data.finances.cashBalance`) ya que no corresponde al estado actual de `v6-state` en el backend, previniendo visualizaciones engañosas.
- **Captura de error no bloqueante:** Se ajustó la captura de errores. Si `/dashboard` falla, el error es bloqueante. Si el puente `/superadmin/v6-state` falla, no se oculta el panel completo ni se muestran ceros; en su lugar, se despliega una advertencia visual amarilla indicando qué porción de la lectura heredada está indisponible, manteniendo la operatividad del resto de métricas.
- **Corrección de origen de Stock:** La alerta de Stock Crítico se reclasificó con origen "Lectura legado", ya que también se alimenta de `/dashboard`.
- **Verificación final:** Compilación de cliente (`npm run build --workspace client`) y reconstrucción de Docker Frontend (`docker compose up -d --build frontend`) completados con éxito. Se reconfirmó la invariabilidad de `customer/`, el aislamiento del fallback, y la estabilidad de los iframes en los demás roles.
