import {
  createWorld, stepWorld, addFood, cycleEnvironment, restoreWorld,
  recordWorldEvent, getWorldCounts, organismDescription, formatAgeTicks,
  WORLD_WIDTH, WORLD_HEIGHT, TICKS_PER_GENERATION, TRAITS, addFoodPatch, reviveWorld
} from './simulation.js';
import {
  drawWorld, hitTestOrganism, drawPopulationChart, drawSpeciesChart,
  drawLineageTree, drawTraitTrendChart, drawBirthDeathChart, drawTraitBars
} from './renderer.js';
import { saveWorld, loadWorld, listWorldSaves, formatSavedAt } from './persistence.js';

const $ = id => document.getElementById(id);
const worldCanvas = $('worldCanvas');
let world = createWorld();
let running = false;
let speed = 1;
let lastUiUpdate = 0;
let lastChartUpdate = 0;
let lastEventKey = null;
let lastFullHistoryKey = null;
let lastSelectionId = null;
let lastWorldSnapshotKey = null;
let toastTimer = null;
let saveQueue = Promise.resolve();
let isSaving = false;
let lastToastEventId = null;
let animationHandle = 0;

const EVENT_ICONS = {
  system: '◌', species: '✳', mutation: '✧', warning: '!', growth: '↗',
  extinction: '×', environment: '◌', discovery: '☆'
};
const EVENT_COLORS = { species: 'species', warning: 'warning', extinction: 'warning', mutation: 'mutation', discovery: 'discovery', growth: 'growth' };
const SPEED_LABELS = { 1: 'Обычная', 5: 'Быстрая', 10: 'Очень быстро', 50: 'Максимум' };

function toast(message, error = false) {
  const node = $('toast');
  node.textContent = message;
  node.style.borderColor = error ? 'rgba(255,133,153,.5)' : '';
  node.style.color = error ? '#ffdce1' : '';
  node.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3100);
}

function setSaveStatus(message, error = false) {
  const status = $('saveStatus');
  status.classList.toggle('error', error);
  status.replaceChildren();
  const dot = document.createElement('span'); dot.className = 'save-status-dot';
  const text = document.createElement('span'); text.textContent = message;
  status.append(dot, text);
}

function getCurrentSelected() {
  return world.organisms.find(o => o.id === world.selectedId) || null;
}
function findSpecies(id) { return world.species.find(s => s.id === id) || null; }

function setRunning(value, options = {}) {
  running = Boolean(value) && world.organisms.length > 0;
  world.wasRunning = running;
  $('startBtn').innerHTML = running ? 'Ⅱ <span>Приостановить</span>' : (world.tick ? '▶ <span>Продолжить жизнь</span>' : '▶ <span>Запустить жизнь</span>');
  $('firstStartBtn').textContent = running ? 'Ⅱ Приостановить' : '▶ Запустить жизнь';
  $('pauseBtn').textContent = running ? 'Ⅱ' : '▶';
  $('pauseBtn').title = running ? 'Поставить на паузу' : 'Продолжить симуляцию';
  $('runStatus').textContent = running ? 'МИР РАЗВИВАЕТСЯ' : 'МИР НА ПАУЗЕ';
  $('stageState').textContent = running ? 'ЖИЗНЬ ПРОДОЛЖАЕТСЯ' : (world.tick ? 'НАБЛЮДЕНИЕ ПРИОСТАНОВЛЕНО' : 'МИР ОЖИДАЕТ');
  $('statusDot').classList.toggle('active', running);
  $('liveSymbol').classList.toggle('active', running);
  $('firstStartHint').classList.toggle('hidden', running || world.tick > 0);
  if (!options.skipSave && !running) queueMicrotask(() => saveAutosave(true));
  updateControlButtons();
}

function updateControlButtons() {
  $('stepBtn').disabled = world.organisms.length === 0;
  $('addFoodBtn').disabled = world.nutrients.length >= 230;
  $('followSelectedBtn').disabled = !getCurrentSelected();
}

function updateEnvironmentUI() {
  const env = world.environment || { label: 'Сбалансированная среда', caption: 'Умеренно появляются источники пищи', mode: 'balanced' };
  $('environmentName').textContent = env.label || 'Сбалансированная среда';
  $('environmentCaption').textContent = env.caption || 'Условия среды';
  const short = { balanced: 'Сейчас: баланс', abundance: 'Сейчас: изобилие', scarcity: 'Сейчас: нехватка пищи' };
  $('climateActionCaption').textContent = short[env.mode] || 'Сейчас: баланс';
}

