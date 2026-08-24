# Prueba de rendimiento móvil

Esta prueba verifica desde una conexión real el tiempo y tamaño de las respuestas esenciales. Levanta el sistema y ejecuta desde un equipo conectado al mismo Wi-Fi o desde el servidor publicado:

```powershell
$env:PERF_BASE_URL="http://IP-DEL-SERVIDOR:3000"
npm run test:performance-mobile
```

El objetivo inicial es que cada consulta esencial responda en 1.2 s o menos. Para medir más rutas públicas:

```powershell
$env:PERF_ENDPOINTS="/api/health,/api/public/catalog"
npm run test:performance-mobile
```

Para una prueba representativa, mide con datos móviles 4G/5G, sin Wi-Fi, y registra tres ejecuciones: primera carga, segunda carga y retorno a la aplicación. El navegador debe mostrar primero la portada y después cargar imágenes de tarjetas al desplazarse.
