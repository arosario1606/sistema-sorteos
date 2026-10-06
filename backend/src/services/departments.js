import { normalizeKey, normalizeText } from '../utils/normalize.js';

// Department.name no es único: dos cargas simultáneas con la misma gerencia nueva la duplicarían.
// Este candado serializa la creación (se libera solo al terminar la transacción).
const DEPARTMENT_LOCK = 7001;

// Busca las gerencias por nombre (sin distinguir mayúsculas, tildes ni espacios) y crea las que falten.
// Debe llamarse DENTRO de una transacción. Devuelve el id por clave normalizada y los nombres creados.
export async function resolveDepartments(tx, names) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEPARTMENT_LOCK})`;

  const existing = await tx.department.findMany();
  const byKey = new Map(existing.map((d) => [normalizeKey(d.name), d.idDepartment]));
  const created = [];

  for (const raw of names) {
    const key = normalizeKey(raw);
    if (!key || byKey.has(key)) continue;
    const name = normalizeText(raw).slice(0, 100);
    const department = await tx.department.create({ data: { name } });
    byKey.set(key, department.idDepartment);
    created.push(name);
  }
  return { byKey, created };
}
