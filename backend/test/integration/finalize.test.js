import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, dropIntranetStub, loadIntranetStub, prisma, resetDb, startServer, token } from './helpers.js';

const ADMIN = { id: 10, email: 'admin@example.com' }; // sedes 1 y 2
const OTHER = { id: 11, email: 'otro@example.com' }; // solo la sede 4

let server;
let api;
const tk = () => token(ADMIN);

before(async () => {
  await resetDb();
  await loadIntranetStub();
  let url;
  ({ server, url } = await startServer());
  api = client(url);
  await prisma.userBranchPermission.createMany({
    data: [
      ...[1, 2].map((idSede) => ({ userId: ADMIN.id, idSede, createdBy: 'test' })),
      { userId: OTHER.id, idSede: 4, createdBy: 'test' },
    ],
  });
});

after(async () => {
  server.close();
  await dropIntranetStub();
  await prisma.$disconnect();
});

const newSorteo = async (name, sedeIds = [1], sorteoDate = '2026-12-20') =>
  (await api.post('/sorteos/create', tk(), { name, sorteoDate, sedeIds })).body;

const history = (sorteoName) =>
  prisma.winnerHistory.findMany({ where: { sorteoName }, orderBy: [{ sorteoDate: 'asc' }, { winningOrder: 'asc' }] });

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

  // Los ganadores de A quedaron en el historial (con lo que se borró no hay forma de reconstruirlos); los de B, no.
  const rows = await history('Sorteo A');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.winningOrder), [1, 2, 3], 'conserva el orden en que ganaron');
  assert.equal(new Set(rows.map((r) => r.cedula)).size, 3, 'sin repetidos');
  for (const r of rows) {
    assert.equal(r.sorteoDate.toISOString().slice(0, 10), '2026-12-20', 'fecha del sorteo, no la de creación');
    assert.match(r.cedula, /^[1-4]$/);
    assert.equal(r.fullName, `A${r.cedula} X`, 'nombres y apellidos del ganador (en el CSV el apellido va primero)');
    assert.equal(r.department, r.cedula <= 2 ? 'GERENCIA COMPARTIDA' : 'GERENCIA SOLO A');
  }
  assert.equal((await history('Sorteo B')).length, 0, 'B no está finalizado: sus ganadores siguen solo en Winner');
});

test('el historial es permanente: sobrevive a finalizar otros sorteos y distingue nombres repetidos por fecha', async () => {
  const d1 = await newSorteo('Sorteo Navidad', [1], '2026-12-10');
  const d2 = await newSorteo('Sorteo Navidad', [1], '2026-12-24');
  await load(d1.idSorteos, 'GERENCIA N;1', '31;Uno;Ana;C;GERENCIA N;SI');
  await load(d2.idSorteos, 'GERENCIA N;1', '32;Dos;Beto;C;GERENCIA N;SI');
  for (const s of [d1, d2]) assert.equal((await api.post(`/draw/execute?id=${s.idSorteos}`, tk())).status, 201);

  assert.equal((await api.post('/sorteos/finalize', tk(), { idSorteos: d1.idSorteos })).status, 200);
  assert.equal((await api.post('/sorteos/finalize', tk(), { idSorteos: d2.idSorteos })).status, 200);

  const rows = await history('Sorteo Navidad');
  assert.deepEqual(rows.map((r) => [r.sorteoDate.toISOString().slice(0, 10), r.cedula, r.fullName, r.winningOrder]), [
    ['2026-12-10', '31', 'ANA UNO', 1],
    ['2026-12-24', '32', 'BETO DOS', 1],
  ], 'mismo nombre, se distinguen por la fecha');
  assert.equal((await history('Sorteo A')).length, 3, 'finalizar otros sorteos no toca lo ya guardado');
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
  assert.equal((await history('Vacío')).length, 0, 'sin ganadores no se registra nada');
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
    assert.equal((await history('Rollback')).length, 0, 'tampoco quedó una copia a medias en el historial');
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_department_delete ON "Department"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_department_delete()');
  }
  assert.equal((await api.post('/sorteos/finalize', tk(), { idSorteos: s.idSorteos })).status, 200, 'sin el fallo sí finaliza');
  assert.equal((await history('Rollback')).length, 1, 'y entonces sí se registra el ganador, una sola vez');
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
  const saved = await history('Carrera');
  assert.equal(saved.length, results[2].body.winners, 'el historial tiene exactamente los ganadores que existían al finalizar');
  assert.deepEqual(saved.map((r) => r.winningOrder), saved.map((_, i) => i + 1), 'órdenes consecutivos, sin huecos ni repetidos');
});
