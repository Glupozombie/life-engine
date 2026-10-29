const canvas = document.querySelector('#world');
const ctx = canvas.getContext('2d');
const ui = {
  run: document.querySelector('#runBtn'), step: document.querySelector('#stepBtn'), reset: document.querySelector('#resetBtn'),
  speed: document.querySelector('#speed'), speedLabel: document.querySelector('#speedLabel'),
  statusDot: document.querySelector('#statusDot'), status: document.querySelector('#statusText'), stage: document.querySelector('#stageLabel'),
  generation: document.querySelector('#generation'), alive: document.querySelector('#alive'), gates: document.querySelector('#gates'),
  distance: document.querySelector('#distance'), championTitle: document.querySelector('#championTitle'), championName: document.querySelector('#championName'),
  championInfo: document.querySelector('#championInfo'), championAvatar: document.querySelector('#championAvatar'), genes: document.querySelector('#genes'),
  progress: document.querySelector('#progressValue'), progressBar: document.querySelector('#progressBar'), progressDescription: document.querySelector('#progressDescription'), log: document.querySelector('#log')
};
const W = 1200, H = 700, POPULATION = 48, MAX_TICKS = 1400, GATE_COUNT = 5;
const TRAITS = [
  ['goalFocus','Фокус цели'],['avoidance','Обход стен'],['turnRate','Манёвренность'],
  ['curiosity','Исследование'],['speed','Скорость'],['sensorRange','Дальность чувств']
];
let seed = (Date.now() >>> 0) || 1, randomState = seed, generation = 1, tick = 0, running = false;
let agents = [], gates = [], champion = null, bestThisGeneration = null, history = [], nextId = 1, raf = 0, lastFrame = 0;
const rand = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
const range = (a,b) => a + (b-a)*rand();
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const wrap = a => { while(a>Math.PI)a-=Math.PI*2; while(a< -Math.PI)a+=Math.PI*2; return a; };
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const copy = value => JSON.parse(JSON.stringify(value));

