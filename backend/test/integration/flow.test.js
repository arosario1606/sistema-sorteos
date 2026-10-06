import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { SECRET, client, prisma, resetDb, startServer, token } from './helpers.js';

const ADMIN = { id: 10, email: 'admin@example.com' }; // sedes 1, 2 y 3 (la 3 está inactiva)
const OTHER = { id: 11, email: 'otro@example.com' }; // solo la sede 4
const NOBODY = { id: 12, email: 'nadie@example.com' }; // sin permisos

let server;
let api;
const tkAdmin = () => token(ADMIN);

before(async () => {
  await resetDb();
  ({ server, url: globalThis.__url } = await startServer());
  api = client(globalThis.__url);

  await prisma.sede.createMany({
    data: [
      { idSede: 1, name: 'Sede 1' },
      { idSede: 2, name: 'Sede 2' },
      { idSede: 3, name: 'Sede 3 (inactiva)', active: false },
      { idSede: 4, name: 'Sede 4' },
    ],
  });
  await prisma.userBranchPermission.createMany({
    data: [
      ...[1, 2, 3].map((idSede) => ({ userId: ADMIN.id, userEmail: ADMIN.email, idSede, createdBy: 'test' })),
      { userId: OTHER.id, userEmail: OTHER.email, idSede: 4, createdBy: 'test' },
    ],
  });
  await prisma.department.createMany({ data: [{ name: 'GERENCIA A' }, { name: 'GERENCIA B' }] });
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('autenticación: rechaza tokens ausentes, falsos, vencidos o sin identidad', async () => {
  assert.equal((await api.get('/me')).status, 401, 'sin token');
  assert.equal((await api.get('/me', 'basura')).status, 401, 'token mal formado');
  assert.equal((await api.get('/me', jwt.sign(ADMIN, 'otro-secreto'))).status, 401, 'firma ajena');
  assert.equal((await api.get('/me', token(ADMIN, { expiresIn: -10 }))).status, 401, 'vencido');
  assert.equal((await api.get('/me', jwt.sign(ADMIN, '', { algorithm: 'none' }))).status, 401, 'alg none');
  assert.equal((await api.get('/me', jwt.sign({ email: 'a@b.c' }, SECRET))).status, 401, 'sin id');
  assert.equal((await api.get('/me', token({ ...ADMIN, active: false }))).status, 403, 'usuario inactivo');
});

test('el header x-user-code de la versión anterior ya no autentica', async () => {
  const res = await fetch(`${globalThis.__url}/api/lottery/me`, { headers: { 'x-user-code': 'admin@example.com' } });
  assert.equal(res.status, 401);
});

test('/me solo ofrece sedes permitidas y activas', async () => {
  const { status, body } = await api.get('/me', tkAdmin());
  assert.equal(status, 200);
  assert.deepEqual(body.sedes.map((s) => s.idSede), [1, 2]);
  assert.equal(body.email, ADMIN.email);
  assert.deepEqual((await api.get('/me', token(NOBODY))).body.sedes, []);
});

test('rutas con id en el path no existen (el gateway autoriza por ruta exacta)', async () => {
  assert.equal((await api.get('/sorteos/1', tkAdmin())).status, 404);
  assert.equal((await api.post('/sorteos/1/ejecutar', tkAdmin())).status, 404);
});

test('crear sorteo: valida permiso, sede activa y datos', async () => {
  const base = { name: 'Sorteo X', sorteoDate: '2026-12-20' };
  assert.equal((await api.post('/sorteos/create', tkAdmin(), { ...base, sedeIds: [3] })).status, 403, 'sede inactiva');
  assert.equal((await api.post('/sorteos/create', tkAdmin(), { ...base, sedeIds: [4] })).status, 403, 'sede sin permiso');
  assert.equal((await api.post('/sorteos/create', tkAdmin(), { ...base, sedeIds: [] })).status, 400);
  assert.equal((await api.post('/sorteos/create', tkAdmin(), { ...base, sorteoDate: 'x', sedeIds: [1] })).status, 400);
  assert.equal((await api.post('/sorteos/create', tkAdmin(), { ...base, name: ' ', sedeIds: [1] })).status, 400);
  const ok = await api.post('/sorteos/create', tkAdmin(), { ...base, sedeIds: [1, 2] });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.createdBy, ADMIN.email, 'se audita con el correo del usuario');
});

test('acceso a sorteos: solo usuarios con permiso sobre alguna sede del grupo', async () => {
  const id = (await prisma.sorteos.findFirstOrThrow()).idSorteos;
  assert.equal((await api.get(`/sorteos/detail?id=${id}`, tkAdmin())).status, 200);
  assert.equal((await api.get(`/sorteos/detail?id=${id}`, token(OTHER))).status, 403);
  assert.equal((await api.get(`/sorteos/detail?id=${id}`, token(NOBODY))).status, 403);
  assert.equal((await api.get('/sorteos/detail?id=abc', tkAdmin())).status, 400);
  assert.equal((await api.get('/sorteos/detail?id=99999', tkAdmin())).status, 404);
  assert.equal((await api.get('/sorteos', token(OTHER))).body.length, 0);
  assert.equal((await api.get('/sorteos', tkAdmin())).body.length, 1);
});

test('desactivar una sede no oculta los sorteos históricos', async () => {
  await prisma.sede.updateMany({ where: { idSede: { in: [1, 2] } }, data: { active: false } });
  try {
    assert.equal((await api.get('/sorteos', tkAdmin())).body.length, 1);
    assert.deepEqual((await api.get('/me', tkAdmin())).body.sedes, []);
  } finally {
    await prisma.sede.updateMany({ where: { idSede: { in: [1, 2] } }, data: { active: true } });
  }
});

async function newSorteo(name) {
  const res = await api.post('/sorteos/create', tkAdmin(), { name, sorteoDate: '2026-12-20', sedeIds: [1] });
  return res.body.idSorteos;
}

const PARTICIPANTS = [
  '1001;PEREZ;ANA;ANALISTA;Gerencia A;SI',
  '1002;LOPEZ;LUIS;ANALISTA;gerencia a;SI',
  '1003;DIAZ;MARIA;JEFE;GERENCIA A;SI',
  '1004;ROJAS;PEDRO;JEFE;GERENCIA A;SI',
  '1005;SOTO;CARLA;ANALISTA;GERENCIA B;SI',
  '1006;RUIZ;JOSE;ANALISTA;GERENCIA B;SI',
  '1007;VEGA;LUZ;ANALISTA;GERENCIA B;NO',
  '1008;MORA;TOMAS;ANALISTA;GERENCIA INVENTADA;SI',
].join('\n');

test('carga de CSV: cupos, participantes, errores por fila y empleados nuevos', async () => {
  const id = await newSorteo('Carga');
  const quotas = await api.upload(`/quotas/upload?id=${id}`, tkAdmin(), 'GERENCIA A;2\nGERENCIA B;1\nNO EXISTE;3\n');
  assert.equal(quotas.body.saved, 2);
  assert.equal(quotas.body.errors.length, 1);

  const res = await api.upload(`/participants/upload?id=${id}`, tkAdmin(), PARTICIPANTS);
  assert.equal(res.status, 200);
  assert.equal(res.body.created, 7);
  assert.equal(res.body.errors.length, 1, 'la gerencia inventada se rechaza sin frenar el resto');
  assert.equal(res.body.employeesCreated, 7, 'cédulas desconocidas se registran como empleados nuevos');
  assert.equal(await prisma.employee.count({ where: { cedula: '1001' } }), 1);

  const again = await api.upload(`/participants/upload?id=${id}`, tkAdmin(), PARTICIPANTS);
  assert.equal(again.body.created, 0, 'recargar el mismo archivo no duplica');
  assert.equal(again.body.updated, 7);

  assert.equal((await api.upload(`/participants/upload?id=${id}`, tkAdmin(), '')).body.total, 0);
  assert.equal((await api.post(`/participants/upload?id=${id}`, tkAdmin())).status, 400, 'sin archivo');
  assert.equal((await api.upload(`/participants/upload?id=${id}`, token(OTHER), PARTICIPANTS)).status, 403);
});

test('sorteo completo: respeta asistencia, participa=NO y cupos; nadie se repite', async () => {
  const id = await newSorteo('Completo');
  await api.upload(`/quotas/upload?id=${id}`, tkAdmin(), 'GERENCIA A;2\nGERENCIA B;1\n');
  await api.upload(`/participants/upload?id=${id}`, tkAdmin(), PARTICIPANTS);

  const list = (await api.get(`/attendance/list?id=${id}`, tkAdmin())).body;
  assert.equal(list.rows.length, 6, 'solo participa=SI y gerencia válida');
  assert.ok(list.rows.every((r) => r.fullName !== ''), 'el nombre sale de Employee');

  // Asisten todos menos el de cédula 1004.
  for (const r of list.rows.filter((x) => x.cedula !== '1004')) {
    const res = await api.post('/attendance/mark', tkAdmin(), { idSorteos: id, idParticipant: r.idParticipant, attended: true });
    assert.equal(res.status, 200);
  }
  const filtered = (await api.get(`/attendance/list?id=${id}&search=soto`, tkAdmin())).body;
  assert.equal(filtered.rows.length, 1);
  assert.equal(filtered.attendedCount, 1);

  const winners = [];
  for (let i = 1; i <= 3; i += 1) {
    const res = await api.post(`/draw/execute?id=${id}`, tkAdmin());
    assert.equal(res.status, 201, `ganador #${i}`);
    assert.equal(res.body.winningOrder, i);
    winners.push(res.body);
  }
  const end = await api.post(`/draw/execute?id=${id}`, tkAdmin());
  assert.equal(end.status, 409);
  assert.equal(end.body.finished, true);

  assert.equal(new Set(winners.map((w) => w.cedula)).size, 3, 'nadie gana dos veces');
  assert.ok(!winners.some((w) => ['1004', '1007', '1008'].includes(w.cedula)), 'no gana quien no asistió, no participa o tiene gerencia inválida');
  assert.equal(winners.filter((w) => w.department === 'GERENCIA A').length, 2, 'cupo de A');
  assert.equal(winners.filter((w) => w.department === 'GERENCIA B').length, 1, 'cupo de B');

  const status = (await api.get(`/draw/winners?id=${id}`, tkAdmin())).body;
  assert.deepEqual(status.winners.map((w) => w.winningOrder), [1, 2, 3]);
  assert.equal(status.remaining, 0);

  const winnerRow = list.rows.find((r) => r.cedula === winners[0].cedula);
  const unmark = await api.post('/attendance/mark', tkAdmin(), { idSorteos: id, idParticipant: winnerRow.idParticipant, attended: false });
  assert.equal(unmark.status, 409, 'no se quita la asistencia a un ganador');
});

test('sin cupos cargados el sorteo no se ejecuta', async () => {
  const id = await newSorteo('Sin cupos');
  assert.equal((await api.post(`/draw/execute?id=${id}`, tkAdmin())).status, 409);
});

test('ejecuciones simultáneas no repiten orden ni exceden el cupo', async () => {
  const id = await newSorteo('Concurrente');
  await api.upload(`/quotas/upload?id=${id}`, tkAdmin(), 'GERENCIA A;3\n');
  await api.upload(`/participants/upload?id=${id}`, tkAdmin(), PARTICIPANTS);
  const rows = (await api.get(`/attendance/list?id=${id}`, tkAdmin())).body.rows.filter((r) => r.department === 'GERENCIA A');
  for (const r of rows) await api.post('/attendance/mark', tkAdmin(), { idSorteos: id, idParticipant: r.idParticipant, attended: true });

  const results = await Promise.all(Array.from({ length: 6 }, () => api.post(`/draw/execute?id=${id}`, tkAdmin())));
  const ok = results.filter((r) => r.status === 201);
  assert.equal(ok.length, 3, 'exactamente el cupo');
  assert.deepEqual(ok.map((r) => r.body.winningOrder).sort(), [1, 2, 3]);
  assert.equal(new Set(ok.map((r) => r.body.cedula)).size, 3);
  assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
});
