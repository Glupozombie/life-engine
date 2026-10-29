export const SAVE_VERSION = 1;
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 700;
export const MAX_POPULATION = 420;
export const MAX_NUTRIENTS = 230;
export const TICKS_PER_GENERATION = 30;

export const TRAITS = [
  { key: 'mobility', label: 'Подвижность', short: 'Движение', color: '#68d9dd', high: 'быстро перемещается' },
  { key: 'perception', label: 'Чувствительность', short: 'Восприятие', color: '#8dc9ff', high: 'лучше замечает пищу' },
  { key: 'efficiency', label: 'Экономия энергии', short: 'Экономия', color: '#99edbe', high: 'медленнее тратит энергию' },
  { key: 'fertility', label: 'Склонность к росту', short: 'Рост', color: '#ffc879', high: 'чаще оставляет потомство' },
  { key: 'shell', label: 'Защитная оболочка', short: 'Оболочка', color: '#d7a8ff', high: 'имеет плотную оболочку' },
  { key: 'filaments', label: 'Отростки', short: 'Отростки', color: '#ff9ed0', high: 'имеет длинные чувствительные отростки' }
];

const SPECIES_NAMES = [
  'Лунные парусники', 'Стеклянные веера', 'Светящиеся скользуны', 'Бирюзовые ленты',
  'Искристые плавники', 'Золотые спирали', 'Коралловые искры', 'Пурпурные странники',
  'Северные капли', 'Мягкие кольца', 'Опаловые пловцы', 'Синие волокна',
  'Перламутровые веера', 'Тихие дрейферы', 'Крошечные светохвосты', 'Жемчужные крылья',
  'Ночные веера', 'Радужные нити', 'Серебряные завитки', 'Дальние искры',
  'Лазурные плавники', 'Туманные ленты', 'Янтарные спирали', 'Медленные кометы'
];
const TRAIT_BY_KEY = Object.fromEntries(TRAITS.map(t => [t.key, t]));
const WORLD_EVENT_TYPES = [
  { id: 'bloom', title: 'Великое цветение', description: 'В воде резко выросло количество питательных веществ. Популяции получают шанс на бурный рост, но за ним может последовать голод.', duration: [2, 4] },
  { id: 'drought', title: 'Голодная полоса', description: 'Источники пищи почти перестали появляться. Организмы с низкими энергозатратами получают преимущество; численность может резко упасть.', duration: [2, 3] },
  { id: 'currents', title: 'Смена течений', description: 'Потоки воды изменились и сдвигают обитателей по-другому. Привычные места кормления могут перестать быть выгодными.', duration: [2, 3] }
];
const ENVIRONMENTS = {
  balanced: { label: 'Сбалансированная среда', caption: 'Умеренно появляются источники пищи', foodRate: 1, energyMultiplier: 1, current: 0.22 },
  abundance: { label: 'Изобилие пищи', caption: 'Источники энергии появляются чаще', foodRate: 1.75, energyMultiplier: 0.92, current: 0.08 },
  scarcity: { label: 'Скудная среда', caption: 'Пищи меньше, экономия энергии важнее', foodRate: 0.48, energyMultiplier: 1.27, current: 0.48 }
};

export function rand(world) {
  let s = (world.rngState >>> 0) || 1;
  s = (Math.imul(1664525, s) + 1013904223) >>> 0;
  world.rngState = s;
  return s / 4294967296;
}
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const rnd = (world, min, max) => min + rand(world) * (max - min);
const pick = (world, arr) => arr[Math.floor(rand(world) * arr.length)];
const clone = value => JSON.parse(JSON.stringify(value));

function newSpeciesName(world) {
  const i = world.species.length;
  const base = SPECIES_NAMES[i % SPECIES_NAMES.length];
  return i >= SPECIES_NAMES.length ? `${base} ${Math.floor(i / SPECIES_NAMES.length) + 1}` : base;
}

function traitDistance(a, b) {
  let total = 0;
  for (const t of TRAITS) total += ((a[t.key] ?? 0.5) - (b[t.key] ?? 0.5)) ** 2;
  return Math.sqrt(total);
}

function addEvent(world, type, title, description, speciesId = null) {
  const event = {
    id: world.nextEventId++, type, title, description,
    tick: world.tick, generation: world.generation,
    speciesId, createdAt: Date.now()
  };
  world.events.unshift(event);
  if (world.events.length > 160) world.events.length = 160;
  return event;
}

export function recordWorldEvent(world, type, title, description, speciesId = null) {
  return addEvent(world, type, title, description, speciesId);
}

function addEffect(world, type, x, y, hue = 185, strength = 1) {
  if (!Array.isArray(world.effects)) world.effects = [];
  const durationMs = type === 'death' ? 1600 : type === 'species' ? 2100 : type === 'eat' ? 750 : 1000;
  world.effects.push({ id: world.tick * 1000 + world.effects.length + 1, type, x, y, hue, strength, createdAt: Date.now(), durationMs });
  if (world.effects.length > 120) world.effects.splice(0, world.effects.length - 120);
}

