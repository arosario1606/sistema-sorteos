import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_SCHEMA, client, createIntranetViews, dropIntranetStub, loadIntranetStub, prisma, resetDb, startServer, token } from './helpers.js';

// «Permisos por Sedes» y lectura en vivo de sedes y usuarios (vistas v_sede / v_users). La intranet se simula con
// esquemas de prueba; las vistas se crean con el MISMO script que usará el administrador.
// Usuarios de la fixture: 10 Ana María Pérez Gómez, 11 Luis Rojas, 12 Josefina Núñez, 13 Pedro (INACTIVO), 14 Cien Porciento.
// Sedes: 1 Maracaibo, 2 Caracas, 3 Antigua (inactiva en la intranet), 4 Valencia, 5 Barquisimeto.
const ADMIN = { id: 10, email: 'admin@example.com' };
const sede = (rows, id) => rows.find((r) => r.idSede === id);

let server;
let api;
const tk = () => token(ADMIN);
const as = (user) => token(user);

before(async () => {
  await resetDb();
  await loadIntranetStub();
  let url;
  ({ server, url } = await startServer());
  api = client(url);
});

after(async () => {
  server.close();
  await dropIntranetStub();
  await prisma.$disconnect();
});

const perms = async (userId) =>
  (await prisma.userBranchPermission.findMany({ where: { userId }, orderBy: { idSede: 'asc' } }));
const ids = async (userId) => (await perms(userId)).map((p) => p.idSede);
const save = (userId, sedeIds, user = ADMIN) => api.post('/permisos/usuario/guardar', as(user), { userId, sedeIds });
const search = (q) => api.get(`/permisos/usuarios?q=${encodeURIComponent(q)}`, tk());

test('las vistas exponen solo las columnas necesarias: nunca la contraseña ni la cédula', async () => {
  const cols = async (view) => (await prisma.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'sorteos_test' AND table_name = $1 ORDER BY ordinal_position", view,
  )).map((r) => r.column_name);
  assert.deepEqual(await cols('v_users'), ['id', 'name', 'lastname', 'email', 'active']);
  assert.deepEqual(await cols('v_sede'), ['id', 'name', 'is_active']);

  const everything = JSON.stringify(await prisma.$queryRawUnsafe('SELECT * FROM v_users'));
  assert.doesNotMatch(everything, /HASH-SECRETO|11111111|cedula|password/i);
  const api1 = JSON.stringify([(await search('ana')).body, (await api.get('/permisos/usuario?id=10', tk())).body]);
  assert.doesNotMatch(api1, /HASH-SECRETO|11111111|password/i, 'la API tampoco las devuelve');
});

test('el script de vistas se puede ejecutar más de una vez', async () => {
  await createIntranetViews();
  await createIntranetViews();
  assert.equal((await api.get('/permisos/sedes', tk())).status, 200);
});

test('buscar usuarios: sin tildes ni mayúsculas, varias palabras en cualquier orden, solo activos', async () => {
  const names = async (q) => (await search(q)).body.users.map((u) => u.fullName);
  assert.deepEqual(await names('maria'), ['Ana María Pérez Gómez'], 'sin tilde encuentra «María»');
  assert.deepEqual(await names('PEREZ ana'), ['Ana María Pérez Gómez'], 'varias palabras y orden libre');
  assert.deepEqual(await names('nunez'), ['Josefina Núñez'], 'ñ y tilde');
  assert.deepEqual(await names('josefina@'), ['Josefina Núñez'], 'también por correo');
  assert.deepEqual(await names('pedro'), [], 'el usuario inactivo no aparece');
  assert.deepEqual(await names('zzzz'), []);

  const first = (await search('luis')).body.users[0];
  assert.deepEqual(first, { id: 11, fullName: 'Luis Rojas', email: 'otro@example.com' });
});

