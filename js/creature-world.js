export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 700;
export const POPULATION_LIMIT = 100;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function rng(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const randomGenome=r=>({speed:.7+r()*.7,sense:90+r()*130,forage:r(),caution:r(),aggression:r(),fertility:.35+r()*.5,turn:.035+r()*.055});
function childGenome(a,b,r){const out={};for(const k of Object.keys(a)){let v=r()<.5?a[k]:b[k];if(r()<.18)v+=(r()-.5)*(k==='sense'?45:.28);out[k]=clamp(v,k==='sense'?55:0,k==='sense'?260: k==='speed'?1.6:1);}return out;}
export function createWorld(seed=Date.now()){
 const r=rng(seed), creatures=[], food=[];
 for(let i=0;i<36;i++)creatures.push(makeCreature(i+1,randomGenome(r),r,1));
 for(let i=0;i<105;i++)food.push({id:i+1,x:35+r()*1130,y:35+r()*630,energy:22+ r()*12,age:0});
 return {seed:seed>>>0,randomState:seed>>>0,tick:0,generation:1,nextId:37,nextFoodId:106,creatures,food,events:['Новая экосистема: существа ищут пищу и пытаются выжить.'],bestGeneration:0};
}
function makeCreature(id,genome,r,generation){return {id,x:35+r()*1130,y:35+r()*630,angle:r()*Math.PI*2,energy:72+ r()*25,age:0,generation,genome,alive:true,kills:0,births:0,trail:[],hue:Math.round(155+genome.aggression*115)};}
function randomFor(world){let s=world.randomState>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;world.randomState=s;return s/4294967296;};}
function nearest(origin,items,range,predicate=()=>true){let best=null,bestD=range;for(const item of items){if(!predicate(item))continue;const d=dist(origin,item);if(d<bestD){best=item;bestD=d;}}return best?{item:best,d:bestD}:null;}
function steer(a,target,weight){if(!target)return 0;let desired=Math.atan2(target.y-a.y,target.x-a.x),delta=((desired-a.angle+Math.PI*3)%(Math.PI*2))-Math.PI;return clamp(delta*weight,-.22,.22);}
export function stepWorld(world,steps=1){
 for(let n=0;n<steps;n++)stepOnce(world);
 return world;
}
function stepOnce(w){
 const r=randomFor(w);w.tick++;
 const alive=w.creatures.filter(c=>c.alive);
 for(const a of alive){
  const g=a.genome; a.age++;
  const danger=nearest(a,alive, g.sense*.95,c=>c!==a&&c.genome.aggression>.48&&c.genome.speed>g.speed*.82);
  const prey=nearest(a,alive,g.sense*.8,c=>c!==a&&c.genome.aggression<.42&&c.energy<g.speed*30);
  const meal=nearest(a,w.food,g.sense*1.8);
  let turn=(r()-.5)*g.turn;
  if(danger)turn+=steer(a,{x:2*a.x-danger.item.x,y:2*a.y-danger.item.y},g.caution*1.25);
  else if(g.aggression>.52&&prey&&a.energy>32)turn+=steer(a,prey.item,g.aggression);
  else if(meal)turn+=steer(a,meal.item,.8+g.forage*.8);
  a.angle+=clamp(turn,-.25,.25);
  const pace=g.speed*(danger?1.25:1);
  const nx=clamp(a.x+Math.cos(a.angle)*pace,12,WORLD_WIDTH-12),ny=clamp(a.y+Math.sin(a.angle)*pace,12,WORLD_HEIGHT-12);
  a.x=nx;a.y=ny;a.energy-=.045+g.speed*.025;a.trail.push({x:a.x,y:a.y});if(a.trail.length>7)a.trail.shift();
  const bite=nearest(a,w.food,13);
  if(bite){a.energy=Math.min(115,a.energy+bite.item.energy);w.food.splice(w.food.indexOf(bite.item),1);}
  if(g.aggression>.52&&a.energy>25){const victim=nearest(a,alive,13,c=>c!==a&&c.alive&&c.genome.aggression<.42);if(victim){victim.item.alive=false;a.energy=Math.min(115,a.energy+27);a.kills++;}}
  if(a.energy>88&&a.age>180&&r()<g.fertility*.012&&w.creatures.length<POPULATION_LIMIT){
   const mate=nearest(a,alive,42,c=>c!==a&&c.alive&&c.energy>65);
   if(mate){const genome=childGenome(g,mate.item.genome,r);const baby=makeCreature(w.nextId++,genome,r,w.generation+1);baby.x=a.x+(r()-.5)*20;baby.y=a.y+(r()-.5)*20;baby.energy=38;w.creatures.push(baby);a.energy-=34;mate.item.energy-=20;a.births++;w.events.unshift('Появилось потомство: новая комбинация наследуемых признаков.');}
  }
  if(a.energy<=0||a.age>2600)a.alive=false;
 }
 if(w.tick%9===0&&w.food.length<180){for(let i=0;i<4;i++)w.food.push({id:w.nextFoodId++,x:20+r()*1160,y:20+r()*660,energy:20+r()*15,age:0});}
 if(w.tick%60===0){const now=w.creatures.filter(c=>c.alive);const before=alive.length;if(now.length>0&&now.length!==before)w.events.unshift(now.length>before?'Популяция растёт: размножение пока опережает смертность.':'Популяция сокращается: ресурсов или защиты не хватает.');}
 if(w.tick%420===0){const live=w.creatures.filter(c=>c.alive);const avg=live.length?live.reduce((s,c)=>s+c.energy,0)/live.length:0;w.events.unshift('Сводка экосистемы: '+live.length+' живых, средняя энергия '+Math.round(avg)+'.');w.generation++;}
 w.events=w.events.slice(0,8);
 if(w.creatures.length>POPULATION_LIMIT*1.5)w.creatures=w.creatures.filter(c=>c.alive).slice(-POPULATION_LIMIT);
}
export function getWorldStats(w){const alive=w.creatures.filter(c=>c.alive);return {population:alive.length,food:w.food.length,generation:w.generation,births:w.creatures.reduce((s,c)=>s+c.births,0),kills:w.creatures.reduce((s,c)=>s+c.kills,0),avgEnergy:alive.length?alive.reduce((s,c)=>s+c.energy,0)/alive.length:0,foragers:alive.filter(c=>c.genome.aggression<.42).length,hunters:alive.filter(c=>c.genome.aggression>.52).length};}
