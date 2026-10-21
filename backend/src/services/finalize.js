import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';
import { lockDepartments } from './departments.js';

// Copia los ganadores del sorteo a Winner_history y devuelve cuántos son. Guarda una foto (nombre, cédula, gerencia,
// orden, nombre y fecha del sorteo) porque el sorteo, sus participantes y sus ganadores se borran justo después.
async function archiveWinners(tx, idSorteos) {
  const { name: sorteoName, sorteoDate } = await tx.sorteos.findUniqueOrThrow({ where: { idSorteos } });
  const winners = await tx.winner.findMany({
    where: { participant: { idSorteos } },
    orderBy: { winningOrder: 'asc' },
    include: { participant: { include: { department: true } } },
  });
  if (winners.length === 0) return 0;

  const employees = await tx.employee.findMany({ where: { cedula: { in: winners.map((w) => w.participant.cedula) } } });
  const byCedula = new Map(employees.map((e) => [e.cedula, e]));
  await tx.winnerHistory.createMany({
    data: winners.map((w) => {
      const e = byCedula.get(w.participant.cedula);
      return {
        sorteoName,
        sorteoDate,
        cedula: w.participant.cedula,
        fullName: `${e?.names ?? ''} ${e?.lastName ?? ''}`.trim(),
        department: w.participant.department.name,
        winningOrder: w.winningOrder,
      };
    }),
  });
  return winners.length;
}

// Finaliza un sorteo: antes de borrar, copia los ganadores a Winner_history (registro permanente) y después borra
// de forma DEFINITIVA el sorteo, sus participantes, ganadores, cupos y grupo de sedes, y las gerencias que ya no use
// ningún sorteo. Todo en una transacción: si algo falla, no se copia ni se borra nada.
// Los empleados (tabla Employee) no se tocan.
export async function finalizeSorteo(idSorteos) {
  return prisma.$transaction(
    async (tx) => {
      // Mismo orden de bloqueos que la carga de CSV: candado de gerencias y después el sorteo.
      await lockDepartments(tx);
      // Bloquea el sorteo: una ejecución en curso termina antes de borrar y las siguientes reciben 404.
      const [sorteo] = await tx.$queryRaw`SELECT id_sorteos, group_id FROM "Sorteos" WHERE id_sorteos = ${idSorteos} FOR UPDATE`;
      if (!sorteo) throw new HttpError(404, 'Sorteo no encontrado');

      const participants = await tx.participant.count({ where: { idSorteos } });
      const winners = await archiveWinners(tx, idSorteos);

      // Borrar el sorteo elimina en cascada participantes y ganadores.
      await tx.sorteos.delete({ where: { idSorteos } });

      // El grupo (sedes y cupos) solo se borra si ningún otro sorteo lo usa.
      const groupId = sorteo.group_id;
      if ((await tx.sorteos.count({ where: { groupId } })) === 0) {
        await tx.branchGroup.delete({ where: { groupId } });
      }

      // Gerencias sin participantes ni cupos en ningún sorteo. Si otro sorteo usa la misma gerencia, se conserva.
      const { count: departmentsDeleted } = await tx.department.deleteMany({
        where: { quotas: { none: {} }, participants: { none: {} } },
      });

      return { idSorteos, participants, winners, departmentsDeleted };
    },
    { timeout: 60000 },
  );
}
