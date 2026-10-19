import { Readable } from 'node:stream';
import csvParser from 'csv-parser';

// Decodifica el archivo (UTF-8 o, si falla, Latin-1) y quita el BOM.
function decode(buffer) {
  let text = buffer.toString('utf8');
  if (text.includes('�')) text = buffer.toString('latin1');
  return text.replace(/^﻿/, '');
}

// El separador se decide con las primeras líneas (no solo con la primera: una primera línea sin separadores, como una
// gerencia sin cantidad, haría leer mal todo el archivo). Se ignora el texto entre comillas y, si hay empate, gana ';'.
function detectSeparator(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  let semicolons = 0;
  let commas = 0;
  for (const line of lines) {
    const bare = line.replace(/"[^"]*"/g, '');
    semicolons += (bare.match(/;/g) || []).length;
    commas += (bare.match(/,/g) || []).length;
  }
  return semicolons > 0 && semicolons >= commas ? ';' : ',';
}

// Devuelve las filas como arreglos de celdas (sin encabezado), cada una con su número de línea.
// Por defecto se omiten las líneas vacías. Con { keepInteriorBlanks: true } se conservan (marcadas con `blank: true`)
// las que quedan ENTRE filas con datos, para poder avisar de ellas; las vacías del final del archivo se ignoran siempre,
// porque los programas de hoja de cálculo suelen dejarlas.
export async function readCsvRows(buffer, { keepInteriorBlanks = false } = {}) {
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

  const numbered = rows.map((cells, i) => ({ line: i + 1, cells, blank: cells.every((c) => c === '') }));
  const lastWithData = numbered.map((r) => r.blank).lastIndexOf(false);

  return numbered
    .filter((r, i) => !r.blank || (keepInteriorBlanks && i < lastWithData))
    .map(({ blank, ...row }) => (keepInteriorBlanks ? { ...row, blank } : row));
}
