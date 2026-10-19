import prisma from '../config/prisma.js';
import { readCsvRows } from '../utils/csv.js';
import { HttpError } from '../utils/http.js';
import { normalizeKey } from '../utils/normalize.js';
import { resolveDepartments } from './departments.js';

const MAX_QUANTITY = 100000;
const NUMBER_LIKE = /^[-+]?\d+([.,]\d+)?$/;

// Una primera fila con texto en la segunda columna (p. ej. "gerencia;cantidad") es un encabezado. Una fila sin segunda
// columna, o con algo que parece un número mal escrito ("2.5"), NO lo es: se valida como dato para avisar del error.
function isHeader(row) {
  const second = row.cells[1] ?? '';
  return second !== '' && !NUMBER_LIKE.test(second);
}

// Valida las filas del CSV de cupos (formato: gerencia;cantidad, con o sin encabezado).
// Devuelve las filas válidas y, por cada línea con problema, un mensaje que dice QUÉ está mal. Función pura (sin base de datos).
export function parseQuotaRows(rows) {
  const headerAt = rows.findIndex((r) => !r.blank);
  const dataRows = headerAt >= 0 && isHeader(rows[headerAt]) ? rows.filter((_, i) => i !== headerAt) : rows;

  const errors = [];
  const quotas = new Map(); // clave normalizada -> { name, qty, line }
  let total = 0;

  for (const { line, cells, blank } of dataRows) {
    if (blank) {
      errors.push({ line, reason: 'Línea vacía: no tiene gerencia ni cantidad (se ignoró)' });
      continue;
    }
    total += 1;

    const name = cells[0] ?? '';
    const qtyText = cells[1] ?? '';
    const key = normalizeKey(name);

    if (cells.slice(2).some((c) => c !== '')) {
      errors.push({ line, reason: 'Tiene más de dos columnas: use solo "gerencia;cantidad" (si el nombre de la gerencia lleva coma o punto y coma, escríbalo entre comillas)' });
    } else if (!key || (qtyText === '' && /^\d+$/.test(name))) {
      // Sin gerencia: la línea trae solo un número (";3" o "3") o solo texto en la segunda columna.
      errors.push({ line, reason: `Falta la gerencia: esta línea solo trae "${qtyText || name}"` });
    } else if (qtyText === '') {
      errors.push({ line, reason: `Falta la cantidad de ganadores para la gerencia "${name}"` });
    } else if (!/^\d+$/.test(qtyText)) {
      errors.push({ line, reason: `Cantidad inválida "${qtyText}" para la gerencia "${name}": use un número entero, sin decimales ni signo` });
    } else if (Number(qtyText) > MAX_QUANTITY) {
      errors.push({ line, reason: `Cantidad demasiado grande "${qtyText}" para la gerencia "${name}" (máximo ${MAX_QUANTITY})` });
    } else if (quotas.has(key)) {
      errors.push({ line, reason: `Gerencia repetida "${name}": ya aparece en la línea ${quotas.get(key).line}` });
    } else {
      quotas.set(key, { name, qty: Number(qtyText), line });
    }
  }

  return { total, quotas, errors };
}

// Las gerencias que no existan se crean con el nombre del CSV (se informan en `departmentsCreated`).
export async function importQuotas({ buffer, groupId, actor }) {
  const rows = await readCsvRows(buffer, { keepInteriorBlanks: true });
  const { total, quotas, errors } = parseQuotaRows(rows);
  if (total === 0) {
    throw new HttpError(400, 'El archivo de cupos no tiene filas con datos. Cada línea debe tener el formato: gerencia;cantidad');
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

  return { total, saved: quotas.size, departmentsCreated, errors };
}
