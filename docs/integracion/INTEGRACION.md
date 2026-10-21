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
y consulta SUS permisos de sede (`User_branch_permission`) con el `id` del token. Las sedes y los usuarios de la intranet los lee en vivo
a través de dos vistas de solo lectura (`v_sede`, `v_users`, sin contraseña ni cédula) que crea el administrador. Por eso su puerto debe
quedar accesible únicamente desde la red Docker del gateway.

## Qué se entrega y dónde va cada pieza

| Pieza | Origen (este repo) | Destino en la intranet |
|---|---|---|
| Servicio backend | `backend/` completo (con su `Dockerfile`) | Contenedor propio, p. ej. `intranet-lottery-backend` |
| Gateway | `docs/integracion/lottery.gateway.routes.js` | `intranet-api-auth/src/routes/` + `app.use(lotteryRoutes)` en `src/index.js` |
| Registro de rutas | `docs/integracion/seed-rutas-sorteos.js` | `intranet-api-auth/utils/seed-routes/sorteos/` (se ejecuta una vez) |
| Vistas de la intranet | `docs/integracion/vistas-sorteos.sql` | Se ejecuta una vez en la base `intranet` (ver `ENTREGA.md`, paso 2b) |
| «Permisos por Sedes» (rutas, menú y permisos) | `docs/integracion/registro-rutas-permisos.sql` | Se ejecuta una vez en la base `intranet`; solo para el grupo `ADMINISTRADOR` |
| Pantallas | `frontend/src/components/main/content/lottery/*` | **reemplazan** `intranet-frontend/src/components/main/content/lottery/` |
| Rutas de pantalla | `frontend/src/routes/_content/{lotteryreg,listassist,execlottery}.jsx` | **reemplazan** los de `intranet-frontend/src/routes/_content/` (mismos paths); `lotteryperm.jsx` es **nueva** («Permisos por Sedes», solo `ADMINISTRADOR`) |

**No copiar** `frontend/src/routes/__root.jsx`, `_content.jsx` ni `index.jsx`: son un layout de desarrollo; la intranet usa los suyos.
Hoy esas tres pantallas son un `<iframe>` al iERP antiguo: este módulo lo sustituye, con los mismos nombres de componente
(`LotteryReg`, `ListAssist`, `ExecLottery`) y los mismos paths, así que el menú existente sigue funcionando.

Dependencia nueva en el frontend de la intranet: ninguna que no tenga ya (`@tanstack/react-router`, `js-cookie`, Tailwind).

## Pasos

1. **Base de datos.** Misma base `intranet`, esquema propio `sorteos`. Crear un usuario/rol con permisos solo sobre ese
   esquema (y `SELECT` sobre `intranet_employees_db."Employee"` si se usa `sync:employees`). Sobre `intranet_api_auth_manager` **no necesita
   ningún permiso**: lee sedes y usuarios por las vistas del paso 2.
   `DATABASE_URL="postgresql://usuario:clave@host:5432/intranet?schema=sorteos"` → `npm run migrate:deploy` (el `Dockerfile` ya lo hace al arrancar).
2. **Vistas y datos iniciales.** Ejecutar `docs/integracion/vistas-sorteos.sql` (un usuario que ya lea `intranet_api_auth_manager`; antes de
   arrancar el servicio): crea `v_sede` y `v_users`, que el módulo lee en vivo en lugar de copiar. Las sedes ya no se sincronizan
   (`sync:sedes` desapareció); `npm run sync:employees` (copia empleados) sigue siendo opcional. Una sede sin fila en `Sede` cuenta como
   activa; para que una no participe se inserta su fila con `active = false` (ver `ENTREGA.md`, paso 4).
   Las gerencias (`Department`) se crean solas con las que traigan los CSV de participantes y de cupos. Los permisos por sede
   (`User_branch_permission`: `user_id` = `Users.id`, `id_sede`) se asignan desde la pantalla «Permisos por Sedes».
