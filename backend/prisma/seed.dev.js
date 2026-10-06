// Datos de PRUEBA locales (no usar en la base real): permisos de un usuario de desarrollo sobre las sedes activas.
// Las gerencias NO se siembran: se crean solas al cargar los CSV de participantes o de cupos.
// Requisito: haber corrido antes `npm run sync:sedes` (las sedes vienen de Locations en la intranet).
import 'dotenv/config';
import prisma from '../src/config/prisma.js';

const userId = Number(process.env.DEV_USER_ID);
const userEmail = process.env.DEV_USER_EMAIL;
if (!Number.isInteger(userId) || !userEmail) {
  console.error('Defina DEV_USER_ID (Users.id de la intranet) y DEV_USER_EMAIL en backend/.env');
  process.exit(1);
}

try {
  const sedes = await prisma.sede.findMany({ where: { active: true } });
  if (sedes.length === 0) throw new Error('No hay sedes: ejecute primero `npm run sync:sedes`');
  for (const s of sedes) {
    await prisma.userBranchPermission.upsert({
      where: { userId_idSede: { userId, idSede: s.idSede } },
      create: { userId, userEmail, idSede: s.idSede, createdBy: 'seed' },
      update: { userEmail },
    });
  }
  console.log(`Seed de desarrollo listo: permisos sobre ${sedes.length} sedes para ${userEmail}`);
} finally {
  await prisma.$disconnect();
}
