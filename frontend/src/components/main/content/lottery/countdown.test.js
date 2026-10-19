import test from 'node:test'
import assert from 'node:assert/strict'
import { countdownNumber } from './countdown.js'

test('con 3,5 s la cuenta va 3, 2, 1 y nunca muestra 4 ni 0', () => {
  const at = (ms) => countdownNumber(ms, 3500)
  assert.equal(at(3500), 3, 'empieza en 3')
  assert.equal(at(2001), 3)
  assert.equal(at(2000), 2)
  assert.equal(at(1001), 2)
  assert.equal(at(1000), 1)
  assert.equal(at(1), 1)
  assert.equal(at(0), 1, 'al final no se muestra 0')
})

test('los números son siempre enteros y no aumentan mientras pasa el tiempo', () => {
  let previous = Infinity
  for (let ms = 3500; ms >= 0; ms -= 10) {
    const n = countdownNumber(ms, 3500)
    assert.ok(Number.isInteger(n))
    assert.ok(n <= previous)
    previous = n
  }
})

test('si cambiara la duración, empieza en su parte entera', () => {
  assert.equal(countdownNumber(5000, 5000), 5)
  assert.equal(countdownNumber(4200, 4200), 4)
})
