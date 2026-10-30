import {createWorld,stepWorld,getWorldStats,WORLD_WIDTH,WORLD_HEIGHT} from './creature-world.js';
const canvas=document.querySelector('#world'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const ui={run:$('runBtn'),step:$('stepBtn'),reset:$('resetBtn'),speed:$('speed'),speedLabel:$('speedLabel'),status:$('statusText'),dot:$('statusDot'),stage:$('stageLabel'),generation:$('generation'),alive:$('alive'),food:$('food'),births:$('births'),foragers:$('foragers'),hunters:$('hunters'),foragerBar:$('foragerBar'),hunterBar:$('hunterBar'),headline:$('worldHeadline'),populationBig:$('populationBig'),description:$('worldDescription'),name:$('creatureName'),info:$('creatureInfo'),genes:$('genes'),log:$('log')};
let world=createWorld(),running=false,selectedId=null,lastFrame=0,raf=0,uiClock=0;
const traitLabels={speed:'Скорость',sense:'Чувствительность',forage:'Поиск пищи',caution:'Осторожность',aggression:'Агрессия',fertility:'Плодовитость',turn:'Манёвренность'};
function drawBackground(){
 ctx.fillStyle='#071522';ctx.fillRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
 const glow=ctx.createRadialGradient(570,350,30,570,350,650);glow.addColorStop(0,'rgba(36,103,91,.12)');glow.addColorStop(1,'rgba(5,17,27,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
 ctx.strokeStyle='rgba(119,177,175,.055)';ctx.lineWidth=1;for(let x=20;x<WORLD_WIDTH;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD_HEIGHT);ctx.stroke();}for(let y=20;y<WORLD_HEIGHT;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD_WIDTH,y);ctx.stroke();}
}
function drawFood(f){ctx.save();ctx.translate(f.x,f.y);ctx.shadowBlur=13;ctx.shadowColor='#ffca83';ctx.fillStyle='#ffca83';ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0c8';ctx.beginPath();ctx.arc(-1,-1,1.2,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawCreature(a){
 const dead=!a.alive;if(dead&&a.age%3!==0)return;
 if(a.trail.length>2){ctx.beginPath();a.trail.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=dead?'rgba(100,120,130,.07)':`hsla(${a.hue},75%,70%,.15)`;ctx.lineWidth=2;ctx.stroke();}
 const g=a.genome,r=5+g.speed*3,hunter=g.aggression>.52;
 ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle);ctx.globalAlpha=dead?.12:1;
 const color=hunter?'#ff8b83':`hsl(${a.hue},68%,67%)`;
 ctx.shadowBlur=dead?0:12;ctx.shadowColor=color;
 // Organic silhouette with animated-looking cilia and a segmented body.
 ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.lineCap='round';
 for(let i=0;i<4;i++){const side=i%2?1:-1,back=i<2?1:-1;ctx.beginPath();ctx.moveTo(-r*.4,side*r*.45);ctx.quadraticCurveTo(-r*1.2,side*r*(.8+((world.tick+i*7)%11)/30),-r*(1.6+back*.1),side*r*1.1);ctx.stroke();}
 ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(r*1.55,0);ctx.bezierCurveTo(r*.8,-r*1.05,-r*.8,-r*.95,-r*1.2,0);ctx.bezierCurveTo(-r*.8,r*.95,r*.8,r*1.05,r*1.55,0);ctx.fill();
 ctx.fillStyle='rgba(4,18,26,.65)';ctx.beginPath();ctx.ellipse(-r*.2,0,r*.58,r*.52,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#f4fff8';ctx.beginPath();ctx.arc(r*.75,-r*.18,1.7,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=hunter?'#ffc0b4':'#baffea';ctx.beginPath();ctx.arc(r*.8,-r*.18,.7,0,Math.PI*2);ctx.fill();
 if(a.id===selectedId){ctx.shadowBlur=0;ctx.strokeStyle='#fff';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,r*2.1,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
function draw(){drawBackground();for(const f of world.food)drawFood(f);for(const a of world.creatures)drawCreature(a);
 ctx.fillStyle='rgba(3,13,22,.72)';ctx.fillRect(14,14,225,34);ctx.fillStyle='#8baabd';ctx.font='10px ui-monospace,monospace';ctx.fillText('LIFE ENGINE · ЖИВОЙ МИР',24,27);ctx.fillStyle='#e5f6fb';ctx.fillText(`ТИК ${world.tick.toLocaleString('ru-RU')} · ${running?'СИМУЛЯЦИЯ ИДЁТ':'ПАУЗА'}`,24,40);
}
function addLog(message){const entry=document.createElement('article');entry.className='log-entry';const b=document.createElement('b');b.textContent=message;const small=document.createElement('small');small.textContent='ТИК '+world.tick;entry.append(b,small);ui.log.prepend(entry);while(ui.log.children.length>8)ui.log.lastElementChild.remove();}
function updateSelected(){const a=world.creatures.find(c=>c.id===selectedId);if(!a){ui.name.textContent='Никто не выбран';ui.info.textContent='Нажми на существо в мире, чтобы увидеть его наследуемые признаки.';ui.genes.replaceChildren();return;}
 ui.name.textContent=`Существо №${a.id}`;ui.info.textContent=`${a.alive?'Живо':'Погибло'} · ${a.genome.aggression>.52?'Хищный тип поведения':'Собиратель'} · возраст ${a.age} · энергия ${Math.max(0,Math.round(a.energy))}`;
 ui.genes.replaceChildren();for(const [key,label] of Object.entries(traitLabels)){const value=a.genome[key],max=key==='sense'?260:key==='speed'?1.6:1,percent=Math.round(value/max*100);const row=document.createElement('div');row.className='gene-row';const name=document.createElement('span');name.textContent=label;const track=document.createElement('div');track.className='gene-track';const fill=document.createElement('i');fill.style.width=percent+'%';track.append(fill);const val=document.createElement('b');val.textContent=percent;row.append(name,track,val);ui.genes.append(row);}
}
function updateUI(){const s=getWorldStats(world);ui.status.textContent=running?'ЭКОСИСТЕМА АКТИВНА':'МИР НА ПАУЗЕ';ui.dot.classList.toggle('running',running);ui.stage.textContent='ПОКОЛЕНИЕ '+s.generation;ui.generation.textContent=s.generation;ui.alive.textContent=s.population;ui.food.textContent=s.food;ui.births.textContent=s.births;ui.foragers.textContent=s.foragers;ui.hunters.textContent=s.hunters;ui.populationBig.textContent=s.population;const total=Math.max(1,s.foragers+s.hunters);ui.foragerBar.style.width=(s.foragers/total*100)+'%';ui.hunterBar.style.width=(s.hunters/total*100)+'%';ui.headline.textContent=s.population>50?'Популяция расширяется':s.population>15?'Экосистема держится':s.population>0?'Жизнь под угрозой':'Экосистема вымерла';ui.description.textContent=`В мире ${s.population} живых существ, ${s.food} источников пищи. Зафиксировано ${s.births} рождений и ${s.kills} успешных атак.`;updateSelected();}
function reset(){world=createWorld(Date.now()>>>0);selectedId=null;running=false;document.body.classList.remove('running');ui.run.textContent='▶ Запустить мир';ui.log.replaceChildren();addLog('Экосистема зародилась. 36 существ ищут пищу.');updateUI();draw();}
function frame(now){if(now-lastFrame>1000/30){lastFrame=now;if(running){stepWorld(world,Number(ui.speed.value));uiClock++;if(uiClock%20===0){updateUI();const latest=world.events[0];if(latest&&latest!==lastEvent){addLog(latest);lastEvent=latest;}}}draw();}raf=requestAnimationFrame(frame);}
let lastEvent='';
canvas.addEventListener('click',event=>{const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*WORLD_WIDTH,y=(event.clientY-rect.top)/rect.height*WORLD_HEIGHT;let best=null,d=28;for(const a of world.creatures){if(!a.alive)continue;const nd=Math.hypot(a.x-x,a.y-y);if(nd<d){best=a;d=nd;}}selectedId=best?.id??null;updateSelected();draw();});
ui.run.addEventListener('click',()=>{running=!running;document.body.classList.toggle('running',running);ui.run.textContent=running?'Ⅱ Пауза':'▶ Продолжить';updateUI();});
ui.step.addEventListener('click',()=>{running=false;document.body.classList.remove('running');ui.run.textContent='▶ Продолжить';stepWorld(world,100);updateUI();draw();});
ui.reset.addEventListener('click',()=>{if(confirm('Создать новую экосистему? Текущий мир будет сброшен.'))reset();});
ui.speed.addEventListener('input',()=>ui.speedLabel.textContent='×'+ui.speed.value);
reset();raf=requestAnimationFrame(frame);
