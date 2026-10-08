import { Readable } from 'node:stream';
import csvParser from 'csv-parser';

// Decodifica el archivo (UTF-8 o, si falla, Latin-1) y quita el BOM.
function decode(buffer) {
  let text = buffer.toString('utf8');
  if (text.includes('�')) text = buffer.toString('latin1');
  return text.replace(/^﻿/, '');
}

function detectSeparator(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
}

// Devuelve las filas como arreglos de celdas (sin encabezado), cada una con su número de línea.
export async function readCsvRows(buffer) {
  const text = decode(buffer);
  const separator = detectSeparator(text);

  const rows = [];
  await new Promise((resolve, reject) => {
    Readable.from([text])
      .pipe(csvParser({ separator, headers: false, skipComments: false }))
      .on('data', (row) => rows.push(Object.values(row).map((v) => String(v ?? '').trim())))
      .on('end', resolve)
      .on('error', reject);
  });

  return rows
    .map((cells, i) => ({ line: i + 1, cells }))
    .filter(({ cells }) => cells.some((c) => c !== ''));
}
