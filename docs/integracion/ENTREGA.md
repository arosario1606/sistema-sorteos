# Entrega a quien administra el servidor

Lista de comprobación para desplegar el módulo de sorteos. El detalle técnico de cada pieza está en
[`INTEGRACION.md`](INTEGRACION.md); este documento fija el **orden**, lo que debe **proveer** el administrador y cómo se
**verifica** cada paso.

## 1. Datos que debe definir el administrador

| Dato | Para qué | Quién lo conoce |
|---|---|---|
| Host y puerto de PostgreSQL (la misma base `intranet`) | `DATABASE_URL` del módulo | Se copian de `SCHEMA_API_AUTH` en `intranet-api-auth/.env` |
| Clave del rol `sorteos_app` | `DATABASE_URL` | La define quien ejecute el paso 2 |
| `SERVICES_SECRET_KEY` de producción | Verificar `x-auth-token` | El MISMO valor de `intranet-api-auth/.env`. No se sube al repo |
| Puerto libre del servidor para el módulo | Publicar el contenedor | Por defecto 3060; debe coincidir con `LOTTERY_SERVICE_PORT` en el gateway |
| Quién administra los permisos por sede | Pantalla «Permisos por Sedes» | Solo el grupo `ADMINISTRADOR` (paso 6); si se quiere otro grupo, se asigna la pantalla y sus 4 rutas a ese grupo |
| Quién ejecuta los scripts SQL de este documento | Vistas y rutas (pasos 2b y 5) | Alguien que ya pueda leer `intranet_api_auth_manager` (p. ej. el administrador de la base) |

## 2. Base de datos: rol propio con permisos mínimos

Ejecutar como administrador de PostgreSQL (verificado: con este rol corren las migraciones y `sync:employees`, y el rol **no tiene
ningún permiso** sobre `intranet_api_auth_manager`: ni siquiera puede leer `Users`; solo ve las dos vistas del paso 2b):

```sql
CREATE ROLE sorteos_app LOGIN PASSWORD '<clave-fuerte>';
CREATE SCHEMA sorteos AUTHORIZATION sorteos_app;
GRANT USAGE ON SCHEMA intranet_employees_db TO sorteos_app;
GRANT SELECT ON intranet_employees_db."Employee" TO sorteos_app;
```

Si el rol ya existía de una versión anterior, además se le pueden quitar los permisos que ya no necesita (opcional, recomendado):
`REVOKE SELECT ON intranet_api_auth_manager."Locations" FROM sorteos_app; REVOKE USAGE ON SCHEMA intranet_api_auth_manager FROM sorteos_app;`
(las vistas del paso 2b siguen funcionando: se ejecutan con los permisos de quien las creó).

### 2b. Vistas de la intranet (sedes y usuarios)

El módulo **no copia** las sedes ni los usuarios: los lee en vivo de dos vistas que se crean con
[`vistas-sorteos.sql`](vistas-sorteos.sql) (ejecutar completo, p. ej. en DBeaver con Alt+X):

| Vista | Lee de | Columnas |
|---|---|---|
| `sorteos.v_sede` | `intranet_api_auth_manager."Locations"` | `id`, `name`, `is_active` |
| `sorteos.v_users` | `intranet_api_auth_manager."Users"` | `id`, `name`, `lastname`, `email`, `active` (**sin** contraseña ni cédula) |

- Debe ejecutarlo un usuario que **ya pueda leer** esas tablas. No puede ir en las migraciones: `sorteos_app` no puede leer `Users`.
- **El usuario que lo ejecute no debe eliminarse ni perder el permiso de lectura** sobre `Users` y `Locations`: las vistas dejarían de funcionar.
- Hacerlo **antes de arrancar** la versión nueva del servicio. Se puede repetir sin problema. Concede `SELECT` a `sorteos_app` si el rol existe.
- Si faltan, el servicio arranca igual pero avisa en el log («faltan las vistas v_sede / v_users») y `/me`, crear sorteos, el detalle/listado
  de sorteos y «Permisos por Sedes» responden 503 con ese mismo aviso.
- Comprobación (con la conexión de `sorteos_app`): `SELECT * FROM sorteos.v_users LIMIT 1;` funciona y
  `SELECT * FROM intranet_api_auth_manager."Users";` responde *permission denied*.

`DATABASE_URL="postgresql://sorteos_app:<clave>@<host>:<puerto>/intranet?schema=sorteos"` (un solo `?schema=`, y siempre `sorteos`).

## 3. Backend (contenedor)

Desde la rama `main`, en `backend/`:

```bash
cp .env.docker.example .env.docker      # completar DATABASE_URL y SERVICES_SECRET_KEY
docker compose --env-file .env.docker up --build -d
```

**Actualización desde la versión anterior:** crear primero las vistas (paso 2b); la migración nueva (`..._sede_vistas_intranet`) conserva
los permisos y las sedes desactivadas y solo elimina las columnas que dejan de copiarse (`Sede.name`, `User_branch_permission.user_email`).

