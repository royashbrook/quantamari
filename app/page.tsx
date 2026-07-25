"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Curio = { name: string; glyph: string; color: string };
type Era = {
  at: number;
  exp: number;
  name: string;
  quip: string;
  palette: [string, string, string];
  curios: Curio[];
};
type Thing = Curio & { id: number; x: number; y: number; r: number; big: boolean; a: number };
type Sticker = Curio & { a: number; d: number; s: number; tilt: number };

const JOURNEY = 1000;
const C = (name: string, glyph: string, color: string): Curio => ({ name, glyph, color });
const ERAS: Era[] = [
  { at: 0, exp: -35, name: "Planck Playground", quip: "Reality is still buffering", palette: ["#171039", "#40266e", "#ff87c8"], curios: [C("space wrinkle","〰","#f9a8d4"),C("quantum fizz","✦","#c4b5fd"),C("tiny maybe","?","#fde68a"),C("vacuum bubble","○","#67e8f9"),C("Planck crumb","·","#fca5a5")] },
  { at: .02, exp: -25, name: "Stringy Somewhere", quip: "Everything is wiggly", palette: ["#112342", "#24537d", "#54d7ff"], curios: [C("closed string","∞","#7dd3fc"),C("open string","∿","#f0abfc"),C("dimension curl","⌁","#fde68a"),C("gravity hum","♪","#a7f3d0"),C("brane flake","▱","#fda4af")] },
  { at: .06, exp: -18, name: "Quark Park", quip: "Up, down, strange, adorable", palette: ["#24143f", "#6d236c", "#ff76ba"], curios: [C("up quark","u","#fb7185"),C("down quark","d","#60a5fa"),C("strange quark","s","#a3e635"),C("gluon","g","#facc15"),C("electron","e⁻","#c084fc")] },
  { at: .2, exp: -15, name: "Particle Parade", quip: "Hadrons have entered the chat", palette: ["#1e2050", "#3e4f9d", "#67e8f9"], curios: [C("proton","p⁺","#fb7185"),C("neutron","n","#94a3b8"),C("neutrino","ν","#a7f3d0"),C("muon","μ","#f9a8d4"),C("photon","γ","#fde047")] },
  { at: .5, exp: -10, name: "Atom Arcade", quip: "Now with actual matter!", palette: ["#0d394a", "#16776e", "#6ee7b7"], curios: [C("hydrogen","H","#f8fafc"),C("helium","He","#fde68a"),C("carbon","C","#a7f3d0"),C("oxygen","O","#7dd3fc"),C("gold atom","Au","#facc15")] },
  { at: 2, exp: -8, name: "Molecule Meadows", quip: "Chemistry gets sticky", palette: ["#103a42", "#3c7757", "#c1e775"], curios: [C("water","H₂O","#7dd3fc"),C("sugar","◇","#fef3c7"),C("protein curl","〽","#f9a8d4"),C("salt","▧","#e2e8f0"),C("caffeine","☕","#c08457")] },
  { at: 10, exp: -6, name: "Microbe Marsh", quip: "The snacks wiggle back", palette: ["#154039", "#378849", "#c8ef70"], curios: [C("bacterium","🦠","#bef264"),C("cell","◉","#f9a8d4"),C("pollen","✿","#fde047"),C("yeast","●","#fef3c7"),C("mitochondrion","ϟ","#fb7185")] },
  { at: 40, exp: -3, name: "Tiny Things", quip: "Pocket lint: apex predator", palette: ["#214331", "#5f823b", "#f5d76e"], curios: [C("dust mite","✣","#fda4af"),C("sand grain","•","#fde68a"),C("ant","🐜","#3f3f46"),C("crumb","◆","#d6a66f"),C("pepper flake","▲","#ef4444")] },
  { at: 120, exp: 0, name: "Everyday Kingdom", quip: "Chairs fear you now", palette: ["#225176", "#4da8ad", "#f7d98f"], curios: [C("sock","🧦","#fb7185"),C("guitar","🎸","#c08457"),C("couch","▰","#f59e0b"),C("mailbox","📫","#60a5fa"),C("tiny car","🚗","#ef4444")] },
  { at: 250, exp: 3, name: "City Snack", quip: "Please roll responsibly", palette: ["#27325d", "#536fa7", "#ffb970"], curios: [C("bungalow","🏠","#fca5a5"),C("office","🏢","#94a3b8"),C("bridge","⌒","#cbd5e1"),C("stadium","⬭","#86efac"),C("skyscraper","▥","#7dd3fc")] },
  { at: 430, exp: 7, name: "Planet Pantry", quip: "Continents are crunchy", palette: ["#071c47", "#15518b", "#38bdf8"], curios: [C("moon","🌙","#e2e8f0"),C("Mercury","●","#a8a29e"),C("Earth","🌎","#38bdf8"),C("Saturn","🪐","#fde68a"),C("comet","☄","#a5f3fc")] },
  { at: 600, exp: 9, name: "Stellar Buffet", quip: "A light lunch", palette: ["#121133", "#422a66", "#fb7185"], curios: [C("red dwarf","★","#fb7185"),C("yellow star","☀","#fde047"),C("blue giant","✹","#7dd3fc"),C("pulsar","✦","#f0abfc"),C("black hole","◉","#171717")] },
  { at: 760, exp: 21, name: "Galaxy Garden", quip: "Spiral, serve, repeat", palette: ["#130b31", "#45216e", "#c084fc"], curios: [C("spiral galaxy","🌀","#c4b5fd"),C("star cluster","⁙","#fde68a"),C("nebula","☁","#f9a8d4"),C("quasar","✧","#67e8f9"),C("dark matter knot","⌘","#818cf8")] },
  { at: 900, exp: 26, name: "Universe Course", quip: "One cosmos, extra sauce", palette: ["#07031d", "#2a1753", "#8b5cf6"], curios: [C("observable universe","◎","#c4b5fd"),C("cosmic web","⌗","#67e8f9"),C("great void","◌","#312e81"),C("timeline","⟶","#f9a8d4"),C("big bang","✺","#fef08a")] },
  { at: 1000, exp: 60, name: "Metaversal Mischief", quip: "Infinity was only the tutorial", palette: ["#0a021d", "#4d145e", "#ff4fd8"], curios: [C("pocket reality","◈","#f0abfc"),C("alternate you","☺","#fde68a"),C("story dimension","✎","#7dd3fc"),C("causality pretzel","♾","#f9a8d4"),C("omniverse crumb","✦","#fff")] },
];

