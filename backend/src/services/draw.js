import { randomInt } from 'node:crypto';
import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';

// Regla de elegibilidad (aislada para poder ajustarla fácilmente):
// participa = SI, asistió, no ha ganado y su gerencia aún tiene cupo en el grupo.
export function pickEligible(candidates, quotaByDept, winnersByDept) {
  return candidates.filter(
    (p) => (winnersByDept.get(p.idDepartment) ?? 0) < (quotaByDept.get(p.idDepartment) ?? 0),
  );
}

export async function drawNextWinner(idSorteos) {
  return prisma.$transaction(async (tx) => {
    // Bloquea el sorteo para que dos ejecuciones simultáneas no generen el mismo orden.
    const [sorteo] = await tx.$queryRaw`SELECT id_sorteos, group_id FROM Sorteos WHERE id_sorteos = ${idSorteos} FOR UPDATE`;
    if (!sorteo) throw new HttpError(404, 'Sorteo no encontrado');

    const quotas = await tx.departmentQuota.findMany({ where: { groupId: sorteo.group_id } });
    if (quotas.length === 0) {
      throw new HttpError(409, 'El sorteo no tiene cupos por gerencia cargados');
    }
    const quotaByDept = new Map(quotas.map((q) => [q.idDepartment, q.allowedQuantity]));

    const winners = await tx.winner.findMany({
      where: { participant: { idSorteos } },
      include: { participant: { select: { idDepartment: true } } },
    });
    const winnersByDept = new Map();
    for (const w of winners) {
      const d = w.participant.idDepartment;
      winnersByDept.set(d, (winnersByDept.get(d) ?? 0) + 1);
    }

    const candidates = await tx.participant.findMany({
      where: { idSorteos, participate: 1, attended: 1, winner: null },
    });
    const eligible = pickEligible(candidates, quotaByDept, winnersByDept);
    if (eligible.length === 0) return null;

    const chosen = eligible[randomInt(eligible.length)];
    const winner = await tx.winner.create({
      data: { idParticipant: chosen.idParticipant, winningOrder: winners.length + 1 },
    });
    const employee = await tx.employee.findUnique({ where: { cedula: chosen.cedula } });
    const department = await tx.department.findUnique({ where: { idDepartment: chosen.idDepartment } });

    return {
      winningOrder: winner.winningOrder,
      idParticipant: chosen.idParticipant,
      cedula: chosen.cedula,
      names: employee?.names ?? '',
      lastName: employee?.lastName ?? '',
      jobTitle: chosen.jobTitle,
      department: department?.name ?? '',
    };
  });
}

export async function listWinners(idSorteos) {
  const winners = await prisma.winner.findMany({
    where: { participant: { idSorteos } },
    orderBy: { winningOrder: 'asc' },
    include: { participant: { include: { department: true } } },
  });
  const employees = await prisma.employee.findMany({
    where: { cedula: { in: winners.map((w) => w.participant.cedula) } },
  });
  const byCedula = new Map(employees.map((e) => [e.cedula, e]));

  return winners.map((w) => {
    const e = byCedula.get(w.participant.cedula);
    return {
      winningOrder: w.winningOrder,
      cedula: w.participant.cedula,
      names: e?.names ?? '',
      lastName: e?.lastName ?? '',
      jobTitle: w.participant.jobTitle,
      department: w.participant.department.name,
    };
  });
}
