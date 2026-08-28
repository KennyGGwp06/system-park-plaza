# Informe de Fase [N] — [Nombre]

## 1. Veredicto

- Estado: COMPLETA / PARCIAL / BLOQUEADA
- Objetivo alcanzado:
- Lo que no se realizó:
- Motivo de cualquier desviación:

## 2. Línea base antes de editar

### Git

```text
Pegar salida de git status --short
```

```text
Pegar salida de git diff --stat
```

### Docker y salud

```text
Pegar docker compose ps y verificaciones de salud
```

### Pruebas base

| Comando | Exit code | Resultado |
|---|---:|---|
| | | |

### Archivos protegidos

- Hash/inventario inicial de `customer/`:
- Confirmación de que `../prototipo V6` no fue usado:

## 3. Cambios implementados

| Archivo | Tipo | Descripción | Razón |
|---|---|---|---|
| | | | |

## 4. Base de datos y migraciones

| Migración | Tablas/columnas/índices | Compatibilidad | Rollback probado |
|---|---|---|---|
| | | | |

- Transacciones utilizadas:
- Reglas de idempotencia:
- Datos existentes preservados:

## 5. API y tiempo real

| Método/ruta | Roles permitidos | Roles bloqueados | Auditoría | Evento Socket.IO | Consumidores |
|---|---|---|---|---|---|
| | | | | | |

## 6. Interfaz

- Rutas/vistas modificadas:
- Estados carga/vacío/error/éxito:
- Evidencia responsive 375/768/1024/1440:
- Evidencia de que no hay sidebar/header duplicado:
- Acciones visibles que siguen pendientes de conectar:

## 7. Pruebas ejecutadas después

| Comando o caso | Exit code/HTTP | Resultado esperado | Resultado real |
|---|---:|---|---|
| | | | |

Incluir como mínimo, cuando aplique:

- Build local.
- Build Docker.
- Persistencia tras recarga.
- Persistencia tras reinicio.
- Dos sesiones y actualización en tiempo real.
- 401/403 por rol.
- Doble envío/idempotencia.
- Caso de error de backend/red.
- Smoke ERP 5173.
- Smoke cliente 4173 sin modificarlo.

## 8. Evidencia de aislamiento

- Restaurante intentando acceder a Bar:
- Bar intentando acceder a Restaurante:
- Admin de recepción intentando una acción exclusiva del Superadmin:
- Usuario no autenticado:

## 9. Auditoría generada

- Acción:
- Actor/rol:
- Recurso:
- Antes/después:
- Correlation/request ID:
- Consulta usada para verificarla:

## 10. Estado final del repositorio

```text
Pegar git status --short
```

```text
Pegar git diff --stat
```

- Hash/inventario final de `customer/`:
- Diferencia respecto al inventario inicial: NINGUNA / detallar bloqueo.
- Archivos creados, modificados y eliminados en esta fase:

## 11. Pendientes y riesgos reales

| Severidad | Pendiente/riesgo | Impacto | Próxima acción |
|---|---|---|---|
| | | | |

No usar “todo funciona” sin evidencia. No ocultar funciones incompletas.

## 12. Rollback de esta fase

Describir cómo revertir exclusivamente esta fase sin perder cambios previos ni datos del usuario. No ejecutar el rollback.

## 13. Solicitud de revisión

- Fase lista para auditoría de Claude: SÍ / NO
- Motivo:
- No se inició la fase siguiente: CONFIRMADO
