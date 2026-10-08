# Sistema de Sorteos

Módulo de sorteos de la intranet. Backend: Node + Express + Prisma sobre **PostgreSQL** (esquema propio `sorteos`).
Frontend: React + Vite (misma pila que `intranet-frontend`). Se integra detrás del gateway de la intranet:
ver [`docs/integracion/INTEGRACION.md`](docs/integracion/INTEGRACION.md).

## Flujo del sistema

1. **Registrar sorteo:** fecha, nombre y sedes que forman el grupo del sorteo (solo sedes activas con permiso del usuario).
2. Subir el **CSV de participantes** (RRHH) y el **CSV de cupos** por gerencia.
3. **Listar asistencia:** marcar con un check quién asistió (se guarda al instante). El botón «Marcar a todos como asistentes»
   (con confirmación) marca de una vez a todos los participantes que faltan; avisa si el sorteo ya tiene ganadores.
4. **Ejecutar sorteo:** cada pulsación de «Sortear» saca un ganador (cuenta regresiva de 3,5 s), hasta que no queden elegibles.
   Todos los ganadores se ven a la vez (sin scroll) y «Pantalla completa» deja solo el sorteo para proyectarlo.
5. **Finalizar sorteo:** botón en «Ejecutar sorteo». **Borra de forma definitiva** el sorteo, sus participantes, ganadores, cupos y
   las gerencias que ningún otro sorteo use (los empleados se conservan). Pide escribir el nombre del sorteo y ofrece antes
   «Descargar ganadores (CSV)» (`ganadores sorteo <nombre>.csv`): es la única copia que queda. Se puede finalizar aunque no se
   hayan sacado todos los ganadores, y sirve también para eliminar un sorteo creado por error.

Elegible = `participa = SI` + asistió + no ha ganado + su gerencia aún tiene cupo en el grupo.
Los cupos son por gerencia dentro del grupo (las sedes del grupo comparten gerencias).
Una gerencia sin cupo cargado no tiene ganadores.

## Formato de los CSV

- Separador `;` o `,`; UTF-8 o Latin-1; con o sin encabezado.
- **Participantes** (sin encabezado): `cedula;apellidos;nombres;cargo;gerencia;participa`. `participa` = `SI`/`NO`.
  La cédula se limpia a letras y números (`28624356-1` → `286243561`). La gerencia se busca sin distinguir
  mayúsculas, tildes ni espacios y, **si no existe, se crea** con el nombre del CSV (el resultado de la carga lista las nuevas para
  detectar errores de escritura). Las cédulas que no estén en `Employee` se registran como empleados nuevos.
- **Cupos**: `gerencia;cantidad` (las gerencias nuevas también se crean aquí).

Ejemplos con datos ficticios en `docs/ejemplos/`.

## Datos propios y datos de la intranet

| Tabla del módulo | Origen |
|---|---|
| `Sede` | Copia de `intranet_api_auth_manager."Locations"` (`npm run sync:sedes`). `active = false` oculta una sede al crear sorteos nuevos sin perder el historial. |
| `Employee` | Copia de `intranet_employees_db."Employee"` (`npm run sync:employees`) + cédulas nuevas que lleguen en los CSV. Se actualiza a mano cuando haga falta. |
| `User_branch_permission` | Propia: `user_id` (= `Users.id` de la intranet), `user_email` (informativo) e `id_sede`. |
| `Department` | Propia. Se llena sola con las gerencias que vengan en los CSV (no se copia de `Area`: sus nombres no coinciden con los del CSV de RRHH) y se borra al finalizar un sorteo si ningún otro sorteo la usa. |

## Puesta en marcha local

Requisitos: Node 22 y un PostgreSQL con la base `intranet` (con los esquemas `intranet_api_auth_manager` e `intranet_employees_db` si se usarán los `sync`).