function updateMetrics() {
  const counts = getWorldCounts(world);
  $('populationValue').textContent = counts.population.toLocaleString('ru-RU');
  $('speciesValue').textContent = counts.activeSpecies.toLocaleString('ru-RU');
  $('generationValue').textContent = counts.generation.toLocaleString('ru-RU');
  $('discoveryValue').textContent = (world.discoveries || 0).toLocaleString('ru-RU');
  $('worldAge').textContent = `${world.generation} поколений`;
  const latest = world.history[world.history.length - 1];
  const prior = world.history[world.history.length - 2];
  if (prior && latest) {
    const delta = latest.population - prior.population;
    $('populationTrend').textContent = delta > 0 ? `Рост на ${delta} за интервал` : delta < 0 ? `Снижение на ${Math.abs(delta)} за интервал` : 'Численность стабильна';
    const speciesDelta = latest.activeSpecies - prior.activeSpecies;
    $('speciesTrend').textContent = speciesDelta > 0 ? `Появилось линий: +${speciesDelta}` : speciesDelta < 0 ? `Линий стало меньше на ${Math.abs(speciesDelta)}` : 'Число линий не изменилось';
  } else {
    $('populationTrend').textContent = 'Начальная популяция';
    $('speciesTrend').textContent = 'Три исходные линии';
  }
  updateEnvironmentUI();
  $('firstStartHint').classList.toggle('hidden', running || world.tick > 0);
  $('emptyWorldHint').classList.toggle('hidden', world.organisms.length > 0);
  updateControlButtons();
}

function eventTime(event) {
  return `ПОК. ${String(event.generation ?? 0).padStart(2, '0')}`;
}
function buildEventElement(event, compact = false) {
  const item = document.createElement('article');
  item.className = 'event-item';
  item.dataset.type = EVENT_COLORS[event.type] || event.type || 'system';
  const mark = document.createElement('span'); mark.className = 'event-mark'; mark.textContent = EVENT_ICONS[event.type] || '•';
  const copy = document.createElement('div'); copy.className = 'event-copy';
  const title = document.createElement('b'); title.textContent = event.title || 'Событие мира';
  const description = document.createElement('p'); description.textContent = event.description || '';
  copy.append(title, description);
  const time = document.createElement('small'); time.className = 'event-time'; time.textContent = eventTime(event);
  item.append(mark, copy, time);
  if (!compact && event.speciesId) {
    item.style.cursor = 'pointer'; item.title = 'Перейти к этой разновидности';
    item.addEventListener('click', () => selectSpecies(event.speciesId));
  }
  return item;
}
function updateEventFeed(force = false) {
  const key = world.events[0]?.id ?? 'none';
  if (!force && key === lastEventKey) return;
  lastEventKey = key;
  const feed = $('eventFeed'); feed.replaceChildren();
  if (!world.events.length) {
    const empty = document.createElement('div'); empty.className = 'event-empty';
    const glyph = document.createElement('span'); glyph.textContent = '✧';
    const text = document.createElement('div'); const b = document.createElement('b'); b.textContent = 'Мир пока тихий';
    const p = document.createElement('p'); p.textContent = 'После запуска здесь появятся первые наблюдения.'; text.append(b, p); empty.append(glyph, text); feed.append(empty); return;
  }
  world.events.slice(0, 4).forEach(event => feed.append(buildEventElement(event)));
  if (world.events[0] && world.events[0].id !== lastToastEventId && lastToastEventId !== null) {
    const top = world.events[0];
    if (['species', 'mutation', 'warning', 'extinction', 'discovery'].includes(top.type)) toast(top.title);
  }
  lastToastEventId = world.events[0]?.id ?? null;
}
function updateFullHistory(force = false) {
  if (!$('researchDetails').open) return;
  const key = world.events[0]?.id ?? 'none';
  if (!force && key === lastFullHistoryKey) return;
  lastFullHistoryKey = key;
  const node = $('fullEventHistory'); node.replaceChildren();
  if (!world.events.length) { node.textContent = 'Событий пока нет.'; return; }
  world.events.slice(0, 80).forEach(event => node.append(buildEventElement(event)));
}

