# Park Plaza · Pucallpa

Sistema del hotel: **app del cliente** (reservas, pagos y estadía de los cinco servicios: Hospedaje, Piscina, Mirador, Terraza y Eventos) y **ERP interno**, con el Centro de dirección del dueño y las estaciones de Recepción, Cocina, Bar, Limpieza y Mantenimiento. Todo corre en tiempo real.

Auditoría local del 12 de octubre: [resultados y límites verificados](AUDITORIA_2026-10-12.md).
La carta pública incluye **91 productos y sus 91 imágenes asignadas** (29 de Restaurante y 62 de Bar).
Se abre desde «Ver carta de Restaurante y Bar». Las presentaciones comparten la foto entregada del producto.
El cóctel Piscina Park Plaza usa la foto de piscina elegida por el dueño.

## Encender (local)
```bash
docker compose up -d --build
```

| Qué | Dirección |
|---|---|
| App del cliente | http://localhost:4173 |
| ERP (personal y dueño) | http://localhost:5173 |
| Marcación de asistencia | http://localhost:5173/reloj |
| API | http://localhost:3000/api |

Son 4 contenedores: `park_plaza_postgres`, `park_plaza_backend`, `park_plaza_frontend` (ERP) y `park_plaza_customer` (app del cliente). Las fotos subidas viven en el volumen `park_plaza_ejem_uploads_data`.

## Usuarios del personal
En esta **demostración** se entra con **usuario** (sin correo) y la clave es el mismo usuario. Se cambian en ERP › Sistema › Usuarios antes de usar datos reales.

| Usuario / clave | Rol | DNI | PIN del reloj |
|---|---|---|---|
| superadmin | Dueño (Centro de dirección) | 70000000 | — |
| recepcion | Recepción (Rosa) | 70000002 | 2222 |
| cocina | Cocina (Carlos) | 70000003 | 3333 |
| bar | Bar (Luis) | 70000004 | 4444 |
| limpieza | Limpieza (Ana) | 70000005 | 5555 |
| mantenimiento | Mantenimiento (Jorge) | 70000007 | 6666 |
| admin | Administrador (deshabilitada: se activa en Usuarios) | 70000001 | — |

Cocina, Bar, Limpieza y Mantenimiento marcan entrada en `/reloj` (DNI + PIN) antes de operar. Recepción necesita caja abierta para cobrar en efectivo.

## Boletas y facturas electrónicas
Recepción (Caja › Pagos y comprobantes) y el dueño (Dinero › Boletas y facturas) emiten **boleta, factura y nota de crédito** con el formato de SUNAT: XML UBL 2.1 firmado con hash, CDR en ZIP y PDF A4 con QR e importe en letras. El dueño tiene además el **Registro de ventas** exportable a CSV y es el único que anula con nota de crédito. El cliente descarga sus comprobantes desde la app.
- Por defecto `SUNAT_MODE=demo`: todo el proceso es real menos el envío a SUNAT (cada documento lo indica).
- Datos del emisor (RUC, razón social, dirección fiscal, ubigeo, series): Configuración general › *Facturación electrónica*. Sin RUC válido se usa uno de prueba.
- Para emitir de verdad: un OSE/PSE y el certificado del hotel (`SUNAT_MODE=beta` → `production`, ver `DESPLIEGUE_AAPANEL.md`).

## Volver a "día cero"
```bash
npm run db:limpiar-operacion
```
Solo se usa en una copia de demostración con respaldo previo. Borra clientes, reservas, pagos, pedidos, solicitudes, tareas, marcaciones, cajas, auditoría e historial. Conserva la configuración, los usuarios, las habitaciones, los servicios, la carta, las recetas, los insumos y su stock, los proveedores y las fotos. La numeración de comprobantes vuelve a 00000001.

Para una demostración: `npm run demo:preparar` habilita la venta de cada plato o bebida con receta activa y stock y lista lo que falta configurar. La carta completa sigue mostrando 91 productos; el paquete preparado tiene **14 disponibles para pedidos**. Los demás se muestran como no disponibles hasta completar su receta técnica y stock. Una instalación vacía empieza con la venta pausada.

## Pruebas
Requieren `puppeteer-core` y Brave para las que usan el navegador.

| Comando | Qué comprueba |
|---|---|
| `npm run prueba:negocio` | **Recorrido de negocio completo por la API** (120 comprobaciones): cinco servicios, estaciones, caja, boletas/facturas/notas de crédito y devolución. No depende de datos previos. `API=https://…/api` para la nube. **Crea datos de prueba.** |
| `npm run prueba:botones` | Comprueba que los controles visibles de 85 pantallas tengan acción asociada; falla si una pantalla redirige o no carga. Se complementa con pruebas de los flujos. |
| `npm run prueba:flujo-completo` | Cliente reserva → dueño aprueba → Limpieza, Mantenimiento y Cocina (12 comprobaciones). **Crea datos de prueba.** |
| `npm run prueba:pantallas-dueno` | Las 50 vistas del Centro de dirección (errores, desborde, tamaño de gráficos). `VIEWPORT=390` para celular. |
| `npm run prueba:estaciones` | Pantallas de todos los roles. En Git Bash, anteponer `MSYS_NO_PATHCONV=1`. |
| `npm run prueba:tiempo-real` | Mide cuánto tarda un cambio del cliente en llegar al Tablero del dueño sin recargar. |
| `npm run prueba:lecturas` | Todas las rutas de lectura con cada rol (0 errores 500). |
| `npm run test:navigation` · `npm run test:shift-ui` | Contratos de navegación y turnos. |
| `node server/scripts/authz-matrix-test.js` | Permisos por rol (158 comprobaciones). |
| `npm run test:catalog-bootstrap` | Carta nueva, protección de ventas, datos públicos y hashes de las 91 imágenes asignadas. |
| `npm run prueba:carta` | Imágenes servidas comparadas por SHA256 y navegación real de la carta en 390/1440 px. Solo lectura. |
| `node server/scripts/verify-public-catalog.mjs` | Carta y fotos servidas desde ERP y cliente. `REQUIRE_ORIGINAL_PHOTOS=true` exige todas las fotos. |

Las pruebas que crean reservas, pagos, inventario o tareas se ejecutan en `docker-compose.audit.yml`, con sus propias bases y volúmenes. Usa `API`, `API_URL`, `TEST_API_URL`, `BASE` o `WEB` según el script para apuntar a esa copia; nunca a una instalación con datos reales.

## Documentos
- `SUPERADMIN_CHANGELOG.md`: registro de cada cambio (qué, por qué, archivos y verificación).
- `AUDITORIA_2026-10-12.md`: correcciones, pruebas locales, evidencia y pendientes de esta entrega.
- `ESCALABILIDAD_AUDITORIA_2026-09-28.md`: auditoría y fases de escalabilidad.
- `DESPLIEGUE_AAPANEL.md`: **subir esta versión al servidor aaPanel** al lado de la anterior, con respaldo, cambio de dominios y vuelta atrás (scripts en `deploy/aapanel/`).
- `DESPLIEGUE_NUBE_PRUEBA.md`: guía alternativa con Caddy en un VPS sin panel.
- `docs/tesina/`: documentos de la tesina.
