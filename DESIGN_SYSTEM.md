# DESIGN SYSTEM - Hotel Park Plaza ERP

## Identidad

El ERP usa una identidad moderna, elegante, profesional y hotelera. La interfaz prioriza legibilidad, operacion rapida y consistencia visual.

## Colores

| Token | HEX | Uso |
| --- | --- | --- |
| `park-dark` | `#0F3D2E` | Sidebar, navegacion, encabezados fuertes |
| `park-green` | `#1E7D4B` | Botones principales, links activos, estados OK |
| `park-green-soft` | `#E7F4EC` | Fondos positivos, etiquetas |
| `park-gold` | `#F5A623` | Acciones destacadas, activo de sidebar, pendientes |
| `park-gold-soft` | `#FFF3D6` | Fondos de advertencia y reservas |
| `park-black` | `#111111` | Texto principal |
| `park-white` | `#FFFFFF` | Cards, formularios, tablas |
| `park-bg` | `#F7F8F6` | Fondo general |
| `park-border` | `#E5E7EB` | Bordes, inputs, divisores |
| `park-muted` | `#6B7280` | Texto secundario |
| `park-danger` | `#E74C3C` | Errores, criticos, cancelados |
| `park-danger-soft` | `#FDECEC` | Fondos criticos |

Los tokens estan configurados en `client/tailwind.config.js` y documentados en `client/src/styles/tokens.js`.

## Tipografia

- Poppins: titulos principales, navegacion y KPIs.
- Inter: subtitulos, botones y labels.
- Roboto: tablas, formularios y contenido.

Escala base:

- 28px: titulo de pagina.
- 18px: titulo de card o seccion.
- 14px: tablas, formularios, descripcion y labels.

## Espaciado

Se usa grilla de 8px con valores preferidos: 4, 8, 12, 16, 24, 32, 40, 48 y 64px.

## Radios

- Inputs: 8px.
- Botones: 8px.
- Cards: 12px.
- Paneles grandes: 16px.
- Modales: 16px.

## Sombras

Sombras suaves: `shadow-card`, `shadow-dropdown`, `shadow-drawer` y `shadow-modal`.

## Componentes Base

Componentes agregados en `client/src/components/ui`:

- `Button`
- `Input`
- `Select`
- `PageHeader`
- `SectionHeader`
- `Tabs`
- `Alert`
- `ModuleCard`
- `Skeleton`

Componentes existentes refactorizados parcialmente:

- `MetricCard`
- `StatusBadge`
- `Table`
- `EmptyState`

## Estados

| Estado | Color |
| --- | --- |
| Confirmado, Libre, Finalizado, Resuelto | Verde |
| Pendiente, Reservado, En espera | Dorado |
| En limpieza, En proceso, En revision | Verde suave/secundario |
| Cancelado, Dano, Sin stock, Critico | Rojo |
| Mantenimiento, Desactivado | Gris |

## Layout

```text
AppLayout
  Sidebar
  Navbar / Topbar
  MainContent
```

El sidebar usa `park-dark`, grupos de navegacion y estado activo dorado.

## Reglas

- No repetir HEX directamente en modulos si existe token.
- No crear estilos aislados para botones/inputs nuevos.
- No dejar botones sin accion.
- Mantener tablas con scroll horizontal en pantallas pequenas.
- Mantener focus visible y labels en formularios nuevos.