test('buscar usuarios: valida el texto y trata % y _ como letras normales', async () => {
  assert.equal((await search('a')).status, 400, 'mínimo 2 letras');
  assert.equal((await search('')).status, 400);
  assert.equal((await api.get('/permisos/usuarios', tk())).status, 400, 'sin q');
  assert.equal((await search('x'.repeat(101))).status, 400, 'demasiado largo');
  assert.equal((await api.get('/permisos/usuarios?q=ana', undefined)).status, 401);

  assert.deepEqual((await search('0%@')).body.users.map((u) => u.id), [14], '% se busca literal');
  assert.deepEqual((await search('%%')).body.users, [], '% no es comodín');
  assert.deepEqual((await search('_u')).body.users, [], '_ no es comodín');
  assert.deepEqual((await search("'; DROP TABLE x; --")).body.users, [], 'sin inyección SQL');
});

test('buscar usuarios: máximo 20 resultados e indica que hay más', async () => {
  for (let i = 0; i < 25; i += 1) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${AUTH_SCHEMA}."Users" (id, email, "password", "name", lastname, active) VALUES (${200 + i}, 'masivo${i}@example.com', 'x', 'Masivo ${String(i).padStart(2, '0')}', 'Prueba', true)`,
    );
  }
  const { body } = await search('masivo');
  assert.equal(body.users.length, 20);
  assert.equal(body.truncated, true);
  assert.equal((await search('masivo 03')).body.truncated, false);
});

test('las sedes se leen en vivo de la intranet: nuevas, renombradas y desactivadas, sin copiar nada', async () => {
  let { body } = await api.get('/permisos/sedes', tk());
  assert.deepEqual(body.map((s) => [s.idSede, s.name, s.active]), [
    [3, 'Sede Antigua', false],
    [5, 'Sede Barquisimeto', true],
    [2, 'Sede Caracas', true],
    [1, 'Sede Maracaibo', true],
    [4, 'Sede Valencia', true],
  ]);

  await prisma.$executeRawUnsafe(`INSERT INTO ${AUTH_SCHEMA}."Locations" (id, "name", is_active) VALUES (6, 'Sede Nueva', true)`);
  await prisma.$executeRawUnsafe(`UPDATE ${AUTH_SCHEMA}."Locations" SET "name" = 'Sede Caracas Centro' WHERE id = 2`);
  ({ body } = await api.get('/permisos/sedes', tk()));
  assert.equal(sede(body, 6).name, 'Sede Nueva', 'una sede nueva aparece sin ningún sync');
  assert.equal(sede(body, 6).active, true, 'sin fila en Sede cuenta como activa');
  assert.equal(sede(body, 2).name, 'Sede Caracas Centro', 'el nombre nuevo se ve de inmediato');
  assert.equal(await prisma.sede.count(), 0, 'no se copió nada a la tabla Sede');

  await prisma.sede.create({ data: { idSede: 6, active: false } }); // decisión de este módulo
  assert.equal(sede((await api.get('/permisos/sedes', tk())).body, 6).active, false, 'Sede.active = false la oculta');
  await prisma.sede.deleteMany();
  await prisma.$executeRawUnsafe(`DELETE FROM ${AUTH_SCHEMA}."Locations" WHERE id = 6`);
  await prisma.$executeRawUnsafe(`UPDATE ${AUTH_SCHEMA}."Locations" SET "name" = 'Sede Caracas' WHERE id = 2`);
});

test('ver permisos de un usuario', async () => {
  await prisma.userBranchPermission.createMany({ data: [4, 1].map((idSede) => ({ userId: 11, idSede, createdBy: 'test' })) });
  const res = await api.get('/permisos/usuario?id=11', tk());
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { user: { id: 11, fullName: 'Luis Rojas', email: 'otro@example.com', active: true }, sedeIds: [1, 4] });
  assert.deepEqual((await api.get('/permisos/usuario?id=12', tk())).body.sedeIds, [], 'sin permisos todavía');
  assert.equal((await api.get('/permisos/usuario?id=999', tk())).status, 404);
  assert.equal((await api.get('/permisos/usuario?id=abc', tk())).status, 400);
  assert.equal((await api.get('/permisos/usuario', tk())).status, 400);
  await prisma.userBranchPermission.deleteMany({ where: { userId: 11 } });
});

test('guardar permisos: reemplaza el conjunto completo y el usuario lo ve en /me', async () => {
  assert.deepEqual((await api.get('/me', as({ id: 12, email: 'josefina@example.com' }))).body.sedes, []);

  let res = await save(12, [1, 2, 4]);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { userId: 12, sedeIds: [1, 2, 4], added: 3, removed: 0 });
  assert.deepEqual(await ids(12), [1, 2, 4]);
  assert.ok((await perms(12)).every((p) => p.createdBy === ADMIN.email), 'queda registrado quién lo asignó');
  const me = await api.get('/me', as({ id: 12, email: 'josefina@example.com' }));
  assert.deepEqual(me.body.sedes.map((s) => s.name), ['Sede Caracas', 'Sede Maracaibo', 'Sede Valencia']);

  res = await save(12, [2, 5, 5]); // quita 1 y 4, agrega 5; el 5 repetido cuenta una vez
  assert.deepEqual(res.body, { userId: 12, sedeIds: [2, 5], added: 1, removed: 2 });
  assert.deepEqual(await ids(12), [2, 5]);

  res = await save(12, [2, 5]);
  assert.deepEqual([res.body.added, res.body.removed], [0, 0], 'guardar lo mismo no cambia nada');
  const createdAt = (await perms(12)).map((p) => p.createdAt.getTime());
  await save(12, [2, 5]);
  assert.deepEqual((await perms(12)).map((p) => p.createdAt.getTime()), createdAt, 'las filas existentes no se recrean');

  assert.equal((await save(12, [])).status, 200, 'una lista vacía quita todos los permisos');
  assert.deepEqual(await ids(12), []);
  assert.deepEqual((await api.get('/me', as({ id: 12, email: 'josefina@example.com' }))).body.sedes, []);
});

test('guardar permisos: valida los datos y no cambia nada si algo está mal', async () => {
  await save(11, [1]);
  const before = await ids(11);
  const bad = async (body, status, pattern) => {
    const res = await api.post('/permisos/usuario/guardar', tk(), body);
    assert.equal(res.status, status, JSON.stringify(body));
    if (pattern) assert.match(res.body.error, pattern);
    assert.deepEqual(await ids(11), before, 'sin cambios tras el error');
  };
  await bad({ userId: 11 }, 400, /lista/);
  await bad({ userId: 11, sedeIds: 'todas' }, 400, /lista/);
  await bad({ userId: 11, sedeIds: [1, 'x'] }, 400, /inválida/);
  await bad({ userId: 11, sedeIds: [1, -2] }, 400, /inválida/);
  await bad({ userId: 11, sedeIds: [1, 1.5] }, 400, /inválida/);
  await bad({ userId: 11, sedeIds: [1, 999] }, 400, /999 no existe/);
  await bad({ userId: 11, sedeIds: [1, 3] }, 400, /Antigua.*inactiva/); // inactiva en la intranet
  await bad({ sedeIds: [1] }, 400, /userId/);
  await bad({ userId: 'abc', sedeIds: [1] }, 400, /userId/);
  await bad({ userId: 11, sedeIds: Array.from({ length: 501 }, (_, i) => i + 1) }, 400, /Demasiadas/);
  assert.equal((await save(999, [1])).status, 404, 'usuario inexistente');
  assert.equal((await api.post('/permisos/usuario/guardar', undefined, { userId: 11, sedeIds: [1] })).status, 401);
  assert.deepEqual(await ids(999), []);
});

test('una sede desactivada en este módulo no se puede asignar de nuevo, pero la que ya se tenía se puede conservar', async () => {
  await prisma.sede.create({ data: { idSede: 5, active: false } });
  try {
    assert.equal((await save(11, [1, 5])).status, 400, 'asignarla de nuevo está prohibido');
    await prisma.userBranchPermission.create({ data: { userId: 11, idSede: 5, createdBy: 'antes' } }); // ya la tenía
    const kept = await save(11, [1, 5]);
    assert.equal(kept.status, 200, 'conservarla (no es nueva) está permitido');
    assert.equal(kept.body.removed, 0);
    assert.equal((await save(11, [1])).status, 200, 'quitarla siempre se puede');
    assert.deepEqual(await ids(11), [1]);
  } finally {
    await prisma.sede.deleteMany();
  }
});

test('dos administradores guardando a la vez no dejan un resultado mezclado', async () => {
  const A = [1, 2];
  const B = [4, 5];
  for (let round = 0; round < 6; round += 1) {
    await save(12, []);
    const results = await Promise.all([save(12, A), save(12, B), save(12, A), save(12, B)]);
    assert.ok(results.every((r) => r.status === 200));
    const final = await ids(12);
    assert.ok(JSON.stringify(final) === JSON.stringify(A) || JSON.stringify(final) === JSON.stringify(B), `mezclado: ${final}`);
  }
  await save(12, []);
});

test('si una sede desaparece de la intranet, los sorteos ya creados siguen visibles y se marca como eliminada', async () => {
  await save(11, [4]);
  const created = await api.post('/sorteos/create', as({ id: 11, email: 'otro@example.com' }), { name: 'Con sede', sorteoDate: '2026-12-20', sedeIds: [4] });
  assert.equal(created.status, 201);
  await prisma.$executeRawUnsafe(`DELETE FROM ${AUTH_SCHEMA}."Locations" WHERE id = 4`);
  try {
    const list = (await api.get('/sorteos', as({ id: 11, email: 'otro@example.com' }))).body;
    assert.deepEqual(list[0].sedes, [{ idSede: 4, name: 'Sede 4 (eliminada)' }]);
    assert.deepEqual((await api.get('/me', as({ id: 11, email: 'otro@example.com' }))).body.sedes, [], 'ya no se ofrece para sorteos nuevos');
    assert.equal((await save(12, [4])).status, 400, 'no se puede asignar una sede que ya no existe');
    assert.deepEqual(await ids(11), [4], 'el permiso huérfano sigue ahí hasta que alguien guarde sin ella');
    assert.equal((await save(11, [])).status, 200);
    assert.deepEqual(await ids(11), [], 'guardar sin la sede eliminada limpia el permiso huérfano');
  } finally {
    await prisma.$executeRawUnsafe(`INSERT INTO ${AUTH_SCHEMA}."Locations" (id, "name", is_active) VALUES (4, 'Sede Valencia', true)`);
    await prisma.userBranchPermission.deleteMany({ where: { userId: 11 } });
  }
});

test('sin las vistas de la intranet: error claro (503) en lo que las usa, y el resto del módulo sigue funcionando', async () => {
  const user = as({ id: 10, email: 'admin@example.com' });
  await prisma.userBranchPermission.create({ data: { userId: 10, idSede: 1, createdBy: 'test' } });
  const created = (await api.post('/sorteos/create', user, { name: 'Antes', sorteoDate: '2026-12-20', sedeIds: [1] })).body;

  await prisma.$executeRawUnsafe('DROP VIEW v_users');
  await prisma.$executeRawUnsafe('DROP VIEW v_sede');
  try {
    for (const res of [await search('ana'), await api.get('/permisos/sedes', tk()), await api.get('/me', user), await api.get('/permisos/usuario?id=10', tk())]) {
      assert.equal(res.status, 503);
      assert.match(res.body.error, /vistas-sorteos\.sql/);
    }
    // Lo que no necesita nombres de la intranet sigue andando: asistencia, detalle sin sedes no, pero sí cargas y sorteo.
    assert.equal((await api.get(`/attendance/list?id=${created.idSorteos}`, user)).status, 200);
    assert.equal((await api.post('/sorteos/finalize', user, { idSorteos: created.idSorteos })).status, 200);
  } finally {
    await createIntranetViews();
    await prisma.userBranchPermission.deleteMany({ where: { userId: 10 } });
  }
  assert.equal((await search('ana')).status, 200, 'al crear las vistas vuelve a funcionar sin reiniciar');
});
