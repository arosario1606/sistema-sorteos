import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';
import { listSedes, withViews } from './sedes.js';

// Administración de permisos por sede (pantalla «Permisos por Sedes»). Los usuarios se leen de la vista v_users
// (solo id, nombre, apellido, correo y estado: nunca la contraseña); los permisos se guardan en User_branch_permission.

export const MIN_QUERY = 2;
export const MAX_RESULTS = 20;
const MAX_SEDES_PER_USER = 500;

// Búsqueda sin acentos ni mayúsculas. El mismo mapa se aplica en SQL (translate) y en JS, y se incluyen las
// mayúsculas acentuadas porque lower() de PostgreSQL no las convierte con algunas configuraciones regionales.
const ACCENTED = 'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ';
const PLAIN = 'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN';
export const fold = (text) =>
  [...String(text ?? '')].map((ch) => PLAIN[ACCENTED.indexOf(ch)] ?? ch).join('').toLowerCase();

const escapeLike = (term) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

// Usuarios ACTIVOS cuyo nombre, apellido o correo contengan todas las palabras buscadas (en cualquier orden).
export async function searchUsers(rawQuery) {
  const terms = fold(rawQuery).split(/\s+/).filter(Boolean);
  if (terms.join(' ').length < MIN_QUERY) {
    throw new HttpError(400, `Escriba al menos ${MIN_QUERY} letras para buscar`);
  }
  if (terms.length > 6 || String(rawQuery).length > 100) throw new HttpError(400, 'La búsqueda es demasiado larga');

  const haystack = Prisma.sql`lower(translate(concat_ws(' ', name, lastname, email), ${ACCENTED}, ${PLAIN}))`;
  const conditions = terms.map((t) => Prisma.sql`${haystack} LIKE ${`%${escapeLike(t)}%`} ESCAPE '\\'`);
  const rows = await withViews(() => prisma.$queryRaw`
    SELECT id, name, lastname, email FROM v_users
    WHERE active AND ${Prisma.join(conditions, ' AND ')}
    ORDER BY name, lastname, id
    LIMIT ${MAX_RESULTS + 1}`);

  return {
    users: rows.slice(0, MAX_RESULTS).map(toUser),
    truncated: rows.length > MAX_RESULTS,
  };
}

const toUser = (r) => ({
  id: r.id,
  fullName: `${r.name ?? ''} ${r.lastname ?? ''}`.trim() || r.email,
  email: r.email,
});

async function findUser(db, userId) {
  const [row] = await withViews(() => db.$queryRaw`SELECT id, name, lastname, email, active FROM v_users WHERE id = ${userId}`);
  if (!row) throw new HttpError(404, 'Usuario no encontrado en la intranet');
  return { ...toUser(row), active: row.active };
}

// Usuario y las sedes que tiene asignadas hoy (ids; pueden incluir sedes ya inactivas, que la pantalla muestra marcadas).
export async function getUserPermissions(userId) {
  const user = await findUser(prisma, userId);
  const rows = await prisma.userBranchPermission.findMany({ where: { userId }, select: { idSede: true }, orderBy: { idSede: 'asc' } });
  return { user, sedeIds: rows.map((r) => r.idSede) };
}

// Reemplaza el conjunto COMPLETO de sedes del usuario. Todo en una transacción y con un candado por usuario:
// dos administradores guardando a la vez no dejan un resultado mezclado (gana el último en confirmar).
export async function saveUserPermissions({ userId, sedeIds, actor }) {
  if (!Array.isArray(sedeIds)) throw new HttpError(400, 'sedeIds debe ser una lista de sedes');
  if (sedeIds.length > MAX_SEDES_PER_USER) throw new HttpError(400, 'Demasiadas sedes');
  const wanted = [...new Set(sedeIds.map(Number))];
  if (wanted.some((id) => !Number.isInteger(id) || id <= 0)) throw new HttpError(400, 'Hay una sede inválida en la lista');

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7311, ${userId}::int)`;
    await findUser(tx, userId);

    const current = new Set((await tx.userBranchPermission.findMany({ where: { userId }, select: { idSede: true } })).map((r) => r.idSede));
    const sedes = new Map((await listSedes(tx)).map((s) => [s.idSede, s]));

    for (const id of wanted) {
      const sede = sedes.get(id);
      if (!sede) throw new HttpError(400, `La sede ${id} no existe en la intranet`);
      // Quitar o conservar una sede inactiva está permitido; asignarla de nuevo no.
      if (!sede.active && !current.has(id)) throw new HttpError(400, `La sede «${sede.name}» está inactiva: no se puede asignar`);
    }

    const toAdd = wanted.filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !wanted.includes(id));
    if (toRemove.length) await tx.userBranchPermission.deleteMany({ where: { userId, idSede: { in: toRemove } } });
    if (toAdd.length) {
      await tx.userBranchPermission.createMany({ data: toAdd.map((idSede) => ({ userId, idSede, createdBy: actor })) });
    }
    return { userId, sedeIds: wanted.sort((a, b) => a - b), added: toAdd.length, removed: toRemove.length };
  });
}