function eraAt(hours: number) {
  for (let i = ERAS.length - 1; i >= 0; i--) if (hours >= ERAS[i].at) return i;
  return 0;
}
function exponentAt(hours: number) {
  if (hours >= JOURNEY) return 60 + Math.log2(1 + (hours - JOURNEY) / 10) * 10;
  const i = eraAt(hours), a = ERAS[i], b = ERAS[Math.min(i + 1, ERAS.length - 1)];
  if (a === b) return a.exp;
  let t = (hours - a.at) / (b.at - a.at);
  t = t * t * (3 - 2 * t);
  return a.exp + (b.exp - a.exp) * t;
}
function scaleText(hours: number) {
  const n = exponentAt(hours), exp = Math.floor(n), m = 10 ** (n - exp);
  return `${m.toFixed(2)} × 10^${exp} m`;
}
function hourText(hours: number) {
  if (hours < 1 / 60) return `${Math.floor(hours * 3600)}s`;
  if (hours < 1) return `${Math.floor(hours * 60)}m`;
  return `${hours.toFixed(hours < 10 ? 2 : 1)}h`;
}
function random(seed: number) {
  const x = Math.sin(seed * 9283.312 + 77.13) * 43758.5453;
  return x - Math.floor(x);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const things = useRef<Thing[]>([]);
  const stickers = useRef<Sticker[]>([]);
  const keys = useRef<Record<string, boolean>>({});
  const stick = useRef({ on: false, x: 0, y: 0, ox: 0, oy: 0 });
  const audio = useRef<AudioContext | null>(null);
  const game = useRef({
    x: 0, y: 0, vx: 0, vy: 0, r: 35, hours: 0, picked: 0, zooms: 0,
    era: 0, running: false, sound: true, distance: 0, lastPickup: -99,
    lastSave: 0, id: 0,
  });
  const [started, setStarted] = useState(false);
  const [atlas, setAtlas] = useState(false);
  const [sound, setSound] = useState(true);
  const [toast, setToast] = useState("Roll over anything smaller than you.");
  const [hud, setHud] = useState({ hours: 0, picked: 0, era: 0, scale: scaleText(0), progress: 0 });

  const ping = useCallback((pitch = 440, fanfare = false) => {
    if (!game.current.sound) return;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = audio.current ?? new Ctx();
    audio.current = ctx;
    const osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime;
    osc.type = fanfare ? "triangle" : "sine";
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * (fanfare ? 2.4 : 1.45), now + (fanfare ? .38 : .1));
    gain.gain.setValueAtTime(fanfare ? .12 : .055, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + (fanfare ? .45 : .13));
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(now + (fanfare ? .46 : .14));
  }, []);

  const begin = useCallback(() => {
    game.current.running = true;
    setStarted(true);
    setToast("Go get those suspiciously small things!");
    audio.current?.resume();
  }, []);
  const toggleSound = useCallback(() => {
    const next = !game.current.sound;
    game.current.sound = next; setSound(next);
    if (next) ping(520);
  }, [ping]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("everything-roll-save-v1");
      if (!raw) return;
      const s = JSON.parse(raw);
      Object.assign(game.current, {
        hours: Number(s.hours) || 0, picked: Number(s.picked) || 0,
        x: Number(s.x) || 0, y: Number(s.y) || 0, zooms: Number(s.zooms) || 0,
        sound: s.sound ?? true,
      });
      game.current.era = eraAt(game.current.hours);
      setSound(game.current.sound);
    } catch { localStorage.removeItem("everything-roll-save-v1"); }
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key.toLowerCase() === "m") toggleSound();
      if (e.key.toLowerCase() === "a") setAtlas(v => !v);
      if (!game.current.running && [" ","enter"].includes(e.key.toLowerCase())) begin();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    addEventListener("keydown", down, { passive: false }); addEventListener("keyup", up);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); };
  }, [begin, toggleSound]);

  useEffect(() => {
    const canvas = canvasRef.current, wrapper = worldRef.current;
    if (!canvas || !wrapper) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = 0, height = 0, dpr = 1, last = performance.now(), spawnClock = 0, hudClock = 0, frame = 0;
    const resize = () => {
      const b = wrapper.getBoundingClientRect(); width = b.width; height = b.height;
      dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = width * dpr; canvas.height = height * dpr;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    const addThing = (seed: number) => {
      const g = game.current, era = ERAS[g.era], a = random(seed + g.id * 7) * Math.PI * 2;
      const d = 240 + random(seed + 11) * Math.max(width, height) * 1.2;
      const big = random(seed + 29) > .82;
      const curio = era.curios[Math.floor(random(seed + 53) * era.curios.length)];
      things.current.push({ ...curio, id: ++g.id, x: g.x + Math.cos(a)*d, y: g.y + Math.sin(a)*d,
        r: big ? g.r * (1.15 + random(seed + 81)*.7) : 8 + random(seed + 41)*g.r*.58,
        big, a: random(seed + 3)*Math.PI*2 });
    };
    const populate = () => {
      const g = game.current;
      things.current = things.current.filter(t => Number.isFinite(t.x) && Math.hypot(t.x-g.x,t.y-g.y) < 1900);
      while (things.current.length < 80) addThing(performance.now()*.002 + things.current.length*109);
    };
    const blob = (x: number,y: number,r: number,color: string,a: number,big: boolean) => {
      ctx.save(); ctx.translate(x,y); ctx.rotate(a); ctx.beginPath();
      for (let i=0;i<=18;i++) {
        const q=i/18*Math.PI*2, m=1+Math.sin(q*3+a)*.055, px=Math.cos(q)*r*m, py=Math.sin(q)*r*m;
        if(i) ctx.lineTo(px,py); else ctx.moveTo(px,py);
      }
      ctx.closePath(); ctx.shadowColor="rgba(5,5,20,.36)"; ctx.shadowBlur=big?17:9; ctx.shadowOffsetY=big?9:4;
      ctx.fillStyle=color; ctx.fill(); ctx.shadowColor="transparent"; ctx.lineWidth=Math.max(2,r*.08);
      ctx.strokeStyle=big?"rgba(255,255,255,.84)":"rgba(255,255,255,.52)"; ctx.stroke(); ctx.restore();
    };
    const draw = (now: number) => {
      const g=game.current, era=ERAS[g.era], [deep,mid,pop]=era.palette;
      const bg=ctx.createRadialGradient(width*.5,height*.45,0,width*.5,height*.45,Math.max(width,height)*.85);
      bg.addColorStop(0,mid); bg.addColorStop(1,deep); ctx.fillStyle=bg; ctx.fillRect(0,0,width,height);
      ctx.globalAlpha=.12; ctx.strokeStyle=pop; ctx.lineWidth=1; const grid=74, ox=(((-g.x*.22)%grid)+grid)%grid, oy=(((-g.y*.22)%grid)+grid)%grid;
      for(let x=ox;x<width;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
      for(let y=oy;y<height;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();} ctx.globalAlpha=1;
      for(let i=0;i<32;i++){const x=(random(i*17+g.era)*width-g.x*(.02+(i%4)*.006)+width*4)%width,y=(random(i*31+4)*height-g.y*(.02+(i%3)*.004)+height*4)%height;ctx.beginPath();ctx.fillStyle=i%5? "rgba(255,255,255,.5)":pop;ctx.arc(x,y,1+i%3,0,Math.PI*2);ctx.fill();}
      const camX=g.x-width/2,camY=g.y-height/2;
      things.current.filter(t=>t.x-camX>-100&&t.x-camX<width+100&&t.y-camY>-100&&t.y-camY<height+100).sort((a,b)=>a.r-b.r).forEach(t=>{
        const x=t.x-camX,y=t.y-camY,pulse=1+Math.sin(now*.002+t.a)*.035; blob(x,y,t.r*pulse,t.color,t.a+now*.0002,t.big);
        ctx.save();ctx.translate(x,y);ctx.font=`800 ${Math.max(10,t.r*(t.glyph.length>2?.65:1.1))}px Arial`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#21132e";ctx.fillText(t.glyph,0,1);ctx.restore();
        if(t.big&&t.r<g.r*1.7){ctx.font="700 9px monospace";ctx.textAlign="center";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("TOO BIG",x,y+t.r+15);}
      });
      const cx=width/2,cy=height/2,roll=g.distance/Math.max(18,g.r);ctx.save();ctx.translate(cx,cy);ctx.rotate(roll);
      ctx.shadowColor="rgba(5,5,20,.45)";ctx.shadowBlur=23;ctx.shadowOffsetY=12;
      const ball=ctx.createRadialGradient(-g.r*.35,-g.r*.45,1,0,0,g.r*1.1);ball.addColorStop(0,"#fff8b5");ball.addColorStop(.44,"#ffcf3f");ball.addColorStop(1,"#ff6b55");
      ctx.beginPath();ctx.arc(0,0,g.r,0,Math.PI*2);ctx.fillStyle=ball;ctx.fill();ctx.shadowColor="transparent";ctx.lineWidth=4;ctx.strokeStyle="rgba(100,30,70,.42)";ctx.stroke();
      ctx.strokeStyle="rgba(145,49,48,.24)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,g.r*.62,-.9,1.8);ctx.stroke();
      stickers.current.forEach((s,i)=>{ctx.save();ctx.translate(Math.cos(s.a)*s.d,Math.sin(s.a)*s.d);ctx.rotate(s.tilt-roll);ctx.font=`800 ${s.s}px Arial`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#221634";ctx.fillText(s.glyph,0,Math.sin(now*.008+i)*2);ctx.restore();});
      ctx.fillStyle="#2f163b";ctx.beginPath();ctx.arc(-g.r*.28,-g.r*.16,Math.max(2.5,g.r*.075),0,Math.PI*2);ctx.arc(g.r*.28,-g.r*.16,Math.max(2.5,g.r*.075),0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#2f163b";ctx.lineWidth=Math.max(2,g.r*.055);ctx.beginPath();ctx.arc(0,g.r*.03,g.r*.24,.18,Math.PI-.18);ctx.stroke();ctx.restore();
    };
    const collect = (t: Thing, now: number) => {
      const g=game.current;g.picked++;g.lastPickup=now/1000;g.r+=Math.min(.85,.35+t.r*.014);
      setToast(`${t.name} acquired!`);stickers.current.push({...t,a:Math.atan2(t.y-g.y,t.x-g.x),d:g.r*(.63+Math.random()*.32),s:Math.max(9,Math.min(18,t.r*.72)),tilt:Math.random()*Math.PI*2});
      if(stickers.current.length>18)stickers.current.shift();ping(300+Math.min(700,g.picked%12*43));
      if(g.r>=67){g.r=36;g.zooms++;things.current=[];stickers.current=stickers.current.slice(-7);setToast(`ZOOM OUT #${g.zooms} — somehow, there is still more.`);ping(350+g.era*20,true);}
    };
    const tick = (now: number) => {
      const g=game.current,dt=Math.min(.033,(now-last)/1000);last=now;
      if(g.running&&!atlas){
        let ix=0,iy=0;if(keys.current.w||keys.current.arrowup)iy--;if(keys.current.s||keys.current.arrowdown)iy++;if(keys.current.a||keys.current.arrowleft)ix--;if(keys.current.d||keys.current.arrowright)ix++;
        if(stick.current.on){ix+=Math.max(-1,Math.min(1,(stick.current.x-stick.current.ox)/54));iy+=Math.max(-1,Math.min(1,(stick.current.y-stick.current.oy)/54));}
        const len=Math.hypot(ix,iy);if(len>.05){ix/=Math.max(1,len);iy/=Math.max(1,len);const accel=760*(keys.current[" "]?1.32:1);g.vx+=ix*accel*dt;g.vy+=iy*accel*dt;const engaged=Math.max(0,1-(now/1000-g.lastPickup)/8);g.hours+=dt*(.72+engaged*.28)/3600;}
        const drag=Math.pow(.052,dt);g.vx*=drag;g.vy*=drag;const speed=Math.hypot(g.vx,g.vy),max=keys.current[" "]?355:270;if(speed>max){g.vx=g.vx/speed*max;g.vy=g.vy/speed*max;}
        g.x+=g.vx*dt;g.y+=g.vy*dt;g.distance+=speed*dt;
        const old=g.era;g.era=eraAt(g.hours);if(old!==g.era){things.current=[];stickers.current=[];setToast(`${ERAS[g.era].name.toUpperCase()} UNLOCKED!`);ping(360+g.era*22,true);}
        things.current.forEach(t=>{const dx=t.x-g.x,dy=t.y-g.y,d=Math.hypot(dx,dy);if(d<g.r+t.r*.68){if(t.r<=g.r*.9){collect(t,now);t.x=Infinity;}else if(d){g.vx-=dx/d*140;g.vy-=dy/d*140;if(now/1000-g.lastPickup>.8)setToast(`${t.name} is too big — keep rolling.`);}}});
        things.current=things.current.filter(t=>Number.isFinite(t.x));
      }
      spawnClock+=dt;if(spawnClock>.35||things.current.length<50){populate();spawnClock=0;}
      hudClock+=dt;if(hudClock>.14){const i=g.era,a=ERAS[i],b=ERAS[Math.min(i+1,ERAS.length-1)],progress=a===b?1:Math.max(0,Math.min(1,(g.hours-a.at)/(b.at-a.at)));setHud({hours:g.hours,picked:g.picked,era:i,scale:scaleText(g.hours),progress});hudClock=0;}
      if(now-g.lastSave>5000){localStorage.setItem("everything-roll-save-v1",JSON.stringify({hours:g.hours,picked:g.picked,x:g.x,y:g.y,zooms:g.zooms,sound:g.sound}));g.lastSave=now;}
      draw(now);frame=requestAnimationFrame(tick);
    };
    resize();populate();addEventListener("resize",resize);frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);removeEventListener("resize",resize);};
  }, [atlas,ping]);

  const down=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!started)return;Object.assign(stick.current,{on:true,x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY});e.currentTarget.setPointerCapture(e.pointerId);};
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(stick.current.on){stick.current.x=e.clientX;stick.current.y=e.clientY;}};
  const up=()=>{stick.current.on=false;};
  const era=ERAS[hud.era],next=ERAS[Math.min(hud.era+1,ERAS.length-1)],remaining=Math.max(0,JOURNEY-hud.hours);

  return <main className="shell">
    <div ref={worldRef} className="world" style={{"--pop":era.palette[2]} as React.CSSProperties}>
      <canvas ref={canvasRef} className="canvas" aria-label="Everything Roll game world" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
      <header className="topbar">
        <div className="brand"><div className="brand-ball">✦</div><div><b>EVERYTHING ROLL</b><small>a very small adventure</small></div></div>
        <div className="actions"><button onClick={()=>setAtlas(true)}>⌁ <span>Scale atlas</span></button><button className="sound" onClick={toggleSound} aria-label={sound?"Mute sound":"Turn on sound"}>{sound?"♪":"×"}</button></div>
      </header>
      <section className="scale-card" aria-live="polite">
        <div className="kicker"><span>{era.name}</span><span className="active">ACTIVE SCALE</span></div>
        <div className="scale">{hud.scale}</div><div className="quip">{era.quip}</div>
        <div className="track"><i style={{width:`${Math.max(1.5,hud.progress*100)}%`}}/></div>
        <div className="meta"><span>Next: {next.name}</span><span>{(hud.progress*100).toFixed(2)}%</span></div>
      </section>
      <aside className="stats">
        <div><b>{hud.picked.toLocaleString()}</b><small>things rolled</small></div><i/>
        <div><b>{hourText(hud.hours)}</b><small>deep journey</small></div><i/>
        <div><b>{remaining?`${Math.ceil(remaining)}h`:"∞"}</b><small>{remaining?"to metaverse":"past metaverse"}</small></div>
      </aside>
      <div className="toast"><span>✦</span>{toast}</div>
      <div className="controls"><span><kbd>WASD</kbd> / arrows to roll</span><span><kbd>SPACE</kbd> for reckless enthusiasm</span></div>
      <div className="touch-tip">◎ drag anywhere to roll</div>

      {!started&&<section className="welcome">
        <div className="eyebrow">BEGIN AT 1.6 × 10⁻³⁵ METERS</div>
        <h1>Start with almost<br/><em>absolutely nothing.</em></h1>
        <p>Roll up everything smaller than you—from quantum fizz and quarks to socks, cities, galaxies, and realities nobody ordered.</p>
        <button className="start" onClick={begin}><span>Start rolling</span><b>→</b></button>
        <div className="welcome-foot"><span>NO TIMER</span><span>•</span><span>AUTO-SAVES HERE</span><span>•</span><span>INFINITE AFTER 1,000H</span></div>
      </section>}

      {atlas&&<section className="atlas-bg" role="dialog" aria-modal="true" aria-label="Scale atlas">
        <div className="atlas">
          <header><div><div className="eyebrow">THE RIDICULOUSLY LONG VIEW</div><h2>Scale atlas</h2><p>The early universe opens quickly; later scales settle into the thousand-hour long game. Progress only advances while you roll.</p></div><button onClick={()=>setAtlas(false)} aria-label="Close atlas">×</button></header>
          <div className="era-list">{ERAS.map((item,i)=><article key={item.name} className={`${hud.hours>=item.at?"reached":""} ${i===hud.era?"current":""}`}>
            <div className="orb" style={{background:item.palette[2]}}>{item.curios[0].glyph}</div>
            <div><span>{item.at?`~${hourText(item.at)}`:"START"}</span><h3>{item.name}</h3><p>{item.quip}</p></div><code>10^{item.exp} m</code>
          </article>)}<article className="forever"><div className="orb">∞</div><div><span>FOREVER</span><h3>The Procedural Beyond</h3><p>New orders of magnitude. New nonsense. No ceiling.</p></div><code>∞ m</code></article></div>
        </div>
      </section>}
    </div>
  </main>;
}
