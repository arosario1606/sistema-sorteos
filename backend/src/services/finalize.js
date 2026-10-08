import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';
import { lockDepartments } from './departments.js';

// Finaliza un sorteo: borra de forma DEFINITIVA el sorteo, sus participantes, ganadores, cupos y grupo de sedes,
// y las gerencias que ya no use ningún sorteo. Todo en una transacción: si algo falla, no se borra nada.
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
      const winners = await tx.winner.count({ where: { participant: { idSorteos } } });

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