```bash
# Backend
cd backend
cp .env.example .env          # ajustar DATABASE_URL, SERVICES_SECRET_KEY (de PRUEBA), DEV_USER_ID y DEV_USER_EMAIL
npm install
npm run migrate:deploy        # crea el esquema "sorteos" y sus tablas (versionadas en prisma/migrations)
npm run sync:sedes            # copia las sedes desde Locations
npm run sync:employees        # (opcional) copia los empleados
npm run seed:dev              # SOLO pruebas: permisos del usuario de desarrollo en todas las sedes activas
npm run dev                   # http://localhost:3000

# Frontend (otra terminal)
cd frontend
cp .env.example .env.local    # pegar DEV_AUTH_TOKEN, que se genera con: (cd ../backend && npm run dev:token)
npm install
npm run dev                   # http://localhost:5173
```

> El backend **siempre** exige `x-auth-token`. En local, Vite lo agrega al reenviar `/apiv1/lottery-service` (imita al gateway
> de la intranet). El token de prueba dura 8 h; si vence aparece «Sin sesión»: genere otro con `npm run dev:token`.

Para cambios de esquema: editar `prisma/schema.prisma` y `npm run migrate:dev` (genera la migración). En producción solo `migrate:deploy`.
No se usa `db push`.

## Pruebas

```bash
cd backend
npm test                      # unitarias (sin base de datos); en frontend/ también hay `npm test` (exportación del CSV)

# Integración: usan esquemas DESCARTABLES (sorteos_test, sorteos_test_auth, sorteos_test_employees) y los limpian solos.
# Nunca tocan sorteos ni los esquemas reales de la intranet; por eso exigen ?schema=sorteos_test
DATABASE_URL="postgresql://usuario:clave@localhost:5432/intranet?schema=sorteos_test" npm run test:integration
```

Cubren: autenticación (token ausente/falso/vencido/`alg:none`), permisos por sede, sedes inactivas, flujo completo del sorteo
(asistencia, `participa = NO`, cupos, gerencias nuevas desde el CSV, nadie gana dos veces), **ejecuciones simultáneas**, cargas simultáneas con una misma gerencia nueva y las sincronizaciones desde la intranet, y **finalizar sorteo** (borra todo lo del sorteo, conserva lo compartido con otro sorteo,
revierte si algo falla a mitad y convive con un sorteo en curso).

## Guía de prueba manual

1. Abrir http://localhost:5173 → **Registrar sorteo**. Elegir fecha, nombre y 2 o más sedes → *Crear sorteo*.
2. Subir `docs/ejemplos/cupos_ejemplo.csv` (16 cupos, suman 26; en una base vacía avisa «16 gerencia(s) nueva(s) creada(s)»)
   y `docs/ejemplos/participantes_ejemplo.csv` (61 participantes, 0 errores; 6 con `NO`; ya no hay gerencias nuevas).
   Probar también un CSV con una gerencia inventada: se crea, el aviso la lista, y como no tiene cupo sus participantes no ganan;
   una fila sin gerencia aparece en «filas con error» sin impedir cargar el resto.
3. **Listar asistencia:** elegir el sorteo (aparecen los 55 con `participa = SI`), buscar por nombre, marcar varios checks.
   Recargar la página y volver a abrir el sorteo: las marcas deben seguir ahí. Probar «Marcar a todos como asistentes»: «Cancelar» no
   cambia nada; confirmar marca a los pendientes y el botón queda deshabilitado.
4. **Ejecutar sorteo:** elegir el sorteo y pulsar «Sortear ganador #1». Tras el contador aparece el ganador y
   se agrega a la lista con su número de orden. Repetir hasta que el botón se deshabilite y aparezca
   «Ya no quedan participantes elegibles» (con todos asistiendo salen 26 ganadores). Nadie se repite y ninguna gerencia supera su cupo.
   Probar «Pantalla completa»: todos los ganadores deben verse a la vez, sin bajar con el mouse (Esc para salir).
5. **Finalizar sorteo:** pulsar «Finalizar sorteo», «Descargar ganadores (CSV)», escribir el nombre del sorteo y confirmar. Tras la
   animación el sorteo ya no aparece en ningún selector, y en la base no queda ninguna fila suya.

Para repetir el sorteo desde cero:

```sql
DELETE FROM sorteos."Winner" WHERE id_participant IN (SELECT id_participant FROM sorteos."Participant" WHERE id_sorteos = <ID>);
```
