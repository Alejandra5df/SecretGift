const test = require('node:test');
const assert = require('node:assert');
const { SorteoServicio } = require('../src/sorteo/servicio');

const servicio = new SorteoServicio();
const ids = [1, 2, 3, 4, 5];

test('nadie se asigna a sí mismo (200 sorteos)', () => {
  for (let i = 0; i < 200; i++) {
    for (const [da, recibe] of servicio.realizar(ids)) assert.notStrictEqual(da, recibe);
  }
});

test('cada participante da y recibe exactamente una vez', () => {
  const pares = servicio.realizar(ids);
  assert.strictEqual(new Set(pares.map((p) => p[0])).size, ids.length);
  assert.strictEqual(new Set(pares.map((p) => p[1])).size, ids.length);
});

test('rechaza menos de 3 participantes', () => {
  assert.throws(() => servicio.realizar([1, 2]));
});

test('detecta una asignación inválida', () => {
  assert.strictEqual(servicio.esValido([1, 2, 3], [[1, 1], [2, 3], [3, 2]]), false);
});