function updateSelection(force = false) {
  const organism = getCurrentSelected();
  const id = organism?.id ?? null;
  if (!force && id === lastSelectionId) {
    if (organism) {
      $('selectedAge').textContent = formatAgeTicks(organism.age);
      $('selectedEnergy').textContent = `${Math.round(Math.max(0, organism.energy) * 100)}%`;
      $('selectedOffspring').textContent = organism.offspring.toLocaleString('ru-RU');
      const species = findSpecies(organism.speciesId);
      $('selectedSpeciesCount').textContent = `${species?.count ?? 0} живых`;
    }
    return;
  }
  lastSelectionId = id;
  $('selectionEmpty').classList.toggle('hidden', Boolean(organism));
  $('selectionContent').classList.toggle('hidden', !organism);
  if (!organism) {
    $('selectedName').textContent = 'Пока никто не выбран';
    $('selectedBadge').style.color = ''; $('selectedBadge').style.background = ''; $('selectedBadge').style.borderColor = '';
    $('selectedBadge').textContent = '✳';
    $('followSelectedBtn').textContent = '◎ Подсветить в мире';
    $('traitBars').replaceChildren();
    return;
  }
  const species = findSpecies(organism.speciesId);
  $('selectedName').textContent = `Организм #${organism.id}`;
  $('selectedBadge').textContent = '✳';
  $('selectedBadge').style.color = `hsl(${species?.hue ?? 185},85%,75%)`;
  $('selectedBadge').style.background = `hsla(${species?.hue ?? 185},85%,60%,.09)`;
  $('selectedBadge').style.borderColor = `hsla(${species?.hue ?? 185},85%,70%,.22)`;
  $('selectedSpeciesSwatch').style.background = `hsl(${species?.hue ?? 185},85%,68%)`;
  $('selectedSpeciesSwatch').style.color = `hsl(${species?.hue ?? 185},85%,68%)`;
  $('selectedSpecies').textContent = species?.name || 'Неизвестная линия';
  $('selectedSpeciesCount').textContent = `${species?.count ?? 0} живых`;
  $('selectedAge').textContent = formatAgeTicks(organism.age);
  $('selectedEnergy').textContent = `${Math.round(Math.max(0, organism.energy) * 100)}%`;
  $('selectedOffspring').textContent = organism.offspring.toLocaleString('ru-RU');
  $('selectedDescription').textContent = organismDescription(organism);
  $('followSelectedBtn').textContent = world.followSelected ? '◉ Подсветка включена' : '◎ Подсветить в мире';
  drawTraitBars($('traitBars'), organism);
}

function renderLineageList() {
  if (!$('researchDetails').open) return;
  const node = $('lineageList');
  const key = `${world.species.length}-${world.generation}-${world.selectedId}`;
  if (node.dataset.key === key) return;
  node.dataset.key = key;
  node.replaceChildren();
  for (const species of world.species.slice(-36).slice().reverse()) {
    const chip = document.createElement('button'); chip.className = `lineage-chip${species.id === findSpecies(getCurrentSelected()?.speciesId)?.id ? ' selected' : ''}`;
    const dot = document.createElement('i'); dot.style.background = `hsl(${species.hue},85%,68%)`;
    const name = document.createElement('span'); name.textContent = species.name;
    const count = document.createElement('small'); count.textContent = species.count > 0 ? `${species.count}` : 'вымер';
    chip.append(dot, name, count); chip.addEventListener('click', () => selectSpecies(species.id)); node.append(chip);
  }
}

function selectSpecies(speciesId) {
  const species = findSpecies(Number(speciesId));
  if (!species) return;
  const member = world.organisms.filter(o => o.speciesId === species.id).sort((a, b) => b.energy - a.energy)[0];
  if (member) {
    world.selectedId = member.id; world.followSelected = true;
    updateSelection(true);
    toast(`Выбрана разновидность «${species.name}». Организм подсвечен в мире.`);
  } else {
    toast(`«${species.name}» больше не встречается среди живых, но её история сохранена.`);
  }
  if ($('researchDetails').open) {
    drawLineageTree($('lineageCanvas'), world, species.id);
    renderLineageList();
  }
  drawWorld(worldCanvas, world);
}

