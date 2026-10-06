// Datos de PRUEBA locales (no usar en la base real): gerencias y permisos de un usuario de desarrollo.
// Requisito: haber corrido antes `npm run sync:sedes` (las sedes vienen de Locations en la intranet).
import 'dotenv/config';
import prisma from '../src/config/prisma.js';

const departments = [
  'LLENAJE Y DESHIDRATADOS',
  'FABRICACION Y ENVASADO DE UHT',
  'GERENCIA DE ASEGURAMIENTO DE LA CALIDAD',
  'PLANIFICACION Y LOGISTICA MP',
  'GERENCIA DE SEGURIDAD',
  'GERENCIA DE TRANSPORTE',
  'GERENCIA DE TALENTO HUMANO',
  'GERENCIA DE ADMINISTRACION Y FINANZAS',
  'SERVICIOS GENERALES',
  'MANTENIMIENTO INDUSTRIAL',
  'GERENCIAS DE PLANTA',
  'GERENCIA DE SERVICIOS AGROPECUARIOS',
  'GERENCIA DE MANTENIMIENTO',
  'SEGURIDAD SALUD LABORAL Y AMBIENTE',
  'GERENCIA DE TECNOLOGIA DE INFORMACION',
  'GERENCIA DE OPERACIONES COMERCIALES',
];

const userId = Number(process.env.DEV_USER_ID);
const userEmail = process.env.DEV_USER_EMAIL;
if (!Number.isInteger(userId) || !userEmail) {
  console.error('Defina DEV_USER_ID (Users.id de la intranet) y DEV_USER_EMAIL en backend/.env');
  process.exit(1);
}

try {
  for (const name of departments) {
    if (!(await prisma.department.findFirst({ where: { name } }))) await prisma.department.create({ data: { name } });
  }

  const sedes = await prisma.sede.findMany({ where: { active: true } });
  if (sedes.length === 0) throw new Error('No hay sedes: ejecute primero `npm run sync:sedes`');
  for (const s of sedes) {
    await prisma.userBranchPermission.upsert({
      where: { userId_idSede: { userId, idSede: s.idSede } },
      create: { userId, userEmail, idSede: s.idSede, createdBy: 'seed' },
      update: { userEmail },
    });
  }
  console.log(`Seed de desarrollo listo: ${departments.length} gerencias y ${sedes.length} sedes para ${userEmail}`);
} finally {
  await prisma.$disconnect();
}
