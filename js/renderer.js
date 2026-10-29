import { WORLD_WIDTH, WORLD_HEIGHT, TRAITS } from './simulation.js';

const BACKGROUND_CACHE = new Map();
const speciesFor = (world, id) => world.species.find(s => s.id === id);
const hueColor = (h, s = 78, l = 62, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function makeBackground(seed) {
  if (BACKGROUND_CACHE.has(seed)) return BACKGROUND_CACHE.get(seed);
  let state = (seed >>> 0) || 1;
  const next = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const stars = Array.from({ length: 125 }, () => ({ x: next(), y: next(), r: 0.35 + next() * 1.15, a: 0.12 + next() * 0.48, hue: [174, 192, 213, 280][Math.floor(next() * 4)], speed: 0.08 + next() * 0.38, phase: next() * 6.28 }));
  const motes = Array.from({ length: 48 }, () => ({ x: next(), y: next(), r: 1.1 + next() * 2.4, a: 0.04 + next() * 0.15, hue: [174, 192, 217, 298][Math.floor(next() * 4)], speed: 0.03 + next() * 0.1, phase: next() * 6.28 }));
  const result = { stars, motes };
  BACKGROUND_CACHE.set(seed, result);
  return result;
}

function drawBackground(ctx, w, h, world, clock) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#051321'); bg.addColorStop(.5, '#071a2b'); bg.addColorStop(1, '#07101f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const wash1 = ctx.createRadialGradient(w * .23, h * .2, 4, w * .23, h * .2, Math.max(w, h) * .55);
  wash1.addColorStop(0, 'rgba(12,124,153,.15)'); wash1.addColorStop(1, 'rgba(12,124,153,0)');
  ctx.fillStyle = wash1; ctx.fillRect(0, 0, w, h);
  const wash2 = ctx.createRadialGradient(w * .78, h * .75, 3, w * .78, h * .75, Math.max(w, h) * .45);
  wash2.addColorStop(0, 'rgba(105,52,160,.105)'); wash2.addColorStop(1, 'rgba(105,52,160,0)');
  ctx.fillStyle = wash2; ctx.fillRect(0, 0, w, h);
  const layers = makeBackground(world.seed || 1);
  for (const p of layers.stars) {
    const x = p.x * w + Math.sin(clock * p.speed + p.phase) * 2.5;
    const y = p.y * h + Math.cos(clock * p.speed * .7 + p.phase) * 2.5;
    ctx.fillStyle = hueColor(p.hue, 76, 77, p.a * (.75 + .25 * Math.sin(clock * .7 + p.phase)));
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  for (const p of layers.motes) {
    const x = ((p.x * w + clock * p.speed * 2 + 2 * w) % w);
    const y = p.y * h + Math.sin(clock * p.speed + p.phase) * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, p.r * 4);
    g.addColorStop(0, hueColor(p.hue, 80, 74, p.a)); g.addColorStop(1, hueColor(p.hue, 80, 74, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, p.r * 4, 0, Math.PI * 2); ctx.fill();
  }
  // Thin, low-contrast flow filaments give the habitat depth without covering the organisms.
  ctx.save(); ctx.globalAlpha = .12; ctx.strokeStyle = '#3f7b9a'; ctx.lineWidth = .7;
  for (let i = 0; i < 9; i++) {
    const y = h * (i / 9) + Math.sin(clock * .12 + i) * 10;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * .24, y - 26, w * .53, y + 23, w, y - 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNutrient(ctx, n, sx, sy, clock) {
  const x = n.x * sx, y = n.y * sy;
  const r = n.radius * Math.min(sx, sy) + 0.8;
  const pulse = .8 + .2 * Math.sin(clock * 1.9 + n.pulse);
  ctx.save();
  const aura = ctx.createRadialGradient(x, y, 0, x, y, r * 5.2);
  aura.addColorStop(0, hueColor(n.hue, 100, 75, .36)); aura.addColorStop(1, hueColor(n.hue, 100, 65, 0));
  ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(x, y, r * 5.2, 0, Math.PI * 2); ctx.fill();
  const body = ctx.createRadialGradient(x - r * .35, y - r * .35, .2, x, y, r * 1.3);
  body.addColorStop(0, '#ffffe0'); body.addColorStop(.3, hueColor(n.hue, 95, 78)); body.addColorStop(1, hueColor(n.hue, 94, 54, .9));
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawOrganism(ctx, o, species, sx, sy, clock, selected, follow, populationCount, canvasWidth) {
  const x = o.x * sx, y = o.y * sy;
  const scale = Math.min(sx, sy);
  const g = o.genes, hue = species?.hue ?? 185;
  const vitality = Math.max(.45, Math.min(1, o.energy + .2));
  const length = (6.1 + g.mobility * 5.3 + g.shell * 1.0) * scale;
  const thickness = (2.7 + g.shell * 2.3 + g.filaments * .6) * scale;
  const filamentLen = (4 + g.filaments * 22) * scale;
  const sides = Math.max(2, Math.min(7, Math.round(2 + g.filaments * 5)));
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.angle); ctx.globalAlpha = vitality;

  // Short motion trace.
  if (o.trail?.length > 1) {
    ctx.save(); ctx.rotate(-o.angle);
    ctx.beginPath();
    o.trail.forEach((p, i) => { const tx = p.x * sx - x, ty = p.y * sy - y; if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty); });
    ctx.strokeStyle = hueColor(hue, 86, 69, .18); ctx.lineWidth = 1.1 * scale; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
  }

  // Diffuse bioluminescence around the body.
  const auraRadius = length * 2.4 + filamentLen * .28;
  const aura = ctx.createRadialGradient(0, 0, thickness * .2, 0, 0, auraRadius);
  aura.addColorStop(0, hueColor(hue, 90, 65, selected ? .28 : .16));
  aura.addColorStop(.38, hueColor(hue, 86, 56, .075)); aura.addColorStop(1, hueColor(hue, 80, 50, 0));
  ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, auraRadius, 0, Math.PI * 2); ctx.fill();

  // Fine filaments respond to the inherited trait.
  ctx.lineCap = 'round';
  if (g.filaments > .08) {
    for (let i = 0; i < sides; i++) {
      const side = (i / Math.max(1, sides - 1) - .5) * 1.75;
      const startX = length * .38, startY = side * thickness * 1.1;
      const endX = length * 1.12 + filamentLen * (.42 + .18 * Math.sin(clock * .8 + o.id + i));
      const endY = side * (thickness + filamentLen * .22) + Math.sin(clock * 1.1 + o.id * .3 + i) * filamentLen * .22;
      ctx.beginPath(); ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(startX + filamentLen * .28, startY - filamentLen * (.12 + .12 * Math.sin(clock + i)), endX, endY);
      ctx.strokeStyle = hueColor(hue + i * 6, 87, 75, .26 + g.filaments * .21); ctx.lineWidth = Math.max(.45, scale * (.5 + g.filaments * .55)); ctx.stroke();
      if (i % 2 === 0) { ctx.beginPath(); ctx.arc(endX, endY, Math.max(.6, scale * .9), 0, Math.PI * 2); ctx.fillStyle = hueColor(hue, 90, 84, .78); ctx.fill(); }
    }
  }

  // Fan-shaped tail. The size and spread are inherited rather than random decoration.
  ctx.beginPath(); ctx.moveTo(-length * .62, 0);
  ctx.quadraticCurveTo(-length * 1.05, -thickness * (1.2 + g.mobility), -length * 1.2, -thickness * (1.1 + g.filaments * 1.5));
  ctx.quadraticCurveTo(-length * .8, -thickness * .4, -length * .65, 0);
  ctx.quadraticCurveTo(-length * .8, thickness * .4, -length * 1.2, thickness * (1.1 + g.filaments * 1.5));
  ctx.quadraticCurveTo(-length * 1.05, thickness * (1.2 + g.mobility), -length * .62, 0);
  ctx.fillStyle = hueColor(hue + 17, 82, 58, .42); ctx.fill();
  ctx.strokeStyle = hueColor(hue, 88, 72, .52); ctx.lineWidth = .7 * scale; ctx.stroke();

  // Translucent outer shell: a thicker shell produces a more armored silhouette.
  if (g.shell > .23) {
    ctx.beginPath(); ctx.ellipse(0, 0, length * (1.02 + g.shell * .11), thickness * (1.06 + g.shell * .22), 0, 0, Math.PI * 2);
    ctx.strokeStyle = hueColor(hue + 32, 86, 81, .32 + g.shell * .34); ctx.lineWidth = scale * (0.7 + g.shell * 1.15); ctx.stroke();
    const plates = Math.round(2 + g.shell * 4);
    for (let i = 0; i < plates; i++) {
      const px = -length * .48 + (i / Math.max(1, plates - 1)) * length * .94;
      ctx.beginPath(); ctx.ellipse(px, 0, length * .13, thickness * .88, 0, 0, Math.PI * 2);
      ctx.fillStyle = hueColor(hue + 25, 76, 83, .11 + g.shell * .13); ctx.fill();
    }
  }

  // Segmented translucent body.
  const body = ctx.createLinearGradient(-length, -thickness, length, thickness);
  body.addColorStop(0, hueColor(hue + 42, 78, 39, .92));
  body.addColorStop(.38, hueColor(hue + 5, 84, 61, .99));
  body.addColorStop(.72, hueColor(hue - 14, 89, 68, .96));
  body.addColorStop(1, hueColor(hue + 24, 82, 84, .92));
  ctx.beginPath(); ctx.ellipse(0, 0, length, thickness, 0, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = hueColor(hue + 25, 92, 87, .72); ctx.lineWidth = .65 * scale; ctx.stroke();
  const segments = Math.max(3, Math.round(3 + g.shell * 3 + g.filaments));
  for (let i = 1; i < segments; i++) {
    const px = -length * .8 + i / segments * length * 1.57;
    const p = px / length;
    const localThickness = thickness * Math.sqrt(Math.max(.28, 1 - p * p));
    ctx.beginPath(); ctx.ellipse(px, 0, Math.max(.7, length * .09), localThickness * .89, 0, 0, Math.PI * 2);
    ctx.fillStyle = hueColor(hue + 24 + i * 3, 89, 88, .21 + g.shell * .12); ctx.fill();
  }
  // Luminous inner core and eye-like sensory node.
  const core = ctx.createRadialGradient(length * .12, -thickness * .15, .1, length * .12, 0, thickness * 1.15);
  core.addColorStop(0, '#f3ffff'); core.addColorStop(.22, hueColor(hue + 15, 95, 87, .9)); core.addColorStop(1, hueColor(hue, 90, 67, 0));
  ctx.fillStyle = core; ctx.beginPath(); ctx.ellipse(length * .12, 0, length * .45, thickness * .85, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(length * .68, -thickness * .23, Math.max(.75, scale * (1 + g.perception)), 0, Math.PI * 2); ctx.fillStyle = '#f2fff7'; ctx.fill();
  ctx.beginPath(); ctx.arc(length * .68 + .2 * scale, -thickness * .23, Math.max(.4, scale * .55), 0, Math.PI * 2); ctx.fillStyle = hueColor(hue - 25, 90, 35); ctx.fill();

  if (o.flash > 0) {
    ctx.beginPath(); ctx.ellipse(0, 0, length + (20 - o.flash) * .28 * scale, thickness + (20 - o.flash) * .2 * scale, 0, 0, Math.PI * 2);
    ctx.strokeStyle = hueColor(hue + 15, 100, 84, Math.min(.8, o.flash / 22)); ctx.lineWidth = .85 * scale; ctx.stroke();
  }
  ctx.restore();

  // Selection ring is kept outside the body's local rotation.
  if (selected || follow) {
    ctx.save(); ctx.translate(x, y);
    const r = Math.max(12, (length + filamentLen * .4) * 1.25);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = follow ? 'rgba(181,255,230,.9)' : 'rgba(230,255,255,.76)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + clock * .15, px = Math.cos(a) * r, py = Math.sin(a) * r;
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fillStyle = hueColor(hue, 100, 85); ctx.fill();
    }
    ctx.restore();
    if (selected && populationCount < 180) {
      ctx.save(); ctx.font = '10px "DM Mono", monospace'; const label = species?.name ?? `#${o.id}`;
      const labelW = Math.min(160, ctx.measureText(label).width + 14); const lx = Math.max(8, Math.min(canvasWidth - labelW - 8, x + 12));
      ctx.fillStyle = 'rgba(5,18,29,.88)'; ctx.strokeStyle = 'rgba(125,219,211,.36)';
      ctx.beginPath(); ctx.roundRect(lx, y - r - 22, labelW, 18, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d6fff4'; ctx.fillText(label, lx + 7, y - r - 10);
      ctx.restore();
    }
  }
}
function drawEffects(ctx, effects, sx, sy, clock) {
  if (!effects?.length) return;
  const scale = Math.min(sx, sy);
  for (const effect of effects) {
    const progress = Math.max(0, Math.min(1, (Date.now() - (effect.createdAt ?? Date.now())) / (effect.durationMs || 1000)));
    if (progress >= 1) continue;
    const alpha = Math.max(0, 1 - progress);
    const x = effect.x * sx, y = effect.y * sy;
    const radius = (effect.type === 'death' ? 4 + progress * 21 : effect.type === 'species' ? 5 + progress * 25 : 3 + progress * 13) * scale;
    ctx.save();
    if (effect.type === 'death') {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = hueColor(effect.hue, 85, 79, alpha * .66); ctx.lineWidth = Math.max(.7, scale * 1.5); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5 + effect.id * .07;
        const r1 = radius * .36, r2 = radius * (.7 + .15 * Math.sin(effect.id + i));
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
        ctx.strokeStyle = hueColor(effect.hue, 78, 71, alpha * .5); ctx.stroke();
      }
    } else if (effect.type === 'eat') {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + effect.id * .3;
        const dist = radius * (.6 + progress * 1.6);
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, Math.max(.7, (2.2 - progress) * scale), 0, Math.PI * 2);
        ctx.fillStyle = hueColor(effect.hue, 93, 83, alpha * .72); ctx.fill();
      }
    } else {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = hueColor(effect.hue, 90, 82, alpha * (effect.type === 'species' ? .85 : .62)); ctx.lineWidth = Math.max(.7, scale * (effect.type === 'species' ? 1.4 : .9)); ctx.stroke();
      if (effect.type === 'species') {
        ctx.beginPath(); ctx.arc(x, y, radius * .4, 0, Math.PI * 2); ctx.strokeStyle = hueColor(effect.hue + 20, 100, 89, alpha * .7); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

export function drawWorld(canvas, world, clock = performance.now() / 1000) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, world, clock);
  const sx = w / WORLD_WIDTH, sy = h / WORLD_HEIGHT;
  // Food appears above the background and below creatures.
  for (const n of world.nutrients) drawNutrient(ctx, n, sx, sy, clock);
  // A soft, slow flow indicates environmental movement without suggesting a rigid grid.
  if (world.environment?.mode === 'scarcity') {
    ctx.save(); ctx.strokeStyle = 'rgba(183,166,255,.07)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const yy = ((i / 8) * h + clock * 5) % h;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.bezierCurveTo(w * .3, yy - 8, w * .7, yy + 8, w, yy - 5); ctx.stroke();
    }
    ctx.restore();
  }
  for (const o of world.organisms) {
    const selected = o.id === world.selectedId;
    drawOrganism(ctx, o, speciesFor(world, o.speciesId), sx, sy, clock, selected, selected && world.followSelected, world.organisms.length, w);
  }
  drawEffects(ctx, world.effects, sx, sy, clock);
  // Small in-world labels anchor the scene with clear, readable facts.
  ctx.save();
  ctx.fillStyle = 'rgba(3,14,25,.56)'; ctx.strokeStyle = 'rgba(130,174,200,.13)';
  ctx.beginPath(); ctx.roundRect(12, 12, 140, 31, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#86aabd'; ctx.font = '9px "DM Mono", monospace'; ctx.fillText('LIFE FIELD', 22, 24);
  ctx.fillStyle = '#e0f7f4'; ctx.font = '11px "DM Mono", monospace'; ctx.fillText(`${world.organisms.length} ЖИВЫХ`, 22, 36);
  ctx.restore();
}

export function hitTestOrganism(world, x, y) {
  let best = null, bestScore = Infinity;
  for (const o of world.organisms) {
    const species = speciesFor(world, o.speciesId);
    const length = 6.1 + o.genes.mobility * 5.3 + o.genes.shell;
    const radius = Math.max(13, length * 1.8 + o.genes.filaments * 7);
    const dx = o.x - x, dy = o.y - y;
    const score = dx * dx + dy * dy;
    if (score <= radius * radius && score < bestScore) { best = o; bestScore = score; }
  }
  return best;
}

function chartBase(ctx, w, h, label) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#061522'; ctx.fillRect(0, 0, w, h);
  const left = 31, right = w - 10, top = 12, bottom = h - 23;
  ctx.strokeStyle = 'rgba(121,162,185,.12)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = top + (bottom - top) * i / 4; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
  ctx.fillStyle = '#5f7f94'; ctx.font = '8px "DM Mono", monospace'; ctx.fillText(label, 8, 10);
  return { left, right, top, bottom, cw: right - left, ch: bottom - top };
}
function drawLineChart(canvas, history, key, color, formatter) {
  const { ctx, w, h } = fitCanvas(canvas);
  const p = chartBase(ctx, w, h, key === 'population' ? 'СУЩЕСТВА' : 'ЛИНИИ');
  if (!history || history.length < 2) { ctx.fillStyle = '#648398'; ctx.font = '10px var(--font)'; ctx.fillText('Данные появятся со временем', p.left + 6, p.top + 22); return; }
  const values = history.map(d => Number(d[key]) || 0);
  const rawMax = Math.max(1, ...values);
  const max = rawMax <= 5 ? Math.max(5, Math.ceil(rawMax / 2) * 2) : Math.ceil(rawMax / 10) * 10;
  ctx.fillStyle = '#628096'; ctx.font = '8px "DM Mono", monospace'; ctx.fillText(String(max), 6, p.top + 3); ctx.fillText('0', 16, p.bottom + 2);
  const points = values.map((v, i) => ({ x: p.left + i / (values.length - 1) * p.cw, y: p.bottom - v / max * p.ch }));
  const grad = ctx.createLinearGradient(0, p.top, 0, p.bottom); grad.addColorStop(0, color + '44'); grad.addColorStop(1, color + '00');
  ctx.beginPath(); ctx.moveTo(points[0].x, p.bottom); points.forEach(pt => ctx.lineTo(pt.x, pt.y)); ctx.lineTo(points[points.length - 1].x, p.bottom); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  const last = points[points.length - 1]; ctx.beginPath(); ctx.arc(last.x, last.y, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = '#628096'; ctx.textAlign = 'left'; ctx.fillText(`Поколение ${history[0].generation}`, p.left, h - 7); ctx.textAlign = 'right'; ctx.fillText(`текущее: ${formatter(values[values.length - 1])}`, p.right, h - 7); ctx.textAlign = 'left';
}
export function drawPopulationChart(canvas, history) { drawLineChart(canvas, history, 'population', '#67e5ce', v => String(v)); }
export function drawSpeciesChart(canvas, history) { drawLineChart(canvas, history, 'activeSpecies', '#c69bff', v => String(v)); }

function drawMultiSeriesChart(canvas, history, definitions, label, fixedMax = null) {
  const { ctx, w, h } = fitCanvas(canvas);
  const p = chartBase(ctx, w, h, label);
  if (!history || history.length < 2) {
    ctx.fillStyle = '#648398'; ctx.font = '10px sans-serif'; ctx.fillText('Данные появятся со временем', p.left + 6, p.top + 22); return;
  }
  const seriesValues = definitions.map(series => history.map(record => Number(series.value(record)) || 0));
  const rawMax = fixedMax ?? Math.max(1, ...seriesValues.flat());
  const max = fixedMax ?? Math.max(1, Math.ceil(rawMax / 2) * 2);
  ctx.fillStyle = '#628096'; ctx.font = '8px "DM Mono", monospace'; ctx.fillText(String(max), 6, p.top + 3); ctx.fillText('0', 16, p.bottom + 2);
  definitions.forEach((series, seriesIndex) => {
    const values = seriesValues[seriesIndex];
    const points = values.map((v, i) => ({ x: p.left + i / (values.length - 1) * p.cw, y: p.bottom - Math.max(0, Math.min(max, v)) / max * p.ch }));
    ctx.beginPath(); points.forEach((pt, i) => { if (!i) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
    ctx.strokeStyle = series.color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  });
  ctx.fillStyle = '#628096'; ctx.textAlign = 'left'; ctx.fillText(`Поколение ${history[0].generation}`, p.left, h - 7); ctx.textAlign = 'right'; ctx.fillText(`сейчас`, p.right, h - 7); ctx.textAlign = 'left';
}

export function drawTraitTrendChart(canvas, history) {
  drawMultiSeriesChart(canvas, history, [
    { value: record => record.traitMeans?.mobility, color: '#66e6d0' },
    { value: record => record.traitMeans?.efficiency, color: '#9bf0bf' },
    { value: record => record.traitMeans?.fertility, color: '#ffc977' }
  ], 'СРЕДНЕЕ ЗНАЧЕНИЕ', 1);
}
export function drawBirthDeathChart(canvas, history) {
  drawMultiSeriesChart(canvas, history, [
    { value: record => record.birthsThisInterval, color: '#66e6d0' },
    { value: record => record.deathsThisInterval, color: '#ff93aa' }
  ], 'СОБЫТИЯ ЗА ИНТЕРВАЛ');
}

export function drawLineageTree(canvas, world, selectedSpeciesId = null) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#061522'; ctx.fillRect(0, 0, w, h);
  const list = world.species.slice(-36);
  if (!list.length) return;
  const left = 18, right = w - 18, top = 20, bottom = h - 24;
  const maxGen = Math.max(1, world.generation, ...list.map(s => s.bornGeneration));
  const rowH = (bottom - top) / Math.max(1, list.length);
  const positions = new Map();
  list.forEach((s, i) => positions.set(s.id, { x: left + (s.bornGeneration / maxGen) * (right - left), y: top + rowH * (i + .5) }));
  ctx.lineWidth = 1.3;
  for (const species of list) {
    const p = positions.get(species.id); if (!p) continue;
    if (species.parentSpeciesId) {
      const parent = positions.get(species.parentSpeciesId);
      if (parent) {
        ctx.beginPath(); ctx.moveTo(parent.x, parent.y); ctx.bezierCurveTo(parent.x + (p.x - parent.x) * .55, parent.y, parent.x + (p.x - parent.x) * .45, p.y, p.x, p.y);
        ctx.strokeStyle = hueColor(species.hue, 80, 64, species.count > 0 ? .5 : .17); ctx.stroke();
      }
    }
  }
  for (const species of list) {
    const p = positions.get(species.id); if (!p) continue;
    const alive = species.count > 0;
    const selected = species.id === selectedSpeciesId;
    ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 4 : 2.8, 0, Math.PI * 2);
    ctx.fillStyle = hueColor(species.hue, 88, alive ? 68 : 42, alive ? .98 : .45); ctx.fill();
    if (selected) { ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.strokeStyle = '#e6fff8'; ctx.lineWidth = 1; ctx.stroke(); }
    if (w > 420 && (selected || species.count > 0)) {
      ctx.font = '8px "DM Mono", monospace'; ctx.fillStyle = alive ? '#a8c4d6' : '#536a7a';
      const text = species.name.length > 19 ? species.name.slice(0, 18) + '…' : species.name;
      ctx.fillText(text, Math.min(right - 85, p.x + 8), p.y + 3);
    }
  }
  ctx.fillStyle = '#5f7f94'; ctx.font = '8px "DM Mono", monospace'; ctx.fillText('ПОЯВЛЕНИЕ ЛИНИЙ →', left, h - 7);
}

export function drawTraitBars(container, organism) {
  container.replaceChildren();
  if (!organism) return;
  for (const trait of TRAITS) {
    const row = document.createElement('div'); row.className = 'trait-row';
    const label = document.createElement('span'); label.textContent = trait.label;
    const track = document.createElement('div'); track.className = 'trait-track';
    const fill = document.createElement('i'); fill.style.width = `${Math.round(organism.genes[trait.key] * 100)}%`; fill.style.background = `linear-gradient(90deg,${trait.color}88,${trait.color})`; track.append(fill);
    const value = document.createElement('b'); value.textContent = `${Math.round(organism.genes[trait.key] * 100)}%`;
    row.append(label, track, value); container.append(row);
  }
}