Comprobar: `docker ps` en `healthy`; `docker logs intranet-lottery-backend` termina en «escuchando en el puerto 3000»;
`curl http://localhost:<puerto>/health` responde `{"status":"ok"}`. Las migraciones se aplican solas al arrancar.

Si PostgreSQL corre en el mismo servidor y no en otro contenedor, el host es `host.docker.internal` (ya mapeado en el compose);
`localhost` dentro del contenedor es el propio contenedor.

## 4. Datos iniciales

```bash
docker exec intranet-lottery-backend npm run sync:employees     # opcional
```

Las sedes ya **no se sincronizan** (`sync:sedes` desapareció): se leen en vivo de `Locations`, así que una sede nueva de la intranet aparece sola.
Una sede sin fila en `sorteos."Sede"` cuenta como activa. Para que una sede **no participe** en sorteos:

```sql
INSERT INTO sorteos."Sede" (id_sede, active) VALUES (<id-sede>, false)
ON CONFLICT (id_sede) DO UPDATE SET active = false, updated_at = now();
```
(`active = true` o borrar la fila la vuelve a habilitar. Una sede inactiva en la intranet tampoco se ofrece.)

## 5. Gateway y rutas

1. Copiar `docs/integracion/lottery.gateway.routes.js` a `intranet-api-auth/src/routes/` y registrar `app.use(lotteryRoutes)` en `src/index.js`.
   Debe conservar `parseReqBody: !req.is("multipart/form-data")`; sin eso la subida de CSV falla.
2. Poner el puerto del módulo en `LOTTERY_SERVICE_PORT`.
3. Ejecutar una vez `docs/integracion/seed-rutas-sorteos.js` y asignar las rutas `/lottery-service` al grupo de permisos correcto
   desde el panel de administración. Sin esto el gateway responde 403.
4. **«Permisos por Sedes»:** ejecutar [`registro-rutas-permisos.sql`](registro-rutas-permisos.sql) (completo, p. ej. DBeaver Alt+X). En una sola
   transacción y sin ids fijos: registra las 4 rutas de backend `/api/lottery/permisos/...`, agrega la pantalla `/lotteryperm` al menú dentro
   de la misma sección que `/lotteryreg` («Sorteos») y da permiso sobre las 5 rutas **solo al grupo `ADMINISTRADOR`**. Se puede repetir.
   Si falta el grupo, la ruta padre o `/lotteryreg`, se detiene con un mensaje claro y no cambia nada. El seed `.js` del paso 3 también
   lista las 4 rutas de backend, pero la pantalla del menú y los permisos solo los hace este script.

## 6. Permisos por sede

Cada usuario necesita permiso sobre las sedes en las que puede crear sorteos; sin él, el módulo carga pero no ofrece ninguna sede.
Se administran desde la pantalla **«Permisos por Sedes»** (menú Sorteos, visible solo para el grupo `ADMINISTRADOR`):

1. Escribir al menos 2 letras del nombre, apellido o correo (sin importar tildes ni mayúsculas; solo salen usuarios activos, máximo 20).
2. Elegir al usuario y marcar sus sedes (las inactivas no se pueden asignar; se puede filtrar la lista y usar «Marcar las visibles»).
3. «Guardar cambios»: reemplaza el conjunto completo de sedes de ese usuario. Queda registrado en `created_by` quién las asignó.

Los usuarios y las sedes salen de las vistas del paso 2b: un usuario o una sede nueva de la intranet aparece sola. Quien tenga acceso a esa
pantalla puede dar **cualquier sede a cualquier usuario**, por eso solo se asigna a `ADMINISTRADOR`.

Respaldo por SQL (solo si hiciera falta; `user_id` es el `Users.id` de la intranet):

```sql
INSERT INTO sorteos."User_branch_permission" (user_id, id_sede, created_by)
VALUES (<id-usuario>, <id-sede>, '<quien-lo-carga>')
ON CONFLICT DO NOTHING;
-- quitar acceso a una sede:
DELETE FROM sorteos."User_branch_permission" WHERE user_id = <id-usuario> AND id_sede = <id-sede>;
```

## 7. Frontend de la intranet

Copiar las pantallas a `intranet-frontend` según la tabla de `INTEGRACION.md` (reemplazan los tres `<iframe>` al iERP antiguo;
mismos nombres y paths, el menú no cambia) y recompilar. **No** copiar `__root.jsx`, `_content.jsx` ni `index.jsx`.

«Permisos por Sedes» es una pantalla **nueva** (no reemplaza ningún `<iframe>`): se suman `routes/_content/lotteryperm.jsx` y, en la carpeta
`lottery/`, `lotteryperm.jsx` y `permissions-logic.js` (la carpeta completa ya los trae). No hay que editar `routeTree.gen.js`: está en el
`.gitignore` de `intranet-frontend` y se genera al compilar. El menú se arma desde la base de datos: la entrada sale del paso 5.4.

## 8. Cómo se sabe que quedó bien

