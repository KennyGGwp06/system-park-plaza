# Flujo y Lógica del Módulo Bartender (Bar)

Este documento detalla el flujo operativo y de inventario específico para el **Módulo de Bartender (Bar)**, alineado con la lógica general del restaurante y las directrices del cliente.

## 1. Topología del Sistema
- **Sistemas Independientes:** Los módulos de Cocina y Bar operan de manera autónoma.
- **Personal de Cocina (Restaurante):** 4 trabajadores (cocineros).
- **Personal de Bar (Bartender):** 2 trabajadores (bartenders).
- **Dinámica de Aceptación:** Cada área tiene su propio sistema. Cuando entra un pedido de bebida al sistema del bar, **cualquiera de los 2 bartenders** puede ir al sistema y aceptar el pedido para empezar a prepararlo. Lo mismo aplica para los 4 cocineros en su sistema.

## 2. Flujo del Pedido en el Bar

El ciclo de vida de un pedido de bebida sigue los mismos estados que la comida:

1. **Recepción Directa del Pedido (Notificación):** 
   - El **cliente** realiza su propio pedido (ej. mediante menú digital, app o QR). El sistema enruta automáticamente las órdenes de bebidas directamente al Módulo Bartender, sin pasar por un recepcionista.
   - **Alerta Sonora y Visual:** El sistema emitirá un sonido de notificación en las 2 pantallas del bar para alertar a los bartenders del nuevo pedido entrante.
2. **Estado: "Aceptado" (Por preparar):** El bartender ve la lista de bebidas pendientes.
3. **Estado: "En Proceso":** El bartender selecciona el pedido y comienza a preparar las bebidas.
4. **Estado: "Listo":** La bebida está terminada y esperando ser recogida por el mesero/atención al cliente.
5. **Estado: "Entregado":** La bebida llega al cliente. 
   - **Descuento Automático de Inventario:** *Solo en el momento exacto en que el estado pasa a "Entregado"*, el sistema descuenta automáticamente los insumos del inventario.

## 3. Control Estricto de Insumos y Recetas (Mermas y Medidas)

Al igual que en la cocina (ej. Saltado de Pollo), el bar operará bajo un control milimétrico:

- **Recetario Técnico Digital (Manual):** El administrador tendrá cargado en el sistema un manual de preparación (recetas técnicas). Si se contrata a un nuevo bartender, este puede consultar el manual en el sistema para ver exactamente qué insumos y qué cantidades exactas lleva cada trago (ej. 2 oz de Pisco, 1 oz de jarabe, rodaja de limón, hielo).
- **Descuento Preciso:** El sistema descontará onzas, mililitros y unidades exactas de las botellas e insumos del bar por cada trago entregado.

## 4. Gestión de Mermas, Pérdidas y Consumo del Personal

Para mantener el control total y evitar "fugas" de inventario sin registrar:
- **Prohibido Botar sin Registrar:** Si un insumo se malogra (ej. fruta podrida, hierbabuena marchita) o si ocurre un accidente (ej. se rompe una botella o se prepara mal un trago), el bartender **NO** debe simplemente botarlo. 
- **Registro de Pérdida:** Debe ingresar al sistema y registrar la pérdida, especificando el motivo (Vencido, Malogrado, Accidente, Consumo de Personal). Esto asegura que el inventario teórico coincida con el físico y quede constancia de por qué falta ese insumo.

## 5. Cierre de Caja e Inventario Diario

- **Inspección del Dueño/Administrador:** Al final del día, el dueño revisará el reporte de cierre.
- **Revisión de Cuadres:** Verificará que las ventas ("Entregados") coincidan con el inventario descontado, y revisará la lista de mermas/pérdidas (lo malogrado o consumido).
- **Cierre del Día:** Si todo está en orden, se realiza el cierre del sistema y del inventario del día actual. Esto congela los datos y prepara el inventario inicial para el día siguiente, asegurando que no se arrastren errores ni se vendan productos vencidos al día siguiente.