3. **Variables del servicio:** `DATABASE_URL`, `PORT=3000`, `SERVICES_SECRET_KEY` (el MISMO valor que el gateway; no se sube al repo).
4. **Docker.** `backend/docker-compose.yml` sigue el estilo del de `intranet-api-auth` (puerto `3008:3000`, que debe coincidir con
   `LOTTERY_SERVICE_PORT` del gateway). Copiar `backend/.env.docker.example` a `backend/.env.docker` (no se sube al repo), completar
   `DATABASE_URL` y `SERVICES_SECRET_KEY` y ejecutar `docker compose --env-file .env.docker up --build -d` dentro de `backend/`.
   El contenedor aplica las migraciones al arrancar, corre como usuario `node` y expone `/health`. Dentro de un contenedor `localhost`
   es el propio contenedor: si PostgreSQL corre en la máquina anfitriona se usa `host.docker.internal` (ya mapeado en el compose).
   Para probar sin tocar ninguna base real: `docker compose -f docker-compose.yml -f docker-compose.test.yml --env-file .env.docker up --build`
   levanta además un PostgreSQL descartable (solo pruebas).
5. **Conectar el módulo al gateway** (`intranet-api-auth`). El gateway solo deja pasar una petición si su ruta exacta está registrada
   en la base de datos Y asignada al grupo de permisos del usuario. Son cuatro acciones, en este orden:

   1. **Copiar el archivo del gateway.** `docs/integracion/lottery.gateway.routes.js` → `intranet-api-auth/src/routes/lottery.gateway.routes.js`.
      En `intranet-api-auth/src/index.js` agregar `import lotteryRoutes from "./routes/lottery.gateway.routes.js";` y, junto a los demás
      `app.use(...)`, `app.use(lotteryRoutes);`. Ese archivo recibe todo lo que llegue a `/apiv1/lottery-service` y lo reenvía al contenedor.
   2. **Confirmar el puerto.** En ese mismo archivo, `LOTTERY_SERVICE_PORT` (3008) debe ser el puerto publicado por el contenedor del paso 4.
      La dirección del servidor sale de `DOCKER_SERVER_IP` en el `.env` del gateway. No se toca el resto del archivo; en particular
      `parseReqBody: !req.is("multipart/form-data")` es lo que permite subir los CSV.
   3. **Registrar las rutas en la base de datos.** Copiar `docs/integracion/seed-rutas-sorteos.js` a
      `intranet-api-auth/utils/seed-routes/sorteos/seed-rutas-sorteos.js` y ejecutarlo desde `intranet-api-auth`:
      `node utils/seed-routes/sorteos/seed-rutas-sorteos.js`. Crea una ruta padre (`/lottery-service`) y una ruta hija por endpoint
      (`/api/lottery/me`, `/api/lottery/sorteos/create`, ...). Es repetible: si ya existen, solo las actualiza. Cada vez que se agregue un
      endpoint al módulo hay que agregarlo en este archivo y volver a ejecutarlo.
   4. **Dar acceso al grupo de permisos.** El seed solo registra las rutas; ningún usuario puede usarlas todavía. Hay que asignar al grupo
      de permisos de quienes usarán sorteos la ruta padre `/lottery-service` **y todas** las hijas `/api/lottery/...` **salvo las 4 de `/api/lottery/permisos/...`**
      (esas van solo al grupo `ADMINISTRADOR`, ver el paso 7), ya sea desde el panel
      de administración de la intranet o insertando las filas en las tablas de grupos (`Permissions_groups_routes_entity` para la padre y
      `Permissions_groups_routes_child_entity` para las hijas; sus columnas son las de la intranet y no se repiten aquí). Si falta la padre
      o alguna hija, el gateway responde **403** en esa pantalla.

   Cómo se comprueba: con un usuario de ese grupo, abrir en el navegador `/apiv1/lottery-service/api/lottery/me` debe devolver un JSON con
   su correo y sus sedes. 403 = falta asignar alguna ruta al grupo (4); una respuesta que no es JSON o un 404 suele indicar que el archivo del gateway no está montado o la ruta no se registró (1 o 3);
   «ECONNREFUSED» en los logs del gateway = el contenedor no está activo o el puerto no coincide (2).