Con una sesión real de la intranet y un usuario con permisos:

1. «Registrar sorteo» ofrece sus sedes y crea un sorteo.
2. Se suben los dos CSV de `docs/ejemplos/` (16 cupos, 61 participantes, 0 errores).
3. «Listar asistencia» guarda las marcas y «Marcar a todos como asistentes» pide confirmación.
4. «Ejecutar sorteo» saca ganadores sin repetir ni superar el cupo de ninguna gerencia, y «Pantalla completa» los muestra todos a la vez.
5. «Finalizar sorteo» (el CSV es opcional) borra el sorteo y deja la base sin sus filas, salvo los ganadores, que quedan en `sorteos."Winner_history"`.
6. Un usuario **sin** permisos recibe 403 y uno sin sesión es redirigido al inicio.
7. Con un usuario del grupo `ADMINISTRADOR`: aparece «Permisos por Sedes» en Sorteos; buscar a alguien, marcar dos sedes y «Guardar cambios»
   muestra «2 sedes agregadas»; ese usuario las ve en «Registrar sorteo» (nombres de las sedes de la intranet).
8. Con un usuario solo de `SORTEOS`: **no** aparece «Permisos por Sedes» en el menú y su llamada directa a
   `/apiv1/lottery-service/api/lottery/permisos/sedes` responde 403.
9. Una sede o un usuario nuevo creado en la intranet aparece en «Permisos por Sedes» sin ejecutar ningún sync.

## 9. Seguridad y operación

- **Puerto expuesto:** el compose publica `3060:3000` en todas las interfaces (igual que el patrón del gateway). El servicio exige un
  `x-auth-token` firmado, pero conviene que un firewall limite ese puerto a la IP del gateway.
- **Finalizar sorteo borra de forma definitiva** el sorteo, participantes, ganadores y cupos, **pero guarda antes a los ganadores en
  `sorteos."Winner_history"`**, una tabla permanente (nombre, cédula, gerencia, orden, nombre del sorteo y fecha del sorteo). Es la única
  tabla que conserva información de sorteos ya finalizados; no tiene pantalla, se consulta por SQL:
  `SELECT * FROM sorteos."Winner_history" ORDER BY sorteo_date, sorteo_name, winning_order;`
  Los sorteos de prueba también quedan registrados (con el nombre que tuvieran): se eliminan a mano
  (`DELETE FROM sorteos."Winner_history" WHERE sorteo_name = '<nombre>';`). Contiene datos personales y se conserva sin límite de tiempo
  (decisión del proyecto): defina quién la consulta. Incluir el esquema `sorteos` en los respaldos de la base.
- **Permisos por sede:** `sorteos_app` no tiene ningún permiso sobre `intranet_api_auth_manager`; solo lee las vistas `v_sede` y `v_users`
  (sin contraseña ni cédula). Las rutas de «Permisos por Sedes» van **solo** al grupo `ADMINISTRADOR`: el servicio no conoce los grupos, confía
  en que el gateway ya filtró; quien llegue a esas rutas puede dar cualquier sede a cualquier usuario.
- **Secretos:** `.env.docker` y la clave del rol no se versionan ni se comparten por chat o correo.
- **Dependencias:** `npm audit` marca 3 avisos altos por `deepmerge-ts`, interno de `prisma` y solo usado por su herramienta de línea de comandos.
  La corrección existe solo en Prisma 8, hoy candidata a lanzamiento; se actualizará cuando sea estable.

## 10. Revertir

1. Quitar las rutas `/lottery-service` del grupo de permisos (el módulo deja de ser accesible; para ocultar solo «Permisos por Sedes», quitar
   `/lotteryperm` y las 4 rutas `/api/lottery/permisos/...` de `ADMINISTRADOR`) y detener el contenedor:
   `docker compose --env-file .env.docker down`.
2. Frontend: restaurar los archivos anteriores de `intranet-frontend` desde su control de versiones.
3. Solo si se quiere borrar también los datos: `DROP SCHEMA sorteos CASCADE;` (**borra todos los sorteos, los permisos por sede, el historial permanente de ganadores y las vistas**; respáldelo antes si hay que conservarlo). No afecta a otros esquemas.

## 11. Lo que NO se ha verificado

- El despliegue en el servidor de producción (red real, firewall, host de PostgreSQL y clave del gateway de producción).
- La conexión desde el contenedor cuando PostgreSQL está en otra máquina distinta del servidor del módulo.
- Los `docker exec ... npm run sync:*` dentro del contenedor (se verificaron los `sync` con el rol restringido ejecutados desde el código fuente, no desde la imagen).
- «Permisos por Sedes» en el servidor real: el script de rutas y el de vistas se probaron en copias locales y réplicas mínimas, no con la
  base de producción.
- Cómo se ordena la entrada nueva dentro de la sección «Sorteos» del menú (las tres pantallas tienen `sequence = 0`) y que un usuario solo de
  `SORTEOS` no la vea: se comprueba en el paso 8.7 y 8.8 de este documento.
