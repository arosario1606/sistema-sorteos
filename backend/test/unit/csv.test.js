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
