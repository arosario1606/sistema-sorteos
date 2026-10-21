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
| Quién carga los permisos por sede | `User_branch_permission` | Se cargan por SQL manual (paso 6); el administrador define quién lo ejecuta |

## 2. Base de datos: rol propio con permisos mínimos

Ejecutar como administrador de PostgreSQL (verificado: con este rol corren las migraciones y los `sync`, y el rol no puede
modificar `intranet_api_auth_manager` ni `intranet_employees_db`):

```sql
CREATE ROLE sorteos_app LOGIN PASSWORD '<clave-fuerte>';
CREATE SCHEMA sorteos AUTHORIZATION sorteos_app;
GRANT USAGE ON SCHEMA intranet_api_auth_manager, intranet_employees_db TO sorteos_app;
GRANT SELECT ON intranet_api_auth_manager."Locations" TO sorteos_app;
GRANT SELECT ON intranet_employees_db."Employee" TO sorteos_app;
```

`DATABASE_URL="postgresql://sorteos_app:<clave>@<host>:<puerto>/intranet?schema=sorteos"` (un solo `?schema=`, y siempre `sorteos`).

## 3. Backend (contenedor)

Desde la rama `main`, en `backend/`:

```bash
cp .env.docker.example .env.docker      # completar DATABASE_URL y SERVICES_SECRET_KEY
docker compose --env-file .env.docker up --build -d
```

Comprobar: `docker ps` en `healthy`; `docker logs intranet-lottery-backend` termina en «escuchando en el puerto 3000»;
`curl http://localhost:<puerto>/health` responde `{"status":"ok"}`. Las migraciones se aplican solas al arrancar.

Si PostgreSQL corre en el mismo servidor y no en otro contenedor, el host es `host.docker.internal` (ya mapeado en el compose);
`localhost` dentro del contenedor es el propio contenedor.

## 4. Datos iniciales

```bash
docker exec intranet-lottery-backend npm run sync:sedes
docker exec intranet-lottery-backend npm run sync:employees     # opcional
```

Desactivar las sedes que no participan en sorteos:
`UPDATE sorteos."Sede" SET active = false WHERE id_sede IN (...);`

## 5. Gateway y rutas

1. Copiar `docs/integracion/lottery.gateway.routes.js` a `intranet-api-auth/src/routes/` y registrar `app.use(lotteryRoutes)` en `src/index.js`.
   Debe conservar `parseReqBody: !req.is("multipart/form-data")`; sin eso la subida de CSV falla.
2. Poner el puerto del módulo en `LOTTERY_SERVICE_PORT`.
3. Ejecutar una vez `docs/integracion/seed-rutas-sorteos.js` y asignar las rutas `/lottery-service` al grupo de permisos correcto
   desde el panel de administración. Sin esto el gateway responde 403.

## 6. Permisos por sede (por SQL manual)

Cada usuario necesita filas en `sorteos."User_branch_permission"`; sin ellas el módulo carga pero no ofrece ninguna sede.
Hoy se cargan por SQL (ejemplo; `user_id` es el `Users.id` de la intranet):

```sql
INSERT INTO sorteos."User_branch_permission" (user_id, user_email, id_sede, created_by)
VALUES (<id-usuario>, '<correo>', <id-sede>, '<quien-lo-carga>')
ON CONFLICT DO NOTHING;
```

Decisión tomada: se mantienen por SQL manual, sin pantalla de administración. Conviene acordar quién ejecuta estos cambios
cuando el personal cambie. Para quitar el acceso a una sede:
`DELETE FROM sorteos."User_branch_permission" WHERE user_id = <id-usuario> AND id_sede = <id-sede>;`

## 7. Frontend de la intranet

Copiar las pantallas a `intranet-frontend` según la tabla de `INTEGRACION.md` (reemplazan los tres `<iframe>` al iERP antiguo;
mismos nombres y paths, el menú no cambia) y recompilar. **No** copiar `__root.jsx`, `_content.jsx` ni `index.jsx`.

## 8. Cómo se sabe que quedó bien

Con una sesión real de la intranet y un usuario con permisos:

1. «Registrar sorteo» ofrece sus sedes y crea un sorteo.
2. Se suben los dos CSV de `docs/ejemplos/` (16 cupos, 61 participantes, 0 errores).
3. «Listar asistencia» guarda las marcas y «Marcar a todos como asistentes» pide confirmación.
4. «Ejecutar sorteo» saca ganadores sin repetir ni superar el cupo de ninguna gerencia, y «Pantalla completa» los muestra todos a la vez.
5. «Finalizar sorteo» (el CSV es opcional) borra el sorteo y deja la base sin sus filas, salvo los ganadores, que quedan en `sorteos."Winner_history"`.
6. Un usuario **sin** permisos recibe 403 y uno sin sesión es redirigido al inicio.

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
- **Secretos:** `.env.docker` y la clave del rol no se versionan ni se comparten por chat o correo.
- **Dependencias:** `npm audit` marca 3 avisos altos por `deepmerge-ts`, interno de `prisma` y solo usado por su herramienta de línea de comandos.
  La corrección existe solo en Prisma 8, hoy candidata a lanzamiento; se actualizará cuando sea estable.

## 10. Revertir

1. Quitar las rutas `/lottery-service` del grupo de permisos (el módulo deja de ser accesible) y detener el contenedor:
   `docker compose --env-file .env.docker down`.
2. Frontend: restaurar los archivos anteriores de `intranet-frontend` desde su control de versiones.
3. Solo si se quiere borrar también los datos: `DROP SCHEMA sorteos CASCADE;` (**borra todos los sorteos y el historial permanente de ganadores**; respáldelo antes si hay que conservarlo). No afecta a otros esquemas.

## 11. Lo que NO se ha verificado

- El despliegue en el servidor de producción (red real, firewall, host de PostgreSQL y clave del gateway de producción).
- La conexión desde el contenedor cuando PostgreSQL está en otra máquina distinta del servidor del módulo.
- Los `docker exec ... npm run sync:*` dentro del contenedor (se verificaron los `sync` con el rol restringido ejecutados desde el código fuente, no desde la imagen).
