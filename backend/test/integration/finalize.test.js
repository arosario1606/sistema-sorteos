import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, prisma, resetDb, startServer, token } from './helpers.js';

const ADMIN = { id: 10, email: 'admin@example.com' }; // sedes 1 y 2
const OTHER = { id: 11, email: 'otro@example.com' }; // solo la sede 4

let server;
let api;
const tk = () => token(ADMIN);

before(async () => {
  await resetDb();
  let url;
  ({ server, url } = await startServer());
  api = client(url);
  await prisma.sede.createMany({ data: [1, 2, 4].map((idSede) => ({ idSede, name: `Sede ${idSede}` })) });
  await prisma.userBranchPermission.createMany({
    data: [
      ...[1, 2].map((idSede) => ({ userId: ADMIN.id, userEmail: ADMIN.email, idSede, createdBy: 'test' })),
      { userId: OTHER.id, userEmail: OTHER.email, idSede: 4, createdBy: 'test' },
    ],
  });
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

const newSorteo = async (name, sedeIds = [1]) =>
  (await api.post('/sorteos/create', tk(), { name, sorteoDate: '2026-12-20', sedeIds })).body;

async function load(id, quotas, participants) {
  if (quotas) await api.upload(`/quotas/upload?id=${id}`, tk(), quotas);
  if (participants) await api.upload(`/participants/upload?id=${id}`, tk(), participants);
  const rows = (await api.get(`/attendance/list?id=${id}`, tk())).body.rows;
  for (const r of rows) await api.post('/attendance/mark', tk(), { idSorteos: id, idParticipant: r.idParticipant, attended: true });
}

const counts = async (idSorteos, groupId) => ({
  sorteo: await prisma.sorteos.count({ where: { idSorteos } }),
  participants: await prisma.participant.count({ where: { idSorteos } }),
  winners: await prisma.winner.count({ where: { participant: { idSorteos } } }),
  group: await prisma.branchGroup.count({ where: { groupId } }),
  groupSedes: await prisma.branchGroupDetail.count({ where: { groupId } }),
  quotas: await prisma.departmentQuota.count({ where: { groupId } }),
});

test('finalizar borra el sorteo y sus datos, conserva lo compartido y no toca otro sorteo', async () => {
  const a = await newSorteo('Sorteo A', [1]);
  const b = await newSorteo('Sorteo B', [2]);
  await load(a.idSorteos, 'GERENCIA COMPARTIDA;2\nGERENCIA SOLO A;1',
    '1;X;A1;C;GERENCIA COMPARTIDA;SI\n2;X;A2;C;GERENCIA COMPARTIDA;SI\n3;X;A3;C;GERENCIA SOLO A;SI\n4;X;A4;C;GERENCIA SOLO A;SI');
  await load(b.idSorteos, 'GERENCIA COMPARTIDA;1', '5;X;B1;C;GERENCIA COMPARTIDA;SI\n6;X;B2;C;GERENCIA COMPARTIDA;SI');
  for (let i = 0; i < 3; i += 1) assert.equal((await api.post(`/draw/execute?id=${a.idSorteos}`, tk())).status, 201);
  assert.equal((await api.post(`/draw/execute?id=${b.idSorteos}`, tk())).status, 201);

  const employeesBefore = await prisma.employee.count();
  const bBefore = await counts(b.idSorteos, b.groupId);
  assert.deepEqual(bBefore, { sorteo: 1, participants: 2, winners: 1, group: 1, groupSedes: 1, quotas: 1 });

  const res = await api.post('/sorteos/finalize', tk(), { idSorteos: a.idSorteos });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { idSorteos: a.idSorteos, participants: 4, winners: 3, departmentsDeleted: 1 });

  assert.deepEqual(await counts(a.idSorteos, a.groupId), { sorteo: 0, participants: 0, winners: 0, group: 0, groupSedes: 0, quotas: 0 });
  assert.deepEqual(await counts(b.idSorteos, b.groupId), bBefore, 'el otro sorteo queda intacto');
  const departments = (await prisma.department.findMany()).map((d) => d.name).sort();
  assert.deepEqual(departments, ['GERENCIA COMPARTIDA'], 'la gerencia compartida se conserva y la exclusiva se borra');
  assert.equal(await prisma.employee.count(), employeesBefore, 'los empleados se conservan');

  assert.deepEqual((await api.get('/sorteos', tk())).body.map((s) => s.idSorteos), [b.idSorteos], 'ya no aparece en los listados');
  assert.equal((await api.get(`/sorteos/detail?id=${a.idSorteos}`, tk())).status, 404);
  assert.equal((await api.post(`/draw/execute?id=${a.idSorteos}`, tk())).status, 404);
  assert.equal((await api.post('/sorteos/finalize', tk(), { idSorteos: a.idSorteos })).status, 404, 'no se puede finalizar dos veces');
});

test('finalizar valida acceso y datos sin borrar nada', async () => {
  const s = await newSorteo('Protegido', [1]);
  await load(s.idSorteos, 'GERENCIA P;1', '7;X;P1;C;GERENCIA P;SI');
  const before = await counts(s.idSorteos, s.groupId);

  assert.equal((await api.post('/sorteos/finalize', token(OTHER), { idSorteos: s.idSorteos })).status, 403);
  assert.equal((await api.post('/sorteos/finalize', undefined, { idSorteos: s.idSorteos })).status, 401);
  assert.equal((await api.post('/sorteos/finalize', tk(), {})).status, 400);
  assert.equal((await api.post('/sorteos/finalize', tk(), { idSorteos: 'abc' })).status, 400);
  assert.equal((await api.post('/sorteos/finalize', tk(), { idSorteos: 999999 })).status, 404);
  assert.deepEqual(await counts(s.idSorteos, s.groupId), before);
});

test('se puede finalizar sin haber sacado ganadores ni cargado datos', async () => {
  const s = await newSorteo('Vacío', [1]);
  const res = await api.post('/sorteos/finalize', tk(), { idSorteos: s.idSorteos });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { idSorteos: s.idSorteos, participants: 0, winners: 0, departmentsDeleted: 0 });
  assert.equal((await counts(s.idSorteos, s.groupId)).group, 0);
});

