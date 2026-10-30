import { useEffect, useRef, useState } from "react";
import "./styles.css";

type Brain = { layers?: {size:number;activation:number[]}[]; output?:number[]; weights?:number[][][] };
type Snapshot = {
  status:string; step?:number; brain?:Brain|null; observation?:number[];
  body?:{points:Record<string,[number,number]>;root_x:number;root_z:number;pitch:number;forward_velocity:number}|null;
  metrics?:{episode_reward?:number;episode_done?:boolean}; error?:string;
};

function drawBody(canvas:HTMLCanvasElement,s:Snapshot|null){
  const c=canvas.getContext("2d");if(!c)return;
  const w=canvas.clientWidth,h=canvas.clientHeight,d=devicePixelRatio||1;canvas.width=w*d;canvas.height=h*d;c.setTransform(d,0,0,d,0,0);
  c.fillStyle="#0a1421";c.fillRect(0,0,w,h);c.strokeStyle="rgba(120,160,190,.08)";
  for(let x=0;x<w;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
  const ground=h*.82;c.strokeStyle="#60758a";c.lineWidth=2;c.beginPath();c.moveTo(0,ground);c.lineTo(w,ground);c.stroke();
  if(!s?.body?.points){c.fillStyle="#9aabba";c.textAlign="center";c.font="13px Inter,sans-serif";c.fillText("Ожидание физической симуляции",w/2,h/2);c.font="11px Inter,sans-serif";c.fillStyle="#60758a";c.fillText("Запусти обучение — здесь появится тело",w/2,h/2+23);return;}
  const p=s.body.points,scale=Math.min(w/3.6,h/1.9),px=(v:[number,number]):[number,number]=>[w/2+(v[0]-s.body!.root_x)*scale,ground-v[1]*scale];
  const links:[string,string][]=[["pelvis","torso"],["torso","head"],["pelvis","left_thigh"],["left_thigh","left_shin"],["left_shin","left_foot"],["pelvis","right_thigh"],["right_thigh","right_shin"],["right_shin","right_foot"],["torso","left_upper_arm"],["left_upper_arm","left_forearm"],["left_forearm","left_hand"],["torso","right_upper_arm"],["right_upper_arm","right_forearm"],["right_forearm","right_hand"]];
  c.lineCap="round";c.lineJoin="round";
  for(const [a,b] of links){if(!p[a]||!p[b])continue;const a1=px(p[a]),b1=px(p[b]);c.strokeStyle=a.includes("left")?"#63d9cf":"#86a9f7";c.lineWidth=a==="pelvis"||a==="torso"?13:9;c.beginPath();c.moveTo(a1[0],a1[1]);c.lineTo(b1[0],b1[1]);c.stroke();}
  for(const [name,v] of Object.entries(p)){const q=px(v);c.fillStyle=name.includes("left")?"#b2fff0":name.includes("right")?"#c5d5ff":"#f2f7fb";c.beginPath();c.arc(q[0],q[1],name==="head"?10:5,0,Math.PI*2);c.fill();}
  c.fillStyle="#91a6b9";c.font="10px monospace";c.textAlign="left";c.fillText("PHYSICS · MUJOCO",16,22);c.textAlign="right";c.fillText("v "+s.body.forward_velocity.toFixed(2)+" m/s",w-16,22);
}

function drawBrain(canvas:HTMLCanvasElement,s:Snapshot|null){
  const c=canvas.getContext("2d");if(!c)return;const w=canvas.clientWidth,h=canvas.clientHeight,d=devicePixelRatio||1;canvas.width=w*d;canvas.height=h*d;c.setTransform(d,0,0,d,0,0);c.fillStyle="#0a1421";c.fillRect(0,0,w,h);
  const b=s?.brain;if(!b?.layers?.length||!b.weights?.length||!s?.observation){c.fillStyle="#9aabba";c.textAlign="center";c.font="13px Inter,sans-serif";c.fillText("Нейросеть появится после первого шага обучения",w/2,h/2-5);c.fillStyle="#60758a";c.font="11px Inter,sans-serif";c.fillText("Здесь будут настоящие активации и веса политики",w/2,h/2+18);return;}
  const raw=[s.observation,...b.layers.map(x=>x.activation),b.output||[]],cap=18;
  const ids=raw.map(a=>Array.from({length:Math.min(cap,a.length)},(_,i)=>Math.round(i*(a.length-1)/Math.max(1,Math.min(cap,a.length)-1))));
  const xs=[w*.08,w*.34,w*.66,w*.92],nodes=raw.map((a,l)=>ids[l].map((idx,j)=>({x:xs[l],y:(j+1)*h/(ids[l].length+1),v:a[idx],i:idx})));
  for(let l=0;l<b.weights.length;l++){const m=b.weights[l],from=nodes[l],to=nodes[l+1];let max=0;for(const row of m)for(const v of row)max=Math.max(max,Math.abs(v));for(const t of to)for(const f of from){const value=m[t.i]?.[f.i]||0,alpha=Math.min(.48,Math.abs(value)/(max||1)*.48);if(alpha<.035)continue;c.strokeStyle=value>=0?"rgba(74,218,190,"+alpha+")":"rgba(173,127,255,"+alpha+")";c.lineWidth=.45+Math.abs(value)/(max||1)*1.25;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(t.x,t.y);c.stroke();}}
  nodes.forEach((layer)=>layer.forEach(n=>{const v=Math.max(-1,Math.min(1,n.v));c.fillStyle=v>=0?"rgba(91,235,200,"+(.22+Math.abs(v)*.78)+")":"rgba(176,139,255,"+(.22+Math.abs(v)*.78)+")";c.beginPath();c.arc(n.x,n.y,4+Math.abs(v)*2,0,Math.PI*2);c.fill();}));
  c.fillStyle="#8199ad";c.font="10px monospace";c.textAlign="center";["SENSORS","HIDDEN 1","HIDDEN 2","MOTOR"].forEach((v,i)=>c.fillText(v,xs[i],h-8));
}

export default function App(){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[connection,setConnection]=useState("connecting"),[busy,setBusy]=useState(false),[steps,setSteps]=useState(500000);
  const body=useRef<HTMLCanvasElement>(null),brain=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{let ws:WebSocket|undefined,timer:number|undefined,alive=true;const connect=()=>{ws=new WebSocket("ws://127.0.0.1:8000/ws/telemetry");ws.onopen=()=>alive&&setConnection("connected");ws.onmessage=e=>{const incoming=JSON.parse(e.data) as Snapshot;setSnapshot(prev=>{if(incoming.brain&&prev?.brain?.weights&&!incoming.brain.weights)incoming.brain.weights=prev.brain.weights;if(!incoming.observation&&prev?.observation)incoming.observation=prev.observation;return incoming;});setBusy(incoming.status==="training"||incoming.status==="starting");};ws.onclose=()=>{if(alive){setConnection("disconnected");timer=window.setTimeout(connect,1500);}};ws.onerror=()=>ws?.close();};connect();return()=>{alive=false;if(timer)clearTimeout(timer);ws?.close();};},[]);
  useEffect(()=>{if(body.current)drawBody(body.current,snapshot);if(brain.current)drawBrain(brain.current,snapshot);},[snapshot]);
  async function start(){setBusy(true);try{const r=await fetch("http://127.0.0.1:8000/api/train",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:"stand",total_timesteps:steps,n_envs:2})});const v=await r.json();if(!v.started)setBusy(false);}catch{setBusy(false);setConnection("disconnected");}}
  async function stop(){try{await fetch("http://127.0.0.1:8000/api/stop",{method:"POST"});}catch{}}
  const status=snapshot?.status==="training"?"ОБУЧЕНИЕ ИДЁТ":snapshot?.status==="completed"?"ЭТАП ЗАВЕРШЁН":snapshot?.status==="error"?"ОШИБКА":snapshot?.status==="starting"?"ЗАПУСК":"ОЖИДАНИЕ";
  return <main className="app">
    <header className="topbar"><div className="brand"><span className="brand-mark">G</span><div><b>GENESIS</b><small>EMBODIED LEARNING LAB</small></div></div><div className="top-status"><i className={connection==="connected"?"online":""}/>{connection==="connected"?"ЛОКАЛЬНЫЙ СЕРВЕР ПОДКЛЮЧЁН":"СЕРВЕР НЕ ПОДКЛЮЧЁН"} <span>/</span> {status}</div><div className="step-counter">STEP {snapshot?.step?.toLocaleString("en-US")||"—"}</div></header>
    <section className="intro"><div><span className="eyebrow">ОБУЧЕНИЕ ДВИЖЕНИЮ С НУЛЯ</span><h1>Как рождается движение</h1><p>Нейросеть управляет физическим телом. Каждое движение — результат её реальных вычислений.</p></div><div className="control-card"><div className="control-head"><span>ТРЕНИРОВОЧНЫЙ ЭТАП</span><span>01 / RECOVERY</span></div><div className="control-row"><label>Подъём и равновесие</label><input aria-label="Количество шагов" type="number" min="1000" max="50000000" step="1000" value={steps} onChange={e=>setSteps(Number(e.target.value))}/></div><div className="control-row"><button className="primary" disabled={busy||connection!=="connected"} onClick={start}>▶ Начать обучение</button><button className="secondary" disabled={!busy} onClick={stop}>Ⅱ Остановить</button></div><small>Первый навык: восстановление вертикального положения и контроль тела.</small></div></section>
    <section className="workspace"><article className="panel"><div className="panel-heading"><div><span className="eyebrow">01 · PHYSICS</span><h2>Тело и движение</h2></div><span className="live-pill"><i/> LIVE SIMULATION</span></div><canvas ref={body} className="body-canvas"/><div className="metrics"><div><small>СКОРОСТЬ</small><b>{snapshot?.body?.forward_velocity?.toFixed(2)??"—"} <em>м/с</em></b></div><div><small>НАКЛОН КОРПУСА</small><b>{snapshot?.body?.pitch?.toFixed(2)??"—"} <em>рад</em></b></div><div><small>ЭПИЗОД</small><b>{snapshot?.metrics?.episode_done?"ЗАВЕРШЁН":"В ПРОЦЕССЕ"}</b></div></div></article>
    <article className="panel"><div className="panel-heading"><div><span className="eyebrow">02 · NEURAL CONTROL</span><h2>Мозг управляющей политики</h2></div><span className="legend"><i className="positive"/> + <i className="negative"/> −</span></div><canvas ref={brain} className="brain-canvas"/><div className="brain-foot"><span>Узлы — реальные активации сети</span><span>Связи — реальные веса модели</span></div></article></section>
    <footer><span>GENESIS / RESEARCH BUILD</span><span>{snapshot?.error?"Ошибка: "+snapshot.error:"Активации — вычислительные состояния сети, не буквальные мысли."}</span></footer>
  </main>;
}
