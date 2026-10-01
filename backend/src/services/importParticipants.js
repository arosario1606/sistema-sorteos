import prisma from '../config/prisma.js';
import { readCsvRows } from '../utils/csv.js';
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

export async function importParticipants({ buffer, idSorteos, userCode }) {
  const rows = await readCsvRows(buffer);
  if (rows.length === 0) return { total: 0, created: 0, updated: 0, employeesCreated: 0, errors: [] };

  const { order, dataRows } = resolveColumns(rows);
  const departments = await prisma.department.findMany();
  const deptByKey = new Map(departments.map((d) => [normalizeKey(d.name), d.idDepartment]));

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
    const idDepartment = deptByKey.get(normalizeKey(rec.gerencia));

    if (!cedula) errors.push({ line, reason: 'Cédula vacía' });
    else if (seen.has(cedula)) errors.push({ line, cedula, reason: 'Cédula repetida en el archivo' });
    else if (!normalizeText(rec.nombres) || !normalizeText(rec.apellidos)) errors.push({ line, cedula, reason: 'Falta nombres o apellidos' });
    else if (idDepartment === undefined) errors.push({ line, cedula, reason: `Gerencia no existe: "${rec.gerencia}"` });
    else if (participa === null) errors.push({ line, cedula, reason: `Valor de participa inválido: "${rec.participa}" (use SI/NO)` });
    else {
      seen.add(cedula);
      valid.push({
        cedula,
        names: normalizeText(rec.nombres),
        lastName: normalizeText(rec.apellidos),
        jobTitle: normalizeText(rec.cargo).slice(0, 100),
        idDepartment,
        participate: participa,
      });
    }
  }

  let created = 0;
  let updated = 0;
  let employeesCreated = 0;

  await prisma.$transaction(
    async (tx) => {
      const existingEmployees = await tx.employee.findMany({
        where: { cedula: { in: valid.map((v) => v.cedula) } },
        select: { cedula: true },
      });
      const known = new Set(existingEmployees.map((e) => e.cedula));
      const missing = valid.filter((v) => !known.has(v.cedula));
      if (missing.length) {
        const r = await tx.employee.createMany({
          data: missing.map((v) => ({ cedula: v.cedula, names: v.names, lastName: v.lastName, isActive: 1 })),
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
        const data = { jobTitle: v.jobTitle, idDepartment: v.idDepartment, participate: v.participate };
        if (inSorteo.has(v.cedula)) {
          await tx.participant.update({
            where: { idSorteos_cedula: { idSorteos, cedula: v.cedula } },
            data: { ...data, updatedBy: userCode },
          });
          updated++;
        } else {
          await tx.participant.create({ data: { ...data, idSorteos, cedula: v.cedula, createdBy: userCode } });
          created++;
        }
      }
    },
    { timeout: 60000 },
  );

  return { total: dataRows.length, created, updated, employeesCreated, errors };
}
