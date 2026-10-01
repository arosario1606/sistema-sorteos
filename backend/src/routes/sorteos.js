import { Router } from 'express';
import multer from 'multer';
import prisma from '../config/prisma.js';
import { asyncHandler, HttpError, parseId } from '../utils/http.js';
import { getAccessibleSorteo } from '../services/sorteoAccess.js';
import { importParticipants } from '../services/importParticipants.js';
import { importQuotas } from '../services/importQuotas.js';
import { drawNextWinner, getDrawStatus } from '../services/draw.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function requireFile(req) {
  if (!req.file) throw new HttpError(400, 'Debe adjuntar un archivo CSV en el campo "archivo"');
  return req.file.buffer;
}

// Sorteos visibles para el usuario (grupo con al menos una sede permitida)
router.get('/', asyncHandler(async (req, res) => {
  const sorteos = await prisma.sorteos.findMany({
    where: { branchGroup: { details: { some: { idSede: { in: req.user.sedeIds } } } } },
    orderBy: [{ sorteoDate: 'desc' }, { idSorteos: 'desc' }],
    include: { branchGroup: { include: { details: { include: { sede: true } } } } },
  });
  res.json(sorteos.map((s) => ({
    idSorteos: s.idSorteos,
    name: s.name,
    sorteoDate: s.sorteoDate,
    groupId: s.groupId,
    sedes: s.branchGroup.details.map((d) => d.sede),
  })));
}));

// Registrar sorteo + agrupar sedes
router.post('/', asyncHandler(async (req, res) => {
  const { name, sorteoDate, sedeIds } = req.body ?? {};
  const date = new Date(`${sorteoDate}T00:00:00.000Z`);
  if (!name?.trim()) throw new HttpError(400, 'El nombre del sorteo es obligatorio');
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Fecha inválida (use AAAA-MM-DD)');
  if (!Array.isArray(sedeIds) || sedeIds.length === 0) throw new HttpError(400, 'Seleccione al menos una sede');

  const ids = [...new Set(sedeIds.map(Number))];
  if (ids.some((id) => !req.user.sedeIds.includes(id))) {
    throw new HttpError(403, 'No tienes permiso sobre alguna de las sedes seleccionadas');
  }

  const sorteo = await prisma.$transaction(async (tx) => {
    const group = await tx.branchGroup.create({
      data: {
        name: name.trim(),
        createdBy: req.user.code,
        details: { create: ids.map((idSede) => ({ idSede })) },
      },
    });
    return tx.sorteos.create({
      data: { name: name.trim(), sorteoDate: date, groupId: group.groupId, createdBy: req.user.code },
    });
  });
  res.status(201).json(sorteo);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.params.id), req.user);
  const [quotas, participants, attended, winners] = await Promise.all([
    prisma.departmentQuota.findMany({
      where: { groupId: sorteo.groupId },
      include: { department: true },
      orderBy: { department: { name: 'asc' } },
    }),
    prisma.participant.count({ where: { idSorteos: sorteo.idSorteos } }),
    prisma.participant.count({ where: { idSorteos: sorteo.idSorteos, attended: 1 } }),
    prisma.winner.count({ where: { participant: { idSorteos: sorteo.idSorteos } } }),
  ]);
  res.json({
    idSorteos: sorteo.idSorteos,
    name: sorteo.name,
    sorteoDate: sorteo.sorteoDate,
    groupId: sorteo.groupId,
    sedes: sorteo.branchGroup.details.map((d) => d.sede),
    quotas: quotas.map((q) => ({ idDepartment: q.idDepartment, department: q.department.name, allowedQuantity: q.allowedQuantity })),
    counts: { participants, attended, winners },
  });
}));

// Carga del CSV de RRHH
router.post('/:id/participantes', upload.single('archivo'), asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.params.id), req.user);
  const result = await importParticipants({
    buffer: requireFile(req),
    idSorteos: sorteo.idSorteos,
    userCode: req.user.code,
  });
  res.json(result);
}));

// Carga del CSV de cupos por gerencia
router.post('/:id/cupos', upload.single('archivo'), asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.params.id), req.user);
  const result = await importQuotas({
    buffer: requireFile(req),
    groupId: sorteo.groupId,
    userCode: req.user.code,
  });
  res.json(result);
}));

// Listado de asistencia
router.get('/:id/asistencia', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.params.id), req.user);
  const participants = await prisma.participant.findMany({
    where: { idSorteos: sorteo.idSorteos, participate: 1 },
    include: { department: true },
    orderBy: { idParticipant: 'asc' },
  });
  const employees = await prisma.employee.findMany({
    where: { cedula: { in: participants.map((p) => p.cedula) } },
  });
  const byCedula = new Map(employees.map((e) => [e.cedula, e]));

  const search = String(req.query.search ?? '').trim().toLowerCase();
  const rows = participants
    .map((p) => {
      const e = byCedula.get(p.cedula);
      return {
        idParticipant: p.idParticipant,
        cedula: p.cedula,
        fullName: `${e?.names ?? ''} ${e?.lastName ?? ''}`.trim(),
        jobTitle: p.jobTitle,
        department: p.department.name,
        attended: p.attended === 1,
      };
    })
    .filter((r) => !search || `${r.fullName} ${r.cedula} ${r.jobTitle} ${r.department}`.toLowerCase().includes(search));

  res.json({ sorteo: sorteo.name, attendedCount: rows.filter((r) => r.attended).length, rows });
}));

router.patch('/:id/asistencia/:idParticipant', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.params.id), req.user);
  const idParticipant = parseId(req.params.idParticipant, 'idParticipant');
  if (typeof req.body?.attended !== 'boolean') throw new HttpError(400, '"attended" debe ser true o false');

  const participant = await prisma.participant.findFirst({ where: { idParticipant, idSorteos: sorteo.idSorteos } });
  if (!participant) throw new HttpError(404, 'Participante no encontrado en este sorteo');
  const hasWon = await prisma.winner.findUnique({ where: { idParticipant } });
  if (hasWon && !req.body.attended) throw new HttpError(409, 'No se puede quitar la asistencia a un ganador');

  await prisma.participant.update({
    where: { idParticipant },
    data: { attended: req.body.attended ? 1 : 0, updatedBy: req.user.code },
  });
  res.json({ idParticipant, attended: req.body.attended });
}));

// Ejecutar sorteo: saca un ganador
router.post('/:id/ejecutar', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.params.id), req.user);
  const winner = await drawNextWinner(sorteo.idSorteos);
  if (!winner) {
    return res.status(409).json({ error: 'No quedan participantes elegibles (asistentes con cupo disponible en su gerencia)', finished: true });
  }
  res.status(201).json(winner);
}));

router.get('/:id/ganadores', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.params.id), req.user);
  res.json(await getDrawStatus(sorteo.idSorteos, sorteo.groupId));
}));

export default router;