function updateGoals() {
  const activeSpecies = world.species.filter(s => s.count > 0).length;
  const goals = [
    { id: 'manySpecies', title: 'Первое разнообразие', description: 'Пусть одновременно живут 5 разновидностей.', progress: Math.min(1, activeSpecies / 5), done: activeSpecies >= 5, value: `${activeSpecies}/5` },
    { id: 'longLife', title: 'Долгая история', description: 'Дождись 100-го поколения.', progress: Math.min(1, world.generation / 100), done: world.generation >= 100, value: `${Math.min(100, world.generation)}/100` },
    { id: 'largePopulation', title: 'Большое сообщество', description: 'Добейся численности 150 существ.', progress: Math.min(1, world.organisms.length / 150), done: world.organisms.length >= 150, value: `${Math.min(150, world.organisms.length)}/150` },
    { id: 'lineage', title: 'Ветвление', description: 'Дождись появления 8 эволюционных линий.', progress: Math.min(1, world.species.length / 8), done: world.species.length >= 8, value: `${Math.min(8, world.species.length)}/8` },
    { id: 'recovery', title: 'Возвращение к жизни', description: 'После спада ниже 35 организмов вырасти до 70.', progress: world.goals?.recoveryArmed ? Math.min(1, world.organisms.length / 70) : 0, done: Boolean(world.goals?.recovery) || (world.goals?.recoveryArmed && world.organisms.length >= 70), value: world.goals?.recoveryArmed ? `${Math.min(70, world.organisms.length)}/70` : 'ещё впереди' }
  ];
  const node = $('goalList');
  const key = goals.map(g => `${g.id}:${g.done}:${Math.round(g.progress * 100)}`).join('|');
  if (node.dataset.key === key) return;
  node.dataset.key = key; node.replaceChildren();
  for (const goal of goals) {
    const done = goal.done || world.goals?.[goal.id];
    const item = document.createElement('div'); item.className = `goal-item${done ? ' done' : ''}`;
    const check = document.createElement('span'); check.className = 'goal-check'; check.textContent = done ? '✓' : '·';
    const text = document.createElement('div'); const b = document.createElement('b'); b.textContent = goal.title; const p = document.createElement('p'); p.textContent = goal.description; text.append(b, p);
    const progress = document.createElement('small'); progress.textContent = done ? 'готово' : goal.value;
    item.append(check, text, progress); node.append(item);
  }
}

function updateResearchCharts(force = false) {
  if (!$('researchDetails').open) return;
  const now = performance.now();
  if (!force && now - lastChartUpdate < 900) return;
  lastChartUpdate = now;
  drawPopulationChart($('populationChart'), world.history);
  drawSpeciesChart($('speciesChart'), world.history);
  drawTraitTrendChart($('traitsChart'), world.history);
  drawBirthDeathChart($('birthDeathChart'), world.history);
  drawLineageTree($('lineageCanvas'), world, findSpecies(getCurrentSelected()?.speciesId)?.id ?? null);
  renderLineageList();
  const latest = world.history[world.history.length - 1] || {};
  const meanAge = latest.averageAge || 0;
  $('avgLifetime').textContent = world.lifespans ? `${Math.max(0, Math.round((world.lifetimeTicks / world.lifespans) / TICKS_PER_GENERATION))} покол.` : 'Пока нет данных';
  $('avgAgeValue').textContent = meanAge ? formatAgeTicks(Math.round(meanAge)) : '—';
  $('totalBirthsValue').textContent = (world.totalBirths || 0).toLocaleString('ru-RU');
  $('nutrientsValue').textContent = (world.nutrients.length || 0).toLocaleString('ru-RU');
  updateFullHistory(force);
}

function updateUI(force = false) {
  updateMetrics();
  updateEventFeed(force);
  updateSelection(force);
  updateGoals();
  updateResearchCharts(force);
  if (world.organisms.length === 0 && running) setRunning(false, { skipSave: true });
}

function renderLoop(now) {
  drawWorld(worldCanvas, world, now / 1000);
  if (now - lastUiUpdate > 240) {
    lastUiUpdate = now;
    updateUI();
  }
  animationHandle = requestAnimationFrame(renderLoop);
}

function simulateBatch() {
  if (!running) return;
  for (let i = 0; i < speed; i++) {
    stepWorld(world);
    if (world.organisms.length === 0) break;
  }
}

function resetWorld(ask = true) {
  if (ask && !confirm('Создать новую экосистему? Текущая останется в сохранениях только если ты уже сохранил её отдельно.')) return;
  setRunning(false, { skipSave: true });
  world = createWorld();
  world.offlineProgress = $('offlineToggle').checked;
  lastEventKey = null; lastFullHistoryKey = null; lastSelectionId = null; lastToastEventId = world.events[0]?.id ?? null;
  $('firstStartHint').classList.remove('hidden'); $('emptyWorldHint').classList.add('hidden');
  updateUI(true);
  drawWorld(worldCanvas, world);
  queueMicrotask(() => saveAutosave(true));
  toast('Создан новый живой мир. Нажми «Запустить жизнь».');
}