function makeSpecies(world, genes, hue, parentSpeciesId = null) {
  const species = {
    id: world.nextSpeciesId++,
    name: newSpeciesName(world),
    hue: ((hue % 360) + 360) % 360,
    parentSpeciesId,
    bornGeneration: world.generation,
    bornTick: world.tick,
    extinctGeneration: null,
    seen: false,
    count: 0,
    peakCount: 0,
    signature: clone(genes)
  };
  world.species.push(species);
  return species;
}

function jitterGenes(world, genes, amount = 0.08) {
  const out = {};
  for (const trait of TRAITS) out[trait.key] = clamp((genes[trait.key] ?? 0.5) + rnd(world, -amount, amount));
  return out;
}

function createOrganism(world, species, genes, x, y, parentId = null, initial = false) {
  return {
    id: world.nextOrganismId++,
    parentId,
    speciesId: species.id,
    genes: clone(genes),
    x: clamp(x, 18, WORLD_WIDTH - 18),
    y: clamp(y, 18, WORLD_HEIGHT - 18),
    angle: rnd(world, 0, Math.PI * 2),
    energy: initial ? rnd(world, 0.58, 0.98) : rnd(world, 0.37, 0.48),
    age: initial ? Math.floor(rnd(world, 2, 180)) : 0,
    offspring: 0,
    flash: initial ? rnd(world, 0, 6) : 18,
    birthTick: world.tick,
    lastAteTick: world.tick,
    trail: [],
    alive: true
  };
}

function addNutrient(world, x = null, y = null) {
  const hue = pick(world, [36, 46, 166, 181, 194]);
  world.nutrients.push({
    id: world.nextNutrientId++,
    x: x === null ? rnd(world, 25, WORLD_WIDTH - 25) : clamp(x, 18, WORLD_WIDTH - 18),
    y: y === null ? rnd(world, 25, WORLD_HEIGHT - 25) : clamp(y, 18, WORLD_HEIGHT - 18),
    energy: rnd(world, 0.18, 0.3),
    radius: rnd(world, 2.5, 4.5),
    hue,
    pulse: rnd(world, 0, Math.PI * 2),
    eaten: false
  });
}

export function createWorld(seed = null) {
  const seedValue = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0 || 1;
  const world = {
    version: SAVE_VERSION,
    seed: seedValue,
    rngState: seedValue,
    tick: 0,
    generation: 0,
    nextOrganismId: 1,
    nextSpeciesId: 1,
    nextNutrientId: 1,
    nextEventId: 1,
    organisms: [], nutrients: [], species: [],
    events: [], history: [], effects: [],
    discoveries: 0,
    totalBirths: 0,
    totalDeaths: 0,
    totalMeals: 0,
    lifetimeTicks: 0,
    lifespans: 0,
    environment: { mode: 'balanced', ...ENVIRONMENTS.balanced },
    worldEvent: null,
    selectedId: null,
    followSelected: false,
    goals: {},
    lastPopulationWindow: [],
    lastScarcityNoticeTick: -1000,
    lastDropNoticeGeneration: -1000,
    lastGrowthNoticeGeneration: -1000,
    lastDominantSpeciesId: null,
    lastSavedAt: Date.now(),
    wasRunning: false,
    offlineProgress: true
  };

  const founders = [
    { genes: { mobility: 0.73, perception: 0.65, efficiency: 0.38, fertility: 0.47, shell: 0.25, filaments: 0.7 }, hue: 184 },
    { genes: { mobility: 0.42, perception: 0.8, efficiency: 0.74, fertility: 0.38, shell: 0.7, filaments: 0.44 }, hue: 286 },
    { genes: { mobility: 0.58, perception: 0.43, efficiency: 0.64, fertility: 0.78, shell: 0.3, filaments: 0.83 }, hue: 36 }
  ];
  const perSpecies = 24;
  for (const founder of founders) {
    const species = makeSpecies(world, founder.genes, founder.hue);
    for (let i = 0; i < perSpecies; i++) {
      const genes = jitterGenes(world, founder.genes, 0.14);
      world.organisms.push(createOrganism(world, species, genes, rnd(world, 28, WORLD_WIDTH - 28), rnd(world, 28, WORLD_HEIGHT - 28), null, true));
    }
  }
  for (let i = 0; i < 164; i++) addNutrient(world);
  refreshSpeciesCounts(world, false);
  addEvent(world, 'system', 'Мир создан', 'Три исходные разновидности готовы исследовать среду. Запусти время и посмотри, какие из них окажутся лучше приспособлены.');
  world.history.push(makeHistoryRecord(world));
  return world;
}

