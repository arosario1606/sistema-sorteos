import prisma from '../config/prisma.js';
import { readCsvRows } from '../utils/csv.js';
import { normalizeKey } from '../utils/normalize.js';

// Formato esperado: gerencia, cantidad (con o sin encabezado).
export async function importQuotas({ buffer, groupId, userCode }) {
  const rows = await readCsvRows(buffer);
  const dataRows = rows.length && !/^\d+$/.test(rows[0].cells[1] ?? '') ? rows.slice(1) : rows;

  const departments = await prisma.department.findMany();
  const deptByKey = new Map(departments.map((d) => [normalizeKey(d.name), d.idDepartment]));

  const errors = [];
  const quotas = new Map();

  for (const { line, cells } of dataRows) {
    const idDepartment = deptByKey.get(normalizeKey(cells[0]));
    const qty = Number(cells[1]);
    if (idDepartment === undefined) errors.push({ line, reason: `Gerencia no existe: "${cells[0]}"` });
    else if (!/^\d+$/.test(cells[1] ?? '') || qty < 0) errors.push({ line, reason: `Cantidad inválida: "${cells[1]}"` });
    else if (quotas.has(idDepartment)) errors.push({ line, reason: `Gerencia repetida: "${cells[0]}"` });
    else quotas.set(idDepartment, qty);
  }

  await prisma.$transaction(async (tx) => {
    for (const [idDepartment, allowedQuantity] of quotas) {
      await tx.departmentQuota.upsert({
        where: { groupId_idDepartment: { groupId, idDepartment } },
        create: { groupId, idDepartment, allowedQuantity, createdBy: userCode },
        update: { allowedQuantity, updatedBy: userCode },
      });
    }
  });

  return { total: dataRows.length, saved: quotas.size, errors };
}
