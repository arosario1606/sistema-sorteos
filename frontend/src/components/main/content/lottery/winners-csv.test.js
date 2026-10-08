import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWinnersCsv, winnersFileName } from './winners-csv.js'

test('el archivo se llama "ganadores sorteo <nombre>.csv"', () => {
  assert.equal(winnersFileName('Sorteo Navidad 2026'), 'ganadores sorteo Sorteo Navidad 2026.csv')
})

test('quita los caracteres que Windows no admite en nombres de archivo', () => {
  assert.equal(winnersFileName('Rifa: "Fin/Año" <2026>?'), 'ganadores sorteo Rifa FinAño 2026.csv')
  assert.equal(winnersFileName('   '), 'ganadores sorteo sin nombre.csv')
})

test('el CSV lleva BOM, separador ; y una fila por ganador en orden', () => {
  const csv = buildWinnersCsv([
    { winningOrder: 1, cedula: '123', names: 'ANA', lastName: 'PÉREZ', jobTitle: 'ANALISTA', department: 'TI' },
    { winningOrder: 2, cedula: '456', names: 'LUIS', lastName: 'DÍAZ', jobTitle: 'JEFE', department: 'RRHH' },
  ])
  assert.ok(csv.startsWith('\uFEFFOrden;Cédula;Nombres;Apellidos;Cargo;Gerencia\r\n'))
  assert.deepEqual(csv.trim().split('\r\n').slice(1), ['1;123;ANA;PÉREZ;ANALISTA;TI', '2;456;LUIS;DÍAZ;JEFE;RRHH'])
})

test('escapa comillas y separadores, y neutraliza fórmulas', () => {
  const csv = buildWinnersCsv([
    { winningOrder: 1, cedula: '1', names: 'A;B', lastName: 'C"D', jobTitle: '=SUMA(1;2)', department: '@x' },
  ])
  assert.equal(csv.trim().split('\r\n')[1], `1;1;"A;B";"C""D";"'=SUMA(1;2)";'@x`)
})

test('sin ganadores solo queda el encabezado', () => {
  assert.equal(buildWinnersCsv([]).trim().split('\r\n').length, 1)
})
