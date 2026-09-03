# Facturación electrónica de Park Plaza

## Alcance implementado

El módulo parte exclusivamente de pagos aprobados y permite:

1. Ver pagos pendientes de comprobante.
2. Elegir boleta o factura.
3. Confirmar los datos fiscales del cliente.
4. Calcular automáticamente valor de venta, IGV y total desde el pago.
5. Emitir el documento mediante un adaptador SUNAT interno.
6. Mostrar `ACEPTADO`, `RECHAZADO` o `PENDIENTE_REINTENTO`.
7. Descargar PDF, XML y CDR.

Un pago solo puede tener un comprobante. Los reintentos conservan el mismo documento, serie y correlativo.

## Situación actual: simulación segura

Mientras el cliente no entregue credenciales, `SUNAT_MODE=demo` mantiene todo el flujo visible y permite simular los tres resultados. Los archivos descargados indican expresamente que son de prueba y ningún dato se envía a SUNAT.

No deben cargarse certificados, Clave SOL ni secretos en Git.

## Variables de conexión

```env
SUNAT_MODE=demo
SUNAT_ADAPTER_URL=
SUNAT_ADAPTER_TOKEN=
SUNAT_ADAPTER_TIMEOUT_MS=30000
SUNAT_INVOICE_SERIES=F001
SUNAT_RECEIPT_SERIES=B001
```

Modos previstos:

- `demo`: prueba local sin SUNAT.
- `beta`: adaptador conectado al ambiente de pruebas.
- `production`: adaptador con credenciales y certificado reales.

## Datos que deben solicitarse al cliente

- RUC y razón social exacta.
- Nombre comercial.
- Dirección fiscal y ubigeo.
- Usuario y Clave SOL destinados a emisión electrónica.
- Certificado digital vigente y su contraseña, si corresponde.
- Series autorizadas o definidas para factura y boleta.
- Logo y datos de contacto para la representación impresa.
- Correo responsable para alertas de rechazo.

## Activación posterior

Cuando se reciban las credenciales:

1. Levantar el adaptador PHP/Greenter únicamente en la red privada de Docker.
2. Guardar certificado y secretos fuera del repositorio.
3. Configurar `SUNAT_MODE=beta`, `SUNAT_ADAPTER_URL` y `SUNAT_ADAPTER_TOKEN`.
4. Emitir y validar una boleta y una factura en BETA.
5. Verificar XML firmado, CDR y PDF.
6. Cambiar a `SUNAT_MODE=production` solo después de la validación.

La interfaz y el flujo del dueño no cambian al activar SUNAT; únicamente cambia el adaptador que procesa el envío.

## Verificación automatizada

```bash
npm run test:electronic-billing
npm run build --workspace client
```

La prueba cubre emisión de boleta, cálculo de IGV, factura con RUC, prevención de duplicados, reintento y generación de los tres archivos.
