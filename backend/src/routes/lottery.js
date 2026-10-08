import { Router } from 'express';
import multer from 'multer';
import prisma from '../config/prisma.js';
import { asyncHandler, HttpError, parseId } from '../utils/http.js';
import { getAccessibleSorteo } from '../services/sorteoAccess.js';
import { importParticipants } from '../services/importParticipants.js';
import { importQuotas } from '../services/importQuotas.js';
import { drawNextWinner, getDrawStatus } from '../services/draw.js';
import { finalizeSorteo } from '../services/finalize.js';

// IMPORTANTE: el gateway de la intranet autoriza por ruta EXACTA (Routes_backend_child.route_path),
// así que no se usan parámetros en el path: el id del sorteo viaja en `?id=` o en el body.
// Cada ruta de abajo debe estar registrada en la intranet (ver docs/integracion/seed-rutas-sorteos.js).
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function requireFile(req) {
  if (!req.file) throw new HttpError(400, 'Debe adjuntar un archivo CSV en el campo "archivo"');
  return req.file.buffer;
}

// Usuario autenticado y las sedes sobre las que puede crear sorteos
router.get('/me', asyncHandler(async (req, res) => {
  const sedes = await prisma.sede.findMany({
    where: { idSede: { in: req.user.activeSedeIds }, active: true },
    select: { idSede: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json({ userId: req.user.id, email: req.user.email, sedes });
}));

// Sorteos visibles para el usuario (grupo con al menos una sede permitida)
router.get('/sorteos', asyncHandler(async (req, res) => {
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
    sedes: s.branchGroup.details.map((d) => ({ idSede: d.sede.idSede, name: d.sede.name })),
  })));
}));

// Registrar sorteo + agrupar sedes
router.post('/sorteos/create', asyncHandler(async (req, res) => {
  const { name, sorteoDate, sedeIds } = req.body ?? {};
  const date = new Date(`${sorteoDate}T00:00:00.000Z`);
  if (!name?.trim()) throw new HttpError(400, 'El nombre del sorteo es obligatorio');
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Fecha inválida (use AAAA-MM-DD)');
  if (!Array.isArray(sedeIds) || sedeIds.length === 0) throw new HttpError(400, 'Seleccione al menos una sede');

  const ids = [...new Set(sedeIds.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || !req.user.activeSedeIds.includes(id))) {
    throw new HttpError(403, 'No tienes permiso sobre alguna de las sedes seleccionadas');
  }

  const sorteo = await prisma.$transaction(async (tx) => {
    const group = await tx.branchGroup.create({
      data: {
        name: name.trim(),
        createdBy: req.user.email,
        details: { create: ids.map((idSede) => ({ idSede })) },
      },
    });
    return tx.sorteos.create({
      data: { name: name.trim(), sorteoDate: date, groupId: group.groupId, createdBy: req.user.email },
    });
  });
  res.status(201).json(sorteo);
}));

// Finalizar: borra el sorteo y todos sus datos (irreversible). Lo puede hacer quien tenga acceso al sorteo.
router.post('/sorteos/finalize', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.body?.idSorteos, 'idSorteos'), req.user);
  const result = await finalizeSorteo(sorteo.idSorteos);
  console.log(`Sorteo ${result.idSorteos} finalizado por ${req.user.email}: ${result.participants} participantes y ${result.winners} ganadores borrados`);
  res.json(result);
}));

router.get('/sorteos/detail', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.query.id), req.user);
  const [quotas, participants, attended, winners] = await Promise.all([
    prisma.departmentQuota.findMany({
      where: { groupId: sorteo.groupId },
      include: { department: true },
      orderBy: { department: { name: 'asc' } },
    }),
    prisma.participant.count({ where: { idSorteos: sorteo.idSorteos } }),
    prisma.participant.count({ where: { idSorteos: sorteo.idSorteos, attended: true } }),
    prisma.winner.count({ where: { participant: { idSorteos: sorteo.idSorteos } } }),
  ]);
  res.json({
    idSorteos: sorteo.idSorteos,
    name: sorteo.name,
    sorteoDate: sorteo.sorteoDate,
    groupId: sorteo.groupId,
    sedes: sorteo.branchGroup.details.map((d) => ({ idSede: d.sede.idSede, name: d.sede.name })),
    quotas: quotas.map((q) => ({ idDepartment: q.idDepartment, department: q.department.name, allowedQuantity: q.allowedQuantity })),
    counts: { participants, attended, winners },
  });
}));

// Carga del CSV de RRHH
router.post('/participants/upload', upload.single('archivo'), asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.query.id), req.user);
  res.json(await importParticipants({
    buffer: requireFile(req),
    idSorteos: sorteo.idSorteos,
    actor: req.user.email,
  }));
}));

// Carga del CSV de cupos por gerencia
router.post('/quotas/upload', upload.single('archivo'), asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.query.id), req.user);
  res.json(await importQuotas({
    buffer: requireFile(req),
    groupId: sorteo.groupId,
    actor: req.user.email,
  }));
}));

// Listado de asistencia
router.get('/attendance/list', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.query.id), req.user);
  const participants = await prisma.participant.findMany({
    where: { idSorteos: sorteo.idSorteos, participate: true },
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
        attended: p.attended,
      };
    })
    .filter((r) => !search || `${r.fullName} ${r.cedula} ${r.jobTitle} ${r.department}`.toLowerCase().includes(search));

  res.json({ sorteo: sorteo.name, attendedCount: rows.filter((r) => r.attended).length, rows });
}));

router.post('/attendance/mark', asyncHandler(async (req, res) => {
  const { idSorteos, idParticipant, attended } = req.body ?? {};
  const sorteo = await getAccessibleSorteo(parseId(idSorteos, 'idSorteos'), req.user);
  const participantId = parseId(idParticipant, 'idParticipant');
  if (typeof attended !== 'boolean') throw new HttpError(400, '"attended" debe ser true o false');

  const participant = await prisma.participant.findFirst({ where: { idParticipant: participantId, idSorteos: sorteo.idSorteos } });
  if (!participant) throw new HttpError(404, 'Participante no encontrado en este sorteo');
  const hasWon = await prisma.winner.findUnique({ where: { idParticipant: participantId } });
  if (hasWon && !attended) throw new HttpError(409, 'No se puede quitar la asistencia a un ganador');

  await prisma.participant.update({
    where: { idParticipant: participantId },
    data: { attended, updatedBy: req.user.email },
  });
  res.json({ idParticipant: participantId, attended });
}));

// Marca como asistentes a todos los participantes del sorteo que participan (los que ya lo estaban no cambian).
router.post('/attendance/mark-all', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.body?.idSorteos, 'idSorteos'), req.user);
  const { count } = await prisma.participant.updateMany({
    where: { idSorteos: sorteo.idSorteos, participate: true, attended: false },
    data: { attended: true, updatedBy: req.user.email },
  });
  res.json({ marked: count });
}));

// Ejecutar sorteo: saca un ganador
router.post('/draw/execute', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.query.id), req.user);
  const winner = await drawNextWinner(sorteo.idSorteos);
  if (!winner) {
    return res.status(409).json({ error: 'No quedan participantes elegibles (asistentes con cupo disponible en su gerencia)', finished: true });
  }
  res.status(201).json(winner);
}));

router.get('/draw/winners', asyncHandler(async (req, res) => {
  const sorteo = await getAccessibleSorteo(parseId(req.query.id), req.user);
  res.json(await getDrawStatus(sorteo.idSorteos, sorteo.groupId));
}));

export default router;
