import test from 'node:test';
import assert from 'node:assert/strict';
import { readCsvRows } from '../../src/utils/csv.js';
import { parseQuotaRows } from '../../src/services/importQuotas.js';

const parse = async (text) => parseQuotaRows(await readCsvRows(Buffer.from(text), { keepInteriorBlanks: true }));
const reasons = (r) => r.errors.map((e) => `${e.line}: ${e.reason}`);

test('archivo válido, con y sin encabezado', async () => {
  for (const text of ['A;1\nB;2\n', 'gerencia;cantidad\nA;1\nB;2\n', 'Departamento;Total\nA;1\nB;2\n']) {
    const r = await parse(text);
    assert.equal(r.quotas.size, 2, text);
    assert.deepEqual(r.errors, [], text);
    assert.equal(r.total, 2);
  }
});

test('gerencia sin cantidad: dice cuál falta y nunca "undefined" (incluso en la primera línea)', async () => {
  const first = await parse('GERENCIA A\nB;2\n');
  assert.deepEqual(reasons(first), ['1: Falta la cantidad de ganadores para la gerencia "GERENCIA A"']);
  assert.equal(first.quotas.size, 1, 'no se traga la primera línea como si fuera un encabezado');

  const middle = await parse('A;1\nGERENCIA B;\nC;3\n');
  assert.deepEqual(reasons(middle), ['2: Falta la cantidad de ganadores para la gerencia "GERENCIA B"']);
});

test('cantidad sin gerencia', async () => {
  assert.deepEqual(reasons(await parse('A;1\n;3\nC;2\n')), ['2: Falta la gerencia: esta línea solo trae "3"']);
  assert.deepEqual(reasons(await parse('A;1\n3\nC;2\n')), ['2: Falta la gerencia: esta línea solo trae "3"']);
});

test('línea vacía entre datos se avisa; las del final y las de solo separadores no estorban', async () => {
  const mid = await parse('A;1\n\nB;2\n');
  assert.deepEqual(reasons(mid), ['2: Línea vacía: no tiene gerencia ni cantidad (se ignoró)']);
  assert.equal(mid.quotas.size, 2);
  assert.equal(mid.total, 2, 'la línea vacía no cuenta como fila de datos');

  assert.deepEqual((await parse('A;1\nB;2\n\n\n;\n;\n')).errors, [], 'vacías al final: sin avisos');
  assert.deepEqual(reasons(await parse('\nA;1\n')), ['1: Línea vacía: no tiene gerencia ni cantidad (se ignoró)']);
});

test('cantidad inválida: decimal, negativa, texto o enorme', async () => {
  const r = await parse('A;2.5\nB;-1\nC;abc\nD;99999999999\nE;4\n');
  assert.equal(r.quotas.size, 1);
  assert.deepEqual(reasons(r), [
    '1: Cantidad inválida "2.5" para la gerencia "A": use un número entero, sin decimales ni signo',
    '2: Cantidad inválida "-1" para la gerencia "B": use un número entero, sin decimales ni signo',
    '3: Cantidad inválida "abc" para la gerencia "C": use un número entero, sin decimales ni signo',
    '4: Cantidad demasiado grande "99999999999" para la gerencia "D" (máximo 100000)',
  ]);
});

test('gerencia repetida indica la línea de la primera aparición; más de dos columnas se avisa', async () => {
  const r = await parse('GERENCIA A;1\nOTRA;2\ngerencia a;5\nX;1;2\n');
  assert.deepEqual(reasons(r).slice(0, 1), ['3: Gerencia repetida "gerencia a": ya aparece en la línea 1']);
  assert.match(reasons(r)[1], /^4: Tiene más de dos columnas/);
  assert.equal([...r.quotas.values()].find((q) => q.name === 'GERENCIA A').qty, 1, 'se conserva la primera');
});

test('ningún mensaje contiene "undefined" ni "null", con entradas raras', async () => {
  const inputs = ['A\n', ';\n', '3\n', 'A;\n', ';5\n', 'A;B;C;D\n', 'a,b,c\n1,2\n', '\n\nA\n', '"A, B";3\n', 'x;1\n;\n\n;7\nA\n'];
  for (const text of inputs) {
    const r = await parse(text);
    for (const e of r.errors) assert.doesNotMatch(e.reason, /undefined|null|NaN/, `${JSON.stringify(text)} -> ${e.reason}`);
  }
});

test('un nombre de gerencia con coma entre comillas se acepta', async () => {
  const r = await parse('"GERENCIA A, B";3\nC;1\n');
  assert.deepEqual(r.errors, []);
  assert.equal([...r.quotas.values()].find((q) => q.name === 'GERENCIA A, B').qty, 3);
});

test('archivo vacío o solo encabezado: total 0 (el servicio responde 400)', async () => {
  assert.equal((await parse('')).total, 0);
  assert.equal((await parse('gerencia;cantidad\n')).total, 0);
});
