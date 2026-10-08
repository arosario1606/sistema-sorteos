# Integración del módulo de sorteos en la intranet

Cómo encaja el módulo (verificado leyendo `intranet-api-auth` e `intranet-frontend`).

```
Navegador ──cookie access_token──▶ intranet-api-auth (gateway)
                                    1. valida el JWT de la cookie (JWT_SECRET_KEY)
                                    2. comprueba el permiso de la ruta EXACTA (Routes_backend / Routes_backend_child)
                                    3. firma un JWT de 5 min con SERVICES_SECRET_KEY: { id, email, cedula, active }
                                    4. proxy ▶ servicio de sorteos (header x-auth-token)
```

El servicio de sorteos **no habla con el navegador ni con la tabla de usuarios**: solo verifica `x-auth-token`
y consulta SUS permisos de sede (`User_branch_permission`) con el `id` del token. Por eso su puerto debe
quedar accesible únicamente desde la red Docker del gateway.

## Qué se entrega y dónde va cada pieza

| Pieza | Origen (este repo) | Destino en la intranet |
|---|---|---|
| Servicio backend | `backend/` completo (con su `Dockerfile`) | Contenedor propio, p. ej. `intranet-lottery-backend` |
| Gateway | `docs/integracion/lottery.gateway.routes.js` | `intranet-api-auth/src/routes/` + `app.use(lotteryRoutes)` en `src/index.js` |
| Registro de rutas | `docs/integracion/seed-rutas-sorteos.js` | `intranet-api-auth/utils/seed-routes/sorteos/` (se ejecuta una vez) |
| Pantallas | `frontend/src/components/main/content/lottery/*` | **reemplazan** `intranet-frontend/src/components/main/content/lottery/` |
| Rutas de pantalla | `frontend/src/routes/_content/{lotteryreg,listassist,execlottery}.jsx` | **reemplazan** los de `intranet-frontend/src/routes/_content/` (mismos paths) |

**No copiar** `frontend/src/routes/__root.jsx`, `_content.jsx` ni `index.jsx`: son un layout de desarrollo; la intranet usa los suyos.
Hoy esas tres pantallas son un `<iframe>` al iERP antiguo: este módulo lo sustituye, con los mismos nombres de componente
(`LotteryReg`, `ListAssist`, `ExecLottery`) y los mismos paths, así que el menú existente sigue funcionando.

Dependencia nueva en el frontend de la intranet: ninguna que no tenga ya (`@tanstack/react-router`, `js-cookie`, Tailwind).

## Pasos

1. **Base de datos.** Misma base `intranet`, esquema propio `sorteos`. Crear un usuario/rol con permisos solo sobre ese
   esquema (y `SELECT` sobre `intranet_api_auth_manager."Locations"` e `intranet_employees_db."Employee"` si se usan los `sync`).
   `DATABASE_URL="postgresql://usuario:clave@host:5432/intranet?schema=sorteos"` → `npm run migrate:deploy` (el `Dockerfile` ya lo hace al arrancar).
2. **Datos iniciales.** `npm run sync:sedes` (copia `Locations`) y `npm run sync:employees` (copia empleados). Después, desactivar a mano
   las sedes que no participan en sorteos (`UPDATE "Sede" SET active = false WHERE id_sede IN (...)`); el `sync` no las reactiva.
   Las gerencias (`Department`) se crean solas con las que traigan los CSV de participantes y de cupos. Los permisos
   (`User_branch_permission`: `user_id` = `Users.id`, `user_email`, `id_sede`) se cargan aparte.
3. **Variables del servicio:** `DATABASE_URL`, `PORT=3000`, `SERVICES_SECRET_KEY` (el MISMO valor que el gateway; no se sube al repo).
4. **docker-compose de la intranet:** agregar el servicio con un puerto libre y poner ese puerto en `LOTTERY_SERVICE_PORT` del archivo de gateway.
5. **Registrar rutas:** ejecutar `seed-rutas-sorteos.js` y asignar las rutas `/lottery-service` al grupo de permisos que corresponda
   desde el panel de administración. Sin esto el gateway responde 403.
6. **Frontend:** copiar los archivos de la tabla y recompilar. Las pantallas llaman a `/apiv1/lottery-service/api/lottery/...`.

## Reglas para no romper la integración

- **Sin parámetros en el path.** El gateway compara el path exacto; por eso el id viaja en `?id=` o en el body. `npm test` lo verifica.
- **Cada endpoint nuevo** va en `backend/src/routes/lottery.js` **y** en `seed-rutas-sorteos.js` (una prueba falla si difieren), y se vuelve a ejecutar el seed.
- Los nombres de ruta (`route_path`, `route_name`) son únicos en toda la intranet: por eso el prefijo `/api/lottery` y «Sorteos - ».
- **Subida de archivos por el gateway:** el archivo del gateway debe llevar `parseReqBody: !req.is("multipart/form-data")` (ya incluido en
  `lottery.gateway.routes.js`). Sin eso, `express-http-proxy` corrompe el CSV y la carga falla con «Error interno del servidor».
- El gateway redirige a `/` si la sesión no es válida (no responde 401): el cliente `lottery-api.js` lo detecta y cierra la sesión.

## Desarrollo local sin el gateway

El backend siempre exige `x-auth-token` (no hay atajo en el código). En local lo aporta Vite imitando al gateway:

```bash
cd backend && npm run dev:token       # token de prueba firmado con SERVICES_SECRET_KEY del .env local (8 h)
# pegarlo en frontend/.env.local como DEV_AUTH_TOKEN=...
```
