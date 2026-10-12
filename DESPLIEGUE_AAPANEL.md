# Park Plaza v2: LOCAL → GITHUB → CLAVES/RESPALDO → NUBE

La reestructuración se instala al lado de la versión anterior. No borres la carpeta actual ni sus volúmenes.
El servidor no fue modificado durante esta auditoría local. Los nombres y rutas anteriores deben confirmarse con el paso 1.

## Antes de empezar

- La versión revisada está en la rama `auditoria/2026-10-12` de https://github.com/KennyGGwp06/system-park-plaza.
- La carta trae 91 productos originales (29 de Restaurante y 62 de Bar), todos con imagen asignada en el código.
  Las presentaciones comparten fotos; el cóctel Piscina Park Plaza usa la foto de piscina elegida por el dueño.
- El dueño confirmó que la nube tiene solo demostración. El ZIP `parkplaza-v2-auditado-20261012.zip` incluye
  `datos/parkplaza.dump`, `datos/uploads.tgz` y sus hashes: operación vacía y 14 productos habilitados para pedidos.
  El paquete se restauró y verificó en otra base local. Contiene usuarios demo y configuración privada: **no subirlo a GitHub**.
- Una base nueva carga la carta con la venta pausada. Se habilita cada producto desde el dueño cuando tiene receta
  técnica vigente y stock; no se simulan existencias para vender. La copia local actual tiene 14 productos disponibles.
- Si la nube tiene reservas, pagos o clientes reales, **no importes una base local de demostración**: conserva el
  respaldo y ensaya su migración en una copia aislada antes del corte. Esta auditoría no certifica la migración de
  la base de septiembre porque todavía no se inspeccionó ese respaldo.
- Las claves usuario = contraseña y SUNAT_MODE=demo son únicamente de demostración. Cambia las claves antes de
  usar datos reales; la emisión demo no es una emisión fiscal real.

## 0. Obtener el código en otra carpeta

En aaPanel → Files usa una carpeta nueva, `/www/wwwroot/GA/CLIENTES/parkplaza-v2`.
Puedes subir y extraer el ZIP preparado o, desde Terminal, clonar:

```bash
cd /www/wwwroot/GA/CLIENTES
git clone --branch auditoria/2026-10-12 --single-branch https://github.com/KennyGGwp06/system-park-plaza.git parkplaza-v2
cd parkplaza-v2
```

Si clonas desde GitHub, sube aparte la carpeta privada `datos/` incluida en el ZIP para obtener la demostración
preparada. El ZIP contiene código sin `.git`: `git pull` solo funciona en una instalación clonada con Git.

Si ya existe esa carpeta, revisa su contenido antes de usarla; no clones encima de la instalación actual.
Las fotos incluidas en Git se sirven como respaldo de las fotos del volumen: las nuevas subidas desde el ERP tienen prioridad.
Un ZIP de código no transporta las fotos nuevas subidas después de esta auditoría; esas necesitan respaldar el volumen.

## 1. Revisar el servidor (solo lectura)

```bash
bash deploy/aapanel/1-revisar-servidor.sh
```

Anota los puertos actuales de los tres dominios y confirma la carpeta y los contenedores de Park Plaza.
Los puertos 18081 y 18082 deben estar libres. No toques los otros sitios que aparecen en tu aaPanel.

## 2. Respaldar y descargar

```bash
bash deploy/aapanel/2-respaldar-version-anterior.sh
```

El respaldo incluye base, fotos, carpeta con su configuración privada y Nginx, en `/www/backup/parkplaza/<fecha>/`.
El script debe terminar correctamente y crear `RESPALDO_COMPLETO`. Descarga el respaldo a tu PC y verifica sus hashes.
Antes de autorizar el corte con datos reales, restaura esa copia en un entorno separado y verifica reservas, cobros y fotos.
El backup automático de v2 incluye base, fotos y SHA256; guarda también `.env.aapanel` aparte, fuera de GitHub.

## 3. Instalar v2 aislada

```bash
bash deploy/aapanel/3-instalar-version-nueva.sh
```

