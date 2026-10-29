import test from 'node:test';
import assert from 'node:assert/strict';

import { runExperiment } from '../scripts/evolution-experiment.js';

import {
  addFood,
  createWorld,
  getWorldCounts,
  MAX_NUTRIENTS,
  MAX_POPULATION,
  restoreWorld,
  stepWorld,
  TRAITS
} from '../js/simulation.js';

function isolateOneOrganism(world, overrides = {}) {
  const organism = world.organisms[0];
  world.organisms = [organism];
  organism.genes = {
    mobility: 0.25,
    perception: 0.5,
    efficiency: 0.5,
    fertility: 0.1,
    shell: 0.2,
    filaments: 0.1,
    ...overrides
  };
  organism.x = 600;
  organism.y = 350;
  organism.angle = 0;
  organism.age = 0;
  organism.energy = 0.7;
  organism.trail = [];
  world.nutrients = [];
  return organism;
}

function energyAfterOneTick({ seed = 123, genes = {}, environment = 'balanced' } = {}) {
  const world = createWorld(seed);
  const organism = isolateOneOrganism(world, genes);
  world.environment = { mode: environment };
  const before = organism.energy;
  stepWorld(world);
  return { before, after: world.organisms[0].energy };
}

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

test('higher efficiency lowers energy consumption under identical conditions', () => {
  const inefficient = energyAfterOneTick({ genes: { efficiency: 0.1 } });
  const efficient = energyAfterOneTick({ genes: { efficiency: 0.9 } });

  assert.ok(inefficient.before - inefficient.after > efficient.before - efficient.after);
});

test('higher mobility has an energy cost under identical conditions', () => {
  const slow = energyAfterOneTick({ genes: { mobility: 0.1 } });
  const fast = energyAfterOneTick({ genes: { mobility: 0.9 } });

  assert.ok(fast.before - fast.after > slow.before - slow.after);
});

test('scarcity mode increases energy loss compared with balanced conditions', () => {
  const balanced = energyAfterOneTick({ environment: 'balanced' });
  const scarcity = energyAfterOneTick({ environment: 'scarcity' });

  assert.ok(scarcity.before - scarcity.after > balanced.before - balanced.after);
});

test('finding food restores more energy than the organism spends on that tick', () => {
  const world = createWorld(2026);
  const organism = isolateOneOrganism(world, {
    mobility: 0.2,
    perception: 1,
    efficiency: 0.5,
    fertility: 0.1,
    shell: 0.2,
    filaments: 0.5
  });
  organism.energy = 0.2;
  world.nutrients = [{
    id: 999999,
    x: organism.x,
    y: organism.y,
    energy: 0.3,
    radius: 4,
    hue: 46,
    pulse: 0,
    eaten: false
  }];

  stepWorld(world);

  assert.equal(world.totalMeals, 1);
  assert.ok(world.organisms[0].energy > 0.2);
  assert.ok(!world.nutrients.some(food => food.id === 999999));
});

test('offspring retain parent traits with bounded mutation variation', () => {
  const world = createWorld(12345);
  let observedOffspring = false;
  let observedMutation = false;

  for (let iteration = 0; iteration < 120 && !observedMutation; iteration++) {
    const parentGenesBeforeStep = new Map(
      world.organisms.map(organism => [organism.id, { ...organism.genes }])
    );

    stepWorld(world);

    for (const child of world.organisms) {
      if (child.parentId === null || child.birthTick !== world.tick) continue;
      const parentGenes = parentGenesBeforeStep.get(child.parentId);
      if (!parentGenes) continue;

      observedOffspring = true;
      let changedTrait = false;

      for (const trait of TRAITS) {
        const difference = Math.abs(child.genes[trait.key] - parentGenes[trait.key]);
        assert.ok(
          difference <= 0.320000001,
          `Mutation for ${trait.key} exceeded its configured maximum: ${difference}`
        );
        if (difference > 1e-8) changedTrait = true;
      }

      if (changedTrait) observedMutation = true;
    }
  }

  assert.ok(observedOffspring, 'the fixed-seed scenario should produce offspring');
  assert.ok(observedMutation, 'the fixed-seed scenario should expose at least one mutated trait');
});


test('fixed-seed environmental experiment is reproducible and records generations', () => {
  const options = { seed: 2468, generations: 3, modes: ['balanced', 'scarcity'] };
  const first = runExperiment(options);
  const second = runExperiment(options);

  assert.deepEqual(first, second);
  assert.equal(first.scenarios.length, 2);
  assert.equal(first.scenarios[0].trajectory.length, 4);
  assert.equal(first.scenarios[0].trajectory.at(-1).generation, 3);
  assert.equal(first.scenarios[0].initialPopulation, first.scenarios[1].initialPopulation);
  assert.ok(first.scenarios.every(scenario =>
    scenario.trajectory.every(record =>
      Number.isFinite(record.population) &&
      TRAITS.every(trait => Number.isFinite(record.traitMeans[trait.key]))
    )
  ));
});



test('world events are seeded, repeatable, and survive save restoration', () => {
  const advance = () => {
    const world = createWorld(314159);
    for (let tick = 0; tick < 30 * 30; tick++) stepWorld(world);
    return world;
  };

  const first = advance();
  const second = advance();
  const eventSummary = world => world.events
    .filter(event => event.title.startsWith('Событие мира:'))
    .map(event => ({ title: event.title, generation: event.generation, description: event.description }));

  assert.deepEqual(eventSummary(first), eventSummary(second));
  assert.ok(eventSummary(first).length > 0, 'fixed seed should produce at least one major world event');
  assert.ok(
    first.worldEvent === null ||
    (['bloom', 'drought', 'currents'].includes(first.worldEvent.id) && first.worldEvent.remainingGenerations > 0)
  );

  const restored = restoreWorld(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(restored.worldEvent, first.worldEvent);
});

test('generation history stores lineage counts and emits deterministic population-shift records', () => {
  const advance = () => {
    const world = createWorld(7654321);
    for (let tick = 0; tick < 30 * 80; tick++) stepWorld(world);
    return world;
  };
  const first = advance();
  const second = advance();

  assert.deepEqual(first.history, second.history);
  assert.deepEqual(
    first.events.filter(event => /Линия быстро расширяется|Линия теряет численность/.test(event.title)),
    second.events.filter(event => /Линия быстро расширяется|Линия теряет численность/.test(event.title))
  );
  assert.ok(first.history.every(record => record.speciesPopulations && typeof record.speciesPopulations === 'object'));
  assert.deepEqual(
    first.history[0].speciesPopulations,
    { 1: 24, 2: 24, 3: 24 }
  );
  assert.ok(
    first.events.some(event => /Линия быстро расширяется|Линия теряет численность/.test(event.title)),
    'long deterministic run should record at least one substantial lineage shift'
  );
});

test('experiment rejects invalid seeds, generation counts, and environments', () => {
  assert.throws(
    () => runExperiment({ generations: 0 }),
    /generations must be an integer between 1 and 300/
  );
  assert.throws(
    () => runExperiment({ seed: 0 }),
    /seed must be an integer between 1 and 4294967295/
  );
  assert.throws(
    () => runExperiment({ modes: ['unknown'] }),
    /modes must contain supported environment mode names/
  );
});
