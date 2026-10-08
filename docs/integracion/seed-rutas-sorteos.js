// COPIAR A: intranet-api-auth/utils/seed-routes/sorteos/seed-rutas-sorteos.js
// Registra en la BD de la intranet las rutas de backend del servicio de sorteos (mismo estilo que los seeds de créditos).
// Ejecutar con la BD de la intranet configurada (SCHEMA_API_AUTH):  node utils/seed-routes/sorteos/seed-rutas-sorteos.js
//
// El gateway autoriza por ruta EXACTA y route_path / route_name son únicos en toda la intranet.
// Si se agrega un endpoint a backend/src/routes/lottery.js, hay que agregarlo aquí y volver a ejecutar.
import { PrismaClient } from '../../../generated/auth/index.js';

const prisma = new PrismaClient();

const parent = { name: 'API Sorteos', path: '/lottery-service' };

const children = [
  { name: 'Sorteos - Usuario y sedes', path: '/api/lottery/me' },
  { name: 'Sorteos - Listar sorteos', path: '/api/lottery/sorteos' },
  { name: 'Sorteos - Crear sorteo', path: '/api/lottery/sorteos/create' },
  { name: 'Sorteos - Detalle de sorteo', path: '/api/lottery/sorteos/detail' },
  { name: 'Sorteos - Finalizar sorteo', path: '/api/lottery/sorteos/finalize' },
  { name: 'Sorteos - Cargar participantes', path: '/api/lottery/participants/upload' },
  { name: 'Sorteos - Cargar cupos', path: '/api/lottery/quotas/upload' },
  { name: 'Sorteos - Listar asistencia', path: '/api/lottery/attendance/list' },
  { name: 'Sorteos - Marcar asistencia', path: '/api/lottery/attendance/mark' },
  { name: 'Sorteos - Marcar asistencia de todos', path: '/api/lottery/attendance/mark-all' },
  { name: 'Sorteos - Ejecutar sorteo', path: '/api/lottery/draw/execute' },
  { name: 'Sorteos - Ver ganadores', path: '/api/lottery/draw/winners' },
];

async function main() {
  const parentRoute = await prisma.routes_backend.upsert({
    where: { route_path: parent.path },
    update: { route_name: parent.name, active: true },
    create: { route_name: parent.name, route_path: parent.path, active: true },
  });
  console.log(`Ruta API padre: ${parentRoute.route_name} (${parentRoute.route_path})`);

  for (const route of children) {
    const child = await prisma.routes_backend_child.upsert({
      where: { route_path: route.path },
      update: { route_name: route.name, active: true, routes_backendId: parentRoute.id },
      create: { route_name: route.name, route_path: route.path, active: true, routes_backendId: parentRoute.id },
    });
    console.log(`   Endpoint registrado: ${child.route_name} (${child.route_path})`);
  }

  console.log('\nListo. Falta asignar estas rutas al/los grupos de permisos desde el panel de administración de la intranet.');
}

main()
  .catch((e) => {
    console.error('Error ejecutando el script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