Genera `.env.aapanel` con claves internas aleatorias, construye con Node 22 y levanta únicamente `parkplaza_v2`.
Descarga ese archivo y guárdalo con el respaldo. No lo publiques en GitHub ni lo pegues en un chat.

Si existe el paquete privado `datos/parkplaza.dump`, también debe existir `datos/uploads.tgz`: se restaura únicamente
la base nueva, con el backend detenido y una transacción. Un fallo detiene la instalación y no crea `datos/.cargado`.
Ese paquete sirve para la demostración preparada, no para reemplazar los datos reales de la nube.
Sin paquete privado se crea una base nueva con la carta completa; revisa existencias y habilita las ventas necesarias.

## 4. Verificar antes de cambiar dominios

```bash
bash deploy/aapanel/4-verificar.sh
```

Revisa el ERP y cliente nuevos usando un túnel SSH o acceso local del servidor a 127.0.0.1:18081 y 18082.
El script comprueba salud, accesos demo, los 91 productos y sus fotos; falla si falta alguna foto.
En una instalación con contraseñas propias, sustituye las comprobaciones demo por ingresos con las cuentas reales.
Prueba reservas, pedidos, cobros, devoluciones y descargas antes del corte. Nunca ejecutes pruebas que crean ventas sobre datos reales.

## 5. Cambio de proxy en aaPanel

En **Website → sitio → Reverse proxy**, cambia solo la URL de destino:

| Sitio | Destino nuevo |
|---|---|
| parkplaza.grupoamayo.com | http://127.0.0.1:18081 |
| cliente.parkplaza.grupoamayo.com | http://127.0.0.1:18082 |
| operaciones.parkplaza.grupoamayo.com | Redirección al ERP, porque Limpieza y Mantenimiento ahora están allí |

Conserva SSL y revisa el bloque de WebSocket en `deploy/aapanel/nginx-sitio.conf`.
Si modificas **Conf**, adapta únicamente los bloques del proxy de Park Plaza. Las reglas de estáticos que busquen
archivos en la carpeta vieja pueden impedir que se carguen los assets del contenedor; no las quites de otros sitios.
Con datos reales, coordina una breve pausa de escrituras y una copia final antes de cambiar el proxy: el respaldo de
unas horas antes no contiene las reservas ni cobros posteriores. No permitas operaciones simultáneas en v1 y v2.

Después del cambio:

```bash
bash deploy/aapanel/4-verificar.sh --require-domains
```

Ambos dominios deben servir la versión nueva y pasar la verificación. Con las cuentas reales comprueba también los flujos.
Solo entonces puedes apagar v1 con `bash deploy/aapanel/6-apagar-version-anterior.sh`; sus datos siguen conservados.
No uses el script de borrado para este despliegue. No ejecutes `down -v` ni `docker system prune`.

## Volver atrás

```bash
bash deploy/aapanel/7-volver-atras.sh
```

Devuelve los proxies a los puertos que anotaste en el paso 1. Si v2 ya recibió movimientos reales, pausa las escrituras
antes de volver y conserva esos movimientos para conciliarlos; encender v1 no migra las operaciones nuevas.

## Actualizaciones posteriores

Dentro de la carpeta v2, respalda primero base, fotos y configuración; verifica el respaldo en otra instalación.
Si instalaste clonando Git, obtén el commit revisado con `git pull --ff-only` (en la rama aprobada).
Si instalaste desde ZIP, usa un ZIP posterior **solo de código**, conservando `.env.aapanel`, `backups/`,
`datos/.cargado` y los volúmenes; no reemplaces `datos/` con otra demostración ni ejecutes `git pull` sin repositorio.
Después ejecuta:

```bash
docker compose -f docker-compose.aapanel.yml --env-file .env.aapanel up -d --build
bash deploy/aapanel/4-verificar.sh --require-domains
```

Conserva `.env.aapanel`, `backups/`, `datos/.cargado` y los volúmenes. No vuelvas a importar el paquete inicial.
Para el backup inicial de v1 se usa el paso 2; para v2 revisa el servicio backup y guarda también la configuración Nginx.

Referencia del panel: https://www.aapanel.com/docs/Function/proxy.html
