import prisma from '../config/prisma.js';

// Único punto que conoce cómo se identifica al usuario de la intranet.
// TODO: reemplazar por la validación del token real de la intranet.
// Mientras tanto: header `x-user-code` o la variable DEV_USER_CODE.
function getIntranetUserCode(req) {
  return req.header('x-user-code') || process.env.DEV_USER_CODE || null;
}

export async function authenticate(req, res, next) {
  try {
    const userCode = getIntranetUserCode(req);
    if (!userCode) return res.status(401).json({ error: 'Usuario no autenticado' });

    const permissions = await prisma.userBranchPermission.findMany({
      where: { userCode },
      select: { idSede: true },
    });
    req.user = { code: userCode, sedeIds: permissions.map((p) => p.idSede) };
    next();
  } catch (err) {
    next(err);
  }
}
