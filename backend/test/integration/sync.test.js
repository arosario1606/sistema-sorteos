import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { prisma, resetDb } from './helpers.js';

// La fixture usa esquemas de prueba propios; sync.js los toma de estas variables. NUNCA los esquemas reales:
// la fixture hace DROP TABLE y destruiría las tablas de la intranet.
const AUTH = 'sorteos_test_auth';
const EMPLOYEES = 'sorteos_test_employees';
process.env.INTRANET_AUTH_SCHEMA = AUTH;
process.env.INTRANET_EMPLOYEES_SCHEMA = EMPLOYEES;
for (const name of [AUTH, EMPLOYEES]) {
  if (!name.startsWith('sorteos_test_')) throw new Error(`Esquema de prueba inválido: ${name}`);
}

const sync = (job) =>
  execFileSync('node', ['prisma/sync.js', job], { env: process.env, encoding: 'utf8' });

before(async () => {
  await resetDb();
  const fixture = (await readFile(new URL('../fixtures/intranet_min.sql', import.meta.url), 'utf8'))
    .replaceAll('{{AUTH_SCHEMA}}', AUTH)
    .replaceAll('{{EMPLOYEES_SCHEMA}}', EMPLOYEES);
  // La fixture se carga fuera del esquema del módulo (con nombres calificados), igual que en la intranet.
  for (const stmt of fixture.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(stmt);
  }
});

after(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${AUTH} CASCADE`);
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${EMPLOYEES} CASCADE`);
  await prisma.$disconnect();
});

test('sync:sedes copia Locations y respeta las sedes desactivadas al repetirse', async () => {
  sync('sedes');
  const sedes = await prisma.sede.findMany({ orderBy: { idSede: 'asc' } });
  assert.deepEqual(sedes.map((s) => [s.idSede, s.name, s.active]), [
    [1, 'Sede Maracaibo', true],
    [2, 'Sede Caracas', true],
    [3, 'Sede Antigua', false],
  ]);

  await prisma.sede.update({ where: { idSede: 2 }, data: { active: false } }); // decisión manual del tutor
  await prisma.$executeRawUnsafe(`UPDATE ${AUTH}."Locations" SET "name" = 'Sede Caracas Centro' WHERE id = 2`);
  sync('sedes');
  const caracas = await prisma.sede.findUniqueOrThrow({ where: { idSede: 2 } });
  assert.equal(caracas.name, 'Sede Caracas Centro', 'actualiza el nombre');
  assert.equal(caracas.active, false, 'no reactiva una sede desactivada a mano');
  assert.equal(await prisma.sede.count(), 3, 'no duplica');
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