function makeHistoryRecord(world) {
  const active = world.species.filter(s => s.count > 0).length;
  const last = world.history?.[world.history.length - 1];
  const mean = key => world.organisms.length ? world.organisms.reduce((sum, o) => sum + (o.genes[key] ?? 0.5), 0) / world.organisms.length : 0;
  const ages = world.organisms.map(o => o.age || 0);
  const meanAge = ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 0;
  const traitMeans = Object.fromEntries(TRAITS.map(t => [t.key, mean(t.key)]));
  let variance = 0;
  for (const trait of TRAITS) {
    const avg = traitMeans[trait.key];
    if (world.organisms.length) variance += world.organisms.reduce((sum, o) => sum + ((o.genes[trait.key] ?? 0.5) - avg) ** 2, 0) / world.organisms.length;
  }
  return {
    tick: world.tick, generation: world.generation,
    population: world.organisms.length,
    activeSpecies: active,
    totalSpecies: world.species.length,
    nutrients: world.nutrients.length,
    births: world.totalBirths,
    deaths: world.totalDeaths,
    birthsThisInterval: world.totalBirths - (last?.births ?? world.totalBirths),
    deathsThisInterval: world.totalDeaths - (last?.deaths ?? world.totalDeaths),
    meals: world.totalMeals,
    averageLifespan: world.lifespans ? world.lifetimeTicks / world.lifespans : 0,
    averageAge: meanAge,
    averageEnergy: world.organisms.length ? world.organisms.reduce((sum, o) => sum + o.energy, 0) / world.organisms.length : 0,
    diversity: variance / TRAITS.length,
    // Snapshot lineage counts so the chronicle can describe real population shifts.
    speciesPopulations: Object.fromEntries(world.species.map(species => [species.id, species.count || 0])),
    traitMeans
  };
}

function refreshSpeciesCounts(world, announceExtinction = true) {
  for (const species of world.species) species.count = 0;
  for (const organism of world.organisms) {
    const species = world.species.find(s => s.id === organism.speciesId);
    if (species) species.count++;
  }
  for (const species of world.species) {
    species.peakCount = Math.max(species.peakCount || 0, species.count);
    if (species.count > 0) species.seen = true;
    if (announceExtinction && species.seen && species.count === 0 && species.extinctGeneration === null && world.generation > species.bornGeneration) {
      species.extinctGeneration = world.generation;
      addEvent(world, 'extinction', `Исчезла линия «${species.name}»`, `Эта разновидность больше не встречается среди живых организмов. Её ветвь останется в истории мира.`, species.id);
    }
  }
}

