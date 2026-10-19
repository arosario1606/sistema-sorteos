import test from 'node:test';
import assert from 'node:assert/strict';
import { readCsvRows } from '../../src/utils/csv.js';

test('detecta separador ; y numera las líneas saltando las vacías', async () => {
  const rows = await readCsvRows(Buffer.from('a;b;c\n\n1;2;3\n'));
  assert.deepEqual(rows, [
    { line: 1, cells: ['a', 'b', 'c'] },
    { line: 3, cells: ['1', '2', '3'] },
  ]);
});

test('detecta separador , y quita el BOM', async () => {
  const rows = await readCsvRows(Buffer.from('﻿a,b\n1,2\n'));
  assert.deepEqual(rows[0].cells, ['a', 'b']);
});

test('decodifica Latin-1 cuando el archivo no es UTF-8', async () => {
  const rows = await readCsvRows(Buffer.from('PÉREZ;ÁNGEL\n', 'latin1'));
  assert.deepEqual(rows[0].cells, ['PÉREZ', 'ÁNGEL']);
});

test('el separador no depende solo de la primera línea (una primera línea sin separadores no engaña)', async () => {
  const rows = await readCsvRows(Buffer.from('GERENCIA SIN CUPO\nA;1\nB;2\n'));
  assert.deepEqual(rows.map((r) => r.cells), [['GERENCIA SIN CUPO'], ['A', '1'], ['B', '2']]);
});

test('el texto entre comillas no cuenta para elegir el separador', async () => {
  const rows = await readCsvRows(Buffer.from('"SERVICIOS, S.A.";3\nOTRA;1\n'));
  assert.deepEqual(rows.map((r) => r.cells), [['SERVICIOS, S.A.', '3'], ['OTRA', '1']]);
});
