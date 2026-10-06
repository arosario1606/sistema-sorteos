import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEligible } from '../../src/services/draw.js';

const cand = (idParticipant, idDepartment) => ({ idParticipant, idDepartment });

test('solo es elegible quien pertenece a una gerencia con cupo disponible', () => {
  const candidates = [cand(1, 10), cand(2, 10), cand(3, 20)];
  const quotas = new Map([[10, 2], [20, 1]]);
  const winners = new Map([[10, 1], [20, 1]]);
  assert.deepEqual(pickEligible(candidates, quotas, winners).map((c) => c.idParticipant), [1, 2]);
});

test('una gerencia sin cupo cargado no tiene ganadores', () => {
  assert.deepEqual(pickEligible([cand(1, 99)], new Map(), new Map()), []);
});

test('con el cupo agotado nadie de esa gerencia es elegible', () => {
  assert.deepEqual(pickEligible([cand(1, 10)], new Map([[10, 1]]), new Map([[10, 1]])), []);
});