test('si algo falla a mitad del borrado no se borra nada (transacción)', async () => {
  const s = await newSorteo('Rollback', [1]);
  await load(s.idSorteos, 'GERENCIA R;1', '8;X;R1;C;GERENCIA R;SI\n9;X;R2;C;GERENCIA R;SI');
  assert.equal((await api.post(`/draw/execute?id=${s.idSorteos}`, tk())).status, 201);
  const before = await counts(s.idSorteos, s.groupId);

  // Falla simulada en el ÚLTIMO paso (borrar gerencias), cuando sorteo, participantes y ganadores ya se borraron.
  await prisma.$executeRawUnsafe(
    "CREATE OR REPLACE FUNCTION fail_department_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fallo simulado'; END; $$ LANGUAGE plpgsql",
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER fail_department_delete BEFORE DELETE ON "Department" FOR EACH ROW EXECUTE FUNCTION fail_department_delete()',
  );
  try {
    const res = await api.post('/sorteos/finalize', tk(), { idSorteos: s.idSorteos });
    assert.equal(res.status, 500);
    assert.deepEqual(await counts(s.idSorteos, s.groupId), before, 'todo sigue ahí tras el fallo');
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_department_delete ON "Department"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_department_delete()');
  }
  assert.equal((await api.post('/sorteos/finalize', tk(), { idSorteos: s.idSorteos })).status, 200, 'sin el fallo sí finaliza');
});

test('finalizar mientras se sortea no deja datos a medias', async () => {
  const s = await newSorteo('Carrera', [1]);
  const rows = Array.from({ length: 12 }, (_, i) => `${100 + i};X;N${i};C;GERENCIA CARRERA F;SI`).join('\n');
  await load(s.idSorteos, 'GERENCIA CARRERA F;12', rows);

  const results = await Promise.all([
    api.post(`/draw/execute?id=${s.idSorteos}`, tk()),
    api.post(`/draw/execute?id=${s.idSorteos}`, tk()),
    api.post('/sorteos/finalize', tk(), { idSorteos: s.idSorteos }),
    api.post(`/draw/execute?id=${s.idSorteos}`, tk()),
  ]);
  assert.equal(results[2].status, 200);
  for (const r of [results[0], results[1], results[3]]) assert.ok([201, 404].includes(r.status), `sorteo: ${r.status}`);
  assert.deepEqual(await counts(s.idSorteos, s.groupId), { sorteo: 0, participants: 0, winners: 0, group: 0, groupSedes: 0, quotas: 0 });
  assert.equal(await prisma.department.count({ where: { name: 'GERENCIA CARRERA F' } }), 0);
});
