import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';

// Las sedes y los usuarios NO se copian: se leen en vivo de las vistas v_sede y v_users, que crea el administrador
// (docs/integracion/vistas-sorteos.sql). Los nombres sin esquema funcionan porque DATABASE_URL fija ?schema=sorteos.

const VIEWS_MISSING =
  'Falta configurar el módulo: las vistas v_sede y v_users no existen. Pida al administrador de la base de datos '
  + 'que ejecute docs/integracion/vistas-sorteos.sql';

// "relation does not exist" (42P01) sobre una de las vistas -> mensaje claro en vez de «Error interno».
export function asViewError(err) {
  const code = err?.meta?.code ?? err?.code;
  if (code === '42P01' || /relation "v_(sede|users)" does not exist/.test(String(err?.message))) {
    console.error('Vista de la intranet ausente:', err?.meta?.message ?? err?.message);
    return new HttpError(503, VIEWS_MISSING);
  }
  return err;
}

export async function withViews(fn) {
  try {
    return await fn();
  } catch (err) {
    throw asViewError(err);
  }
}

// Todas las sedes de la intranet. `active` = activa en la intranet Y no desactivada en este módulo (Sede.active);
// una sede sin fila en Sede cuenta como activa.
export function listSedes(db = prisma) {
  return withViews(() => db.$queryRaw`
    SELECT v.id AS "idSede", v.name, (v.is_active AND COALESCE(s.active, true)) AS active
    FROM v_sede v
    LEFT JOIN "Sede" s ON s.id_sede = v.id
    ORDER BY v.name, v.id`);
}

// De las sedes dadas, cuáles se pueden ofrecer hoy (para crear sorteos o asignar permisos nuevos).
export async function activeSedeIds(ids) {
  const wanted = new Set(ids);
  return new Set((await listSedes()).filter((s) => s.active && wanted.has(s.idSede)).map((s) => s.idSede));
}

// Devuelve una función id -> nombre. Una sede que ya no existe en la intranet conserva el id y se marca como eliminada.
export async function sedeNames() {
  const byId = new Map((await listSedes()).map((s) => [s.idSede, s.name]));
  return (id) => byId.get(id) ?? `Sede ${id} (eliminada)`;
}

// [{ idSede, name }] para los detalles de un grupo de sedes.
export async function describeSedes(details) {
  const nameOf = await sedeNames();
  return details.map((d) => ({ idSede: d.idSede, name: nameOf(d.idSede) }));
}
