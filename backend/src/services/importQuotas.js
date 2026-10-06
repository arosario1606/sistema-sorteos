import prisma from '../config/prisma.js';
import { readCsvRows } from '../utils/csv.js';
import { normalizeKey } from '../utils/normalize.js';
import { resolveDepartments } from './departments.js';

// Formato esperado: gerencia, cantidad (con o sin encabezado).
// Las gerencias que no existan se crean con el nombre del CSV (se informan en `departmentsCreated`).
export async function importQuotas({ buffer, groupId, actor }) {
  const rows = await readCsvRows(buffer);
  const dataRows = rows.length && !/^\d+$/.test(rows[0].cells[1] ?? '') ? rows.slice(1) : rows;

  const errors = [];
  const quotas = new Map(); // clave normalizada -> { name, qty }

  for (const { line, cells } of dataRows) {
    const key = normalizeKey(cells[0]);
    const qty = Number(cells[1]);
    if (!key) errors.push({ line, reason: 'Falta la gerencia' });
    else if (!/^\d+$/.test(cells[1] ?? '') || qty < 0) errors.push({ line, reason: `Cantidad inválida: "${cells[1]}"` });
    else if (quotas.has(key)) errors.push({ line, reason: `Gerencia repetida: "${cells[0]}"` });
    else quotas.set(key, { name: cells[0], qty });
  }

  let departmentsCreated = [];
  await prisma.$transaction(async (tx) => {
    const resolved = await resolveDepartments(tx, [...quotas.values()].map((q) => q.name));
    departmentsCreated = resolved.created;

    for (const [key, { qty }] of quotas) {
      const idDepartment = resolved.byKey.get(key);
      await tx.departmentQuota.upsert({
        where: { groupId_idDepartment: { groupId, idDepartment } },
        create: { groupId, idDepartment, allowedQuantity: qty, createdBy: actor },
        update: { allowedQuantity: qty, updatedBy: actor },
      });
    }
  });

  return { total: dataRows.length, saved: quotas.size, departmentsCreated, errors };
}
