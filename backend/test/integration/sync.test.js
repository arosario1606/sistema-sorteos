import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { AUTH_SCHEMA, EMPLOYEES_SCHEMA, dropIntranetStub, loadIntranetStub, prisma, resetDb } from './helpers.js';

// La fixture usa esquemas de prueba propios; sync.js los toma de estas variables. NUNCA los esquemas reales:
// la fixture hace DROP TABLE y destruiría las tablas de la intranet.
process.env.INTRANET_AUTH_SCHEMA = AUTH_SCHEMA;
process.env.INTRANET_EMPLOYEES_SCHEMA = EMPLOYEES_SCHEMA;

const sync = (job) =>
  execFileSync('node', ['prisma/sync.js', job], { env: process.env, encoding: 'utf8' });

before(async () => {
  await resetDb();
  await loadIntranetStub({ views: false }); // aquí solo se prueba la copia de empleados
});

after(async () => {
  await dropIntranetStub();
  await prisma.$disconnect();
});

test('las sedes ya no se sincronizan: no existe sync:sedes', () => {
  assert.throws(() => sync('sedes'), /Uso: node prisma\/sync.js <employees>/);
});

test('sync:employees normaliza cédulas y nombres, conserva ambas variantes y no pisa los nuevos', async () => {
  await prisma.employee.create({ data: { cedula: '99999999', names: 'DESCONOCIDO', lastName: 'DEL CSV' } });
  sync('employees');
  const byCedula = Object.fromEntries((await prisma.employee.findMany()).map((e) => [e.cedula, e]));

  assert.equal(byCedula['12345678'].names, 'JUAN CARLOS');
  assert.equal(byCedula['12345678'].lastName, 'PÉREZ GÓMEZ');
  assert.ok(byCedula['V2222222'], 'V-2222222 -> V2222222');
  assert.ok(byCedula['28624356'] && byCedula['286243561'], 'las dos variantes de la cédula duplicada siguen existiendo');
  assert.equal(byCedula['33333333'].isActive, false);
  assert.ok(byCedula['99999999'], 'no borra cédulas que vinieron de un CSV');
  assert.equal(byCedula['12345678'].email, null, 'no copia el correo');
  assert.equal(await prisma.employee.count(), 6);

  sync('employees');
  assert.equal(await prisma.employee.count(), 6, 'repetible sin duplicar');
});
