// Datos de PRUEBA locales (no usar en la base real): permisos de un usuario de desarrollo sobre las sedes activas.
// Las gerencias NO se siembran: se crean solas al cargar los CSV de participantes o de cupos.
// Requisito: las vistas de la intranet (docs/integracion/vistas-sorteos.sql); las sedes se leen de Locations.
// En la intranet real estos permisos se asignan desde la pantalla «Permisos por Sedes».
import 'dotenv/config';
import prisma from '../src/config/prisma.js';
import { listSedes } from '../src/services/sedes.js';

const userId = Number(process.env.DEV_USER_ID);
const userEmail = process.env.DEV_USER_EMAIL;
if (!Number.isInteger(userId) || !userEmail) {
  console.error('Defina DEV_USER_ID (Users.id de la intranet) y DEV_USER_EMAIL en backend/.env');
  process.exit(1);
}

try {
  const sedes = (await listSedes()).filter((s) => s.active);
  if (sedes.length === 0) throw new Error('No hay sedes activas: revise las vistas de la intranet (vistas-sorteos.sql)');
  for (const s of sedes) {
    await prisma.userBranchPermission.upsert({
      where: { userId_idSede: { userId, idSede: s.idSede } },
      create: { userId, idSede: s.idSede, createdBy: 'seed' },
      update: {},
    });
  }
  console.log(`Seed de desarrollo listo: permisos sobre ${sedes.length} sedes para ${userEmail}`);
} finally {
  await prisma.$disconnect();
}
