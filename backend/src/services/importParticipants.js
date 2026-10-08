import prisma from '../config/prisma.js';
import { readCsvRows } from '../utils/csv.js';
import { resolveDepartments } from './departments.js';
import { normalizeCedula, normalizeKey, normalizeText, parseSiNo } from '../utils/normalize.js';

// Orden de columnas cuando el CSV no trae encabezado (según el manual del sistema anterior).
const DEFAULT_ORDER = ['cedula', 'apellidos', 'nombres', 'cargo', 'gerencia', 'participa'];

const HEADER_ALIASES = {
  CEDULA: 'cedula',
  NOMBRES: 'nombres',
  NOMBRE: 'nombres',
  APELLIDOS: 'apellidos',
  APELLIDO: 'apellidos',
  CARGO: 'cargo',
  GERENCIA: 'gerencia',
  PARTICIPA: 'participa',
};

// Si la primera fila es un encabezado reconocible, usa sus columnas; si no, el orden por defecto.
function resolveColumns(rows) {
  const first = rows[0]?.cells.map((c) => HEADER_ALIASES[normalizeKey(c)]);
  const isHeader = first && first.filter(Boolean).length >= 4;
  if (!isHeader) return { order: DEFAULT_ORDER, dataRows: rows };

  const order = [];
  first.forEach((name, i) => {
    if (name) order[i] = name;
  });
  return { order, dataRows: rows.slice(1) };
}

export async function importParticipants({ buffer, idSorteos, actor }) {
  const rows = await readCsvRows(buffer);
  if (rows.length === 0) return { total: 0, created: 0, updated: 0, employeesCreated: 0, departmentsCreated: [], errors: [] };

  const { order, dataRows } = resolveColumns(rows);
  const errors = [];
  const valid = [];
  const seen = new Set();

  for (const { line, cells } of dataRows) {
    const rec = {};
    order.forEach((name, i) => {
      if (name) rec[name] = cells[i] ?? '';
    });

    const cedula = normalizeCedula(rec.cedula);
    const participa = parseSiNo(rec.participa);
    const gerencia = normalizeKey(rec.gerencia);

    if (!cedula) errors.push({ line, reason: 'Cédula vacía' });
    else if (seen.has(cedula)) errors.push({ line, cedula, reason: 'Cédula repetida en el archivo' });
    else if (!normalizeText(rec.nombres) || !normalizeText(rec.apellidos)) errors.push({ line, cedula, reason: 'Falta nombres o apellidos' });
    else if (!gerencia) errors.push({ line, cedula, reason: 'Falta la gerencia' });
    else if (participa === null) errors.push({ line, cedula, reason: `Valor de participa inválido: "${rec.participa}" (use SI/NO)` });
    else {
      seen.add(cedula);
      valid.push({
        cedula,
        names: normalizeText(rec.nombres),
        lastName: normalizeText(rec.apellidos),
        jobTitle: normalizeText(rec.cargo).slice(0, 100),
        gerencia: rec.gerencia,
        participate: participa,
      });
    }
  }

  let created = 0;
  let updated = 0;
  let employeesCreated = 0;
  let departmentsCreated = [];

  await prisma.$transaction(
    async (tx) => {
      // Las gerencias que no existan se crean con el nombre que trae el CSV (se informan en el resultado).
      const resolved = await resolveDepartments(tx, valid.map((v) => v.gerencia));
      departmentsCreated = resolved.created;

      const existingEmployees = await tx.employee.findMany({
        where: { cedula: { in: valid.map((v) => v.cedula) } },
        select: { cedula: true },
      });
      const known = new Set(existingEmployees.map((e) => e.cedula));
      const missing = valid.filter((v) => !known.has(v.cedula));
      if (missing.length) {
        const r = await tx.employee.createMany({
          data: missing.map((v) => ({ cedula: v.cedula, names: v.names, lastName: v.lastName, isActive: true })),
          skipDuplicates: true,
        });
        employeesCreated = r.count;
      }

      const existingParticipants = await tx.participant.findMany({
        where: { idSorteos, cedula: { in: valid.map((v) => v.cedula) } },
        select: { cedula: true },
      });
      const inSorteo = new Set(existingParticipants.map((p) => p.cedula));

      for (const v of valid) {
        const data = { jobTitle: v.jobTitle, idDepartment: resolved.byKey.get(normalizeKey(v.gerencia)), participate: v.participate };
        if (inSorteo.has(v.cedula)) {
          await tx.participant.update({
            where: { idSorteos_cedula: { idSorteos, cedula: v.cedula } },
            data: { ...data, updatedBy: actor },
          });
          updated++;
        } else {
          await tx.participant.create({ data: { ...data, idSorteos, cedula: v.cedula, createdBy: actor } });
          created++;
        }
      }
    },
    { timeout: 60000 },
  );

  return { total: dataRows.length, created, updated, employeesCreated, departmentsCreated, errors };
}
