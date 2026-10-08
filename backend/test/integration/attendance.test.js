import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, prisma, resetDb, startServer, token } from './helpers.js';

const ADMIN = { id: 10, email: 'admin@example.com' };
const OTHER = { id: 11, email: 'otro@example.com' };

let server;
let api;
const tk = () => token(ADMIN);

before(async () => {
  await resetDb();
  let url;
  ({ server, url } = await startServer());
  api = client(url);
  await prisma.sede.createMany({ data: [1, 4].map((idSede) => ({ idSede, name: `Sede ${idSede}` })) });
  await prisma.userBranchPermission.createMany({
    data: [
      { userId: ADMIN.id, userEmail: ADMIN.email, idSede: 1, createdBy: 'test' },
      { userId: OTHER.id, userEmail: OTHER.email, idSede: 4, createdBy: 'test' },
    ],
  });
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

const PARTICIPANTS = [
  '1;X;A;C;GERENCIA M;SI', '2;X;B;C;GERENCIA M;SI', '3;X;C;C;GERENCIA M;SI', '4;X;D;C;GERENCIA M;SI',
  '5;X;E;C;GERENCIA M;NO', // participa = NO: nunca debe marcarse
].join('\n');

async function newSorteo(name) {
  const s = (await api.post('/sorteos/create', tk(), { name, sorteoDate: '2026-12-20', sedeIds: [1] })).body;
  await api.upload(`/quotas/upload?id=${s.idSorteos}`, tk(), 'GERENCIA M;5');
  await api.upload(`/participants/upload?id=${s.idSorteos}`, tk(), PARTICIPANTS);
  return s.idSorteos;
}

test('marcar a todos: marca solo a quienes participan, deja intactos a los ya marcados y se puede repetir', async () => {
  const id = await newSorteo('Todos');
  const rows = (await api.get(`/attendance/list?id=${id}`, tk())).body.rows;
  await api.post('/attendance/mark', tk(), { idSorteos: id, idParticipant: rows[0].idParticipant, attended: true });

  const res = await api.post('/attendance/mark-all', tk(), { idSorteos: id });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { marked: 3 }, 'solo los 3 pendientes que participan (el 1 ya estaba marcado)');

  const after = (await api.get(`/attendance/list?id=${id}`, tk())).body;
  assert.equal(after.rows.length, 4);
  assert.ok(after.rows.every((r) => r.attended));
  assert.equal(await prisma.participant.count({ where: { idSorteos: id, participate: false, attended: true } }), 0, 'participa=NO no se marca');
  const updated = await prisma.participant.findMany({ where: { idSorteos: id, attended: true } });
  assert.ok(updated.filter((p) => p.updatedBy === ADMIN.email).length >= 3, 'queda auditado con el correo');

  assert.deepEqual((await api.post('/attendance/mark-all', tk(), { idSorteos: id })).body, { marked: 0 }, 'repetirlo no cambia nada');
});

test('marcar a todos valida acceso y datos sin tocar nada', async () => {
  const id = await newSorteo('Protegido');
  assert.equal((await api.post('/attendance/mark-all', token(OTHER), { idSorteos: id })).status, 403);
  assert.equal((await api.post('/attendance/mark-all', undefined, { idSorteos: id })).status, 401);
  assert.equal((await api.post('/attendance/mark-all', tk(), {})).status, 400);
  assert.equal((await api.post('/attendance/mark-all', tk(), { idSorteos: 'x' })).status, 400);
  assert.equal((await api.post('/attendance/mark-all', tk(), { idSorteos: 999999 })).status, 404);
  assert.equal(await prisma.participant.count({ where: { idSorteos: id, attended: true } }), 0);
});

test('marcar a todos solo afecta al sorteo indicado', async () => {
  const a = await newSorteo('Sorteo A');
  const b = await newSorteo('Sorteo B');
  assert.equal((await api.post('/attendance/mark-all', tk(), { idSorteos: a })).body.marked, 4);
  assert.equal(await prisma.participant.count({ where: { idSorteos: b, attended: true } }), 0);
});
