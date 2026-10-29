import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addFood,
  createWorld,
  getWorldCounts,
  MAX_NUTRIENTS,
  MAX_POPULATION,
  restoreWorld,
  stepWorld
} from '../js/simulation.js';

test('createWorld creates the expected initial ecosystem', () => {
  const world = createWorld(12345);

  assert.equal(world.tick, 0);
  assert.equal(world.organisms.length, 72);
  assert.equal(world.nutrients.length, 164);
  assert.equal(world.species.length, 3);
  assert.equal(getWorldCounts(world).population, 72);
  assert.ok(world.organisms.every(organism =>
    Number.isFinite(organism.x) && Number.isFinite(organism.y)
  ));
});

test('a fixed seed reproduces starting organism traits and positions', () => {
  const summarize = world => world.organisms.map(organism => ({
    x: organism.x,
    y: organism.y,
    angle: organism.angle,
    energy: organism.energy,
    speciesId: organism.speciesId,
    genes: organism.genes
  }));

  assert.deepEqual(summarize(createWorld(9876)), summarize(createWorld(9876)));
});

test('stepWorld advances exactly one tick and keeps population within limits', () => {
  const world = createWorld(54321);
  const result = stepWorld(world);

  assert.equal(world.tick, 1);
  assert.equal(result.population, world.organisms.length);
  assert.ok(world.organisms.length <= MAX_POPULATION);
  assert.ok(world.nutrients.length <= MAX_NUTRIENTS);
  assert.ok(world.organisms.every(organism =>
    Number.isFinite(organism.x) &&
    Number.isFinite(organism.y) &&
    Number.isFinite(organism.energy)
  ));
});

test('addFood never exceeds the nutrient limit', () => {
  const world = createWorld(222);
  const before = world.nutrients.length;
  const added = addFood(world, MAX_NUTRIENTS);

  assert.equal(added, MAX_NUTRIENTS - before);
  assert.equal(world.nutrients.length, MAX_NUTRIENTS);
  assert.ok(world.nutrients.length <= MAX_NUTRIENTS);
});

test('restoreWorld preserves a valid saved simulation state', () => {
  const world = createWorld(777);
  stepWorld(world);

  const restored = restoreWorld(JSON.parse(JSON.stringify(world)));

  assert.equal(restored.tick, world.tick);
  assert.equal(restored.seed, world.seed);
  assert.equal(restored.organisms.length, world.organisms.length);
  assert.equal(restored.nutrients.length, world.nutrients.length);
  assert.equal(restored.environment.mode, world.environment.mode);
});

test('restoreWorld rejects incompatible save data', () => {
  assert.throws(
    () => restoreWorld({ version: -1, organisms: [], nutrients: [], species: [] }),
    /совместимым сохранением LIFE ENGINE/
  );
});
