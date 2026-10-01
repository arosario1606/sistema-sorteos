// Datos de PRUEBA locales (no usar en la base real): sedes, gerencias y permisos del usuario de desarrollo.
import prisma from '../src/config/prisma.js';

const sedes = ['Grupo San Simon Maracaibo', 'Agropecuaria San Simon La Gloria', 'Agropecuaria San Simon Casigua',
  'Inversiones Lacteas San Simon', 'Inversiones El Palmeral Planta', 'Inversiones El Palmeral Casigua',
  'Grupo San Simon Caracas', 'Frigorifico Industrial Sur del Lago', 'Grupo Sansimon Especial',
  'Asasica Inepal Casigua', 'Asasica Hacienda la Gloria'];
const departments = ['TRIBUTOS', 'TRANSPORTE', 'TRADE_MARKETING', 'TESORERIA', 'TECNOLOGIA_DE_INFORMACION',
  'TALENTO_HUMANO', 'SOPORTE_A_USUARIO', 'SERVICIOS_MEDICOS'];
const user = process.env.DEV_USER_CODE || 'usuario.prueba';

for (const [i, name] of sedes.entries()) {
  await prisma.sede.upsert({ where: { idSede: i + 1 }, create: { idSede: i + 1, name }, update: {} });
  await prisma.userBranchPermission.upsert({
    where: { userCode_idSede: { userCode: user, idSede: i + 1 } },
    create: { userCode: user, idSede: i + 1, createdBy: 'seed' },
    update: {},
  });
}
for (const name of departments) {
  if (!(await prisma.department.findFirst({ where: { name } }))) await prisma.department.create({ data: { name } });
}
console.log('Seed de desarrollo listo para', user);
await prisma.$disconnect();
