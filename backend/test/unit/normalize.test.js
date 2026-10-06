import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCedula, normalizeKey, normalizeText, parseSiNo } from '../../src/utils/normalize.js';

test('normalizeCedula deja solo letras y números', () => {
  assert.equal(normalizeCedula('28624356-1'), '286243561');
  assert.equal(normalizeCedula(' V-12.345.678 '), 'V12345678');
  assert.equal(normalizeCedula(null), '');
});

test('normalizeKey ignora mayúsculas, tildes y espacios', () => {
  assert.equal(normalizeKey('Gerencia de Tecnología'), 'GERENCIA_DE_TECNOLOGIA');
  assert.equal(normalizeKey('  gerencia   de_tecnologia '), 'GERENCIA_DE_TECNOLOGIA');
});

test('normalizeText compacta espacios y pasa a mayúsculas', () => {
  assert.equal(normalizeText('  juan   pérez '), 'JUAN PÉREZ');
});

test('parseSiNo devuelve booleanos y null para valores inválidos', () => {
  assert.equal(parseSiNo('si'), true);
  assert.equal(parseSiNo('SÍ'), true);
  assert.equal(parseSiNo(' No '), false);
  assert.equal(parseSiNo('quizás'), null);
  assert.equal(parseSiNo(''), null);
});