6. **Frontend** (`intranet-frontend`). Hoy las tres pantallas del menú (`lotteryreg`, `listassist`, `execlottery`) son un `<iframe>` al iERP
   antiguo. Se sustituyen por las pantallas de este módulo, que usan los mismos nombres y paths, así que el menú no cambia:

   1. **Reemplazar la carpeta de pantallas.** Copiar todo el contenido de `frontend/src/components/main/content/lottery/` de este repo sobre
      `intranet-frontend/src/components/main/content/lottery/`. La carpeta es autónoma: solo usa React y `js-cookie`, que la intranet ya tiene.
   2. **Reemplazar las tres rutas.** Copiar `frontend/src/routes/_content/lotteryreg.jsx`, `listassist.jsx` y `execlottery.jsx` sobre los archivos de
      igual nombre en `intranet-frontend/src/routes/_content/`.
   3. **No copiar** `__root.jsx`, `_content.jsx`, `index.jsx` ni `routeTree.gen.js`: son el armazón de desarrollo de este repo y la intranet
      usa los suyos (los paths no cambian, así que su árbol de rutas sigue valiendo).
   4. **Compilar** `intranet-frontend` con su comando habitual y publicar el resultado.

   Las pantallas llaman a `/apiv1/lottery-service/api/lottery/...` (mismo origen y cookie de sesión). Si algún día el gateway cambiara de
   ruta, se ajusta con la variable `VITE_LOTTERY_API_BASE` al compilar.

   Cómo se comprueba: las tres entradas del menú muestran las pantallas nuevas (no el iERP), y en las herramientas del navegador (pestaña Red)
   la llamada a `.../api/lottery/me` responde 200.

7. **«Permisos por Sedes»** (pantalla para asignar sedes a los usuarios; solo `ADMINISTRADOR`). Ejecutar una vez
   `docs/integracion/registro-rutas-permisos.sql`: registra las 4 rutas de backend `/api/lottery/permisos/{usuarios,sedes,usuario,usuario/guardar}`,
   la pantalla `/lotteryperm` en el menú (misma sección que `/lotteryreg`) y los permisos del grupo `ADMINISTRADOR`. Es SQL y no usa ids fijos,
   así que sirve en cualquier entorno; si el grupo o `/lotteryreg` no existen, se detiene sin cambiar nada. Requiere las vistas del paso 2.
   La pantalla y su ruta (`lotteryperm.jsx`) ya vienen en la carpeta del paso 6; `routeTree.gen.js` se genera al compilar.

   Cómo se comprueba: un usuario de `ADMINISTRADOR` ve «Permisos por Sedes» y puede buscar usuarios; uno solo de `SORTEOS` no la ve y recibe
   403 en `/api/lottery/permisos/sedes`.

## Reglas para no romper la integración

- **Sin parámetros en el path.** El gateway compara el path exacto; por eso el id viaja en `?id=` o en el body. `npm test` lo verifica.
- **Cada endpoint nuevo** va en `backend/src/routes/lottery.js` **y** en `seed-rutas-sorteos.js` (una prueba falla si difieren), y se vuelve a ejecutar el seed.
  Si el endpoint debe ser solo de administradores (como los de permisos), además se asigna únicamente a ese grupo.
- **Sedes y usuarios no se copian:** se leen de `v_sede` y `v_users`. Si la intranet cambia las columnas de `Locations` o `Users` que usan las
  vistas, hay que actualizar `vistas-sorteos.sql` y volver a ejecutarlo.
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
