# Auditoría local y entrega Park Plaza — 12 de octubre de 2026

Se revisó la reestructuración en `C:\Dev\Clientes\park_plaza_ejem\park_plaza_ejem`, desde el commit `ee4e801`.
Las pruebas que crean movimientos se ejecutaron en la copia Docker `parkplaza_audit_20261012` (API 18300,
ERP 18573, cliente 18473), con base y volúmenes propios. La restauración del paquete se comprobó en
`parkplaza_fresh_20261012` (API 18301). No se conectó ni modificó aaPanel o su base.

## Resultado y correcciones

- Carta pública completa: 91 productos, 29 de Restaurante y 62 de Bar. La vista anterior solo mostraba los
  disponibles para pedidos y aparentaba una carta incompleta. La nueva vista permite consultar toda la carta;
  los pedidos siguen sujetos a receta vigente, stock y habilitación de venta. El paquete demo tiene 14 vendibles.
- Incorporadas las fotos entregadas en OneDrive: 96 archivos leídos y comparados por SHA256, 13 duplicados,
  83 archivos reunidos en `server/public/menu/catalog`. Los 91 productos usan 81 archivos, compartiendo fotos
  entre tamaños/presentaciones. Las dos imágenes adicionales quedan conservadas. También se conservan
  89 fotos anteriores para compatibilidad con respaldos. La foto de piscina para el cóctel fue elegida por el dueño.
- Fotos incluidas en Git como respaldo del volumen de subidas. Una base nueva carga la carta completa sin
  importar usuarios o movimientos de un respaldo; comienza con venta pausada.
- El catálogo público se limita a datos de presentación y no publica recetas, costos ni ingredientes internos.
- Sincronización de imágenes con validación de identidad y hashes, transacción y comparación antes/después:
  solo cambia `image`; conserva precios, recetas, stock, clientes, pagos y todos los demás datos operativos.
- Corregidos falsos positivos de la auditoría: una pantalla redirigida por falta de turno ya no cuenta como revisada;
  login fallido, errores JavaScript/HTTP y vistas de error hacen fallar la prueba. Las lecturas no cuentan como
  cliente autenticado una identidad sin DNI ni exigen rutas de una cuenta deshabilitada.
- Altura natural de una columna móvil no se confunde con desborde horizontal. Las capturas fallan ante errores
  reales en vez de terminar correctamente cuando existen incidencias.
- Node 22 y dependencias de ejecución actualizadas; construcción de ambas interfaces y tres imágenes Docker verificada.
- Instalación aaPanel con preflight bloqueante, proyecto separado, claves aleatorias, comprobación de puertos,
  respaldo completo y hashes. La importación detiene escritores, verifica SHA256 y restaura atómicamente;
  no crea `.cargado` ante fallos. El apagado de v1 exige que ambos dominios sirvan la versión nueva.
- Respaldo periódico de v2 incluye base, fotos y hashes. El borrado de v1 exige respaldo completo y ruta exacta;
  **no se recomienda ni ejecutó el borrado para esta entrega**.

## Pruebas verificadas

