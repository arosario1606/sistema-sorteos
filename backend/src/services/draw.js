import { randomInt } from 'node:crypto';
import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';

// Regla de elegibilidad (aislada para poder ajustarla fácilmente):
// participa = SI, asistió, no ha ganado y su gerencia aún tiene cupo en el grupo.
// Una gerencia sin cupo cargado tiene cupo 0 y no puede ganar.
export function pickEligible(candidates, quotaByDept, winnersByDept) {
  return candidates.filter(
    (p) => (winnersByDept.get(p.idDepartment) ?? 0) < (quotaByDept.get(p.idDepartment) ?? 0),
  );
}

// Estado actual del sorteo: ganadores existentes y participantes aún elegibles.
async function loadState(db, idSorteos, groupId) {
  const quotas = await db.departmentQuota.findMany({ where: { groupId } });
  const quotaByDept = new Map(quotas.map((q) => [q.idDepartment, q.allowedQuantity]));

  const winners = await db.winner.findMany({
    where: { participant: { idSorteos } },
    include: { participant: { select: { idDepartment: true } } },
  });
  const winnersByDept = new Map();
  for (const w of winners) {
    const d = w.participant.idDepartment;
    winnersByDept.set(d, (winnersByDept.get(d) ?? 0) + 1);
  }

  const candidates = await db.participant.findMany({
    where: { idSorteos, participate: 1, attended: 1, winner: null },
  });
  return {
    hasQuotas: quotas.length > 0,
    winnersCount: winners.length,
    candidates,
    quotaByDept,
    winnersByDept,
    eligible: pickEligible(candidates, quotaByDept, winnersByDept),
  };
}

export async function drawNextWinner(idSorteos) {
  return prisma.$transaction(async (tx) => {
    // Bloquea el sorteo para que dos ejecuciones simultáneas no generen el mismo orden.
    const [sorteo] = await tx.$queryRaw`SELECT id_sorteos, group_id FROM Sorteos WHERE id_sorteos = ${idSorteos} FOR UPDATE`;
    if (!sorteo) throw new HttpError(404, 'Sorteo no encontrado');

    const state = await loadState(tx, idSorteos, sorteo.group_id);
    if (!state.hasQuotas) throw new HttpError(409, 'El sorteo no tiene cupos por gerencia cargados');
    if (state.eligible.length === 0) return null;

    const chosen = state.eligible[randomInt(state.eligible.length)];
    const winner = await tx.winner.create({
      data: { idParticipant: chosen.idParticipant, winningOrder: state.winnersCount + 1 },
    });

    // Cuántos quedan elegibles después de este ganador (para saber si el sorteo terminó).
    const winnersByDept = new Map(state.winnersByDept);
    winnersByDept.set(chosen.idDepartment, (winnersByDept.get(chosen.idDepartment) ?? 0) + 1);
    const remaining = pickEligible(
      state.candidates.filter((c) => c.idParticipant !== chosen.idParticipant),
      state.quotaByDept,
      winnersByDept,
    ).length;

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
      remaining,
    };
  });
}

// Ganadores en orden y cuántos participantes siguen elegibles.
export async function getDrawStatus(idSorteos, groupId) {
  const winners = await prisma.winner.findMany({
    where: { participant: { idSorteos } },
    orderBy: { winningOrder: 'asc' },
    include: { participant: { include: { department: true } } },
  });
  const employees = await prisma.employee.findMany({
    where: { cedula: { in: winners.map((w) => w.participant.cedula) } },
  });
  const byCedula = new Map(employees.map((e) => [e.cedula, e]));
  const state = await loadState(prisma, idSorteos, groupId);

  return {
    remaining: state.eligible.length,
    hasQuotas: state.hasQuotas,
    winners: winners.map((w) => {
      const e = byCedula.get(w.participant.cedula);
      return {
        winningOrder: w.winningOrder,
        cedula: w.participant.cedula,
        names: e?.names ?? '',
        lastName: e?.lastName ?? '',
        jobTitle: w.participant.jobTitle,
        department: w.participant.department.name,
      };
    }),
  };
}
