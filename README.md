# Sistema de Sorteos

Migración del sistema de sorteos de la intranet. Backend: Node + Express + Prisma (MySQL). Frontend: React + Vite.

## Flujo del sistema

1. **Registrar sorteo:** fecha, nombre y sedes que forman el grupo del sorteo (solo sedes con permiso del usuario).
2. Subir el **CSV de participantes** (RRHH) y el **CSV de cupos** por gerencia.
3. **Listar asistencia:** marcar con un check quién asistió (se guarda al instante).
4. **Ejecutar sorteo:** cada pulsación de «Sortear» saca un ganador, hasta que no queden elegibles.

Elegible = `participa = SI` + asistió + no ha ganado + su gerencia aún tiene cupo en el grupo.
Los cupos son por gerencia dentro del grupo (las sedes del grupo comparten gerencias).
Una gerencia sin cupo cargado no tiene ganadores.

## Formato de los CSV

- Separador `;` o `,`; UTF-8 o Latin-1; con o sin encabezado.
- **Participantes** (sin encabezado): `cedula;apellidos;nombres;cargo;gerencia;participa`. `participa` = `SI`/`NO`.
  La cédula se limpia a letras y números (`28624356-1` → `286243561`). La gerencia debe existir en `Department`
  (no distingue mayúsculas ni tildes). Cédulas que no estén en `Employee` se registran (activas).
- **Cupos**: `gerencia;cantidad`.

Ejemplos con datos ficticios en `docs/ejemplos/`.

## Puesta en marcha local

```bash
# Backend
cd backend
cp .env.example .env        # ajustar DATABASE_URL y DEV_USER_CODE
npm install
npx prisma db push          # crea/sincroniza las tablas (ver nota)
npm run seed:dev            # SOLO base de pruebas: sedes, gerencias y permisos del usuario de desarrollo
npm run dev                 # http://localhost:3000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (redirige /api al backend)
```

> **Nota:** el proyecto no tiene migraciones; `prisma db push` sincroniza el schema. En una base que ya tenga
> las tablas solo debe agregar `@unique` en `Employee.cedula` y `@@unique([idSorteos, cedula])` en `Participant`.
> Si hay cédulas repetidas en `Employee`, el comando fallará hasta depurarlas.

## Autenticación (provisional)

El usuario sale de `DEV_USER_CODE` (o del header `x-user-code`) y sus sedes de `User_branch_permission`.
Se reemplazará por el token de la intranet en `backend/src/middleware/auth.js` (+ `frontend/src/api.js`).

## Guía de prueba manual

1. Abrir http://localhost:5173 → **Registrar sorteo**. Elegir fecha, nombre y 2 o más sedes → *Crear sorteo*.
2. Subir `docs/ejemplos/participantes_ejemplo.csv` (resultado esperado: 61 filas, 0 errores; 5 con `NO`)
   y `docs/ejemplos/cupos_ejemplo.csv` (16 cupos). Probar también un CSV con una gerencia inventada: debe
   aparecer en «filas con error» sin impedir cargar el resto.
3. **Listar asistencia:** elegir el sorteo, buscar por nombre, marcar varios checks. Recargar la página y
   volver a abrir el sorteo: las marcas deben seguir ahí. Solo aparecen los de `participa = SI`.
4. **Ejecutar sorteo:** elegir el sorteo y pulsar «Sortear ganador #1». Tras el contador aparece el ganador y
   se agrega a la lista con su número de orden. Repetir hasta que el botón se deshabilite y aparezca
   «Sorteo finalizado». Nadie se repite y ninguna gerencia supera su cupo.

Para repetir el sorteo desde cero:

```sql
DELETE FROM Winner WHERE id_participant IN (SELECT id_participant FROM Participant WHERE id_sorteos = <ID>);
```
