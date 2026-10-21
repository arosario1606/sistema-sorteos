import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canSearch, clearVisible, filterSedes, fold, idsToSave, isDirty, orphanIds, selectVisible, toggleSede,
} from './permissions-logic.js'

const SEDES = [
  { idSede: 1, name: 'Sede Maracaibo', active: true },
  { idSede: 2, name: 'Sede Caracas Centro', active: true },
  { idSede: 3, name: 'Sede Antigua', active: false },
  { idSede: 4, name: 'Sede Mérida', active: true },
]

test('fold ignora tildes y mayúsculas', () => {
  assert.equal(fold('MÉRIDA Núñez'), 'merida nunez')
})

test('canSearch exige 2 letras (sin contar espacios de más)', () => {
  assert.equal(canSearch(''), false)
  assert.equal(canSearch('a'), false)
  assert.equal(canSearch('  a '), false)
  assert.equal(canSearch('an'), true)
})

test('filterSedes: sin tildes, varias palabras en cualquier orden', () => {
  assert.deepEqual(filterSedes(SEDES, '').map((s) => s.idSede), [1, 2, 3, 4], 'sin filtro muestra todas')
  assert.deepEqual(filterSedes(SEDES, 'merida').map((s) => s.idSede), [4])
  assert.deepEqual(filterSedes(SEDES, 'centro caracas').map((s) => s.idSede), [2])
  assert.deepEqual(filterSedes(SEDES, 'zzz'), [])
})

test('isDirty compara conjuntos, no el orden', () => {
  assert.equal(isDirty([1, 2], [2, 1]), false)
  assert.equal(isDirty([1, 2], [1]), true)
  assert.equal(isDirty([], [3]), true)
  assert.equal(isDirty([], []), false)
  assert.equal(isDirty([1, 1], [1]), false)
})

test('toggleSede: no deja marcar una sede inactiva, pero sí desmarcarla', () => {
  assert.deepEqual(toggleSede([1], SEDES[1]), [1, 2])
  assert.deepEqual(toggleSede([1, 2], SEDES[1]), [1])
  assert.deepEqual(toggleSede([1], SEDES[2]), [1], 'inactiva: no se agrega')
  assert.deepEqual(toggleSede([1, 3], SEDES[2]), [1], 'inactiva ya asignada: se puede quitar')
})

test('selectVisible y clearVisible respetan lo marcado fuera del filtro y las sedes inactivas', () => {
  const visible = filterSedes(SEDES, 'sede') // todas
  assert.deepEqual(selectVisible([], visible).sort(), [1, 2, 4], 'las inactivas no se marcan')
  assert.deepEqual(selectVisible([3], visible).sort(), [1, 2, 3, 4], 'conserva una inactiva ya asignada')
  const some = filterSedes(SEDES, 'maracaibo')
  assert.deepEqual(clearVisible([1, 2, 4], some), [2, 4], 'solo quita las visibles')
})

test('orphanIds e idsToSave: las sedes que ya no existen en la intranet no se envían', () => {
  assert.deepEqual(orphanIds([1, 99], SEDES), [99])
  assert.deepEqual(idsToSave([4, 1, 99, 1], SEDES), [1, 4])
})