function doStep() {
  if (world.organisms.length === 0) { toast('В мире нет живых организмов. Создай новую экосистему.'); return; }
  const wasRunning = running;
  if (wasRunning) setRunning(false, { skipSave: true });
  const stats = stepWorld(world);
  updateUI(true); drawWorld(worldCanvas, world);
  if (stats.births) toast(`Появилось потомство: ${stats.births}`);
  else if (stats.meals) toast(`Организмы нашли пищу: ${stats.meals}`);
  else toast('Мир сделал один шаг.');
  saveAutosave(true);
}

function slugifyName(name) {
  return name.toLocaleLowerCase('ru-RU').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'мой-мир';
}
function queueSave(key, snapshot, label) {
  saveQueue = saveQueue.catch(() => {}).then(() => saveWorld(key, snapshot, label));
  return saveQueue;
}

async function saveAutosave(quiet = false) {
  if (isSaving) return;
  isSaving = true;
  try {
    world.wasRunning = running;
    world.offlineProgress = $('offlineToggle').checked;
    world.lastSavedAt = Date.now();
    await queueSave('autosave', world, 'Автосохранение');
    setSaveStatus(`Автосохранение · ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
    if (!quiet) toast('Мир сохранён в этом браузере.');
  } catch (error) {
    setSaveStatus('Сохранить не удалось — проверь место в браузере', true);
    if (!quiet) toast(`Не удалось сохранить мир: ${error.message || error}`, true);
  } finally {
    isSaving = false;
  }
}

async function saveNamedSlot() {
  const label = $('saveName').value.trim() || 'Мой живой мир';
  const key = `slot:${slugifyName(label)}`;
  world.wasRunning = running;
  world.offlineProgress = $('offlineToggle').checked;
  world.lastSavedAt = Date.now();
  try {
    await queueSave(key, world, label);
    await saveAutosave(true);
    await refreshSaveSlots(key);
    setSaveStatus(`Сохранён слот «${label}»`);
    toast(`Мир «${label}» сохранён. Его можно загрузить позже.`);
  } catch (error) {
    setSaveStatus('Не удалось сохранить слот', true);
    toast(`Ошибка сохранения: ${error.message || error}`, true);
  }
}

async function refreshSaveSlots(selectedKey = null) {
  const select = $('saveSlots');
  const oldValue = selectedKey || select.value || 'autosave';
  const records = await listWorldSaves();
  select.replaceChildren();
  const auto = document.createElement('option'); auto.value = 'autosave'; auto.textContent = 'Автосохранение'; select.append(auto);
  for (const record of records.filter(r => r.key !== 'autosave')) {
    const opt = document.createElement('option'); opt.value = record.key;
    opt.textContent = `${record.label} · пок. ${record.generation} · ${record.population} живых · ${formatSavedAt(record.savedAt)}`;
    select.append(opt);
  }
  select.value = [...select.options].some(o => o.value === oldValue) ? oldValue : 'autosave';
}

async function applyOfflineProgress(loadedWorld, savedAt) {
  const enabled = $('offlineToggle').checked && loadedWorld.offlineProgress !== false && loadedWorld.wasRunning;
  if (!enabled || !savedAt) return 0;
  const elapsedMs = Math.max(0, Date.now() - savedAt);
  const steps = Math.min(240, Math.floor(Math.max(0, elapsedMs - 10000) / 30000));
  for (let i = 0; i < steps; i++) {
    stepWorld(loadedWorld);
    if (!loadedWorld.organisms.length) break;
  }
  if (steps > 0) recordWorldEvent(loadedWorld, 'system', 'Мир развивался в твоё отсутствие', `Рассчитано ${steps} шагов симуляции. Офлайн-прогресс ограничен, чтобы долгое отсутствие не приводило к неограниченным вычислениям.`);
  return steps;
}

async function loadSave(key = $('saveSlots').value) {
  const record = await loadWorld(key);
  if (!record?.world) { toast('Такого сохранения пока нет. Сначала сохрани мир.', true); return; }
  if (world.tick > 0 && !confirm('Загрузить сохранение? Текущий мир будет заменён, если он не сохранён отдельно.')) return;
  setRunning(false, { skipSave: true });
  try {
    let loaded = restoreWorld(record.world);
    const steps = await applyOfflineProgress(loaded, record.savedAt || loaded.lastSavedAt);
    loaded.wasRunning = false;
    loaded.offlineProgress = $('offlineToggle').checked;
    world = loaded;
    lastEventKey = null; lastFullHistoryKey = null; lastSelectionId = null;
    lastToastEventId = world.events[0]?.id ?? null;
    updateUI(true); drawWorld(worldCanvas, world);
    $('firstStartHint').classList.toggle('hidden', world.tick > 0);
    $('emptyWorldHint').classList.toggle('hidden', world.organisms.length > 0);
    toast(steps ? `Сохранение загружено. Рассчитано ${steps} шагов за время отсутствия.` : 'Сохранение загружено.');
    await saveAutosave(true);
  } catch (error) {
    toast(`Не удалось загрузить мир: ${error.message || error}`, true);
  }
}

function exportCurrentWorld() {
  try {
    const payload = {
      application: 'LIFE ENGINE', formatVersion: 1,
      exportedAt: new Date().toISOString(),
      note: 'Локальное сохранение вымышленной модели искусственной жизни.',
      world: JSON.parse(JSON.stringify(world))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `life-engine-world-${world.generation}gen.json`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Файл мира подготовлен. Храни его как резервную копию.');
  } catch (error) { toast(`Экспорт не удался: ${error.message || error}`, true); }
}

async function importWorldFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const rawWorld = data?.world || data;
    const imported = restoreWorld(rawWorld);
    if (world.tick > 0 && !confirm('Импортировать этот мир? Текущая симуляция будет заменена.')) return;
    setRunning(false, { skipSave: true });
    world = imported;
    world.offlineProgress = $('offlineToggle').checked;
    world.wasRunning = false;
    lastEventKey = null; lastFullHistoryKey = null; lastSelectionId = null; lastToastEventId = world.events[0]?.id ?? null;
    updateUI(true); drawWorld(worldCanvas, world);
    await saveAutosave(true); await refreshSaveSlots();
    toast('Мир импортирован и сохранён в автосохранении.');
  } catch (error) {
    toast(`Импорт не удался: ${error.message || 'проверь файл'}`, true);
  } finally { $('importFile').value = ''; }
}

async function bootstrap() {
  await refreshSaveSlots();
  try {
    const record = await loadWorld('autosave');
    if (record?.world) {
      const loaded = restoreWorld(record.world);
      const steps = await applyOfflineProgress(loaded, record.savedAt || loaded.lastSavedAt);
      loaded.wasRunning = false;
      world = loaded;
      $('offlineToggle').checked = loaded.offlineProgress !== false;
      lastEventKey = null; lastFullHistoryKey = null; lastSelectionId = null; lastToastEventId = world.events[0]?.id ?? null;
      updateUI(true);
      if (steps) recordWorldEvent(world, 'system', 'Мир развивался в твоё отсутствие', `Рассчитано ${steps} шагов симуляции. Прогресс ограничен по времени.`);
      await saveAutosave(true);
    }
  } catch (error) {
    setSaveStatus('Автосохранение не удалось прочитать; создан новый мир', true);
    console.warn('LIFE ENGINE: failed to restore autosave', error);
  }
  updateUI(true); drawWorld(worldCanvas, world);
}

// Main controls
$('startBtn').addEventListener('click', () => setRunning(!running));
$('firstStartBtn').addEventListener('click', () => setRunning(!running));
$('pauseBtn').addEventListener('click', () => setRunning(!running));
$('stepBtn').addEventListener('click', doStep);
$('resetBtn').addEventListener('click', () => resetWorld(true));
$('reviveBtn').addEventListener('click', () => { setRunning(false, { skipSave: true }); reviveWorld(world); world.selectedId = null; world.followSelected = false; updateUI(true); drawWorld(worldCanvas, world); saveAutosave(true); toast('Новая колония появилась. История прежнего мира сохранена.'); });
$('focusAllBtn').addEventListener('click', () => { world.selectedId = null; world.followSelected = false; updateSelection(true); drawWorld(worldCanvas, world); toast('Показан весь мир.'); });
$('addFoodBtn').addEventListener('click', () => { const added = addFood(world, 35); updateUI(true); toast(`Добавлено ${added} источников пищи.`); });
$('climateBtn').addEventListener('click', () => { cycleEnvironment(world); updateEnvironmentUI(); updateEventFeed(true); updateUI(true); toast(`Новые условия: ${world.environment.label.toLowerCase()}.`); });
$('saveNowBtn').addEventListener('click', () => saveAutosave(false));
$('saveSlotBtn').addEventListener('click', saveNamedSlot);
$('loadSlotBtn').addEventListener('click', () => loadSave());
$('exportBtn').addEventListener('click', exportCurrentWorld);
$('importFile').addEventListener('change', event => importWorldFile(event.target.files?.[0]));
$('offlineToggle').addEventListener('change', () => { world.offlineProgress = $('offlineToggle').checked; saveAutosave(true); });
$('followSelectedBtn').addEventListener('click', () => {
  const organism = getCurrentSelected(); if (!organism) return;
  world.followSelected = !world.followSelected;
  $('followSelectedBtn').textContent = world.followSelected ? '◉ Подсветка включена' : '◎ Подсветить в мире';
  drawWorld(worldCanvas, world);
  toast(world.followSelected ? 'Организм будет выделен контуром.' : 'Дополнительная подсветка отключена.');
});
$('showAllEventsBtn').addEventListener('click', () => {
  $('researchDetails').open = true;
  $('fullEventHistory').scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateResearchCharts(true);
});
$('researchDetails').addEventListener('toggle', () => updateResearchCharts(true));

document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => {
  speed = Number(button.dataset.speed) || 1;
  document.querySelectorAll('[data-speed]').forEach(node => node.classList.toggle('selected', node === button));
  $('speedCaption').textContent = SPEED_LABELS[speed] || `×${speed}`;
}));

worldCanvas.addEventListener('click', event => {
  const rect = worldCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * WORLD_WIDTH;
  const y = (event.clientY - rect.top) / rect.height * WORLD_HEIGHT;
  const organism = hitTestOrganism(world, x, y);
  if (event.shiftKey && !organism) {
    const added = addFoodPatch(world, x, y, 28);
    updateUI(true); drawWorld(worldCanvas, world);
    toast(`Локально добавлено ${added} источников пищи.`);
  } else if (organism) {
    world.selectedId = organism.id; world.followSelected = false;
    updateSelection(true); drawWorld(worldCanvas, world);
  } else {
    world.selectedId = null; world.followSelected = false;
    updateSelection(true); drawWorld(worldCanvas, world);
  }
});
worldCanvas.addEventListener('pointermove', event => {
  const rect = worldCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * WORLD_WIDTH;
  const y = (event.clientY - rect.top) / rect.height * WORLD_HEIGHT;
  worldCanvas.style.cursor = hitTestOrganism(world, x, y) ? 'pointer' : 'crosshair';
});
$('lineageCanvas').addEventListener('click', event => {
  if (!$('researchDetails').open) return;
  const rect = $('lineageCanvas').getBoundingClientRect();
  const y = (event.clientY - rect.top) / rect.height;
  const list = world.species.slice(-36);
  if (!list.length) return;
  const index = Math.max(0, Math.min(list.length - 1, Math.floor(y * list.length)));
  selectSpecies(list[index].id);
});

// Keyboard shortcuts for quick observation.
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'Space') { event.preventDefault(); setRunning(!running); }
  else if (event.key.toLowerCase() === 'n') doStep();
});

// A timer drives the model independently from the screen refresh rate.
const simulationTimer = setInterval(simulateBatch, 100);
const autosaveTimer = setInterval(() => { if (world.tick > 0 || running) saveAutosave(true); }, 15000);
window.addEventListener('resize', () => { drawWorld(worldCanvas, world); updateResearchCharts(true); });
window.addEventListener('pagehide', () => {
  world.wasRunning = running;
  world.offlineProgress = $('offlineToggle').checked;
  world.lastSavedAt = Date.now();
  // IndexedDB writes are queued while the page is still active; also refresh the browser fallback.
  saveWorld('autosave', world, 'Автосохранение').catch(() => {});
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveAutosave(true); });

setInterval(() => {
  // A low rate of UI updates keeps the display responsive at ×50 simulation speed.
  updateUI();
}, 350);

updateUI(true);
drawWorld(worldCanvas, world);
animationHandle = requestAnimationFrame(renderLoop);
bootstrap();
