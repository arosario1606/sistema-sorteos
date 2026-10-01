import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';

// Carga el sorteo con sus sedes y valida que el usuario tenga permiso
// sobre al menos una sede del grupo.
export async function getAccessibleSorteo(idSorteos, user) {
  const sorteo = await prisma.sorteos.findUnique({
    where: { idSorteos },
    include: { branchGroup: { include: { details: { include: { sede: true } } } } },
  });
  if (!sorteo) throw new HttpError(404, 'Sorteo no encontrado');

  const allowed = sorteo.branchGroup.details.some((d) => user.sedeIds.includes(d.idSede));
  if (!allowed) throw new HttpError(403, 'No tienes permiso sobre las sedes de este sorteo');
  return sorteo;
}