function resourceBuckets(nutrients, cellSize = 110) {
  const buckets = new Map();
  for (const n of nutrients) {
    if (n.eaten) continue;
    const key = `${Math.floor(n.x / cellSize)},${Math.floor(n.y / cellSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(n);
  }
  return { buckets, cellSize };
}

function findNearestFood(organism, grid, reach) {
  const cs = grid.cellSize;
  const minX = Math.floor((organism.x - reach) / cs), maxX = Math.floor((organism.x + reach) / cs);
  const minY = Math.floor((organism.y - reach) / cs), maxY = Math.floor((organism.y + reach) / cs);
  const reachSq = reach * reach;
  let best = null, bestSq = reachSq;
  for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
    const list = grid.buckets.get(`${cx},${cy}`);
    if (!list) continue;
    for (const food of list) {
      if (food.eaten) continue;
      const dx = food.x - organism.x, dy = food.y - organism.y, d2 = dx * dx + dy * dy;
      if (d2 < bestSq) { bestSq = d2; best = food; }
    }
  }
  return best;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function mutateGenes(world, parentGenes) {
  const genes = clone(parentGenes);
  const changed = [];
  for (const trait of TRAITS) {
    if (rand(world) < 0.075) {
      const magnitude = rand(world) < 0.06 ? rnd(world, 0.18, 0.32) : rnd(world, 0.04, 0.15);
      const delta = (rand(world) < 0.5 ? -1 : 1) * magnitude;
      genes[trait.key] = clamp(genes[trait.key] + delta);
      changed.push({ key: trait.key, old: parentGenes[trait.key], value: genes[trait.key], delta });
    }
  }
  if (!changed.length && rand(world) < 0.11) {
    const trait = pick(world, TRAITS);
    const delta = (rand(world) < 0.5 ? -1 : 1) * rnd(world, 0.035, 0.09);
    genes[trait.key] = clamp(genes[trait.key] + delta);
    changed.push({ key: trait.key, old: parentGenes[trait.key], value: genes[trait.key], delta });
  }
  return { genes, changed };
}

function childSpecies(world, parent, genes, mutationChanges) {
  const parentSpecies = world.species.find(s => s.id === parent.speciesId);
  if (!parentSpecies || world.species.length >= 50 || mutationChanges.length === 0) return parentSpecies;
  const distance = traitDistance(genes, parentSpecies.signature);
  const dramatic = mutationChanges.some(change => Math.abs(change.delta) > 0.22);
  if (distance < 0.38 || (!dramatic && distance < 0.52)) return parentSpecies;
  const hueOffset = rnd(world, 25, 78) * (rand(world) < 0.5 ? -1 : 1);
  const species = makeSpecies(world, genes, parentSpecies.hue + hueOffset, parentSpecies.id);
  world.discoveries++;
  addEvent(world, 'species', `Новая разновидность: ${species.name}`, `У наследника заметно изменились признаки. Он стал отдельной ветвью, происходящей от «${parentSpecies.name}».`, species.id);
  return species;
}

function tryReproduce(world, parent, births) {
  if (world.organisms.length + births.length >= MAX_POPULATION) return;
  const g = parent.genes;
  const threshold = 0.68 + (1 - g.fertility) * 0.14;
  if (parent.age < 12 || parent.energy < threshold) return;
  if (rand(world) >= 0.003 + g.fertility * 0.012) return;
  const { genes, changed } = mutateGenes(world, g);
  const species = childSpecies(world, parent, genes, changed);
  if (!species) return;
  const angle = parent.angle + rnd(world, -1.5, 1.5);
  const distance = rnd(world, 8, 28);
  const child = createOrganism(world, species, genes,
    parent.x + Math.cos(angle) * distance,
    parent.y + Math.sin(angle) * distance,
    parent.id, false);
  child.energy = 0.43;
  child.angle = angle;
  child.flash = changed.length ? 26 : 16;
  parent.energy -= 0.34 + g.fertility * 0.03;
  parent.offspring++;
  births.push(child);
  if (species.id !== parent.speciesId) addEffect(world, 'species', child.x, child.y, species.hue, 1.25);
  else addEffect(world, changed.length ? 'mutation' : 'birth', child.x, child.y, species.hue, changed.length ? 1.1 : 0.7);
  world.totalBirths++;
  if (changed.length && changed.some(c => Math.abs(c.delta) >= 0.18) && rand(world) < 0.12) {
    const trait = changed.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    const traitMeta = TRAIT_BY_KEY[trait.key];
    addEvent(world, 'mutation', `Заметное изменение: ${traitMeta.label.toLowerCase()}`, `У потомка «${species.name}» изменился признак «${traitMeta.label.toLowerCase()}». Внешний вид и поведение могут постепенно отличаться от родительских.`, species.id);
  }
}

function updateWorldEvent(world) {
  if (world.worldEvent) {
    world.worldEvent.remainingGenerations--;
    if (world.worldEvent.remainingGenerations <= 0) {
      addEvent(world, 'environment', 'Завершилось событие: «' + world.worldEvent.title + '»', 'Условия среды вернулись к обычному режиму. Теперь станет видно, какие линии пережили испытание.');
      world.worldEvent = null;
    }
  }
  if (!world.worldEvent && world.generation >= 3 && rand(world) < 0.22) {
    const eventType = pick(world, WORLD_EVENT_TYPES);
    const minDuration = eventType.duration[0], maxDuration = eventType.duration[1];
    const duration = Math.floor(rnd(world, minDuration, maxDuration + 1));
    world.worldEvent = { id: eventType.id, title: eventType.title, remainingGenerations: duration, currentShift: eventType.id === 'currents' ? rnd(world, -0.34, 0.34) : 0 };
    addEvent(world, 'environment', 'Событие мира: «' + eventType.title + '»', eventType.description + ' Ожидаемая длительность: ' + duration + ' поколения.');
  }
}

function updatePopulationSignals(world, previousRecord) {
  const n = world.organisms.length;
  const prev = previousRecord?.population ?? n;
  if (prev >= 35 && n < prev * 0.72 && world.generation - world.lastDropNoticeGeneration >= 3) {
    let explanation = 'За последний интервал наблюдения число живых существ заметно снизилось.';
    if (world.nutrients.length < 24) explanation = 'Источников пищи осталось мало, поэтому часть организмов не смогла восполнить энергию.';
    else if (world.environment.mode === 'scarcity') explanation = 'В скудной среде организмы тратят больше энергии, а пищи появляется меньше.';
    addEvent(world, 'warning', 'Популяция заметно сократилась', explanation);
    world.lastDropNoticeGeneration = world.generation;
  } else if (prev > 0 && n > prev * 1.32 && n >= 95 && world.generation - world.lastGrowthNoticeGeneration >= 3) {
    addEvent(world, 'growth', 'Популяция быстро растёт', `Численность увеличилась с ${prev} до ${n} существ за один интервал наблюдения. Если пищи станет меньше, рост может замедлиться.`);
    world.lastGrowthNoticeGeneration = world.generation;
  }

  const active = world.species.filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  const dominant = active[0];
  if (dominant && dominant.count >= Math.max(12, n * 0.42) && dominant.id !== world.lastDominantSpeciesId) {
    if (world.lastDominantSpeciesId !== null) addEvent(world, 'species', `Линия «${dominant.name}» стала самой многочисленной`, `Сейчас на неё приходится около ${Math.round(dominant.count / Math.max(1, n) * 100)}% живой популяции.`, dominant.id);
    world.lastDominantSpeciesId = dominant.id;
  }

  // Turn sufficiently large, observed lineage shifts into readable history.
  // This reports a measured change, not an unproven single cause.
  const previousLineages = previousRecord?.speciesPopulations;
  if (previousLineages && world.generation - (world.lastLineageSignalGeneration ?? -10) >= 2) {
    const shifts = world.species.map(species => {
      const before = Math.max(0, Number(previousLineages[species.id]) || 0);
      const after = species.count || 0;
      return { species, before, after, delta: after - before };
    }).filter(change => Math.abs(change.delta) >= Math.max(4, change.before * 0.25));
    shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const shift = shifts[0];
    if (shift && shift.before > 0 && shift.after > 0) {
      const growing = shift.delta > 0;
      const eventName = growing ? 'Линия быстро расширяется' : 'Линия теряет численность';
      const context = world.worldEvent
        ? ` Во время этого интервала действовало событие «${world.worldEvent.title}»; это совпадение по времени, а не доказательство единственной причины.`
        : '';
      addEvent(
        world,
        growing ? 'growth' : 'warning',
        `${eventName}: «${shift.species.name}»`,
        `Численность линии изменилась с ${shift.before} до ${shift.after} организмов за поколение.${context}`,
        shift.species.id
      );
      world.lastLineageSignalGeneration = world.generation;
    }
  }
}

export function stepWorld(world) {
  if (!world || !Array.isArray(world.organisms)) return { births: 0, deaths: 0, meals: 0 };
  world.tick++;
  if (!Array.isArray(world.effects)) world.effects = [];
  const effectNow = Date.now();
  world.effects = world.effects.filter(effect => effect.createdAt && effect.durationMs ? effectNow - effect.createdAt < effect.durationMs : (effect.life ?? 0) > 0);
  // Older same-version snapshots may contain step-based effect timers; let them expire safely.
  for (const effect of world.effects) { if (!effect.createdAt || !effect.durationMs) { effect.life = (effect.life ?? 1) - 1; if (effect.life <= 0) effect.durationMs = 0; } }
  const env = { ...(ENVIRONMENTS[world.environment?.mode] || ENVIRONMENTS.balanced) };
  world.environment = { mode: world.environment?.mode || 'balanced', ...env };
  if (world.worldEvent?.remainingGenerations > 0) {
    if (world.worldEvent.id === 'bloom') {
      env.foodRate *= 1.85;
      env.energyMultiplier *= 0.9;
    } else if (world.worldEvent.id === 'drought') {
      env.foodRate *= 0.38;
      env.energyMultiplier *= 1.22;
    } else if (world.worldEvent.id === 'currents') {
      env.current += world.worldEvent.currentShift || 0;
    }
  }

  const grid = resourceBuckets(world.nutrients);
  const survivors = [];
  const births = [];
  let deaths = 0, meals = 0;

  for (const organism of world.organisms) {
    organism.age++;
    if (!Array.isArray(organism.trail)) organism.trail = [];
    if (world.tick % 3 === 0) { organism.trail.push({ x: organism.x, y: organism.y }); if (organism.trail.length > 7) organism.trail.shift(); }
    organism.flash = Math.max(0, (organism.flash || 0) - 1);
    const g = organism.genes;
    const reach = 35 + g.perception * 105 + g.filaments * 24;
    const food = findNearestFood(organism, grid, reach);
    if (food) {
      const wantedAngle = Math.atan2(food.y - organism.y, food.x - organism.x);
      organism.angle += wrapAngle(wantedAngle - organism.angle) * (0.12 + g.perception * 0.1);
    } else {
      organism.angle += (rand(world) - 0.5) * (0.22 + (1 - g.perception) * 0.3);
    }

    const speed = 0.42 + g.mobility * 1.72 + g.filaments * 0.12;
    organism.x += Math.cos(organism.angle) * speed + env.current;
    organism.y += Math.sin(organism.angle) * speed + Math.sin(world.tick * 0.017 + organism.id) * 0.13;
    if (organism.x < 15 || organism.x > WORLD_WIDTH - 15) {
      organism.x = clamp(organism.x, 15, WORLD_WIDTH - 15);
      organism.angle = Math.PI - organism.angle;
    }
    if (organism.y < 15 || organism.y > WORLD_HEIGHT - 15) {
      organism.y = clamp(organism.y, 15, WORLD_HEIGHT - 15);
      organism.angle = -organism.angle;
    }

    if (food) {
      const dx = food.x - organism.x, dy = food.y - organism.y;
      const touchRadius = 6 + g.filaments * 4 + food.radius;
      if (dx * dx + dy * dy < touchRadius * touchRadius && !food.eaten) {
        food.eaten = true;
        organism.energy = clamp(organism.energy + food.energy, 0, 1.18);
        organism.lastAteTick = world.tick;
        organism.flash = Math.max(organism.flash, 10);
        meals++;
        world.totalMeals++;
        addEffect(world, 'eat', food.x, food.y, food.hue, 0.8);
      }
    }

    const efficiencyFactor = 1 - g.efficiency * 0.39;
    const scarcityFactor = world.environment.mode === 'scarcity' ? (1 - g.shell * 0.29) : 1;
    const drain = (0.0017 + g.mobility * 0.0016 + g.shell * 0.00065 + g.filaments * 0.00042) * efficiencyFactor * env.energyMultiplier * scarcityFactor;
    organism.energy -= drain;
    if (organism.energy <= 0 || organism.age > 780 + g.shell * 850) {
      deaths++;
      organism.alive = false;
      world.lifetimeTicks = (world.lifetimeTicks || 0) + organism.age;
      world.lifespans = (world.lifespans || 0) + 1;
      const species = world.species.find(s => s.id === organism.speciesId);
      addEffect(world, 'death', organism.x, organism.y, species?.hue ?? 185, 1);
      continue;
    }
    tryReproduce(world, organism, births);
    survivors.push(organism);
  }

  world.organisms = survivors.concat(births);
  if (world.organisms.length > MAX_POPULATION) {
    world.organisms.sort((a, b) => b.energy - a.energy);
    world.organisms.length = MAX_POPULATION;
  }
  world.totalDeaths += deaths;
  world.nutrients = world.nutrients.filter(food => !food.eaten);
  const spawnChance = 0.27 * env.foodRate;
  for (let i = 0; i < 3 && world.nutrients.length < MAX_NUTRIENTS; i++) {
    if (rand(world) < spawnChance && world.nutrients.length < MAX_NUTRIENTS) addNutrient(world);
  }
  if (world.nutrients.length < 12 && world.tick - world.lastScarcityNoticeTick > 120 && world.organisms.length > 8) {
    addEvent(world, 'warning', 'Источников пищи почти не осталось', 'Можно добавить пищу вручную или посмотреть, как организмам удаётся пережить нехватку ресурсов.');
    world.lastScarcityNoticeTick = world.tick;
  }

  world.lastPopulationWindow.push(world.organisms.length);
  if (world.lastPopulationWindow.length > TICKS_PER_GENERATION) world.lastPopulationWindow.shift();
  if (world.tick % TICKS_PER_GENERATION === 0) {
    world.generation++;
    updateWorldEvent(world);
    refreshSpeciesCounts(world, true);
    const previous = world.history[world.history.length - 1];
    updatePopulationSignals(world, previous);
    world.history.push(makeHistoryRecord(world));
    if (world.history.length > 320) world.history.shift();
    checkGoals(world);
  } else if (world.tick % 8 === 0) {
    refreshSpeciesCounts(world, false);
  }

  if (world.organisms.length === 0 && world._emptyReported !== true) {
    world._emptyReported = true;
    addEvent(world, 'warning', 'В этом мире больше нет живых организмов', 'Можно изучить историю исчезнувших линий или вернуть исходную экосистему.');
  } else if (world.organisms.length > 0) world._emptyReported = false;

  return { births: births.length, deaths, meals, population: world.organisms.length };
}

export function addFood(world, amount = 35) {
  let added = 0;
  for (let i = 0; i < amount && world.nutrients.length < MAX_NUTRIENTS; i++) {
    addNutrient(world, rnd(world, 150, WORLD_WIDTH - 150), rnd(world, 100, WORLD_HEIGHT - 100));
    added++;
  }
  addEvent(world, 'system', 'В среду добавлена пища', `Появилось ${added} новых источников энергии. Организмы поблизости могут быстрее восстановить силы.`);
  return added;
}

export function addFoodPatch(world, x, y, amount = 28) {
  let added = 0;
  const radius = 95;
  for (let i = 0; i < amount && world.nutrients.length < MAX_NUTRIENTS; i++) {
    const angle = rnd(world, 0, Math.PI * 2);
    const distance = Math.sqrt(rand(world)) * radius;
    addNutrient(world, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
    added++;
  }
  addEvent(world, 'system', 'Создан локальный источник пищи', `В одной области появилось ${added} источников энергии. Организмы, оказавшиеся рядом, смогут быстрее восстановить силы.`);
  addEffect(world, 'species', x, y, 45, 1.4);
  return added;
}

export function reviveWorld(world) {
  const genes = { mobility: 0.58, perception: 0.67, efficiency: 0.72, fertility: 0.55, shell: 0.48, filaments: 0.56 };
  const species = makeSpecies(world, genes, rnd(world, 155, 215), null);
  for (let i = 0; i < 30; i++) {
    const angle = rnd(world, 0, Math.PI * 2), radius = Math.sqrt(rand(world)) * 170;
    const organism = createOrganism(world, species, jitterGenes(world, genes, 0.09), WORLD_WIDTH / 2 + Math.cos(angle) * radius, WORLD_HEIGHT / 2 + Math.sin(angle) * radius, null, true);
    organism.age = 0;
    organism.energy = rnd(world, 0.78, 1);
    world.organisms.push(organism);
  }
  for (let i = 0; i < 70 && world.nutrients.length < MAX_NUTRIENTS; i++) {
    const angle = rnd(world, 0, Math.PI * 2), radius = Math.sqrt(rand(world)) * 210;
    addNutrient(world, WORLD_WIDTH / 2 + Math.cos(angle) * radius, WORLD_HEIGHT / 2 + Math.sin(angle) * radius);
  }
  world._emptyReported = false;
  refreshSpeciesCounts(world, false);
  addEvent(world, 'system', 'В мир внесена новая колония', 'Ты вернул возможность наблюдать за жизнью. Прежние вымершие ветви и история событий сохранены.');
  if (world.history.length) world.history[world.history.length - 1] = makeHistoryRecord(world);
  else world.history.push(makeHistoryRecord(world));
  return world;
}

export function cycleEnvironment(world) {
  const modes = ['balanced', 'abundance', 'scarcity'];
  const current = modes.indexOf(world.environment?.mode || 'balanced');
  const mode = modes[(current + 1) % modes.length];
  world.environment = { mode, ...ENVIRONMENTS[mode] };
  const descriptions = {
    balanced: 'Условия вернулись к балансу: пища и затраты энергии умеренные.',
    abundance: 'Пища появляется чаще. Подвижные организмы могут быстрее находить её, но высокая подвижность по-прежнему требует энергии.',
    scarcity: 'Пища появляется реже, а затраты энергии растут. Экономные организмы и обладатели защитной оболочки получают преимущество.'
  };
  addEvent(world, 'environment', `Среда изменилась: ${world.environment.label.toLowerCase()}`, descriptions[mode]);
  return world.environment;
}

function checkGoals(world) {
  const goals = [
    { id: 'manySpecies', title: 'Первое разнообразие', description: 'Одновременно существуют 5 разновидностей.', done: world.species.filter(s => s.count > 0).length >= 5 },
    { id: 'longLife', title: 'Долгая история', description: 'Мир прожил 100 поколений.', done: world.generation >= 100 },
    { id: 'largePopulation', title: 'Большое сообщество', description: 'В мире живут 150 организмов.', done: world.organisms.length >= 150 },
    { id: 'lineage', title: 'Ветвление', description: 'Появилось 8 эволюционных линий.', done: world.species.length >= 8 },
    { id: 'recovery', title: 'Возвращение к жизни', description: 'Популяция выросла до 70 после спада ниже 35.', done: world.goals?.recoveryArmed && world.organisms.length >= 70 }
  ];
  if (world.organisms.length < 35) world.goals.recoveryArmed = true;
  for (const goal of goals) {
    if (goal.done && !world.goals[goal.id]) {
      world.goals[goal.id] = true;
      addEvent(world, 'discovery', `Цель выполнена: ${goal.title}`, goal.description);
    }
  }
}

export function selectEnvironment(world, mode) {
  if (!ENVIRONMENTS[mode]) return world.environment;
  world.environment = { mode, ...ENVIRONMENTS[mode] };
  return world.environment;
}

export function restoreWorld(value) {
  if (!value || value.version !== SAVE_VERSION || !Array.isArray(value.organisms) || !Array.isArray(value.nutrients) || !Array.isArray(value.species)) {
    throw new Error('Файл не является совместимым сохранением LIFE ENGINE.');
  }
  const world = clone(value);
  world.organisms = world.organisms.slice(0, MAX_POPULATION).filter(o => o && o.genes && Number.isFinite(o.x) && Number.isFinite(o.y));
  world.nutrients = world.nutrients.slice(0, MAX_NUTRIENTS).filter(n => n && Number.isFinite(n.x) && Number.isFinite(n.y));
  world.events = Array.isArray(world.events) ? world.events.slice(0, 160) : [];
  world.effects = Array.isArray(world.effects) ? world.effects.slice(-120) : [];
  for (const effect of world.effects) { if (!Number.isFinite(effect.createdAt) || !Number.isFinite(effect.durationMs)) { effect.createdAt = Date.now(); effect.durationMs = 500; } }
  world.history = Array.isArray(world.history) ? world.history.slice(-320) : [];
  world.goals = world.goals && typeof world.goals === 'object' ? world.goals : {};
  world.worldEvent = world.worldEvent && typeof world.worldEvent === 'object' ? world.worldEvent : null;
  if (world.worldEvent && (!Number.isInteger(world.worldEvent.remainingGenerations) || world.worldEvent.remainingGenerations <= 0)) world.worldEvent = null;
  world.lastPopulationWindow = Array.isArray(world.lastPopulationWindow) ? world.lastPopulationWindow.slice(-TICKS_PER_GENERATION) : [];
  const environmentMode = ENVIRONMENTS[world.environment?.mode] ? world.environment.mode : 'balanced';
  world.environment = { mode: environmentMode, ...ENVIRONMENTS[environmentMode] };
  world.tick = Math.max(0, Number(world.tick) || 0);
  world.generation = Math.max(0, Number(world.generation) || 0);
  world.seed = (Number(world.seed) >>> 0) || 1;
  world.rngState = (Number(world.rngState) >>> 0) || world.seed;
  world.discoveries = Math.max(0, Number(world.discoveries) || 0);
  world.totalBirths = Math.max(0, Number(world.totalBirths) || 0);
  world.totalDeaths = Math.max(0, Number(world.totalDeaths) || 0);
  world.totalMeals = Math.max(0, Number(world.totalMeals) || 0);
  world.lifetimeTicks = Math.max(0, Number(world.lifetimeTicks) || 0);
  world.lifespans = Math.max(0, Number(world.lifespans) || 0);
  world.nextOrganismId = Math.max(Number(world.nextOrganismId) || 1, ...world.organisms.map(o => (Number(o.id) || 0) + 1));
  world.nextSpeciesId = Math.max(Number(world.nextSpeciesId) || 1, ...world.species.map(s => (Number(s.id) || 0) + 1));
  world.nextNutrientId = Math.max(Number(world.nextNutrientId) || 1, ...world.nutrients.map(n => (Number(n.id) || 0) + 1));
  world.nextEventId = Math.max(Number(world.nextEventId) || 1, ...world.events.map(e => (Number(e.id) || 0) + 1));
  world.lastScarcityNoticeTick = Number(world.lastScarcityNoticeTick ?? -1000);
  world.lastDropNoticeGeneration = Number(world.lastDropNoticeGeneration ?? -1000);
  world.lastGrowthNoticeGeneration = Number(world.lastGrowthNoticeGeneration ?? -1000);
  world.lastDominantSpeciesId = world.lastDominantSpeciesId ?? null;
  for (const species of world.species) {
    species.extinctGeneration = species.extinctGeneration ?? null;
    species.seen = Boolean(species.seen);
    species.count = Math.max(0, Number(species.count) || 0);
    species.peakCount = Math.max(0, Number(species.peakCount) || 0);
    if (!species.signature) species.signature = clone(world.organisms.find(o => o.speciesId === species.id)?.genes || Object.fromEntries(TRAITS.map(t => [t.key, .5])));
  }
  world.selectedId = null;
  world.followSelected = false;
  for (const o of world.organisms) {
    o.energy = clamp(Number(o.energy) || 0, 0, 1.2);
    o.age = Math.max(0, Number(o.age) || 0);
    for (const trait of TRAITS) o.genes[trait.key] = clamp(Number(o.genes[trait.key] ?? 0.5));
    if (!Number.isFinite(o.angle)) o.angle = 0;
    if (!Number.isFinite(o.offspring)) o.offspring = 0;
    if (!Array.isArray(o.trail)) o.trail = [];
  }
  refreshSpeciesCounts(world, false);
  return world;
}

export function organismDescription(organism) {
  if (!organism) return '';
  const sorted = TRAITS.map(t => ({ ...t, value: organism.genes[t.key] })).sort((a, b) => b.value - a.value);
  const mainTraits = sorted.filter(t => t.value >= 0.68).slice(0, 2).map(t => t.high);
  if (!mainTraits.length) return 'У этой особи нет резко выраженного преимущества: её успех зависит от того, как сочетаются признаки и какие условия сложатся в среде.';
  if (mainTraits.length === 1) return `Особенность: ${mainTraits[0]}. Это может помогать в некоторых условиях, но не гарантирует выживание.`;
  return `Особенности: ${mainTraits[0]} и ${mainTraits[1]}. Такое сочетание помогает в одних условиях, но имеет свою цену.`;
}

export function formatAgeTicks(ticks) {
  if (ticks < 30) return `${ticks} шаг.`;
  const generations = Math.floor(ticks / TICKS_PER_GENERATION);
  return `${generations} пок.`;
}

export function environmentLabels() {
  return Object.entries(ENVIRONMENTS).map(([id, env]) => ({ id, ...env }));
}

export function getWorldCounts(world) {
  const active = world.species.filter(s => s.count > 0).length;
  return { population: world.organisms.length, activeSpecies: active, discoveries: world.discoveries, generation: world.generation, nutrients: world.nutrients.length };
}
