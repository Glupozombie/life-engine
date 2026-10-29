import { pathToFileURL } from 'node:url';

import {
  createWorld,
  getWorldCounts,
  selectEnvironment,
  stepWorld,
  TICKS_PER_GENERATION,
  TRAITS
} from '../js/simulation.js';

export const EXPERIMENT_MODES = ['balanced', 'abundance', 'scarcity'];

function summarizeRecord(record) {
  return {
    generation: record.generation,
    population: record.population,
    activeSpecies: record.activeSpecies,
    nutrients: record.nutrients,
    averageEnergy: record.averageEnergy,
    traitMeans: Object.fromEntries(
      TRAITS.map(trait => [trait.key, record.traitMeans[trait.key]])
    )
  };
}

/**
 * Run the same seeded ecosystem under different environmental conditions.
 * This reports model outcomes; it does not assume that any trait must increase.
 */
export function runExperiment({
  seed = 12345,
  generations = 30,
  modes = EXPERIMENT_MODES
} = {}) {
  if (!Number.isInteger(generations) || generations < 1 || generations > 300) {
    throw new RangeError('generations must be an integer between 1 and 300');
  }
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xFFFFFFFF) {
    throw new RangeError('seed must be an integer between 1 and 4294967295');
  }
  if (!Array.isArray(modes) || modes.length === 0 ||
      modes.some(mode => !EXPERIMENT_MODES.includes(mode))) {
    throw new TypeError('modes must contain supported environment mode names');
  }

  const scenarios = modes.map(mode => {
    const world = createWorld(seed);
    selectEnvironment(world, mode);
    const historyStart = world.history.length;

    for (let tick = 0; tick < generations * TICKS_PER_GENERATION; tick++) {
      stepWorld(world);
    }

    const counts = getWorldCounts(world);
    const trajectory = world.history.slice(historyStart - 1).map(summarizeRecord);

    return {
      mode,
      seed: world.seed,
      generationsRequested: generations,
      generationsCompleted: world.generation,
      ticks: world.tick,
      extinct: counts.population === 0,
      initialPopulation: trajectory[0]?.population ?? 0,
      finalPopulation: counts.population,
      activeSpecies: counts.activeSpecies,
      totalSpecies: world.species.length,
      births: world.totalBirths,
      deaths: world.totalDeaths,
      meals: world.totalMeals,
      trajectory
    };
  });

  return {
    experiment: 'LIFE ENGINE — comparison of environmental conditions',
    note: 'This is an observation of the current simplified model, not proof of biological accuracy or a universal evolutionary rule.',
    seed,
    generations,
    scenarios
  };
}

function parseIntegerArgument(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(prefix.length));
  if (!Number.isInteger(parsed)) throw new TypeError(`--${name} must be an integer`);
  return parsed;
}

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const seed = parseIntegerArgument('seed', 12345);
  const generations = parseIntegerArgument('generations', 30);
  console.log(JSON.stringify(runExperiment({ seed, generations }), null, 2));
}