function makeCourse() {
  gates = [];
  const pattern = [150, 555, 205, 500, 355];
  for(let i=0;i<GATE_COUNT;i++) {
    const center = clamp(pattern[i] + range(-42,42), 105, H-105);
    const gap = 142 + range(-12,16);
    gates.push({x:205+i*190, center, top:center-gap/2, bottom:center+gap/2, width:16});
  }
}
function randomGenome() {
  return {goalFocus:range(.45,.95), avoidance:range(.2,.95), turnRate:range(.35,.9), curiosity:range(.02,.28), speed:range(.48,.9), sensorRange:range(.4,.95)};
}
function makeAgent(genome=null) {
  return {id:nextId++,x:54,y:H/2+range(-26,26),angle:range(-.18,.18),energy:100,alive:true,ticks:0,gateIndex:0,trail:[],genome:genome?copy(genome):randomGenome(),collisions:0,fitness:0,hue:Math.floor(range(160,205))};
}
function resetWorld() {
  seed=(Date.now()>>>0)||1; randomState=seed; generation=1; tick=0; nextId=1; champion=null; bestThisGeneration=null; history=[]; makeCourse();
  agents=Array.from({length:POPULATION},()=>makeAgent());
  running=false; ui.run.textContent='▶ Запустить'; document.body.classList.remove('running');
  addLog('Экспедиция сформирована', '48 существ начинают путь через пять контрольных проходов. Лучшие исследователи передадут свои особенности потомкам.');
  updateUI(); draw();
}
function targetFor(agent) {
  const gate=gates[Math.min(agent.gateIndex,GATE_COUNT-1)];
  if(gate && agent.x < gate.x+gate.width+5) return {x:gate.x-12,y:gate.center};
  return {x:W-48,y:H/2};
}
function solidAt(x,y) {
  if(x<8||x>W-8||y<8||y>H-8)return true;
  for(const g of gates) {
    if(x+5>=g.x-g.width/2 && x-5<=g.x+g.width/2 && (y<g.top || y>g.bottom)) return true;
  }
  return false;
}
function ray(agent,angle,maxDistance) {
  const stride=6;
  for(let d=0;d<=maxDistance;d+=stride) {
    if(solidAt(agent.x+Math.cos(angle)*d,agent.y+Math.sin(angle)*d)) return d/maxDistance;
  }
  return 1;
}
function updateAgent(a) {
  if(!a.alive)return;
  const g=a.genome, target=targetFor(a), targetAngle=Math.atan2(target.y-a.y,target.x-a.x);
  const delta=wrap(targetAngle-a.angle);
  const rangeSensor=80+g.sensorRange*180;
  const left=ray(a,a.angle-.72,rangeSensor), front=ray(a,a.angle,rangeSensor), right=ray(a,a.angle+.72,rangeSensor);
  let steer=delta*g.goalFocus;
  if(front<.78) steer+=(right-left)*g.avoidance*(1.15+(1-front)*1.2);
  steer+=(rand()-.5)*g.curiosity;
  a.angle+=clamp(steer,-1,1)*g.turnRate*.12;
  const velocity=1.0+g.speed*1.65;
  const nx=a.x+Math.cos(a.angle)*velocity, ny=a.y+Math.sin(a.angle)*velocity;
  if(solidAt(nx,ny)) {
    a.collisions++; a.energy-=.18;
    // A collision is a real setback, but a creature can recover and try another angle.
    a.angle+=((left>right)?-1:1)*(.3+g.avoidance*.65);
  } else { a.x=nx; a.y=ny; }
  a.energy-=.018+g.speed*.009;
  a.ticks++; a.trail.push({x:a.x,y:a.y}); if(a.trail.length>15)a.trail.shift();
  while(a.gateIndex<GATE_COUNT) {
    const gate=gates[a.gateIndex];
    if(a.x>gate.x+gate.width && a.y>gate.top+3 && a.y<gate.bottom-3) a.gateIndex++;
    else break;
  }
  if(a.energy<=0 || a.x>W-30) a.alive=false;
  a.fitness=a.gateIndex*140 + a.x/W*38 + a.energy*.06 - a.collisions*.04 + a.ticks*.004;
}
function stepSimulation() {
  tick++;
  for(const a of agents) updateAgent(a);
  const alive=agents.filter(a=>a.alive);
  const best=[...agents].sort((a,b)=>b.fitness-a.fitness)[0];
  if(!bestThisGeneration || best.fitness>bestThisGeneration.fitness) bestThisGeneration=copy(best);
  if(!champion || best.fitness>champion.fitness) champion=copy(best);
  if(tick>=MAX_TICKS || alive.length===0 || agents.every(a=>a.x>W-30)) finishGeneration();
}
function crossover(a,b) {
  const child={};
  for(const [key] of TRAITS) {
    let value=rand()<.5?a[key]:b[key];
    if(rand()<.22)value+=range(-.24,.24);
    else if(rand()<.12)value+=range(-.07,.07);
    child[key]=clamp(value,.02,1);
  }
  return child;
}
function finishGeneration() {
  running=false; ui.run.textContent='▶ Продолжить'; document.body.classList.remove('running');
  const ranked=[...agents].sort((a,b)=>b.fitness-a.fitness);
  const best=ranked[0]||bestThisGeneration;
  const reached=Math.max(0,...agents.map(a=>a.gateIndex));
  const oldChampion=champion;
  history.unshift({generation,reached,progress:Math.round((best?.x||0)/W*100),fitness:Math.round(best?.fitness||0)});
  history=history.slice(0,6);
  addLog(`Поколение ${generation}: пройдено ${reached} из ${GATE_COUNT}`, best? `Лучший исследователь достиг ${Math.round(best.x/W*100)}% пути, столкновений: ${best.collisions}. Отбор сохранит удачные признаки.`:'Экспедиция остановилась.');
  const parents=ranked.slice(0,Math.max(6,Math.floor(POPULATION*.3)));
  const next=[];
  for(let i=0;i<4;i++) next.push(makeAgent(parents[i%parents.length].genome));
  while(next.length<POPULATION) {
    const a=parents[Math.floor(rand()*parents.length)], b=parents[Math.floor(rand()*parents.length)];
    next.push(makeAgent(crossover(a.genome,b.genome)));
  }
  generation++; tick=0; agents=next; bestThisGeneration=null;
  // Fresh lives, inherited strategies. The course stays the same so progress is comparable.
  updateUI(); draw();
}
function drawBackground() {
  ctx.fillStyle='#071421';ctx.fillRect(0,0,W,H);
  ctx.save();
  for(let x=20;x<W;x+=40)for(let y=20;y<H;y+=40){ctx.fillStyle=((x+y)/40)%2?'rgba(91,143,170,.035)':'rgba(91,143,170,.018)';ctx.fillRect(x,y,1,1);}
  const glow=ctx.createRadialGradient(W-45,H/2,4,W-45,H/2,210);glow.addColorStop(0,'rgba(170,151,255,.18)');glow.addColorStop(1,'rgba(170,151,255,0)');ctx.fillStyle=glow;ctx.fillRect(W-260,H/2-250,260,500);
  ctx.restore();
  // Start zone and destination
  ctx.fillStyle='rgba(101,228,208,.07)';ctx.fillRect(0,0,110,H);
  ctx.strokeStyle='rgba(110,230,210,.35)';ctx.setLineDash([5,8]);ctx.beginPath();ctx.moveTo(112,20);ctx.lineTo(112,H-20);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#c8b9ff';ctx.font='bold 14px ui-monospace,monospace';ctx.fillText('НОВЫЙ МИР',W-160,H/2-36);
  ctx.strokeStyle='rgba(183,163,255,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(W-48,H/2,26,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='rgba(183,163,255,.22)';ctx.beginPath();ctx.arc(W-48,H/2,38,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(183,163,255,.7)';ctx.beginPath();ctx.arc(W-48,H/2,5,0,Math.PI*2);ctx.fill();
  for(let i=0;i<gates.length;i++){
    const g=gates[i];ctx.fillStyle='rgba(255,195,112,.15)';ctx.fillRect(g.x-g.width/2,0,g.width,g.top);ctx.fillRect(g.x-g.width/2,g.bottom,g.width,H-g.bottom);
    ctx.fillStyle='#ffcb79';ctx.fillRect(g.x-g.width/2-2,g.top-2,g.width+4,4);ctx.fillRect(g.x-g.width/2-2,g.bottom-2,g.width+4,4);
    ctx.fillStyle='#ad9b76';ctx.font='10px ui-monospace,monospace';ctx.fillText(`ПРОХОД ${i+1}`,g.x-31,24);
    ctx.strokeStyle='rgba(255,203,121,.12)';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(g.x,g.top);ctx.lineTo(g.x,g.bottom);ctx.stroke();ctx.setLineDash([]);
  }
}
function drawAgent(a) {
  if(a.trail.length>1){ctx.beginPath();a.trail.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=`hsla(${a.hue},85%,70%,.17)`;ctx.lineWidth=1.5;ctx.stroke();}
  if(!a.alive)return;
  const r=4.1+a.genome.speed*1.3;
  ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle);
  ctx.fillStyle=`hsla(${a.hue},85%,65%,.13)`;ctx.beginPath();ctx.arc(0,0,r*3.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=`hsl(${a.hue},83%,65%)`;ctx.beginPath();ctx.moveTo(r*1.8,0);ctx.quadraticCurveTo(0,-r,-r*1.2,0);ctx.quadraticCurveTo(0,r,r*1.8,0);ctx.fill();
  ctx.fillStyle='#e9fff9';ctx.beginPath();ctx.arc(r*.65,-r*.18,1.2,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function draw() {
  ctx.clearRect(0,0,W,H);drawBackground();
  for(const a of agents)drawAgent(a);
  if(bestThisGeneration){ctx.save();ctx.strokeStyle='rgba(255,255,255,.7)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(bestThisGeneration.x,bestThisGeneration.y,11,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
  ctx.fillStyle='rgba(3,13,22,.72)';ctx.fillRect(12,12,160,30);ctx.fillStyle='#8baabd';ctx.font='10px ui-monospace,monospace';ctx.fillText('ЭКСПЕДИЦИЯ',22,24);ctx.fillStyle='#e5f6fb';ctx.fillText(`ПОКОЛЕНИЕ ${generation} · ШАГ ${tick}`,22,36);
}
function updateUI() {
  const alive=agents.filter(a=>a.alive).length;
  const best=bestThisGeneration||[...agents].sort((a,b)=>b.fitness-a.fitness)[0];
  const reached=Math.max(0,...agents.map(a=>a.gateIndex));
  ui.generation.textContent=generation;ui.alive.textContent=alive;ui.gates.textContent=`${reached} / ${GATE_COUNT}`;
  ui.distance.textContent=`${Math.round((best?.x||0)/W*100)}%`;ui.stage.textContent=`ПОКОЛЕНИЕ ${generation}`;
  ui.status.textContent=running?'ЭКСПЕДИЦИЯ ИДЁТ':'ГОТОВ К ЗАПУСКУ';ui.statusDot.classList.toggle('running',running);
  ui.progress.textContent=`${reached} / ${GATE_COUNT}`;ui.progressBar.style.width=`${Math.min(100,reached/GATE_COUNT*100)}%`;
  ui.championTitle.textContent=champion? `Путь: ${Math.round(champion.x/W*100)}%`:'Пока никто не прошёл';
  ui.progressDescription=ui.progressDescription||document.querySelector('#progressDescription');
  ui.progressDescription.textContent=best? `Лучший текущий результат: ${Math.round(best.x/W*100)}% пути. Контрольных проходов пройдено: ${best.gateIndex} из ${GATE_COUNT}. ${running?'Наблюдай за попытками и сравнивай поколения.':'Запусти симуляцию или перейди к следующему поколению.'}`:'Нет активных исследователей.';
  if(champion){
    ui.championName.textContent=`Исследователь № ${champion.id}`;
    ui.championInfo.textContent=`Поколение ${Math.max(1,generation-1)}, проходов: ${champion.gateIndex}/${GATE_COUNT}, столкновений: ${champion.collisions}.`;
    ui.championAvatar.style.filter=`hue-rotate(${champion.hue-175}deg)`;
    ui.genes.replaceChildren();
    for(const [key,label] of TRAITS){const row=document.createElement('div');row.className='gene-row';const name=document.createElement('span');name.textContent=label;const track=document.createElement('div');track.className='gene-track';const fill=document.createElement('i');fill.style.width=`${Math.round(champion.genome[key]*100)}%`;track.append(fill);const value=document.createElement('b');value.textContent=`${Math.round(champion.genome[key]*100)}`;row.append(name,track,value);ui.genes.append(row);}
  }
}
function addLog(title,description) {
  const entry=document.createElement('article');entry.className='log-entry';const b=document.createElement('b');b.textContent=title;const p=document.createElement('p');p.textContent=description;const small=document.createElement('small');small.textContent=`ПОКОЛЕНИЕ ${generation}`;entry.append(b,p,small);ui.log.prepend(entry);
  while(ui.log.children.length>8)ui.log.lastElementChild.remove();
}
function frame(now) {
  if(now-lastFrame>1000/30){lastFrame=now;if(running){const speed=Number(ui.speed.value);for(let i=0;i<speed;i++){stepSimulation();if(!running)break;}}draw();updateUI();}
  raf=requestAnimationFrame(frame);
}
ui.run.addEventListener('click',()=>{running=!running;ui.run.textContent=running?'Ⅱ Пауза':'▶ Запустить';document.body.classList.toggle('running',running);updateUI();});
ui.step.addEventListener('click',()=>{if(running){running=false;ui.run.textContent='▶ Запустить';document.body.classList.remove('running');}finishGeneration();});
ui.reset.addEventListener('click',()=>{if(confirm('Начать новую экспедицию? Текущие результаты этой сессии будут сброшены.'))resetWorld();});
ui.speed.addEventListener('input',()=>ui.speedLabel.textContent=`×${ui.speed.value}`);
resetWorld();raf=requestAnimationFrame(frame);