| Cobertura | Resultado |
|---|---|
| Navegación ERP/cliente, contratos de acceso y turnos | Pasaron; cliente: 22 vistas, 89 acciones declaradas y 14 rutas API |
| Controles ERP por seis roles | 85 pantallas abiertas, 2664 apariciones de botones/enlaces, ninguna sin acción asociada, sin errores de JS/API |
| Recorrido de negocio API | Pasó: cinco servicios, pedidos, consumo/reserva de stock, tareas, cobros, boleta/factura/nota de crédito, PDF/XML/CDR demo, devolución y cierre de caja |
| Recorrido con clics en navegador | 12 comprobaciones pasaron: reserva móvil, pago Yape demo, aprobación, actualización automática con QR y solicitudes a las estaciones |
| Autorización y seguridad de roles | Matriz: 158 comprobaciones; RBAC: 11 comprobaciones; pasaron |
| Inventario relacional | 11 suites, 100 comprobaciones: catálogo, compras, traslados, operaciones, recetas, transformaciones, pedidos, botellas, dirección y solicitudes; pasaron |
| Facturación demo | 37 comprobaciones y 5 documentos; pasó |
| Estado, SLA, devoluciones, personal y módulos del dueño | Suites disponibles pasaron |
| Lecturas reales | 959 respuestas, 115 rutas, 7 identidades (6 personal + público), 0 errores 500 |
| Tiempo real | Evento llegó al tablero sin recargar en 1066 ms en la medición de navegador; Socket.IO backend pasó |
| Dirección en móvil | 50 vistas a 390 px, sin desborde horizontal ni errores JS/API; fuentes de gráficos hasta 13 px |
| Carta final en móvil y escritorio | 91 tarjetas y 91 imágenes, 390/1440 px, sin desborde ni errores y regreso funcional |
| Imágenes servidas | 91/91 SHA256 coinciden en ERP local, cliente local y respaldo restaurado; ninguna foto pendiente |
| Base nueva sin importar respaldo | 91 productos/91 imágenes; pedidos pausados, sin usar fotos de un volumen anterior |
| Paquete demo restaurado | Operación vacía, 91 productos, 14 vendibles, seis accesos demo, sin reservas de stock, numeración reiniciada |
| Instalador, fallos simulados | Preflight, contraseña inconsistente, paquete corrupto, error de restauración y dominio anterior bloquean el avance; no se apaga v1 ni se marca una importación fallida como completa |
| Build, sintaxis Bash y Compose | Ambas interfaces, tres imágenes Docker, scripts Linux y configuración aaPanel pasaron |
| Dependencias en ejecución | `npm audit --omit=dev`: 0 vulnerabilidades conocidas |

La prueba de botones revisa que exista una acción asociada; no equivale a pulsar cada control en todas las
combinaciones de datos. Los recorridos de negocio y de navegador verifican las operaciones descritas arriba.
Estos resultados son evidencia local, no una garantía de ausencia absoluta de errores.

## Respaldo, instalación local y entrega

Antes de modificar la instalación local se guardaron base, subidas y las tres imágenes Docker anteriores.
Los respaldos privados y logs están en `scratch/auditoria-20261012` (fuera de Git).
La instalación habitual ya sirve el código probado en http://localhost:5173 y http://localhost:4173.
La sincronización local de fotos verificó que no cambió ningún dato operativo.

El paquete privado contiene un dump de demostración limpia preparado en QA y probado en otra base.
No incluye `.env` local ni claves de GitHub; el instalador genera las claves internas nuevas en el servidor.
La guía [DESPLIEGUE_AAPANEL.md](DESPLIEGUE_AAPANEL.md) detalla: revisar → respaldar → instalar en otra
carpeta → verificar → cambiar los proxies → verificar ambos dominios → apagar la versión anterior.
El ZIP final también se extrajo en Linux: nombres UTF-8 (incluidos los tequeños) y SHA256 de sus datos verificados.
Los hashes privados usan saltos de línea de Linux. La guía distingue actualizaciones desde Git y desde un ZIP sin `.git`.

## Límites y pendientes explícitos

- `npm audit` completo mantiene 7 avisos en herramientas de construcción de Tailwind 3: 5 altos por la cadena
  de `braces` (patrones anidados) y 2 moderados por PostCSS. No están en el servidor ni en los contenedores
  Nginx de ejecución. La corrección que propone npm requiere migrar a Tailwind 4; queda pendiente esa migración
  y su comparación visual. No se acepta CSS, patrones o configuración de construcción de usuarios externos.
- Google/Firebase con una cuenta real, SUNAT/OSE real, pasarela de pago, hardware biométrico, impresión física
  y carga concurrente sostenida de producción no fueron certificados. Yape/Plin y comprobantes se probaron en modo demo.
- Se respetó el stock existente: cargar 91 productos no habilita automáticamente la venta de todos. Los 77 restantes
  requieren configurar su receta/stock/habilitación desde el ERP.
- Falta la ejecución y verificación en aaPanel, que realiza el dueño. La instalación de septiembre no se inspeccionó
  en la nube; su respaldo debe conservarse aunque actualmente sea solo demostración.
- El borrado automático de duplicados fue rechazado por la revisión de comandos («blocked by policy»).
  Se conservaron los 13 duplicados verificados en el respaldo local; `faltantes` ya no está en el catálogo ni en OneDrive.
