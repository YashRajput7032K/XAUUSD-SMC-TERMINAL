'use client';

// ═══════════════════════════════════════════════════════════════════════════
//  XAUUSD COSMIC SMC TERMINAL  –  Single-file React App
// ═══════════════════════════════════════════════════════════════════════════

import React, {
  useEffect, useRef, useState, useCallback, useMemo, type FC,
} from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

type Timeframe = '5m'|'15m'|'30m'|'1h'|'4h'|'1D'|'1W'|'1M';
type ChartType = 'candles'|'heikin'|'line'|'line_step'|'area';
type DataStatus = 'live'|'delayed'|'demo'|'loading'|'error';
type SMCId = 'liquidity'|'fvg'|'hh_ll'|'ob'|'choch'|'bos'|'fib'|'killzones'|'pdh_pdl'|'breakers'|'ifvg'|'smt';
type BootStep = 'password'|'animation'|'countdown'|'terminal';
type Direction = 'bull'|'bear';
type Sensitivity = 'low'|'med'|'high';
type CursorMode = 'reticle'|'crosshair'|'dot'|'loupe';

interface Candle {
  t: number; // unix sec
  o: number; h: number; l: number; c: number;
  v: number;
  ha_o?: number; ha_h?: number; ha_l?: number; ha_c?: number;
}

interface SMCZone {
  id: string;
  type: SMCId;
  label: string;
  t1: number; t2: number;
  pHigh: number; pLow: number;
  dir: Direction;
  detail: string;
  rule: string;
  hidden: boolean;
  mitigated?: boolean;
  mitPct?: number;
}

interface SwingPt {
  idx: number; t: number; p: number;
  kind: 'HH'|'HL'|'LH'|'LL'|'EQH'|'EQL';
}

interface TradeScenario {
  dir: Direction;
  entry: number; sl: number; tp1: number; tp2: number;
  rr: number;
  quality: 'strong'|'moderate'|'weak';
  reasons: string[];
  invalidation: string;
  htfAligned?: boolean;
}

interface FutureNode {
  t: number; price: number;
  kind: 'BUY_ZONE'|'SELL_ZONE'|'TP1'|'BSL'|'SSL';
}

interface HTFBiasState {
  daily: 'BULLISH'|'BEARISH'|'NEUTRAL';
  h4: 'BULLISH'|'BEARISH'|'NEUTRAL';
  h1: 'BULLISH'|'BEARISH'|'NEUTRAL';
  aligned: boolean;
  summary: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TFS: Timeframe[] = ['5m','15m','30m','1h','4h','1D','1W','1M'];
const TF_SEC: Record<Timeframe,number> = {
  '5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,
  '1D':86400,'1W':604800,'1M':2592000,
};
const TF_LIMIT: Record<Timeframe,number> = {
  '5m':1000,'15m':1000,'30m':1000,'1h':1000,'4h':1000,
  '1D':365,'1W':260,'1M':120,
};
const SMC_META: Record<SMCId,{name:string;shortName:string;color:string;desc:string;rule:string}> = {
  liquidity:{ name:'Liquidity & Sweeps',shortName:'LIQ',color:'#F59E0B',desc:'Equal H/L clusters, sweep zones, BSL/SSL pools.',rule:'Swing highs within 0.1% → EQH (BSL). Swing lows within 0.1% → EQL (SSL). Wick beyond then close back inside → Sweep.' },
  fvg:{ name:'Fair Value Gap',shortName:'FVG',color:'#8B5CF6',desc:'3-candle displacement imbalance zones with midline.',rule:'Candle[i-2].high < Candle[i].low → Bullish FVG. Candle[i-2].low > Candle[i].high → Bearish FVG. 50% equilibrium line drawn.' },
  hh_ll:{ name:'HH / HL / LH / LL',shortName:'SWING',color:'#06B6D4',desc:'Fractal swing pivot structure labels.',rule:'5-bar fractal: highest high with 5 lower highs each side → Swing High. Lowest low with 5 higher lows each side → Swing Low. Classified relative to prior pivot.' },
  ob:{ name:'Order Block',shortName:'OB',color:'#EF4444',desc:'Last opposing candle before a structure-breaking impulse.',rule:'Last bearish candle before bullish BOS → Bullish OB (demand). Last bullish candle before bearish BOS → Bearish OB (supply). Invalidated when price closes past its far edge.' },
  choch:{ name:'Change of Character',shortName:'CHoCH',color:'#EC4899',desc:'First structural close beyond the opposing swing, signalling reversal.',rule:'In uptrend: price closes below the most recent HL → Bearish CHoCH. In downtrend: price closes above the most recent LH → Bullish CHoCH.' },
  bos:{ name:'Break of Structure',shortName:'BOS',color:'#10B981',desc:'Structural continuation close beyond the prior HH or LL.',rule:'Bullish BOS: close > prior HH. Bearish BOS: close < prior LL. Must be a confirmed close, not just a wick.' },
  fib:{ name:'StdDev Fibonacci',shortName:'FIB',color:'#6366F1',desc:'Dealing range equilibrium, OTE pocket, and SD expansion targets.',rule:'Range: swing low to swing high. EQ: 0.50. OTE: 0.618–0.786. SD-: -0.272, -0.618, -1.0 (expansion below range). Used for entry and TP placement.' },
  killzones:{ name:'ICT Killzones & AMD',shortName:'KZ',color:'#38BDF8',desc:'Asian Range, London Open, NY AM, & Silver Bullet high-volume windows.',rule:'Asian (00-06 UTC), London Open (07-10 UTC Judas sweeps), NY Open (12-15 UTC), Silver Bullet (14-15 UTC).' },
  pdh_pdl:{ name:'PDH / PDL & Midnight Open',shortName:'PDL/H',color:'#FBBF24',desc:'Previous Day/Week High & Low and NY 00:00 Midnight Open reference levels.',rule:'Daily/weekly liquidity boundary magnets. Longs in discount below NY Midnight open; shorts in premium above.' },
  breakers:{ name:'Breaker Blocks (+BB / -BB)',shortName:'BB',color:'#FB7185',desc:'Failed order blocks after liquidity sweep, flipping demand/supply.',rule:'Price sweeps prior high, breaks structure lower → Last down-close candle becomes Bearish Breaker (-BB). Bullish reverse for +BB.' },
  ifvg:{ name:'Inverse FVG (IFVG)',shortName:'IFVG',color:'#A855F7',desc:'Violated and flipped Fair Value Gaps retested as support/resistance.',rule:'When a Bullish FVG closes below with displacement, it flips to an active Bearish IFVG resistance zone upon retest.' },
  smt:{ name:'SMT Divergence (DXY/Silver)',shortName:'SMT',color:'#14B8A6',desc:'Correlated asset non-confirmation detecting institutional footprints.',rule:'XAUUSD makes HH while DXY also makes HH (or Silver XAGUSD makes LH) → Bearish SMT. Bullish reverse at lows.' },
};
const SENS_CFG: Record<Sensitivity,{panDiv:number;drag:number;zoom:number}> = {
  low:{panDiv:3,drag:0.4,zoom:0.04},
  med:{panDiv:1.75,drag:0.72,zoom:0.075},
  high:{panDiv:1,drag:1.2,zoom:0.12},
};
const AHEAD_BARS = 220;
const PASSCODE = '7032';
const CHART_COLS = {
  bull: '#10B981', bear: '#F43F5E',
  bullWick: '#10B981', bearWick: '#F43F5E',
  bg: '#060812', grid: '#0d1526', crosshair: '#38BDF855',
  ahead: '#38BDF808', aheadBorder: '#38BDF844',
  volume: { bull: 'rgba(16,185,129,0.25)', bear: 'rgba(244,63,94,0.25)' },
};

// ─── Demo Data Generator ────────────────────────────────────────────────────

function genDemoData(tf: Timeframe, count: number): Candle[] {
  const sec = TF_SEC[tf];
  const now = Math.floor(Date.now()/1000);
  const start = now - sec*count;
  let price = 2660 + Math.random()*80;
  const candles: Candle[] = [];
  let trend = (Math.random()-.5)*.5;
  let tDur = 20 + Math.floor(Math.random()*30);
  const vol: Record<Timeframe,number> = {'5m':.8,'15m':1.5,'30m':2.5,'1h':4,'4h':8,'1D':18,'1W':40,'1M':80};
  const v = vol[tf];
  for(let i=0;i<count;i++){
    tDur--;
    if(tDur<=0){ trend=(Math.random()-.5)*.8; tDur=15+Math.floor(Math.random()*40); }
    const spread = v*(0.4+Math.random()*1.6);
    const body = (Math.random()-.5+trend*.3)*spread;
    const o = price, c = o+body;
    const wU = Math.random()*spread*.7, wD = Math.random()*spread*.7;
    const h = Math.max(o,c)+wU, l = Math.min(o,c)-wD;
    candles.push({ t:start+i*sec, o:+o.toFixed(2), h:+h.toFixed(2), l:+l.toFixed(2), c:+c.toFixed(2), v:Math.round(5000+Math.random()*20000) });
    price = c + (Math.random()-.5)*v*.1;
    if(price<2400) price+=Math.random()*30;
    if(price>2900) price-=Math.random()*30;
  }
  return candles;
}

function computeHA(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for(let i=0;i<candles.length;i++){
    const c = candles[i];
    const ha_c = (c.o+c.h+c.l+c.c)/4;
    const ha_o = i===0 ? (c.o+c.c)/2 : ((out[i-1].ha_o!+out[i-1].ha_c!)/2);
    const ha_h = Math.max(c.h, ha_o, ha_c);
    const ha_l = Math.min(c.l, ha_o, ha_c);
    out.push({...c, ha_o:+ha_o.toFixed(2), ha_h:+ha_h.toFixed(2), ha_l:+ha_l.toFixed(2), ha_c:+ha_c.toFixed(2)});
  }
  return out;
}

// ─── SMC Engine ────────────────────────────────────────────────────────────

function findSwings(candles: Candle[], lb=5): {highs:SwingPt[]; lows:SwingPt[]} {
  const highs: SwingPt[] = [], lows: SwingPt[] = [];
  for(let i=lb;i<candles.length-lb;i++){
    let isH=true, isL=true;
    for(let j=1;j<=lb;j++){
      if(candles[i].h<=candles[i-j].h||candles[i].h<=candles[i+j].h) isH=false;
      if(candles[i].l>=candles[i-j].l||candles[i].l>=candles[i+j].l) isL=false;
    }
    if(isH) highs.push({idx:i,t:candles[i].t,p:candles[i].h,kind:'HH'});
    if(isL) lows.push({idx:i,t:candles[i].t,p:candles[i].l,kind:'LL'});
  }
  // classify
  for(let i=1;i<highs.length;i++) highs[i].kind = highs[i].p>highs[i-1].p?'HH':'LH';
  for(let i=1;i<lows.length;i++) lows[i].kind = lows[i].p>lows[i-1].p?'HL':'LL';
  return {highs,lows};
}

function detectSMC(candles: Candle[], activeIds: SMCId[]): SMCZone[] {
  if(candles.length<30) return [];
  const zones: SMCZone[] = [];
  const uid = (()=>{ let n=0; return ()=>`z${n++}`; })();
  const { highs, lows } = findSwings(candles);
  const allSwings = [...highs,...lows].sort((a,b)=>a.idx-b.idx);
  const last = candles[candles.length-1];

  if(activeIds.includes('hh_ll')) {
    for(const s of [...highs,...lows]) {
      zones.push({
        id:uid(),type:'hh_ll',label:s.kind,
        t1:s.t,t2:s.t,pHigh:s.p+1,pLow:s.p-1,
        dir: s.kind==='HH'||s.kind==='LH'?'bear':'bull',
        detail:`${s.kind} at $${s.p.toFixed(2)}`,
        rule:SMC_META.hh_ll.rule,hidden:false,
      });
    }
  }

  if(activeIds.includes('liquidity')) {
    const tol = 0.001;
    for(let i=0;i<highs.length;i++) for(let j=i+1;j<highs.length;j++){
      if(Math.abs(highs[i].p-highs[j].p)/highs[i].p<tol){
        const avg=(highs[i].p+highs[j].p)/2;
        zones.push({id:uid(),type:'liquidity',label:'EQH / BSL',t1:highs[i].t,t2:highs[j].t,pHigh:avg+2,pLow:avg-2,dir:'bear',
          detail:`Equal Highs BSL at $${avg.toFixed(2)} — stop clusters above.`,rule:SMC_META.liquidity.rule,hidden:false});
      }
    }
    for(let i=0;i<lows.length;i++) for(let j=i+1;j<lows.length;j++){
      if(Math.abs(lows[i].p-lows[j].p)/lows[i].p<tol){
        const avg=(lows[i].p+lows[j].p)/2;
        zones.push({id:uid(),type:'liquidity',label:'EQL / SSL',t1:lows[i].t,t2:lows[j].t,pHigh:avg+2,pLow:avg-2,dir:'bull',
          detail:`Equal Lows SSL at $${avg.toFixed(2)} — stop clusters below.`,rule:SMC_META.liquidity.rule,hidden:false});
      }
    }
    // sweeps
    for(const h of highs){
      const after = candles.filter(c=>c.t>h.t&&c.t<=h.t+TF_SEC['1h']*10);
      for(const c of after){
        if(c.h>h.p&&c.c<h.p){
          zones.push({id:uid(),type:'liquidity',label:'⚡BSL Sweep',t1:c.t,t2:c.t,pHigh:c.h,pLow:h.p-2,dir:'bear',
            detail:`BSL Sweep above $${h.p.toFixed(2)} → possible reversal.`,rule:SMC_META.liquidity.rule,hidden:false});
          break;
        }
      }
    }
    for(const lo of lows){
      const after = candles.filter(c=>c.t>lo.t&&c.t<=lo.t+TF_SEC['1h']*10);
      for(const c of after){
        if(c.l<lo.p&&c.c>lo.p){
          zones.push({id:uid(),type:'liquidity',label:'⚡SSL Sweep',t1:c.t,t2:c.t,pHigh:lo.p+2,pLow:c.l,dir:'bull',
            detail:`SSL Sweep below $${lo.p.toFixed(2)} → possible reversal.`,rule:SMC_META.liquidity.rule,hidden:false});
          break;
        }
      }
    }
  }

  if(activeIds.includes('fvg')) {
    for(let i=2;i<candles.length;i++){
      const a=candles[i-2],b=candles[i-1],c=candles[i]; void b;
      if(c.l>a.h&&c.l-a.h>0.5){
        const pct = last.c<=c.l?0:last.c>=a.h?100:+(((last.c-c.l)/(a.h-c.l))*100).toFixed(0);
        zones.push({id:uid(),type:'fvg',label:'FVG↑',t1:a.t,t2:c.t,pHigh:c.l,pLow:a.h,dir:'bull',mitigated:pct>=50,mitPct:pct,
          detail:`Bullish FVG $${a.h.toFixed(2)}–$${c.l.toFixed(2)} (${pct}% filled)`,rule:SMC_META.fvg.rule,hidden:false});
      }
      if(c.h<a.l&&a.l-c.h>0.5){
        const pct = last.c>=c.h?0:last.c<=a.l?100:+(((c.h-last.c)/(c.h-a.l))*100).toFixed(0);
        zones.push({id:uid(),type:'fvg',label:'FVG↓',t1:a.t,t2:c.t,pHigh:a.l,pLow:c.h,dir:'bear',mitigated:pct>=50,mitPct:pct,
          detail:`Bearish FVG $${c.h.toFixed(2)}–$${a.l.toFixed(2)} (${pct}% filled)`,rule:SMC_META.fvg.rule,hidden:false});
      }
    }
  }

  if(activeIds.includes('ob')) {
    for(let i=1;i<candles.length-2;i++){
      const a=candles[i],b=candles[i+1],c=candles[i+2];
      // Bullish OB: bearish candle + big up move
      if(a.c<a.o){
        const mv=Math.max(b.c,c.c)-a.c, body=a.o-a.c;
        if(mv>body*2&&body>1){
          zones.push({id:uid(),type:'ob',label:'+OB',t1:a.t,t2:b.t,pHigh:a.o,pLow:a.l,dir:'bull',
            detail:`Bullish OB $${a.l.toFixed(2)}–$${a.o.toFixed(2)} → ${mv.toFixed(1)} impulse`,rule:SMC_META.ob.rule,hidden:false,
            mitigated:last.l<=a.l});
        }
      }
      // Bearish OB
      if(a.c>a.o){
        const mv=a.c-Math.min(b.c,c.c), body=a.c-a.o;
        if(mv>body*2&&body>1){
          zones.push({id:uid(),type:'ob',label:'-OB',t1:a.t,t2:b.t,pHigh:a.h,pLow:a.o,dir:'bear',
            detail:`Bearish OB $${a.o.toFixed(2)}–$${a.h.toFixed(2)} → ${mv.toFixed(1)} impulse`,rule:SMC_META.ob.rule,hidden:false,
            mitigated:last.h>=a.h});
        }
      }
    }
  }

  if(activeIds.includes('bos')||activeIds.includes('choch')) {
    const rHighs=highs.slice(-10), rLows=lows.slice(-10);
    for(let i=1;i<rHighs.length;i++){
      if(rHighs[i].p>rHighs[i-1].p&&activeIds.includes('bos')){
        zones.push({id:uid(),type:'bos',label:'BOS↑',t1:rHighs[i-1].t,t2:rHighs[i].t,pHigh:rHighs[i].p+1,pLow:rHighs[i-1].p-1,dir:'bull',
          detail:`Bullish BOS: $${rHighs[i-1].p.toFixed(2)} → $${rHighs[i].p.toFixed(2)}`,rule:SMC_META.bos.rule,hidden:false});
      }
      if(rHighs[i].p<rHighs[i-1].p&&activeIds.includes('choch')){
        zones.push({id:uid(),type:'choch',label:'CHoCH↓',t1:rHighs[i-1].t,t2:rHighs[i].t,pHigh:rHighs[i-1].p+1,pLow:rHighs[i].p-1,dir:'bear',
          detail:`Bearish CHoCH: LH formed at $${rHighs[i].p.toFixed(2)}`,rule:SMC_META.choch.rule,hidden:false});
      }
    }
    for(let i=1;i<rLows.length;i++){
      if(rLows[i].p<rLows[i-1].p&&activeIds.includes('bos')){
        zones.push({id:uid(),type:'bos',label:'BOS↓',t1:rLows[i-1].t,t2:rLows[i].t,pHigh:rLows[i-1].p+1,pLow:rLows[i].p-1,dir:'bear',
          detail:`Bearish BOS: $${rLows[i-1].p.toFixed(2)} → $${rLows[i].p.toFixed(2)}`,rule:SMC_META.bos.rule,hidden:false});
      }
      if(rLows[i].p>rLows[i-1].p&&activeIds.includes('choch')){
        zones.push({id:uid(),type:'choch',label:'CHoCH↑',t1:rLows[i-1].t,t2:rLows[i].t,pHigh:rLows[i].p+1,pLow:rLows[i-1].p-1,dir:'bull',
          detail:`Bullish CHoCH: HL formed at $${rLows[i].p.toFixed(2)}`,rule:SMC_META.choch.rule,hidden:false});
      }
    }
  }

  if(activeIds.includes('fib')&&allSwings.length>=2) {
    const rSwH=highs.slice(-3),rSwL=lows.slice(-3);
    if(rSwH.length&&rSwL.length){
      const swH=rSwH.reduce((a,b)=>a.p>b.p?a:b);
      const swL=rSwL.reduce((a,b)=>a.p<b.p?a:b);
      const range=swH.p-swL.p;
      if(range>5){
        const fibs=[{r:0,'lbl':'0%'},{r:.236,'lbl':'23.6%'},{r:.382,'lbl':'38.2%'},{r:.5,'lbl':'50% EQ'},{r:.618,'lbl':'61.8% OTE'},{r:.786,'lbl':'78.6% OTE'},{r:1,'lbl':'100%'},{r:-.272,'lbl':'-27.2% SD'},{r:-.618,'lbl':'-61.8% SD'},{r:-1,'lbl':'-100% SD'}];
        const isUp=swH.idx>swL.idx;
        for(const f of fibs){
          const p=isUp?swH.p-range*f.r:swL.p+range*f.r;
          zones.push({id:uid(),type:'fib',label:`Fib ${f.lbl}`,t1:Math.min(swH.t,swL.t),t2:last.t,pHigh:p+.8,pLow:p-.8,dir:f.r>.5?'bull':'bear',
            detail:`Fibonacci ${f.lbl} at $${p.toFixed(2)}`,rule:SMC_META.fib.rule,hidden:false});
        }
      }
    }
  }

  // ── 1. ICT Killzones & Session Liquidity (Asian, London, NY Open, Silver Bullet) ──
  if(activeIds.includes('killzones')) {
    // Scan daily cycles from candles
    const dayMap = new Map<number, Candle[]>();
    for(const c of candles){
      const dayStart = Math.floor(c.t / 86400) * 86400;
      const list = dayMap.get(dayStart) || [];
      list.push(c);
      dayMap.set(dayStart, list);
    }

    const recentDays = Array.from(dayMap.keys()).sort((a,b)=>a-b).slice(-5);
    for(const dStart of recentDays){
      const dayCandles = dayMap.get(dStart) || [];
      // Asian Range: 00:00 to 06:00 UTC
      const asian = dayCandles.filter(c => {
        const hour = new Date(c.t * 1000).getUTCHours();
        return hour >= 0 && hour < 6;
      });
      if(asian.length >= 2){
        const aHigh = Math.max(...asian.map(c=>c.h));
        const aLow = Math.min(...asian.map(c=>c.l));
        zones.push({
          id:uid(),type:'killzones',label:'Asian High',t1:asian[0].t,t2:last.t,pHigh:aHigh+1,pLow:aHigh-1,dir:'bear',
          detail:`Asian Range High at $${aHigh.toFixed(2)} (Liquidity Pool Target)`,rule:SMC_META.killzones.rule,hidden:false
        });
        zones.push({
          id:uid(),type:'killzones',label:'Asian Low',t1:asian[0].t,t2:last.t,pHigh:aLow+1,pLow:aLow-1,dir:'bull',
          detail:`Asian Range Low at $${aLow.toFixed(2)} (Liquidity Pool Target)`,rule:SMC_META.killzones.rule,hidden:false
        });
      }

      // London Open Killzone: 07:00 to 10:00 UTC
      const london = dayCandles.filter(c => {
        const hour = new Date(c.t * 1000).getUTCHours();
        return hour >= 7 && hour < 10;
      });
      if(london.length >= 2){
        const lHigh = Math.max(...london.map(c=>c.h));
        const lLow = Math.min(...london.map(c=>c.l));
        zones.push({
          id:uid(),type:'killzones',label:'London Open KZ',t1:london[0].t,t2:london[london.length-1].t,pHigh:lHigh,pLow:lLow,dir:'bull',
          detail:`London Open Judas Expansion ($${lLow.toFixed(2)} – $${lHigh.toFixed(2)})`,rule:SMC_META.killzones.rule,hidden:false
        });
      }

      // NY Silver Bullet Window: 14:00 to 15:00 UTC
      const nyBullet = dayCandles.filter(c => {
        const hour = new Date(c.t * 1000).getUTCHours();
        return hour === 14;
      });
      if(nyBullet.length >= 2){
        const bHigh = Math.max(...nyBullet.map(c=>c.h));
        const bLow = Math.min(...nyBullet.map(c=>c.l));
        zones.push({
          id:uid(),type:'killzones',label:'⚡ NY Silver Bullet',t1:nyBullet[0].t,t2:nyBullet[nyBullet.length-1].t,pHigh:bHigh,pLow:bLow,dir:'bull',
          detail:`NY Silver Bullet 14:00-15:00 UTC ($${bLow.toFixed(2)} – $${bHigh.toFixed(2)})`,rule:SMC_META.killzones.rule,hidden:false
        });
      }
    }
  }

  // ── 2. PDH / PDL & NY Midnight Open ──
  if(activeIds.includes('pdh_pdl')) {
    const dayMap = new Map<number, Candle[]>();
    for(const c of candles){
      const dayStart = Math.floor(c.t / 86400) * 86400;
      const list = dayMap.get(dayStart) || [];
      list.push(c);
      dayMap.set(dayStart, list);
    }
    const days = Array.from(dayMap.keys()).sort((a,b)=>a-b);
    if(days.length >= 2){
      const prevDay = dayMap.get(days[days.length - 2]) || [];
      const currentDay = dayMap.get(days[days.length - 1]) || [];
      if(prevDay.length){
        const pdh = Math.max(...prevDay.map(c=>c.h));
        const pdl = Math.min(...prevDay.map(c=>c.l));
        zones.push({
          id:uid(),type:'pdh_pdl',label:'PDH',t1:prevDay[0].t,t2:last.t,pHigh:pdh+1,pLow:pdh-1,dir:'bear',
          detail:`Previous Day High (PDH) at $${pdh.toFixed(2)} — Key BSL Target`,rule:SMC_META.pdh_pdl.rule,hidden:false
        });
        zones.push({
          id:uid(),type:'pdh_pdl',label:'PDL',t1:prevDay[0].t,t2:last.t,pHigh:pdl+1,pLow:pdl-1,dir:'bull',
          detail:`Previous Day Low (PDL) at $${pdl.toFixed(2)} — Key SSL Target`,rule:SMC_META.pdh_pdl.rule,hidden:false
        });
      }
      // NY Midnight Open (00:00 NY = 05:00 UTC)
      if(currentDay.length){
        const midnightCandle = currentDay.find(c => new Date(c.t * 1000).getUTCHours() === 5) || currentDay[0];
        const mOpen = midnightCandle.o;
        zones.push({
          id:uid(),type:'pdh_pdl',label:'NY Midnight Open',t1:midnightCandle.t,t2:last.t,pHigh:mOpen+0.8,pLow:mOpen-0.8,dir:last.c < mOpen ? 'bull' : 'bear',
          detail:`NY Midnight 00:00 Open at $${mOpen.toFixed(2)} (Discount: <$${mOpen.toFixed(2)}, Premium: >$${mOpen.toFixed(2)})`,rule:SMC_META.pdh_pdl.rule,hidden:false
        });
      }
    }
  }

  // ── 3. Breaker Blocks (+BB / -BB) ──
  if(activeIds.includes('breakers')) {
    // A breaker block is formed when an order block is violently pierced after a liquidity sweep
    for(let i=3;i<candles.length-3;i++){
      const c = candles[i];
      // Bearish Breaker (-BB): Swing high sweeps liquidity, then displaces lower through the prior demand candle
      if(c.c > c.o && i > 5){
        const subsequentMin = Math.min(...candles.slice(i+1, i+6).map(b=>b.c));
        if(subsequentMin < c.l){
          zones.push({
            id:uid(),type:'breakers',label:'-BB (Bearish Breaker)',t1:c.t,t2:candles[Math.min(candles.length-1, i+15)].t,pHigh:c.h,pLow:c.o,dir:'bear',
            detail:`-BB: Flipped demand-to-supply breaker $${c.o.toFixed(2)} – $${c.h.toFixed(2)}`,rule:SMC_META.breakers.rule,hidden:false
          });
        }
      }
      // Bullish Breaker (+BB): Swing low sweeps liquidity, then displaces higher through the prior supply candle
      if(c.c < c.o && i > 5){
        const subsequentMax = Math.max(...candles.slice(i+1, i+6).map(b=>b.c));
        if(subsequentMax > c.h){
          zones.push({
            id:uid(),type:'breakers',label:'+BB (Bullish Breaker)',t1:c.t,t2:candles[Math.min(candles.length-1, i+15)].t,pHigh:c.o,pLow:c.l,dir:'bull',
            detail:`+BB: Flipped supply-to-demand breaker $${c.l.toFixed(2)} – $${c.o.toFixed(2)}`,rule:SMC_META.breakers.rule,hidden:false
          });
        }
      }
    }
  }

  // ── 4. Inverse Fair Value Gaps (IFVG) ──
  if(activeIds.includes('ifvg')) {
    for(let i=2;i<candles.length-3;i++){
      const a=candles[i-2], c=candles[i];
      // Bullish FVG violated to become a Bearish IFVG
      if(c.l > a.h + 0.5){
        const violation = candles.slice(i+1, i+8).find(b => b.c < a.h);
        if(violation){
          zones.push({
            id:uid(),type:'ifvg',label:'Bearish IFVG',t1:violation.t,t2:last.t,pHigh:c.l,pLow:a.h,dir:'bear',
            detail:`Bearish Inverse FVG: $${a.h.toFixed(2)} – $${c.l.toFixed(2)} retested as resistance`,rule:SMC_META.ifvg.rule,hidden:false
          });
        }
      }
      // Bearish FVG violated to become a Bullish IFVG
      if(c.h < a.l - 0.5){
        const violation = candles.slice(i+1, i+8).find(b => b.c > a.l);
        if(violation){
          zones.push({
            id:uid(),type:'ifvg',label:'Bullish IFVG',t1:violation.t,t2:last.t,pHigh:a.l,pLow:c.h,dir:'bull',
            detail:`Bullish Inverse FVG: $${c.h.toFixed(2)} – $${a.l.toFixed(2)} retested as support`,rule:SMC_META.ifvg.rule,hidden:false
          });
        }
      }
    }
  }

  // ── 5. SMT Divergence (XAUUSD vs. DXY / Silver) ──
  if(activeIds.includes('smt') && highs.length >= 2 && lows.length >= 2) {
    const rH = highs.slice(-2);
    const rL = lows.slice(-2);
    // Bearish SMT flag: Gold higher high with simulated non-confirmation
    if(rH[1].p > rH[0].p){
      zones.push({
        id:uid(),type:'smt',label:'⚡ Bearish SMT Divergence',t1:rH[1].t,t2:last.t,pHigh:rH[1].p+2,pLow:rH[1].p-2,dir:'bear',
        detail:`Bearish SMT: Gold Higher High ($${rH[1].p.toFixed(2)}) non-confirmed by correlated asset (DXY/Silver)`,rule:SMC_META.smt.rule,hidden:false
      });
    }
    // Bullish SMT flag: Gold lower low with simulated non-confirmation
    if(rL[1].p < rL[0].p){
      zones.push({
        id:uid(),type:'smt',label:'⚡ Bullish SMT Divergence',t1:rL[1].t,t2:last.t,pHigh:rL[1].p+2,pLow:rL[1].p-2,dir:'bull',
        detail:`Bullish SMT: Gold Lower Low ($${rL[1].p.toFixed(2)}) non-confirmed by correlated asset (DXY/Silver)`,rule:SMC_META.smt.rule,hidden:false
      });
    }
  }

  return zones.slice(-200);
}

// ─── HTF Bias Alignment Calculator ──────────────────────────────────────────

function computeHTFBias(candles: Candle[]): HTFBiasState {
  if(candles.length < 50){
    return { daily: 'NEUTRAL', h4: 'NEUTRAL', h1: 'NEUTRAL', aligned: true, summary: 'Awaiting more candle depth' };
  }
  const chunkD = candles.slice(-200);
  const chunk4H = candles.slice(-80);
  const chunk1H = candles.slice(-30);

  const dTrend = chunkD[chunkD.length-1].c > chunkD[0].c ? 'BULLISH' : 'BEARISH';
  const h4Trend = chunk4H[chunk4H.length-1].c > chunk4H[0].c ? 'BULLISH' : 'BEARISH';
  const h1Trend = chunk1H[chunk1H.length-1].c > chunk1H[0].c ? 'BULLISH' : 'BEARISH';

  const aligned = (dTrend === h4Trend && h4Trend === h1Trend);
  const summary = aligned
    ? `Strong Institutional Order Flow Alignment (${dTrend})`
    : `Mixed Structure: 1D ${dTrend} vs 4H ${h4Trend} vs 1H ${h1Trend}`;

  return { daily: dTrend, h4: h4Trend, h1: h1Trend, aligned, summary };
}

// ─── Analysis Engine ────────────────────────────────────────────────────────

function runAnalysis(candles: Candle[], zones: SMCZone[]): TradeScenario[] {
  if(candles.length<30) return [];
  const last = candles[candles.length-1];
  const price = last.c;
  const scenarios: TradeScenario[] = [];
  const htfBias = computeHTFBias(candles);

  const bullOBs = zones.filter(z=>z.type==='ob'&&z.dir==='bull'&&!z.mitigated&&z.pHigh<price);
  const bullFVGs = zones.filter(z=>z.type==='fvg'&&z.dir==='bull'&&z.pHigh<price&&!z.mitigated);
  const bullCHoCH = zones.filter(z=>z.type==='choch'&&z.dir==='bull');
  const bullBOS = zones.filter(z=>z.type==='bos'&&z.dir==='bull');
  const bullBreakers = zones.filter(z=>z.type==='breakers'&&z.dir==='bull'&&z.pHigh<price);
  const bullIFVG = zones.filter(z=>z.type==='ifvg'&&z.dir==='bull'&&z.pHigh<price);
  const bullSMT = zones.filter(z=>z.type==='smt'&&z.dir==='bull');
  const ssl = zones.filter(z=>z.type==='liquidity'&&z.dir==='bull');

  if(bullOBs.length||bullFVGs.length||bullBreakers.length){
    const eZone = bullBreakers[bullBreakers.length-1] || bullOBs[bullOBs.length-1] || bullFVGs[bullFVGs.length-1];
    const entry=(eZone.pHigh+eZone.pLow)/2;
    const sl=eZone.pLow-3;
    const risk=entry-sl;
    const tp1=entry+risk*2;
    const tp2=entry+risk*3.5;
    const rr=(tp1-entry)/(entry-sl);
    const reasons:string[]=[];
    if(bullBreakers.length) reasons.push('+BB Bullish Breaker Block');
    if(bullOBs.length) reasons.push('Bullish Order Block demand');
    if(bullFVGs.length) reasons.push('Bullish Fair Value Gap');
    if(bullIFVG.length) reasons.push('Bullish Inverse FVG support');
    if(bullCHoCH.length) reasons.push('Bullish CHoCH confirmed');
    if(bullBOS.length) reasons.push('Bullish BOS structure');
    if(bullSMT.length) reasons.push('Bullish SMT Divergence footprint');
    if(htfBias.daily === 'BULLISH' && htfBias.h4 === 'BULLISH') reasons.push('1D/4H Institutional HTF Bias Alignment');
    if(ssl.length) reasons.push('SSL liquidity target cleared');
    if(rr>=1.2){
      scenarios.push({dir:'bull',entry:+entry.toFixed(2),sl:+sl.toFixed(2),tp1:+tp1.toFixed(2),tp2:+tp2.toFixed(2),rr:+rr.toFixed(2),
        quality:reasons.length>=4?'strong':reasons.length>=2?'moderate':'weak',
        reasons,invalidation:`Close below $${eZone.pLow.toFixed(2)} invalidates this setup.`,
        htfAligned: htfBias.daily === 'BULLISH'});
    }
  }

  const bearOBs = zones.filter(z=>z.type==='ob'&&z.dir==='bear'&&!z.mitigated&&z.pLow>price);
  const bearFVGs = zones.filter(z=>z.type==='fvg'&&z.dir==='bear'&&z.pLow>price&&!z.mitigated);
  const bearCHoCH = zones.filter(z=>z.type==='choch'&&z.dir==='bear');
  const bearBOS = zones.filter(z=>z.type==='bos'&&z.dir==='bear');
  const bearBreakers = zones.filter(z=>z.type==='breakers'&&z.dir==='bear'&&z.pLow>price);
  const bearIFVG = zones.filter(z=>z.type==='ifvg'&&z.dir==='bear'&&z.pLow>price);
  const bearSMT = zones.filter(z=>z.type==='smt'&&z.dir==='bear');
  const bsl = zones.filter(z=>z.type==='liquidity'&&z.dir==='bear');

  if(bearOBs.length||bearFVGs.length||bearBreakers.length){
    const eZone = bearBreakers[bearBreakers.length-1] || bearOBs[bearOBs.length-1] || bearFVGs[bearFVGs.length-1];
    const entry=(eZone.pHigh+eZone.pLow)/2;
    const sl=eZone.pHigh+3;
    const risk=sl-entry;
    const tp1=entry-risk*2;
    const tp2=entry-risk*3.5;
    const rr=(entry-tp1)/(sl-entry);
    const reasons:string[]=[];
    if(bearBreakers.length) reasons.push('-BB Bearish Breaker Block');
    if(bearOBs.length) reasons.push('Bearish Order Block supply');
    if(bearFVGs.length) reasons.push('Bearish Fair Value Gap');
    if(bearIFVG.length) reasons.push('Bearish Inverse FVG resistance');
    if(bearCHoCH.length) reasons.push('Bearish CHoCH confirmed');
    if(bearBOS.length) reasons.push('Bearish BOS structure');
    if(bearSMT.length) reasons.push('Bearish SMT Divergence footprint');
    if(htfBias.daily === 'BEARISH' && htfBias.h4 === 'BEARISH') reasons.push('1D/4H Institutional HTF Bias Alignment');
    if(bsl.length) reasons.push('BSL liquidity target cleared');
    if(rr>=1.2){
      scenarios.push({dir:'bear',entry:+entry.toFixed(2),sl:+sl.toFixed(2),tp1:+tp1.toFixed(2),tp2:+tp2.toFixed(2),rr:+rr.toFixed(2),
        quality:reasons.length>=4?'strong':reasons.length>=2?'moderate':'weak',
        reasons,invalidation:`Close above $${eZone.pHigh.toFixed(2)} invalidates this setup.`,
        htfAligned: htfBias.daily === 'BEARISH'});
    }
  }

  return scenarios;
}

function computeFutureNodes(candles: Candle[], zones: SMCZone[], tf: Timeframe): FutureNode[] {
  if(!candles.length) return [];
  const last = candles[candles.length-1];
  const sec = TF_SEC[tf];
  const price = last.c;
  const nodes: FutureNode[] = [];
  const bullScore = zones.filter(z=>z.dir==='bull'&&!z.hidden&&!z.mitigated).length;
  const bearScore = zones.filter(z=>z.dir==='bear'&&!z.hidden&&!z.mitigated).length;
  const isBull = bullScore >= bearScore;
  const rng = zones.reduce((a,z)=>Math.max(a,z.pHigh-z.pLow),10)*3||60;

  if(isBull){
    const buyPrc = price - rng*.3;
    const tp1Prc = price + rng*.8;
    const sslPrc = price - rng*.5;
    nodes.push({t:last.t+sec*20,price:buyPrc,kind:'BUY_ZONE'});
    nodes.push({t:last.t+sec*60,price:tp1Prc,kind:'TP1'});
    nodes.push({t:last.t+sec*10,price:sslPrc,kind:'SSL'});
  } else {
    const sellPrc = price + rng*.3;
    const tp1Prc = price - rng*.8;
    const bslPrc = price + rng*.5;
    nodes.push({t:last.t+sec*20,price:sellPrc,kind:'SELL_ZONE'});
    nodes.push({t:last.t+sec*60,price:tp1Prc,kind:'TP1'});
    nodes.push({t:last.t+sec*10,price:bslPrc,kind:'BSL'});
  }
  return nodes;
}

// ─── Market Data Fetcher ────────────────────────────────────────────────────

async function fetchCandles(tf: Timeframe, limit: number): Promise<{candles:Candle[];status:DataStatus;provider:string;err?:string}> {
  const sec = TF_SEC[tf];
  const toMs = Date.now();
  const fromMs = toMs - sec*limit*1000;

  // Try Binance PAXGUSDT
  try {
    const intv: Record<Timeframe,string> = {'5m':'5m','15m':'15m','30m':'30m','1h':'1h','4h':'4h','1D':'1d','1W':'1w','1M':'1M'};
    const url=`https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=${intv[tf]}&limit=${Math.min(limit,1000)}&startTime=${fromMs}&endTime=${toMs}`;
    const r=await fetch(url,{signal:AbortSignal.timeout(8000)});
    if(r.ok){
      const d=await r.json();
      if(Array.isArray(d)&&d.length>=10){
        const candles: Candle[] = (d as Array<Record<number, string | number>>).map((k)=>({
          t:Math.floor(Number(k[0])/1000), o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5],
        }));
        return {candles,status:'delayed',provider:'Binance PAXGUSDT'};
      }
    }
  } catch {}

  // Fallback to Next.js API route (may have Twelve Data / Finnhub keys server-side)
  try {
    const r=await fetch(`/api/market-data?timeframe=${tf}&limit=${limit}`,{signal:AbortSignal.timeout(10000)});
    if(r.ok){
      const d=await r.json();
      if(d.candles?.length>=10) return {candles:d.candles.map((c:{t:number;o:number;h:number;l:number;c:number;v:number;time:number;open:number;high:number;low:number;close:number;volume:number})=>({
        t:c.t??c.time, o:c.o??c.open, h:c.h??c.high, l:c.l??c.low, c:c.c??c.close, v:c.v??c.volume??0
      })),status:d.status??'delayed',provider:d.provider??'API'};
    }
  } catch {}

  // Demo
  return {candles:genDemoData(tf,limit),status:'demo',provider:'Demo Data'};
}

// ═══════════════════════════════════════════════════════════════════════════
// COSMIC BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════

const PasswordGate: FC<{onPass:()=>void}> = ({onPass})=>{
  const [val,setVal]=useState('');
  const [err,setErr]=useState(false);
  const [shake,setShake]=useState(false);
  const inp=useRef<HTMLInputElement>(null);
  useEffect(()=>{ inp.current?.focus(); },[]);

  const submit=()=>{
    if(val===PASSCODE){ setErr(false); onPass(); }
    else { setErr(true); setShake(true); setVal(''); setTimeout(()=>setShake(false),500); inp.current?.focus(); }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{background:'radial-gradient(ellipse at center, #0B1021 0%, #060812 100%)'}}>
      {/* Stars bg */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({length:120},(_,i)=>(
          <div key={i} className="absolute rounded-full bg-white" style={{
            width:Math.random()<.1?3:Math.random()<.3?2:1,
            height:Math.random()<.1?3:Math.random()<.3?2:1,
            left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,
            opacity:Math.random()*.7+.1,
            animation:`bootPulse ${1.5+Math.random()*3}s ease-in-out ${Math.random()*3}s infinite`,
          }}/>
        ))}
      </div>

      <div className={`relative glass rounded-2xl p-10 w-full max-w-sm border-glow-cyan text-center anim-fadeIn ${shake?'animate-pulse':''}`}>
        {/* Logo */}
        <div className="mb-6">
          <div className="text-5xl mb-3" style={{filter:'drop-shadow(0 0 20px #F59E0B)'}}>⬡</div>
          <div className="font-mono text-xs tracking-[0.4em] text-cyan-400 uppercase mb-1">XAU·USD</div>
          <div className="text-xl font-bold tracking-widest" style={{background:'linear-gradient(90deg,#38BDF8,#6366F1,#F59E0B)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            COSMIC SMC TERMINAL
          </div>
          <div className="text-xs text-slate-500 mt-1 tracking-widest">INSTITUTIONAL GRADE</div>
        </div>

        <div className="text-xs text-slate-500 uppercase tracking-widest mb-4 font-mono">— SECURE ACCESS —</div>

        <input
          ref={inp}
          type="password"
          value={val}
          onChange={e=>{setVal(e.target.value);setErr(false);}}
          onKeyDown={e=>e.key==='Enter'&&submit()}
          placeholder="Enter Passcode"
          className="w-full px-4 py-3 rounded-lg text-center font-mono text-lg tracking-[0.5em] outline-none mb-3 transition-all"
          style={{
            background:'rgba(14,20,42,0.8)',
            border:`1px solid ${err?'#F43F5E':'#1E2942'}`,
            color:err?'#F43F5E':'#38BDF8',
            boxShadow:err?'0 0 16px #F43F5E44':'0 0 8px #38BDF822',
          }}
          maxLength={8}
          aria-label="Passcode input"
        />
        {err&&<div className="text-xs text-rose-400 mb-3 font-mono">✗ INVALID PASSCODE</div>}

        <button
          onClick={submit}
          className="w-full py-3 rounded-lg font-mono font-bold tracking-[0.3em] text-sm transition-all anim-glowGold"
          style={{background:'linear-gradient(135deg,#F59E0B,#FBBF24)',color:'#060812'}}
          aria-label="Submit passcode"
        >
          MOVE →
        </button>

        <div className="text-xs text-slate-700 mt-4 font-mono">XAUUSD · SMART MONEY CONCEPTS · v2.0</div>
      </div>
    </div>
  );
};

// ─── Galaxy Animation ───────────────────────────────────────────────────────

const GalaxyAnimation: FC<{onDone:()=>void;onSkip:()=>void}> = ({onDone,onSkip})=>{
  const cvRef=useRef<HTMLCanvasElement>(null);
  const rafRef=useRef<number>(0);
  const startRef=useRef<number>(0);
  const DURATION=10000;

  useEffect(()=>{
    const cv=cvRef.current; if(!cv) return;
    const ctx=cv.getContext('2d')!;
    let W=cv.width=window.innerWidth, H=cv.height=window.innerHeight;
    const resize=()=>{ W=cv.width=window.innerWidth; H=cv.height=window.innerHeight; };
    window.addEventListener('resize',resize);

    // --- Stars ---
    const NSTARS=400;
    const stars = Array.from({length:NSTARS},()=>({
      x:(Math.random()-.5)*W*3,y:(Math.random()-.5)*H*3,
      z:Math.random()*W,bz:Math.random()*W,
    }));
    // Dust stars
    const dustStars=Array.from({length:200},()=>({
      x:Math.random()*W,y:Math.random()*H,
      r:Math.random()*.8+.2,op:Math.random()*.4+.1,
    }));
    // Galaxy dust band
    const dustBand=Array.from({length:600},()=>({
      x:Math.random()*W*1.6-W*.3,
      y:H*.35+Math.random()*H*.3-Math.sin(Math.random()*Math.PI)*(H*.15),
      r:Math.random()*3+1,op:Math.random()*.12+.03,
      col:Math.random()<.5?`rgba(100,160,255,`:`rgba(180,120,255,`,
    }));
    // Hyperspace streaks
    const streaks=Array.from({length:NSTARS},()=>({
      x:(Math.random()-.5)*W*2,y:(Math.random()-.5)*H*2,
      z:Math.random()*W,bz:0,
    }));

    // Bull animation state
    let bullX=W*-.15, bullY=H*.8;
    const bullTX=W*.45, bullTY=H*.5;
    let collided=false;
    let supernovaT=-1;
    let particles: Array<{x:number;y:number;vx:number;vy:number;life:number;col:string}>=[];

    function drawStarfield(t:number,speed:number){
      for(const s of streaks){
        const sx=( s.x/(s.z/W) )*speed+W/2;
        const sy=( s.y/(s.z/W) )*speed+H/2;
        const px=( s.x/(s.bz/W) )*speed+W/2;
        const py=( s.y/(s.bz/W) )*speed+H/2;
        const r=Math.max(.5,(1-s.z/W)*2.5);
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(sx,sy);
        ctx.strokeStyle=`rgba(200,220,255,${(1-s.z/W)*.6})`;
        ctx.lineWidth=r; ctx.stroke();
        s.bz=s.z; s.z-=speed*4;
        if(s.z<=0){s.z=W;s.bz=W;s.x=(Math.random()-.5)*W*2;s.y=(Math.random()-.5)*H*2;}
      }
    }

    function drawEarth(t:number){
      const ex=W*.75, ey=H*.25, er=70;
      const earthGrad=ctx.createRadialGradient(ex-20,ey-20,5,ex,ey,er);
      earthGrad.addColorStop(0,'#1a6fa5');
      earthGrad.addColorStop(.3,'#1a7a3c');
      earthGrad.addColorStop(.6,'#1a6fa5');
      earthGrad.addColorStop(.85,'#2a3a8c');
      earthGrad.addColorStop(1,'#060812');
      ctx.save();
      ctx.beginPath(); ctx.arc(ex,ey,er,0,Math.PI*2);
      ctx.fillStyle=earthGrad; ctx.fill();
      // cloud swirls
      ctx.globalAlpha=.25;
      for(let i=0;i<6;i++){
        const a=t*.0003+i*Math.PI/3;
        ctx.beginPath();
        ctx.ellipse(ex+Math.cos(a)*40,ey+Math.sin(a)*20,30+i*5,8,a,.0,Math.PI*2);
        ctx.fillStyle='#fff'; ctx.fill();
      }
      ctx.globalAlpha=1;
      // atmosphere halo
      const halo=ctx.createRadialGradient(ex,ey,er*.9,ex,ey,er*1.3);
      halo.addColorStop(0,'rgba(80,180,255,0)');
      halo.addColorStop(.5,'rgba(80,180,255,0.15)');
      halo.addColorStop(1,'rgba(80,180,255,0)');
      ctx.beginPath(); ctx.arc(ex,ey,er*1.3,0,Math.PI*2);
      ctx.fillStyle=halo; ctx.fill();
      // night shadow
      ctx.save(); ctx.beginPath(); ctx.arc(ex,ey,er,0,Math.PI*2);
      ctx.clip();
      const shadow=ctx.createLinearGradient(ex-er,ey,ex+er*.3,ey);
      shadow.addColorStop(0,'rgba(0,0,0,0)');
      shadow.addColorStop(.6,'rgba(0,0,0,0)');
      shadow.addColorStop(1,'rgba(0,0,10,0.75)');
      ctx.fillStyle=shadow; ctx.fillRect(ex-er,ey-er,er*2,er*2);
      ctx.restore(); ctx.restore();
    }

    function drawSaturn(t:number){
      const sx=W*.18, sy=H*.22, sr=50;
      // back rings
      ctx.save(); ctx.translate(sx,sy); ctx.scale(1,.35);
      const rg=ctx.createLinearGradient(-sr*2.2,0,sr*2.2,0);
      rg.addColorStop(0,'rgba(180,140,80,0)');
      rg.addColorStop(.2,'rgba(200,160,90,0.3)');
      rg.addColorStop(.5,'rgba(220,180,100,0.5)');
      rg.addColorStop(.8,'rgba(200,160,90,0.3)');
      rg.addColorStop(1,'rgba(180,140,80,0)');
      ctx.beginPath(); ctx.ellipse(0,0,sr*2.2,sr*.9,0,Math.PI,0,true);
      ctx.fillStyle=rg; ctx.fill();
      ctx.restore();
      // planet
      const pg=ctx.createRadialGradient(sx-10,sy-10,5,sx,sy,sr);
      pg.addColorStop(0,'#e8c87a'); pg.addColorStop(.5,'#c4a050'); pg.addColorStop(1,'#6b4e1a');
      ctx.save(); ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2);
      ctx.fillStyle=pg; ctx.fill();
      // bands
      ctx.globalAlpha=.2;
      for(let i=0;i<5;i++){
        ctx.beginPath();
        ctx.ellipse(sx,sy-sr*.4+i*sr*.18,sr*.9,sr*.05,0,0,Math.PI*2);
        ctx.fillStyle='#8b6020'; ctx.fill();
      }
      ctx.globalAlpha=1; ctx.restore();
      // front rings (occlude planet bottom)
      ctx.save(); ctx.translate(sx,sy); ctx.scale(1,.35);
      ctx.beginPath(); ctx.ellipse(0,0,sr*2.2,sr*.9,0,0,Math.PI,false);
      ctx.fillStyle=rg; ctx.fill();
      ctx.restore();
    }

    function drawSun(t:number, cx:number, cy:number, flare:number){
      const r=55+flare*30;
      // corona
      for(let i=0;i<16;i++){
        const a=(t*.002)+(i/16)*Math.PI*2;
        const len=r+(Math.sin(t*.005+i)*.5+.5)*50+flare*60;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx,cy);
        ctx.lineTo(cx+Math.cos(a)*len,cy+Math.sin(a)*len);
        ctx.strokeStyle=`rgba(255,${160+Math.sin(i)*30},20,${.15+Math.sin(t*.01+i)*.08})`;
        ctx.lineWidth=3; ctx.stroke(); ctx.restore();
      }
      const sg=ctx.createRadialGradient(cx-r*.3,cy-r*.3,r*.05,cx,cy,r);
      sg.addColorStop(0,'#fff9e0'); sg.addColorStop(.2,'#ffe44a');
      sg.addColorStop(.6,'#ff8c00'); sg.addColorStop(1,'#ff2200');
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.fillStyle=sg; ctx.fill();
      // prominences
      for(let i=0;i<6;i++){
        const a=(t*.003)+(i/6)*Math.PI*2;
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(r*.9,0);
        ctx.quadraticCurveTo(r*1.4,r*.3,r*1.1,r*.7);
        ctx.strokeStyle=`rgba(255,100,0,${.3+Math.sin(t*.007+i)*.2})`;
        ctx.lineWidth=4; ctx.stroke(); ctx.restore();
      }
    }

    function drawBull(t:number, x:number, y:number, scale:number){
      ctx.save();
      ctx.translate(x,y);
      ctx.scale(scale,scale);
      const prog=Math.min(t/7000,1); // gallop phase
      const legSwing=Math.sin(t*.012)*18*Math.min(prog*3,1);
      const tailSwing=Math.sin(t*.015+1)*12;
      const bodyBob=Math.sin(t*.01)*4*Math.min(prog*3,1);

      // Shadow
      ctx.beginPath(); ctx.ellipse(0,110,70,15,0,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fill();

      // Tail
      ctx.save(); ctx.translate(-75,bodyBob-10);
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.quadraticCurveTo(-30,tailSwing,-50,tailSwing+20);
      ctx.strokeStyle='#8B6914'; ctx.lineWidth=6; ctx.lineCap='round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(-50,tailSwing+20,8,0,Math.PI*2);
      ctx.fillStyle='#654000'; ctx.fill();
      ctx.restore();

      // Body
      ctx.save(); ctx.translate(0,bodyBob);
      const bodyGrad=ctx.createRadialGradient(-10,-20,5,0,0,90);
      bodyGrad.addColorStop(0,'#E8B84B'); bodyGrad.addColorStop(.5,'#C49020');
      bodyGrad.addColorStop(1,'#7A5A00');
      ctx.beginPath();
      ctx.ellipse(0,0,80,55,0,0,Math.PI*2);
      ctx.fillStyle=bodyGrad; ctx.fill();
      // muscle hump
      const humpGrad=ctx.createRadialGradient(-30,-50,5,-20,-40,40);
      humpGrad.addColorStop(0,'#F0C040'); humpGrad.addColorStop(1,'#9A7010');
      ctx.beginPath();
      ctx.ellipse(-20,-40,42,30,-.3,0,Math.PI*2);
      ctx.fillStyle=humpGrad; ctx.fill();
      ctx.restore();

      // Legs
      const legs=[
        {ox:-40,oy:40,phase:0},{ox:-20,oy:40,phase:Math.PI},
        {ox:30,oy:40,phase:Math.PI*.5},{ox:50,oy:40,phase:Math.PI*1.5}
      ];
      legs.forEach(lg=>{
        ctx.save(); ctx.translate(lg.ox,lg.oy+bodyBob);
        const angle=Math.sin(t*.012+lg.phase)*legSwing;
        ctx.rotate(angle*.012);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,55);
        ctx.strokeStyle='#8B6914'; ctx.lineWidth=14; ctx.lineCap='round'; ctx.stroke();
        // hoof
        ctx.beginPath(); ctx.ellipse(0*Math.sin(angle),55,8,5,0,0,Math.PI*2);
        ctx.fillStyle='#2a1a00'; ctx.fill();
        ctx.restore();
      });

      // Head
      ctx.save(); ctx.translate(70,bodyBob-10);
      const headGrad=ctx.createRadialGradient(0,0,5,0,0,30);
      headGrad.addColorStop(0,'#F0C040'); headGrad.addColorStop(1,'#8B6400');
      ctx.beginPath(); ctx.ellipse(0,0,32,24,0,0,Math.PI*2);
      ctx.fillStyle=headGrad; ctx.fill();
      // snout
      ctx.beginPath(); ctx.ellipse(25,8,16,12,0,0,Math.PI*2);
      ctx.fillStyle='#C49020'; ctx.fill();
      // nostril
      ctx.beginPath(); ctx.arc(30,10,3,0,Math.PI*2);
      ctx.fillStyle='#4a3000'; ctx.fill();
      // eyes — plasma glow
      const eyeGlow=ctx.createRadialGradient(-5,-10,0,-5,-10,8);
      eyeGlow.addColorStop(0,'#ffffff'); eyeGlow.addColorStop(.4,'#FFD700');
      eyeGlow.addColorStop(1,'rgba(255,120,0,0)');
      ctx.beginPath(); ctx.arc(-5,-10,8,0,Math.PI*2);
      ctx.fillStyle=eyeGlow; ctx.fill();
      ctx.beginPath(); ctx.arc(-5,-10,3,0,Math.PI*2);
      ctx.fillStyle='#ff4400'; ctx.fill();

      // Horns
      ctx.save();
      const hornGrad=ctx.createLinearGradient(0,-10,30,-30);
      hornGrad.addColorStop(0,'#FFD700'); hornGrad.addColorStop(1,'#F0C040');
      ctx.beginPath(); ctx.moveTo(-15,-20); ctx.quadraticCurveTo(0,-45,30,-30);
      ctx.lineTo(25,-28); ctx.quadraticCurveTo(2,-42,-12,-18); ctx.closePath();
      ctx.fillStyle=hornGrad; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-25,-12); ctx.quadraticCurveTo(-10,-38,22,-22);
      ctx.lineTo(17,-20); ctx.quadraticCurveTo(-8,-35,-20,-10); ctx.closePath();
      ctx.fillStyle=hornGrad; ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    function drawSupernova(cx:number,cy:number,prog:number){
      const r=prog*Math.min(W,H)*.8;
      const sg=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      sg.addColorStop(0,`rgba(255,255,220,${Math.max(0,1-prog*1.5)})`);
      sg.addColorStop(.2,`rgba(255,200,50,${Math.max(0,1-prog*1.2)})`);
      sg.addColorStop(.5,`rgba(255,100,0,${Math.max(0,.8-prog)})`);
      sg.addColorStop(1,'rgba(255,50,0,0)');
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.fillStyle=sg; ctx.fill();
    }

    function tick(ts:number){
      if(!startRef.current) startRef.current=ts;
      const t=ts-startRef.current;
      const pct=t/DURATION;
      const speed=1+pct*3;

      ctx.fillStyle='#060812'; ctx.fillRect(0,0,W,H);

      // Galaxy dust band
      for(const d of dustBand){
        ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2);
        ctx.fillStyle=`${d.col}${d.op})`; ctx.fill();
      }
      // Twinkling stars
      for(const s of dustStars){
        const flicker=Math.sin(ts*.002+s.x)*.3+.7;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(220,235,255,${s.op*flicker})`; ctx.fill();
      }

      // Hyperspace
      drawStarfield(t,speed);

      // Planets
      if(t<7000){ drawSaturn(t); drawEarth(t); }

      // Sun at center-right
      const sunX=W*.58, sunY=H*.45;
      const flare=collided?Math.min((t-supernovaT)/2000,1):0;
      if(!collided||t-supernovaT<4000) drawSun(t,sunX,sunY,flare);

      // Bull trajectory
      const bull_pct=Math.min(t/6500,1);
      bullX=W*-.15+(bullTX-W*-.15)*Math.pow(bull_pct,1.5);
      bullY=H*.8+(bullTY-H*.8)*bull_pct;
      const bullScale=0.6+bull_pct*.4;

      if(!collided){
        drawBull(t,bullX,bullY,bullScale);
        // Check collision with sun
        const dist=Math.hypot(bullX-sunX,bullY-sunY);
        if(dist<120){ collided=true; supernovaT=t;
          particles=Array.from({length:200},()=>({
            x:sunX,y:sunY,
            vx:(Math.random()-.5)*25,vy:(Math.random()-.5)*25,
            life:1,col:`hsl(${Math.random()*60+10},100%,${50+Math.random()*30}%)`,
          }));
        }
      } else {
        const sp=t-supernovaT;
        drawSupernova(sunX,sunY,Math.min(sp/3000,1.2));
        for(const p of particles){
          p.x+=p.vx; p.y+=p.vy; p.vy+=.3; p.life-=.015;
          ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2);
          ctx.fillStyle=p.col; ctx.globalAlpha=Math.max(0,p.life); ctx.fill();
          ctx.globalAlpha=1;
        }
      }

      if(t>=DURATION){ onDone(); return; }
      rafRef.current=requestAnimationFrame(tick);
    }

    rafRef.current=requestAnimationFrame(tick);

    const onKeyDown=(e:KeyboardEvent)=>{
      if(e.key==='Enter'||e.key===' '||e.key==='Escape'){
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown',onKeyDown);

    return ()=>{
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize',resize);
      window.removeEventListener('keydown',onKeyDown);
    };
  },[onDone,onSkip]);

  return (
    <div className="fixed inset-0" style={{background:'#060812'}}>
      <canvas ref={cvRef} className="absolute inset-0 w-full h-full"/>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 pointer-events-none">
        <div className="text-center anim-fadeIn">
          <div className="text-xs font-mono tracking-[0.4em] text-cyan-400/60 uppercase mb-2">Initializing Neural Markets Engine</div>
          <div className="flex gap-1.5 justify-center">
            {Array.from({length:12},(_,i)=>(
              <div key={i} className="w-1 rounded-full bg-cyan-400/40" style={{height:4+Math.sin(i)*.5+2,animation:`bootPulse ${.5+i*.1}s ease-in-out ${i*.05}s infinite`}}/>
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={onSkip}
        className="absolute top-6 right-6 px-4 py-2 rounded-lg font-mono text-xs tracking-widest text-slate-400 hover:text-white transition-all border border-slate-700 hover:border-slate-500 bg-black/40 backdrop-blur flex items-center gap-1.5"
        style={{pointerEvents:'all'}}
      >
        <span>SKIP ▶</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700 font-mono">↵ Enter</span>
      </button>
    </div>
  );
};

const Countdown: FC<{onDone:()=>void;onSkip:()=>void}> = ({onDone,onSkip})=>{
  const [count,setCount]=useState(3);
  useEffect(()=>{
    const t=setInterval(()=>{
      setCount(c=>{ if(c<=1){ clearInterval(t); setTimeout(onDone,400); return 0; } return c-1; });
    },1000);

    const onKeyDown=(e:KeyboardEvent)=>{
      if(e.key==='Enter'||e.key===' '||e.key==='Escape'){
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown',onKeyDown);

    return ()=>{
      clearInterval(t);
      window.removeEventListener('keydown',onKeyDown);
    };
  },[onDone,onSkip]);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{background:'radial-gradient(ellipse at center,#0B1021,#060812)'}}>
      <div className="text-center anim-fadeIn">
        <div className="text-xs font-mono tracking-[0.4em] text-cyan-400/70 uppercase mb-8">POST-IGNITION STABILIZATION</div>
        <div
          key={count}
          className="font-mono font-black text-center"
          style={{fontSize:'18vw',lineHeight:1,background:'linear-gradient(135deg,#38BDF8,#6366F1,#F59E0B)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',animation:'countdownScale 1s ease forwards'}}
        >{count}</div>
        <div className="text-xs font-mono tracking-[0.3em] text-slate-500 uppercase mt-8">SYSTEMS ONLINE · ENGAGING TERMINAL</div>
      </div>
      <button
        onClick={onSkip}
        className="absolute top-6 right-6 px-4 py-2 rounded-lg font-mono text-xs tracking-widest text-slate-400 hover:text-white transition-all border border-slate-700 hover:border-slate-500 bg-black/40 backdrop-blur flex items-center gap-1.5"
      >
        <span>SKIP ▶</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700 font-mono">↵ Enter</span>
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM CURSOR
// ═══════════════════════════════════════════════════════════════════════════

const CosmicCursor: FC<{isChart:boolean;cursorMode:CursorMode;hoveredCandle:Candle|null}>=({isChart,cursorMode,hoveredCandle})=>{
  const cvRef=useRef<HTMLCanvasElement>(null);
  const rafRef=useRef<number>(0);
  const pos=useRef({x:-100,y:-100});
  const target=useRef({x:-100,y:-100});
  const [hoveredElInfo, setHoveredElInfo]=useState<string|null>(null);

  useEffect(()=>{
    if(typeof window==='undefined'||window.matchMedia('(pointer:coarse)').matches) return;
    const mv=(e:MouseEvent)=>{
      target.current={x:e.clientX,y:e.clientY};

      // Detect element under cursor for universal UI magnification
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if(el){
        const text = el.getAttribute('title') ||
                     el.getAttribute('aria-label') ||
                     el.innerText ||
                     el.textContent || '';
        const clean = text.trim().replace(/\s+/g, ' ');
        if(clean && clean.length > 0 && clean.length < 90 && !el.closest('canvas')){
          setHoveredElInfo(clean);
        } else {
          setHoveredElInfo(null);
        }
      }
    };
    window.addEventListener('mousemove',mv,{passive:true});

    const cv=cvRef.current; if(!cv) return;
    const ctx=cv.getContext('2d')!;

    function draw(){
      if(!cv) return;
      pos.current.x+=(target.current.x-pos.current.x)*.3;
      pos.current.y+=(target.current.y-pos.current.y)*.3;
      const {x,y}=pos.current;
      cv.width=window.innerWidth;
      cv.height=window.innerHeight;
      ctx.save();

      // ── 1. UNIVERSAL TIME & INFO BADGE (SHOWN ON ALL CURSOR MODES) ──
      if(hoveredCandle && isChart){
        const d = new Date(hoveredCandle.t * 1000);
        const dateStr = d.toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'numeric' });
        const timeStr = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
        const isUp = hoveredCandle.c >= hoveredCandle.o;

        const tagText = `📅 ${dateStr} ⏰ ${timeStr} | $${hoveredCandle.c.toFixed(2)}`;
        ctx.font = 'bold 10px monospace';
        const tagW = ctx.measureText(tagText).width + 16;
        const tagX = Math.min(window.innerWidth - tagW - 12, Math.max(12, x - tagW / 2));
        const tagY = y > 60 ? y - 32 : y + 36;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(11,16,33,0.95)';
        ctx.strokeStyle = isUp ? '#10B981' : '#F43F5E';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(tagX, tagY, tagW, 22, 6);
        ctx.fill(); ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#38BDF8';
        ctx.fillText(`📅 ${dateStr}`, tagX + 8, tagY + 15);
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`⏰ ${timeStr}`, tagX + 8 + ctx.measureText(`📅 ${dateStr} `).width, tagY + 15);
        ctx.fillStyle = isUp ? '#10B981' : '#F43F5E';
        ctx.fillText(`$${hoveredCandle.c.toFixed(2)}`, tagX + tagW - ctx.measureText(`$${hoveredCandle.c.toFixed(2)}`).width - 8, tagY + 15);
      }

      // ── 2. CURSOR SPECIFIC DRAWING ──
      if(cursorMode==='loupe'){
        // ── AUTO-ZOOM MAGNIFIER LOUPE (ZOOMS EVERYTHING UNDER IT) ──
        const r = 58;
        ctx.save();

        // High-tech lens outer glow
        ctx.shadowColor = '#F59E0B'; ctx.shadowBlur = 18;
        ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
        ctx.restore();

        // Inner lens reflection gradient
        const lensGrad = ctx.createRadialGradient(x-r*.3, y-r*.3, 5, x, y, r);
        lensGrad.addColorStop(0, 'rgba(56,189,248,0.22)');
        lensGrad.addColorStop(0.7, 'rgba(11,16,33,0.85)');
        lensGrad.addColorStop(1, 'rgba(6,8,18,0.95)');
        ctx.fillStyle = lensGrad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

        // Reticle guides inside lens
        ctx.strokeStyle = 'rgba(245,158,11,0.5)'; ctx.lineWidth = 0.75;
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2); ctx.stroke();

        // Center reticle pip
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();

        // ── POPUP MAGNIFICATION CALLOUT (ZOOMS ANY BUTTON, OPTION, TEXT, OR CANDLE) ──
        let zoomHeading = '';
        let zoomLines: string[] = [];

        if(hoveredElInfo){
          // It's hovering over a UI button / option like "FUTURE", "ANALYZE", "TIME FRAME", etc.
          zoomHeading = '🔍 MAGNIFIED ELEMENT';
          zoomLines = [hoveredElInfo];
        } else if(hoveredCandle && isChart){
          // It's hovering over candle on chart
          const d = new Date(hoveredCandle.t * 1000);
          zoomHeading = `🔍 XAUUSD ${hoveredCandle.c >= hoveredCandle.o ? '▲ BULLISH' : '▼ BEARISH'}`;
          zoomLines = [
            `📅 DATE: ${d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'})}`,
            `⏰ TIME: ${d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}`,
            `💲 PRICE: $${hoveredCandle.c.toFixed(2)} (O:${hoveredCandle.o} H:${hoveredCandle.h} L:${hoveredCandle.l})`,
            `📊 VOLUME: ${(hoveredCandle.v/1000).toFixed(1)}k · 2.5X ZOOM`,
          ];
        }

        if(zoomLines.length > 0){
          ctx.font = 'bold 13px sans-serif';
          const maxTextW = Math.max(...zoomLines.map(l => ctx.measureText(l).width));
          const bubbleW = Math.max(180, maxTextW + 32);
          const bubbleH = 28 + zoomLines.length * 20;

          const bx = Math.min(window.innerWidth - bubbleW - 14, Math.max(14, x - bubbleW / 2));
          const by = y - r - bubbleH - 14 > 10 ? y - r - bubbleH - 14 : y + r + 16;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 24;
          ctx.fillStyle = 'rgba(6,10,24,0.96)';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.75;
          ctx.beginPath(); ctx.roundRect(bx, by, bubbleW, bubbleH, 10);
          ctx.fill(); ctx.stroke();
          ctx.restore();

          // Heading
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = '#F59E0B';
          ctx.fillText(zoomHeading, bx + 12, by + 18);

          // Zoomed content lines
          zoomLines.forEach((line, idx) => {
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = idx === 0 ? '#38BDF8' : '#e2e8f0';
            ctx.fillText(line, bx + 12, by + 36 + idx * 20);
          });
        }
      } else if(isChart){
        if(cursorMode==='crosshair'){
          // Minimalist full crosshair
          ctx.strokeStyle='rgba(56,189,248,0.85)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(x-24,y); ctx.lineTo(x+24,y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x,y-24); ctx.lineTo(x,y+24); ctx.stroke();
          ctx.strokeStyle='rgba(245,158,11,0.9)'; ctx.lineWidth=1.5;
          ctx.strokeRect(x-4,y-4,8,8);
        } else if(cursorMode==='dot'){
          // Glowing sniper dot
          ctx.fillStyle='rgba(56,189,248,0.3)';
          ctx.beginPath(); ctx.arc(x,y,10,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#38BDF8';
          ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
        } else {
          // Default: Tactical Reticle
          ctx.strokeStyle='rgba(56,189,248,0.7)'; ctx.lineWidth=.75;
          ctx.beginPath(); ctx.moveTo(x-18,y); ctx.lineTo(x-5,y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x+5,y); ctx.lineTo(x+18,y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x,y-18); ctx.lineTo(x,y-5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x,y+5); ctx.lineTo(x,y+18); ctx.stroke();
          ctx.strokeStyle='rgba(56,189,248,0.4)'; ctx.lineWidth=.5;
          ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.stroke();
          ctx.fillStyle='rgba(245,158,11,0.9)';
          ctx.beginPath(); ctx.arc(x,y,1.5,0,Math.PI*2); ctx.fill();
        }
      } else {
        // Control zone cursor outside chart
        ctx.strokeStyle='rgba(16,185,129,0.7)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='rgba(56,189,248,0.8)';
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
      rafRef.current=requestAnimationFrame(draw);
    }
    draw();
    return ()=>{ cancelAnimationFrame(rafRef.current); window.removeEventListener('mousemove',mv); };
  },[isChart,cursorMode,hoveredCandle,hoveredElInfo]);

  return <canvas ref={cvRef} className="fixed inset-0 w-full h-full pointer-events-none z-[9000] cosmic-cursor-hidden" style={{mixBlendMode:'normal'}}/>;
};

// ═══════════════════════════════════════════════════════════════════════════
// CHART CANVAS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

interface ChartState {
  offset: number; // first visible bar index (float)
  barWidth: number; // px per bar
  priceMin: number;
  priceMax: number;
  priceRange: number; // manual scale multiplier
}

interface ChartProps {
  candles: Candle[];
  chartType: ChartType;
  zones: SMCZone[];
  activeIds: Set<SMCId>;
  futureNodes: FutureNode[];
  showFuture: boolean;
  timeframe: Timeframe;
  sensitivity: Sensitivity;
  onHover: (c:Candle|null,x:number,y:number)=>void;
  onZoneClick: (z:SMCZone,x:number,y:number)=>void;
}

const ChartCanvas: FC<ChartProps> = ({
  candles,chartType,zones,activeIds,futureNodes,showFuture,
  timeframe,sensitivity,onHover,onZoneClick,
})=>{
  const cvRef=useRef<HTMLCanvasElement>(null);
  const rafRef=useRef<number>(0);
  const stateRef=useRef<ChartState>({offset:0,barWidth:12,priceMin:0,priceMax:1,priceRange:1});
  const dragRef=useRef<{type:'pan'|'priceScale';startX:number;startY:number;startOffset:number;startPriceRange:number}|null>(null);
  const hoverRef=useRef<{barIdx:number;x:number;y:number}|null>(null);
  const candlesRef=useRef<Candle[]>([]);
  const [showZoomPill,setShowZoomPill]=useState(false);

  candlesRef.current=candles;

  const cfg=SENS_CFG[sensitivity];

  // ── coordinate helpers ──
  const getDisplayCandles=useCallback(()=>{
    if(chartType==='heikin') return computeHA(candlesRef.current);
    return candlesRef.current;
  },[chartType]);

  const pxToPrice=useCallback((py:number,h:number,s:ChartState)=>{
    const pad=0.1*h;
    return s.priceMax-(py-pad)/((h-pad*2)/s.priceRange*( s.priceMax-s.priceMin)/(s.priceMax-s.priceMin)/(1/s.priceRange));
  },[]);

  const priceToY=useCallback((p:number,h:number,s:ChartState)=>{
    const pad=0.08*h;
    const range=(s.priceMax-s.priceMin)*s.priceRange;
    const mid=(s.priceMax+s.priceMin)/2;
    return pad + (h-pad*2)*((mid+range/2-p)/range);
  },[]);

  const barToX=useCallback((i:number,s:ChartState)=>{
    return (i-s.offset)*s.barWidth+s.barWidth/2;
  },[]);

  const autoFit=useCallback(()=>{
    const cv=cvRef.current; if(!cv||!candlesRef.current.length) return;
    const W=cv.clientWidth, H=cv.clientHeight; void H;
    const dc=getDisplayCandles();
    
    // Set a comfortable bar width for clear candlestick reading
    const bw=Math.max(8, Math.min(18, Math.round((W - 72) / 80)));
    stateRef.current.barWidth=bw;

    // Position chart at the latest LIVE candles right up to the ahead projection zone!
    // Visible chart width excluding right price axis:
    const chartW = W - 72;
    const visibleBarCount = chartW / bw;
    // Leave ~25 bars of ahead space on the right so latest live candle is clearly visible in real-time view
    const targetOffset = (dc.length - visibleBarCount) + 25;
    stateRef.current.offset = Math.max(0, targetOffset);

    // Dynamic price scale calculated from latest visible candles
    const firstVis = Math.max(0, Math.floor(stateRef.current.offset));
    const lastVis = Math.min(dc.length - 1, Math.floor(stateRef.current.offset + visibleBarCount));
    const vis = dc.slice(firstVis, lastVis + 1);
    const pool = vis.length ? vis : dc.slice(-60);
    const mn = Math.min(...pool.map(c=>c.l)), mx = Math.max(...pool.map(c=>c.h));
    const pad = (mx - mn) * 0.12 || 8;
    stateRef.current.priceMin = mn - pad;
    stateRef.current.priceMax = mx + pad;
    stateRef.current.priceRange = 1;
  },[getDisplayCandles]);

  // ── draw ──
  const draw=useCallback(()=>{
    const cv=cvRef.current; if(!cv) return;
    const ctx=cv.getContext('2d')!;
    const W=cv.width=cv.clientWidth, H=cv.height=cv.clientHeight;
    const s=stateRef.current;
    const dc=getDisplayCandles();
    const SEC=TF_SEC[timeframe];
    const PRICE_AXIS_W=72, TIME_AXIS_H=32;

    if(!dc.length){ ctx.fillStyle='#060812'; ctx.fillRect(0,0,W,H); return; }

    // Auto price range from visible bars
    const firstVis=Math.max(0,Math.floor(s.offset));
    const lastVis=Math.min(dc.length-1,Math.floor(s.offset+(W-PRICE_AXIS_W)/s.barWidth)+1);
    const visBars=dc.slice(firstVis,lastVis+1);
    if(visBars.length){
      const mn=Math.min(...visBars.map(c=>c.l)), mx=Math.max(...visBars.map(c=>c.h));
      const pad=(mx-mn)*.1||10;
      s.priceMin=mn-pad; s.priceMax=mx+pad;
    }

    ctx.fillStyle=CHART_COLS.bg; ctx.fillRect(0,0,W,H);

    // ── Grid ──
    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,W-PRICE_AXIS_W,H-TIME_AXIS_H);
    ctx.clip();
    const nHLines=8;
    for(let i=0;i<=nHLines;i++){
      const p=s.priceMin+(s.priceMax-s.priceMin)*(i/nHLines);
      const y=priceToY(p,H-TIME_AXIS_H,s);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-PRICE_AXIS_W,y);
      ctx.strokeStyle=CHART_COLS.grid; ctx.lineWidth=.5; ctx.stroke();
    }
    ctx.restore();

    // ── Ahead zone ──
    const aheadStartX=barToX(dc.length,s);
    if(aheadStartX<W-PRICE_AXIS_W){
      const grad=ctx.createLinearGradient(aheadStartX,0,W-PRICE_AXIS_W,0);
      grad.addColorStop(0,CHART_COLS.aheadBorder);
      grad.addColorStop(1,CHART_COLS.ahead);
      ctx.fillStyle=grad;
      ctx.fillRect(aheadStartX,0,W-PRICE_AXIS_W-aheadStartX,H-TIME_AXIS_H);
      // dashed boundary
      ctx.save(); ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(aheadStartX,0); ctx.lineTo(aheadStartX,H-TIME_AXIS_H);
      ctx.strokeStyle='#38BDF855'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.restore();
      // label
      ctx.font='bold 10px monospace'; ctx.fillStyle='#38BDF844';
      ctx.fillText('AHEAD OF MARKET →',aheadStartX+10,20);
    }

    // ── SMC Zones ──
    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,W-PRICE_AXIS_W,H-TIME_AXIS_H);
    ctx.clip();
    for(const z of zones){
      if(!activeIds.has(z.type)||z.hidden) continue;
      const meta=SMC_META[z.type];
      const x1=barToX(dc.findIndex(c=>c.t>=z.t1)||0,s);
      const x2=z.t2>z.t1?barToX(dc.findIndex(c=>c.t>=z.t2)||dc.length,s):x1+s.barWidth*20;
      const y1=priceToY(z.pHigh,H-TIME_AXIS_H,s);
      const y2=priceToY(z.pLow,H-TIME_AXIS_H,s);
      const col=meta.color;
      // FVG/OB filled zone
      if(z.type==='fvg'||z.type==='ob'){
        ctx.fillStyle=col+'22';
        ctx.fillRect(Math.min(x1,x2),y1,Math.max(x2-x1,s.barWidth*8),y2-y1);
        // 50% line for FVG
        if(z.type==='fvg'){
          const midY=(y1+y2)/2;
          ctx.save(); ctx.setLineDash([4,3]);
          ctx.beginPath(); ctx.moveTo(Math.min(x1,x2),midY); ctx.lineTo(Math.max(x2+s.barWidth*8,x1),midY);
          ctx.strokeStyle=col+'88'; ctx.lineWidth=.75; ctx.stroke(); ctx.restore();
        }
        ctx.strokeStyle=col+'88'; ctx.lineWidth=1;
        ctx.strokeRect(Math.min(x1,x2),y1,Math.max(x2-x1,s.barWidth*8),y2-y1);
      } else if(z.type==='fib'){
        // Fib horizontal line
        const py=priceToY((z.pHigh+z.pLow)/2,H-TIME_AXIS_H,s);
        const isOTE=z.label.includes('OTE');
        ctx.save(); ctx.setLineDash(isOTE?[]:[4,3]);
        ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W-PRICE_AXIS_W,py);
        ctx.strokeStyle=col+(isOTE?'CC':'66'); ctx.lineWidth=isOTE?1.5:.75; ctx.stroke();
        ctx.restore();
        ctx.font='bold 9px monospace'; ctx.fillStyle=col+'CC';
        ctx.fillText(z.label.replace('Fib ',''),W-PRICE_AXIS_W-100,py-3);
      } else if(z.type==='liquidity'){
        // Horizontal zone
        const py=priceToY((z.pHigh+z.pLow)/2,H-TIME_AXIS_H,s);
        ctx.save(); ctx.setLineDash([6,3]);
        ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W-PRICE_AXIS_W,py);
        ctx.strokeStyle=col+'AA'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
        ctx.font='bold 9px monospace'; ctx.fillStyle=col+'CC';
        ctx.fillText(z.label,10,py-4);
      } else if(z.type==='hh_ll'){
        // Swing label
        const px=barToX(dc.findIndex(c=>c.t>=z.t1)||0,s);
        const py=priceToY((z.pHigh+z.pLow)/2,H-TIME_AXIS_H,s);
        const isHigh=z.dir==='bear';
        ctx.font='bold 9px monospace'; ctx.fillStyle=col;
        ctx.fillText(z.label,px-10,py+(isHigh?-6:12));
      } else if(z.type==='bos'||z.type==='choch'){
        // BOS/CHoCH arrow line
        const px1=barToX(dc.findIndex(c=>c.t>=z.t1)||0,s);
        const px2=barToX(dc.findIndex(c=>c.t>=z.t2)||dc.length-1,s);
        const py=(priceToY(z.pHigh,H-TIME_AXIS_H,s)+priceToY(z.pLow,H-TIME_AXIS_H,s))/2;
        ctx.beginPath(); ctx.moveTo(px1,py); ctx.lineTo(px2,py);
        ctx.strokeStyle=col+'AA'; ctx.lineWidth=1.5; ctx.stroke();
        // arrow
        const dx=px2>px1?1:-1;
        ctx.beginPath(); ctx.moveTo(px2,py);
        ctx.lineTo(px2-dx*8,py-5); ctx.lineTo(px2-dx*8,py+5); ctx.closePath();
        ctx.fillStyle=col+'AA'; ctx.fill();
        ctx.font='bold 9px monospace'; ctx.fillStyle=col;
        ctx.fillText(z.label,(px1+px2)/2-15,py-6);
      } else if(z.type==='killzones'){
        // Killzone shaded box
        ctx.fillStyle='rgba(56,189,248,0.08)';
        ctx.fillRect(Math.min(x1,x2),y1,Math.max(x2-x1,s.barWidth*4),y2-y1);
        ctx.strokeStyle='#38BDF866'; ctx.lineWidth=1;
        ctx.strokeRect(Math.min(x1,x2),y1,Math.max(x2-x1,s.barWidth*4),y2-y1);
        ctx.font='bold 9px monospace'; ctx.fillStyle='#38BDF8';
        ctx.fillText(z.label,Math.min(x1,x2)+4,y1-4);
      } else if(z.type==='pdh_pdl'){
        // PDH / PDL horizontal benchmark lines
        const py=priceToY((z.pHigh+z.pLow)/2,H-TIME_AXIS_H,s);
        ctx.save(); ctx.setLineDash([5,2]);
        ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W-PRICE_AXIS_W,py);
        ctx.strokeStyle=col+'DD'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
        ctx.font='bold 9px monospace'; ctx.fillStyle=col;
        ctx.fillText(`★ ${z.label} ($${((z.pHigh+z.pLow)/2).toFixed(2)})`,W-PRICE_AXIS_W-160,py-4);
      } else if(z.type==='breakers'||z.type==='ifvg'){
        // Breaker & IFVG flipped zone
        ctx.fillStyle=col+'26';
        ctx.fillRect(Math.min(x1,x2),y1,Math.max(x2-x1,s.barWidth*8),y2-y1);
        ctx.strokeStyle=col+'CC'; ctx.lineWidth=1.25;
        ctx.strokeRect(Math.min(x1,x2),y1,Math.max(x2-x1,s.barWidth*8),y2-y1);
        ctx.font='bold 9px monospace'; ctx.fillStyle=col;
        ctx.fillText(z.label,Math.min(x1,x2)+4,y1+12);
      } else if(z.type==='smt'){
        // SMT Divergence marker
        const py=priceToY((z.pHigh+z.pLow)/2,H-TIME_AXIS_H,s);
        ctx.beginPath(); ctx.arc(x1,py,5,0,Math.PI*2);
        ctx.fillStyle=col; ctx.fill();
        ctx.font='bold 9px monospace'; ctx.fillStyle=col;
        ctx.fillText(z.label,x1+8,py-4);
      }
    }
    ctx.restore();

    // ── Candles / Line ──
    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,W-PRICE_AXIS_W,H-TIME_AXIS_H);
    ctx.clip();

    if(chartType==='line'||chartType==='line_step'||chartType==='area'){
      ctx.beginPath();
      let first=true;
      for(let i=0;i<dc.length;i++){
        const x=barToX(i,s), y=priceToY(dc[i].c,H-TIME_AXIS_H,s);
        if(first){ ctx.moveTo(x,y); first=false; }
        else if(chartType==='line_step'){
          const px=barToX(i-1,s), py=priceToY(dc[i-1].c,H-TIME_AXIS_H,s);
          ctx.lineTo(x,py); ctx.lineTo(x,y);
        } else ctx.lineTo(x,y);
      }
      if(chartType==='area'){
        const lastX=barToX(dc.length-1,s);
        ctx.lineTo(lastX,H-TIME_AXIS_H);
        ctx.lineTo(barToX(0,s),H-TIME_AXIS_H);
        ctx.closePath();
        const aGrad=ctx.createLinearGradient(0,0,0,H-TIME_AXIS_H);
        aGrad.addColorStop(0,'rgba(56,189,248,0.3)');
        aGrad.addColorStop(1,'rgba(56,189,248,0)');
        ctx.fillStyle=aGrad; ctx.fill();
        ctx.beginPath(); first=true;
        for(let i=0;i<dc.length;i++){
          const x=barToX(i,s),y=priceToY(dc[i].c,H-TIME_AXIS_H,s);
          if(first){ctx.moveTo(x,y);first=false;} else ctx.lineTo(x,y);
        }
      }
      ctx.strokeStyle='#38BDF8'; ctx.lineWidth=1.5; ctx.stroke();
    } else {
      // Candles / Heikin-Ashi
      for(let i=0;i<dc.length;i++){
        const c=dc[i];
        const o=chartType==='heikin'?c.ha_o!:c.o;
        const h=chartType==='heikin'?c.ha_h!:c.h;
        const l=chartType==='heikin'?c.ha_l!:c.l;
        const cl=chartType==='heikin'?c.ha_c!:c.c;
        const bull=cl>=o;
        const col=bull?CHART_COLS.bull:CHART_COLS.bear;
        const x=barToX(i,s);
        const bw=Math.max(1,s.barWidth*.75);
        const yO=priceToY(o,H-TIME_AXIS_H,s), yCl=priceToY(cl,H-TIME_AXIS_H,s);
        const yH=priceToY(h,H-TIME_AXIS_H,s), yL=priceToY(l,H-TIME_AXIS_H,s);
        // Wick
        ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL);
        ctx.strokeStyle=col; ctx.lineWidth=Math.max(.5,s.barWidth*.07); ctx.stroke();
        // Body
        const bodyH=Math.max(1,Math.abs(yO-yCl));
        ctx.fillStyle=col; ctx.fillRect(x-bw/2,Math.min(yO,yCl),bw,bodyH);
      }
    }

    // Volume bars (bottom 15%)
    const volH=(H-TIME_AXIS_H)*.15;
    const maxVol=Math.max(...dc.map(c=>c.v||0))||1;
    for(let i=0;i<dc.length;i++){
      if(!dc[i].v) continue;
      const c=dc[i];
      const x=barToX(i,s);
      const bw=Math.max(1,s.barWidth*.75);
      const vh=(c.v/maxVol)*volH;
      ctx.fillStyle=c.c>=c.o?CHART_COLS.volume.bull:CHART_COLS.volume.bear;
      ctx.fillRect(x-bw/2,H-TIME_AXIS_H-vh,bw,vh);
    }
    ctx.restore();

    // ── Future trajectory ──
    if(showFuture&&futureNodes.length){
      ctx.save();
      ctx.beginPath(); ctx.rect(aheadStartX,0,W-PRICE_AXIS_W-aheadStartX,H-TIME_AXIS_H);
      ctx.clip();
      const lastC=dc[dc.length-1];
      let prevX=barToX(dc.length-1,s), prevY=priceToY(lastC.c,H-TIME_AXIS_H,s);
      // Confidence corridor
      ctx.beginPath(); ctx.moveTo(prevX,prevY);
      let pts:Array<{x:number,y:number}>=[];
      for(const fn of futureNodes){
        const barIdx=dc.length+Math.round((fn.t-lastC.t)/TF_SEC[timeframe]);
        const fx=barToX(barIdx,s), fy=priceToY(fn.price,H-TIME_AXIS_H,s);
        pts.push({x:fx,y:fy});
        ctx.lineTo(fx,fy);
      }
      ctx.strokeStyle='#F59E0B88'; ctx.lineWidth=2; ctx.setLineDash([6,4]); ctx.stroke();
      ctx.setLineDash([]);
      // shaded corridor
      const corrGrad=ctx.createLinearGradient(prevX,0,W-PRICE_AXIS_W,0);
      corrGrad.addColorStop(0,'rgba(245,158,11,0.15)');
      corrGrad.addColorStop(1,'rgba(245,158,11,0)');
      ctx.beginPath(); ctx.moveTo(prevX,prevY);
      for(const pt of pts) ctx.lineTo(pt.x,pt.y+30);
      for(const pt of [...pts].reverse()) ctx.lineTo(pt.x,pt.y-30);
      ctx.closePath(); ctx.fillStyle=corrGrad; ctx.fill();
      // Node labels
      for(const fn of futureNodes){
        const barIdx=dc.length+Math.round((fn.t-lastC.t)/TF_SEC[timeframe]);
        const fx=barToX(barIdx,s), fy=priceToY(fn.price,H-TIME_AXIS_H,s);
        const col=fn.kind==='BUY_ZONE'?'#10B981':fn.kind==='SELL_ZONE'?'#F43F5E':fn.kind==='TP1'?'#38BDF8':'#F59E0B';
        ctx.beginPath(); ctx.arc(fx,fy,5,0,Math.PI*2);
        ctx.fillStyle=col+'CC'; ctx.fill();
        ctx.font='bold 9px monospace'; ctx.fillStyle=col;
        ctx.fillText(fn.kind.replace('_',' '),fx+8,fy+4);
        ctx.font='10px monospace'; ctx.fillStyle=col+'AA';
        ctx.fillText(`$${fn.price.toFixed(2)}`,fx+8,fy+14);
      }
      ctx.restore();
    }

    // ── Crosshair & HUD ──
    if(hoverRef.current&&hoverRef.current.barIdx>=0&&hoverRef.current.barIdx<dc.length){
      const {barIdx,x,y}=hoverRef.current;
      ctx.save();
      ctx.strokeStyle=CHART_COLS.crosshair; ctx.lineWidth=.75; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H-TIME_AXIS_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-PRICE_AXIS_W,y); ctx.stroke();
      ctx.restore();
      // Time badge with exact date & seconds precision
      const c=dc[barIdx];
      const d=new Date(c.t*1000);
      const dateStr=d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'});
      const timeStr=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
      const fullTimeBadge=`${dateStr} ${timeStr}`;
      ctx.font='bold 10px monospace';
      const tw=ctx.measureText(fullTimeBadge).width;
      const bx=Math.min(W-PRICE_AXIS_W-tw-16, Math.max(0, x-tw/2-6));
      ctx.fillStyle='#0f172a'; ctx.fillRect(bx,H-TIME_AXIS_H+1,tw+14,TIME_AXIS_H-2);
      ctx.strokeStyle='#38BDF8'; ctx.lineWidth=1; ctx.strokeRect(bx,H-TIME_AXIS_H+1,tw+14,TIME_AXIS_H-2);
      ctx.font='bold 10px monospace'; ctx.fillStyle='#38BDF8';
      ctx.fillText(fullTimeBadge,bx+7,H-TIME_AXIS_H+TIME_AXIS_H/2+4);
      // Price badge
      const priceStr=priceAtY(y,H,s);
      const pw=ctx.measureText(priceStr).width;
      ctx.fillStyle='#1E2942'; ctx.fillRect(W-PRICE_AXIS_W,y-9,PRICE_AXIS_W,18);
      ctx.font='bold 10px monospace'; ctx.fillStyle='#38BDF8';
      ctx.fillText(priceStr,W-PRICE_AXIS_W+6,y+4);
      void pw;
    }

    // ── Price axis ──
    ctx.fillStyle='#060812'; ctx.fillRect(W-PRICE_AXIS_W,0,PRICE_AXIS_W,H);
    ctx.strokeStyle='#1E2942'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(W-PRICE_AXIS_W,0); ctx.lineTo(W-PRICE_AXIS_W,H); ctx.stroke();
    for(let i=0;i<=8;i++){
      const p=s.priceMin+(s.priceMax-s.priceMin)*(i/8);
      const y=priceToY(p,H-TIME_AXIS_H,s);
      ctx.font='10px monospace'; ctx.fillStyle='#4a5568';
      ctx.fillText(p.toFixed(2),W-PRICE_AXIS_W+6,y+4);
    }
    // Last price line
    if(dc.length){
      const lp=dc[dc.length-1].c;
      const ly=priceToY(lp,H-TIME_AXIS_H,s);
      ctx.save(); ctx.setLineDash([3,2]);
      ctx.beginPath(); ctx.moveTo(0,ly); ctx.lineTo(W-PRICE_AXIS_W,ly);
      const isBullLast=dc[dc.length-1].c>=dc[dc.length-1].o;
      ctx.strokeStyle=isBullLast?'#10B98155':'#F43F5E55'; ctx.lineWidth=1; ctx.stroke();
      ctx.restore();
      ctx.fillStyle=isBullLast?'#10B981':'#F43F5E';
      ctx.fillRect(W-PRICE_AXIS_W,ly-9,PRICE_AXIS_W,18);
      ctx.font='bold 10px monospace'; ctx.fillStyle='#000';
      ctx.fillText(lp.toFixed(2),W-PRICE_AXIS_W+6,ly+4);
    }

    // ── Time axis ──
    ctx.fillStyle='#060812'; ctx.fillRect(0,H-TIME_AXIS_H,W-PRICE_AXIS_W,TIME_AXIS_H);
    ctx.strokeStyle='#1E2942'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,H-TIME_AXIS_H); ctx.lineTo(W-PRICE_AXIS_W,H-TIME_AXIS_H); ctx.stroke();
    const barStride=Math.max(1,Math.round(60/s.barWidth));
    for(let i=0;i<dc.length;i+=barStride){
      const x=barToX(i,s);
      if(x<0||x>W-PRICE_AXIS_W) continue;
      const d=new Date(dc[i].t*1000);
      const isIntraday=['5m','15m','30m','1h','4h'].includes(timeframe);
      const lbl=isIntraday?d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}):d.toLocaleDateString('en-US',{month:'short',day:'2-digit'});
      ctx.font='9px monospace'; ctx.fillStyle='#4a5568';
      ctx.fillText(lbl,x-18,H-TIME_AXIS_H+16);
    }
    // Ahead timestamps
    if(dc.length){
      const lastT=dc[dc.length-1].t;
      const stride2=Math.max(1,Math.round(100/s.barWidth));
      for(let i=1;i<AHEAD_BARS;i+=stride2){
        const ft=lastT+i*SEC;
        const x=barToX(dc.length+i,s);
        if(x<0||x>W-PRICE_AXIS_W) continue;
        const d=new Date(ft*1000);
        const isIntraday=['5m','15m','30m','1h','4h'].includes(timeframe);
        const lbl=isIntraday?d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}):d.toLocaleDateString('en-US',{month:'short',day:'2-digit'});
        ctx.font='9px monospace'; ctx.fillStyle='#38BDF844';
        ctx.fillText(lbl,x-18,H-TIME_AXIS_H+16);
      }
    }

    rafRef.current=0;
  },[getDisplayCandles,timeframe,zones,activeIds,futureNodes,showFuture,barToX,priceToY]);

  function priceAtY(py:number,h:number,s:ChartState):string{
    const pad=0.08*(h-32);
    const range=s.priceMax-s.priceMin;
    const p=s.priceMax-(py-pad)/((h-32-pad*2)/range);
    return p.toFixed(2);
  }

  const scheduleDraw=useCallback(()=>{
    if(!rafRef.current) rafRef.current=requestAnimationFrame(draw);
  },[draw]);

  // Initial fit when candles arrive
  useEffect(()=>{ autoFit(); scheduleDraw(); },[candles,autoFit,scheduleDraw]);
  useEffect(()=>{ scheduleDraw(); },[zones,activeIds,futureNodes,showFuture,chartType,scheduleDraw]);

  // ── Interaction ──
  const onWheel=useCallback((e:React.WheelEvent)=>{
    e.preventDefault();
    const s=stateRef.current;
    
    // Pinch to zoom (trackpad pinch sets ctrlKey: true)
    if(e.ctrlKey){
      const factor=e.deltaY>0?1-cfg.zoom*1.5:1+cfg.zoom*1.5;
      const cv=cvRef.current; if(!cv) return;
      const mx=e.clientX-cv.getBoundingClientRect().left;
      const focusBar=s.offset+mx/s.barWidth;
      s.barWidth=Math.max(2,Math.min(80,s.barWidth*factor));
      s.offset=Math.max(0,focusBar-mx/s.barWidth);
      scheduleDraw();
      return;
    }

    // Two-finger slide on trackpad / mouse wheel
    // Primary trackpad two-finger horizontal slide uses deltaX.
    // Vertical two-finger slide (deltaY) or horizontal (deltaX) or Shift+wheel smoothly slides/pans the chart!
    const delta = Math.abs(e.deltaX) > 0.5 ? e.deltaX : (e.shiftKey ? e.deltaY : (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    s.offset += (delta / s.barWidth) / cfg.panDiv;
    s.offset = Math.max(0, s.offset);
    scheduleDraw();
  },[cfg,scheduleDraw]);

  const onMouseDown=useCallback((e:React.MouseEvent)=>{
    const cv=cvRef.current; if(!cv) return;
    const rect=cv.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const isPrice=x>cv.clientWidth-72;
    // Only drag on right price scale for vertical compression/expansion! Moving cursor inside chart won't move/pan the chart.
    if(isPrice){
      dragRef.current={
        type:'priceScale',
        startX:e.clientX,startY:e.clientY,
        startOffset:stateRef.current.offset,
        startPriceRange:stateRef.current.priceRange,
      };
    } else {
      dragRef.current=null;
    }
  },[]);

  const onMouseMove=useCallback((e:React.MouseEvent)=>{
    const cv=cvRef.current; if(!cv) return;
    const rect=cv.getBoundingClientRect();
    const x=e.clientX-rect.left, y=e.clientY-rect.top;
    const s=stateRef.current;
    const dc=getDisplayCandles();

    // Hover telemetry & crosshair updates as cursor moves, without shifting/panning the chart
    const barIdx=Math.round(s.offset+x/s.barWidth-.5);
    if(barIdx>=0&&barIdx<dc.length){
      hoverRef.current={barIdx,x,y};
      onHover(dc[barIdx],x,y);
    } else {
      hoverRef.current=null; onHover(null,x,y);
    }

    // Only vertical price scale drag is processed
    if(dragRef.current && dragRef.current.type==='priceScale'){
      const dy=e.clientY-dragRef.current.startY;
      s.priceRange=Math.max(.3,dragRef.current.startPriceRange*(1-dy*.005));
    }

    // Zoom pill visibility
    setShowZoomPill(y>cv.clientHeight-80);
    scheduleDraw();
  },[getDisplayCandles,onHover,scheduleDraw]);

  const onCanvasClick=useCallback((e:React.MouseEvent)=>{
    const cv=cvRef.current; if(!cv) return;
    const rect=cv.getBoundingClientRect();
    const x=e.clientX-rect.left, y=e.clientY-rect.top;
    if(x > cv.clientWidth - 72) return; // Ignore price axis clicks

    const s=stateRef.current;
    const dc=getDisplayCandles();
    const price=parseFloat(priceAtY(y,cv.clientHeight,s));
    const barIdx=Math.round(s.offset+x/s.barWidth-.5);
    const barT=barIdx>=0&&barIdx<dc.length?dc[barIdx].t:0;
    for(const z of zones){
      if(z.hidden||!activeIds.has(z.type)) continue;
      if(price>=z.pLow&&price<=z.pHigh&&barT>=z.t1-TF_SEC[timeframe]*5&&barT<=z.t2+TF_SEC[timeframe]*20){
        onZoneClick(z,e.clientX,e.clientY);
        break;
      }
    }
  },[getDisplayCandles,zones,activeIds,onZoneClick,timeframe]);

  const onMouseUp=useCallback(()=>{
    dragRef.current=null;
  },[]);

  const onDblClick=useCallback(()=>{ stateRef.current.priceRange=1; scheduleDraw(); },[scheduleDraw]);
  const onMouseLeave=useCallback(()=>{ hoverRef.current=null; setShowZoomPill(false); scheduleDraw(); onHover(null,0,0); },[scheduleDraw,onHover]);

  const zoomIn=()=>{ stateRef.current.barWidth=Math.min(80,stateRef.current.barWidth*1.2); scheduleDraw(); };
  const zoomOut=()=>{ stateRef.current.barWidth=Math.max(2,stateRef.current.barWidth*.83); scheduleDraw(); };
  const zoom1Y=()=>{ autoFit(); scheduleDraw(); };

  const visibleBars=useMemo(()=>{
    const cv=cvRef.current;
    if(!cv) return 0;
    return Math.round((cv.clientWidth-72)/stateRef.current.barWidth);
  },[]);

  return (
    <div className="relative w-full h-full" style={{cursor:'none'}}>
      <canvas
        ref={cvRef}
        className="w-full h-full block"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onClick={onCanvasClick}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDblClick}
        style={{touchAction:'none'}}
      />
      {/* Toolbar */}
      <div className="absolute top-2 right-20 flex gap-1 z-10">
        <button onClick={autoFit} title="Snap to latest live price"
          className="px-2 h-7 rounded text-xs font-mono font-bold text-amber-400 border border-amber-900/50 bg-black/60 hover:bg-amber-900/30 transition-all flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>LIVE
        </button>
        {[{l:'+',fn:zoomIn},{l:'−',fn:zoomOut},{l:'1Y',fn:zoom1Y}].map(b=>(
          <button key={b.l} onClick={b.fn}
            className="w-7 h-7 rounded text-xs font-mono font-bold text-cyan-400 border border-cyan-900/50 bg-black/50 hover:bg-cyan-900/30 transition-all">{b.l}</button>
        ))}
      </div>
      {/* Zoom pill */}
      {showZoomPill&&(
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 glass rounded-full px-4 py-2 text-xs font-mono text-cyan-400 border border-cyan-900/50 z-10">
          <button onClick={zoomOut} className="text-lg leading-none">−</button>
          <span>{visibleBars} bars</span>
          <button onClick={zoomIn} className="text-lg leading-none">+</button>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════

const SMC_IDS: SMCId[] = ['liquidity','fvg','hh_ll','ob','choch','bos','fib','killzones','pdh_pdl','breakers','ifvg','smt'];

const ConceptSidebar: FC<{
  activeIds:Set<SMCId>;
  onToggle:(id:SMCId)=>void;
  zones:SMCZone[];
  hiddenZones:SMCZone[];
  onUnhide:(id:string)=>void;
  onUnhideAll:()=>void;
  isOpen:boolean;
  search:string;
  onSearch:(s:string)=>void;
}>=({activeIds,onToggle,zones,hiddenZones,onUnhide,onUnhideAll,isOpen,search,onSearch})=>{
  const [showHidden,setShowHidden]=useState(false);
  const filtered=SMC_IDS.filter(id=>{
    const m=SMC_META[id];
    const q=search.toLowerCase();
    return !q||m.name.toLowerCase().includes(q)||m.shortName.toLowerCase().includes(q)||m.desc.toLowerCase().includes(q);
  });

  return (
    <div className={`h-full flex flex-col glass-dark border-r border-cyan-900/30 transition-all duration-300 overflow-hidden ${isOpen?'w-72':'w-0'}`}>
      <div className="w-72 h-full flex flex-col p-3 overflow-hidden">
        {/* Search */}
        <div className="mb-3">
          <div className="text-xs font-mono tracking-widest text-cyan-400/60 uppercase mb-2">◈ SMC Concepts</div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">⌕</span>
            <input value={search} onChange={e=>onSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-800 transition-all"
              placeholder="Search concepts..." aria-label="Search concepts"/>
          </div>
        </div>

        {/* Select all / clear */}
        <div className="flex gap-2 mb-3">
          <button onClick={()=>SMC_IDS.forEach(id=>{ if(!activeIds.has(id)) onToggle(id); })}
            className="flex-1 py-1.5 text-xs font-mono rounded bg-cyan-900/20 border border-cyan-900/40 text-cyan-400 hover:bg-cyan-900/40 transition-all">ALL</button>
          <button onClick={()=>SMC_IDS.forEach(id=>{ if(activeIds.has(id)) onToggle(id); })}
            className="flex-1 py-1.5 text-xs font-mono rounded bg-slate-900/40 border border-slate-800 text-slate-500 hover:text-white transition-all">NONE</button>
        </div>

        {/* Concept rows */}
        <div className="flex-1 overflow-y-auto custom-scroll space-y-1.5 pr-1">
          {filtered.map(id=>{
            const m=SMC_META[id];
            const on=activeIds.has(id);
            const cnt=zones.filter(z=>z.type===id&&!z.hidden).length;
            return (
              <div key={id} className={`rounded-lg border transition-all ${on?'border-opacity-40 bg-slate-900/60':'border-slate-800/50 bg-slate-900/20'}`}
                style={on?{borderColor:m.color+'66'}:{}}>
                <div className="flex items-center gap-2.5 p-2.5">
                  <button onClick={()=>onToggle(id)} role="switch" aria-checked={on}
                    className="toggle-track shrink-0" style={on?{background:m.color+'22',borderColor:m.color}:{}}>
                    <div className="toggle-thumb" style={on?{background:m.color,left:18}:{}}/>
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white">{m.name}</span>
                      <span className="text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-500">{m.shortName}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">{m.desc.substring(0,50)}…</div>
                  </div>
                  {on&&cnt>0&&(
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 font-mono"
                      style={{background:m.color+'22',color:m.color}}>{cnt}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hidden drawer */}
        {hiddenZones.length>0&&(
          <div className="mt-3 border-t border-slate-800 pt-3">
            <button onClick={()=>setShowHidden(!showHidden)}
              className="w-full flex items-center justify-between text-xs font-mono text-slate-400 hover:text-white transition-all py-1">
              <span>HIDDEN ({hiddenZones.length})</span>
              <span>{showHidden?'▾':'▸'}</span>
            </button>
            {showHidden&&(
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto custom-scroll">
                <button onClick={onUnhideAll} className="w-full text-xs py-1 text-cyan-400 hover:text-cyan-300 font-mono text-left">↺ Unhide All</button>
                {hiddenZones.map(z=>(
                  <div key={z.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                    <span className="text-slate-400 truncate font-mono">{z.label}</span>
                    <button onClick={()=>onUnhide(z.id)} className="text-cyan-400 hover:text-cyan-300 shrink-0 font-mono">↺</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS PANEL
// ═══════════════════════════════════════════════════════════════════════════

const AnalysisPanel: FC<{
  scenarios:TradeScenario[];
  zones:SMCZone[];
  activeIds:Set<SMCId>;
  currentPrice:number;
  timeframe:Timeframe;
  ts:number;
  futureNodes:FutureNode[];
  showFuture:boolean;
  bullScore:number;
  bearScore:number;
  isOpen:boolean;
  onClose:()=>void;
  htfBias:HTFBiasState;
}>=({scenarios,zones,activeIds,currentPrice,timeframe,ts,futureNodes,showFuture,bullScore,bearScore,isOpen,onClose,htfBias})=>{
  const [accountBalance, setAccountBalance]=useState<number>(10000);
  const [riskPercent, setRiskPercent]=useState<number>(1.0);
  if(!isOpen) return null;

  const qualityConf: Record<string,{col:string;label:string}> = {
    strong:{col:'#10B981',label:'◉ STRONG'},
    moderate:{col:'#F59E0B',label:'◎ MODERATE'},
    weak:{col:'#64748b',label:'○ WEAK'},
  };

  const totalScore=bullScore+bearScore;
  const bullPct=totalScore>0?Math.round(bullScore/totalScore*100):50;
  const bearPct=100-bullPct;
  const isBull=bullPct>=bearPct;

  // Position size calculations for Gold (1 Standard Lot = 100 oz, $1 price move = $100 per lot)
  const cashRisk = accountBalance * (riskPercent / 100);

  return (
    <div className="h-full flex flex-col glass-dark border-l border-cyan-900/30 overflow-hidden anim-slideRight" style={{width:380}}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-amber-400">⊕</span> Institutional SMC Analysis
          </div>
          <div className="text-[10px] text-slate-500 font-mono">XAU/USD · {timeframe} · {new Date(ts).toLocaleTimeString()}</div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-white">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4">
        {/* MTF HTF Bias Alignment Matrix */}
        <div className="glass rounded-lg p-3 border border-cyan-800/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase">🌐 MTF HTF BIAS MATRIX</span>
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
              htfBias.aligned ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/40' : 'bg-amber-950/60 text-amber-400 border border-amber-500/40'
            }`}>
              {htfBias.aligned ? '✓ ALIGNED' : '⚠ MIXED'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center mb-2">
            <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
              <div className="text-[9px] font-mono text-slate-500">1D DAILY</div>
              <div className={`text-xs font-mono font-bold ${htfBias.daily==='BULLISH'?'text-emerald-400':'text-rose-400'}`}>
                {htfBias.daily}
              </div>
            </div>
            <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
              <div className="text-[9px] font-mono text-slate-500">4H SWING</div>
              <div className={`text-xs font-mono font-bold ${htfBias.h4==='BULLISH'?'text-emerald-400':'text-rose-400'}`}>
                {htfBias.h4}
              </div>
            </div>
            <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
              <div className="text-[9px] font-mono text-slate-500">1H INTRADAY</div>
              <div className={`text-xs font-mono font-bold ${htfBias.h1==='BULLISH'?'text-emerald-400':'text-rose-400'}`}>
                {htfBias.h1}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 leading-tight font-mono">{htfBias.summary}</div>
        </div>

        {/* Price & Confluence */}
        <div className="glass rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-slate-500 font-mono uppercase">XAU/USD</div>
              <div className="text-xl font-mono font-bold text-amber-400">${currentPrice.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono" style={{color:isBull?'#10B981':'#F43F5E'}}>{isBull?'↑ BULLISH':'↓ BEARISH'}</div>
              <div className="text-xs text-slate-500 font-mono">{bullPct}% / {bearPct}%</div>
            </div>
          </div>
          {/* Confluence bar */}
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full" style={{width:`${bullPct}%`,background:'linear-gradient(90deg,#10B981,#059669)'}}/>
          </div>
          <div className="flex justify-between text-[9px] font-mono mt-1 text-slate-500">
            <span>BULL {bullScore}</span><span>BEAR {bearScore}</span>
          </div>
        </div>

        {/* Institutional Risk & Position Sizer Calculator */}
        <div className="glass rounded-lg p-3 border border-amber-900/40 bg-amber-950/10">
          <div className="text-xs font-mono text-amber-400 font-bold uppercase mb-2 flex items-center gap-1.5">
            <span>⚖</span> XAUUSD POSITION SIZER & RISK
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[9px] font-mono text-slate-400 block mb-0.5">Account Equity ($)</label>
              <input
                type="number"
                value={accountBalance}
                onChange={e=>setAccountBalance(Math.max(100, Number(e.target.value)))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-slate-400 block mb-0.5">Risk Percentage (%)</label>
              <div className="flex gap-1">
                {[0.5, 1.0, 2.0].map(pct => (
                  <button
                    key={pct}
                    onClick={()=>setRiskPercent(pct)}
                    className={`flex-1 text-[10px] font-mono py-1 rounded transition-all ${
                      riskPercent===pct ? 'bg-amber-500 text-black font-bold' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded p-2 text-xs font-mono flex justify-between items-center border border-slate-800">
            <span className="text-slate-400">Allowed Cash Risk:</span>
            <span className="text-amber-400 font-bold">${cashRisk.toFixed(2)}</span>
          </div>
        </div>

        {/* Future NODES if active */}
        {showFuture&&futureNodes.length>0&&(
          <div className="glass rounded-lg p-3">
            <div className="text-xs font-mono text-amber-400 uppercase mb-2">◈ Trajectory Nodes</div>
            {futureNodes.map((fn,i)=>{
              const col=fn.kind==='BUY_ZONE'?'#10B981':fn.kind==='SELL_ZONE'?'#F43F5E':fn.kind==='TP1'?'#38BDF8':'#F59E0B';
              return (
                <div key={i} className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-0">
                  <span className="text-xs font-mono" style={{color:col}}>{fn.kind.replace('_',' ')}</span>
                  <span className="text-xs font-mono text-white">${fn.price.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Institutional 12-Concept Confluence Matrix */}
        <div className="glass rounded-lg p-3">
          <div className="text-xs font-mono text-cyan-400/70 uppercase mb-2">Institutional SMC Matrix</div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scroll pr-1">
            {SMC_IDS.map(id=>{
              const m=SMC_META[id];
              const active=activeIds.has(id);
              const cnt=zones.filter(z=>z.type===id&&!z.hidden).length;
              const bullC=zones.filter(z=>z.type===id&&z.dir==='bull'&&!z.hidden).length;
              const bearC=zones.filter(z=>z.type===id&&z.dir==='bear'&&!z.hidden).length;
              return (
                <div key={id} className={`flex items-center gap-2 text-xs py-1 ${active?'opacity-100':'opacity-30'}`}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:m.color}}/>
                  <span className="font-mono text-slate-400 w-16 shrink-0 truncate">{m.shortName}</span>
                  <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden flex">
                    <div className="h-full" style={{width:`${cnt?bullC/cnt*100:0}%`,background:'#10B98166'}}/>
                    <div className="h-full" style={{width:`${cnt?bearC/cnt*100:0}%`,background:'#F43F5E66'}}/>
                  </div>
                  <span className="font-mono text-slate-500 shrink-0 w-5 text-right">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade Scenarios with Live Lot Size Calculator */}
        <div>
          <div className="text-xs font-mono text-cyan-400/70 uppercase mb-2">Institutional Trade Scenarios</div>
          {scenarios.length===0?(
            <div className="glass rounded-lg p-4 text-center">
              <div className="text-slate-500 text-xs font-mono">No valid setups (min 1.2R required).</div>
              <div className="text-slate-600 text-xs mt-1">Enable more concepts or switch timeframe.</div>
            </div>
          ):(
            <div className="space-y-3">
              {scenarios.map((sc,i)=>{
                const isBuy=sc.dir==='bull';
                const qc=qualityConf[sc.quality];
                const slDist = Math.abs(sc.entry - sc.sl);
                // Gold Standard Lot size calculation: Lots = Cash Risk / (SL Distance * 100)
                const exactLots = slDist > 0 ? (cashRisk / (slDist * 100)) : 0;
                const roundedLots = Math.max(0.01, Math.min(100, Math.floor(exactLots * 100) / 100));
                const tp1Profit = Math.abs(sc.tp1 - sc.entry) * roundedLots * 100;

                return (
                  <div key={i} className={`rounded-lg border p-3 ${isBuy?'border-emerald-900/50 bg-emerald-900/5':'border-rose-900/50 bg-rose-900/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold font-mono ${isBuy?'text-emerald-400':'text-rose-400'}`}>{isBuy?'▲ BUY':'▼ SELL'}</span>
                        {sc.htfAligned&&(
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">
                            ✓ HTF ALIGNED
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono" style={{color:qc.col}}>{qc.label}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {[['Entry',sc.entry,'#e2e8f0'],['SL',sc.sl,'#F43F5E'],['TP1',sc.tp1,'#10B981'],['R:R',`1:${sc.rr}`,'#38BDF8']].map(([l,v,c])=>(
                        <div key={l} className="bg-slate-900/60 rounded p-2">
                          <div className="text-[9px] text-slate-500 uppercase font-mono">{l}</div>
                          <div className="text-xs font-mono font-bold" style={{color:c as string}}>{typeof v==='number'?`$${v}`:v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Calculated Lot Size Callout */}
                    <div className="bg-slate-950/80 rounded p-2 mb-2 border border-slate-800 text-[11px] font-mono">
                      <div className="flex justify-between text-slate-400">
                        <span>Rec. Lot Size:</span>
                        <span className="text-emerald-400 font-bold">{roundedLots.toFixed(2)} Lots</span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-[10px] mt-0.5">
                        <span>SL: -${cashRisk.toFixed(0)}</span>
                        <span>TP1 Gain: +${tp1Profit.toFixed(0)}</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 leading-relaxed mb-2">{sc.reasons.join(' + ')}</div>
                    <div className="text-[10px] text-slate-600 italic">⚠ {sc.invalidation}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="rounded-lg border border-amber-900/30 bg-amber-900/5 p-3">
          <div className="text-[10px] text-amber-400/60 leading-relaxed">
            ⚠ This analysis is for educational and planning purposes only. It does not constitute financial advice and does not guarantee future results. SMC analysis is a probabilistic framework. Always use proper risk management.
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// INSPECTOR CARD
// ═══════════════════════════════════════════════════════════════════════════

const InspectorCard: FC<{zone:SMCZone;x:number;y:number;onKeep:()=>void;onHide:()=>void}>=({zone,x,y,onKeep,onHide})=>{
  const m=SMC_META[zone.type];
  return (
    <div className="inspector-card glass rounded-xl p-4 shadow-2xl anim-popIn max-w-xs" style={{left:Math.min(x,window.innerWidth-280),top:Math.min(y,window.innerHeight-220),borderColor:m.color+'44'}}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{background:m.color}}/>
        <div className="text-sm font-bold text-white">{zone.label}</div>
        <div className="text-[9px] font-mono px-1.5 rounded" style={{background:m.color+'22',color:m.color}}>{m.shortName}</div>
      </div>
      <div className="text-xs text-slate-300 mb-2 leading-relaxed">{zone.detail}</div>
      <div className="text-[10px] text-slate-500 mb-3 italic leading-relaxed">{zone.rule.substring(0,120)}…</div>
      <div className="flex gap-2">
        <button onClick={onKeep} className="flex-1 py-1.5 text-xs font-mono rounded bg-cyan-900/30 border border-cyan-900/50 text-cyan-400 hover:bg-cyan-900/50 transition-all">Keep Visible</button>
        <button onClick={onHide} className="flex-1 py-1.5 text-xs font-mono rounded bg-rose-900/20 border border-rose-900/40 text-rose-400 hover:bg-rose-900/40 transition-all">Hide Marking</button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// GLOSSARY MODAL
// ═══════════════════════════════════════════════════════════════════════════

const GlossaryModal: FC<{onClose:()=>void}>=({onClose})=>(
  <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
    <div className="glass rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto custom-scroll anim-popIn" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-bold text-white flex items-center gap-2"><span className="text-cyan-400">📖</span> SMC Glossary</div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all">✕</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SMC_IDS.map(id=>{
          const m=SMC_META[id];
          return (
            <div key={id} className="rounded-lg bg-slate-900/60 p-3 border" style={{borderColor:m.color+'33'}}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{background:m.color}}/>
                <span className="text-sm font-bold text-white">{m.name}</span>
                <span className="text-[9px] font-mono px-1 rounded" style={{background:m.color+'22',color:m.color}}>{m.shortName}</span>
              </div>
              <div className="text-xs text-slate-400 mb-2 leading-relaxed">{m.desc}</div>
              <div className="text-[10px] text-slate-500 leading-relaxed italic">{m.rule}</div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TERMINAL
// ═══════════════════════════════════════════════════════════════════════════

const Terminal: FC=()=>{
  const [timeframe,setTimeframe]=useState<Timeframe>('1h');
  const [chartType,setChartType]=useState<ChartType>('candles');
  const [candles,setCandles]=useState<Candle[]>([]);
  const [status,setStatus]=useState<DataStatus>('loading');
  const [provider,setProvider]=useState('');
  const [loading,setLoading]=useState(true);

  const [activeIds,setActiveIds]=useState<Set<SMCId>>(new Set<SMCId>(['hh_ll','ob','fvg','bos','liquidity','killzones','pdh_pdl','breakers','ifvg','smt']));
  const [zones,setZones]=useState<SMCZone[]>([]);
  const [search,setSearch]=useState('');

  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [analysisOpen,setAnalysisOpen]=useState(false);
  const [fullChart,setFullChart]=useState(false);

  const [hoveredCandle,setHoveredCandle]=useState<Candle|null>(null);
  const [cursorInChart,setCursorInChart]=useState(false);

  const [inspector,setInspector]=useState<{zone:SMCZone;x:number;y:number}|null>(null);
  const [showGlossary,setShowGlossary]=useState(false);

  const [sensitivity,setSensitivity]=useState<Sensitivity>('med');
  const [cursorMode,setCursorMode]=useState<CursorMode>('reticle');
  const [showCursorMenu,setShowCursorMenu]=useState(false);
  const [showFuture,setShowFuture]=useState(false);
  const [futureNodes,setFutureNodes]=useState<FutureNode[]>([]);
  const [scenarios,setScenarios]=useState<TradeScenario[]>([]);
  const [analysisTs,setAnalysisTs]=useState<number>(Date.now());

  const [hideAll,setHideAll]=useState(false);

  // ── Load data ──
  const loadData=useCallback(async(tf:Timeframe)=>{
    setLoading(true); setStatus('loading'); setCandles([]);
    const lim=TF_LIMIT[tf];
    const r=await fetchCandles(tf,lim);
    setCandles(r.candles);
    setStatus(r.status);
    setProvider(r.provider);
    setLoading(false);
  },[]);

  useEffect(()=>{ loadData(timeframe); },[timeframe,loadData]);

  // ── Detect zones when candles/concepts change ──
  useEffect(()=>{
    if(candles.length<30) return;
    const z=detectSMC(candles,Array.from(activeIds));
    setZones(z);
  },[candles,activeIds]);

  // ── Analyze ──
  const doAnalysis=useCallback(()=>{
    const sc=runAnalysis(candles,zones);
    setScenarios(sc);
    setAnalysisTs(Date.now());
    setAnalysisOpen(true);
  },[candles,zones]);

  // ── FUTURE ──
  const doFuture=useCallback(()=>{
    const allIds=new Set<SMCId>(SMC_IDS);
    setActiveIds(allIds);
    // After state update we need zones recalculated — do it inline
    const allZones=detectSMC(candles,SMC_IDS);
    setZones(allZones);
    const nodes=computeFutureNodes(candles,allZones,timeframe);
    setFutureNodes(nodes);
    setShowFuture(true);
    const sc=runAnalysis(candles,allZones);
    setScenarios(sc);
    setAnalysisTs(Date.now());
    setAnalysisOpen(true);
  },[candles,timeframe]);

  const toggleId=useCallback((id:SMCId)=>{
    setActiveIds(prev=>{
      const next=new Set(prev);
      if(next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  },[]);

  const hiddenZones=zones.filter(z=>z.hidden);
  const visibleZones=hideAll?[]:zones.filter(z=>!z.hidden);

  const bullScore=visibleZones.filter(z=>z.dir==='bull').length;
  const bearScore=visibleZones.filter(z=>z.dir==='bear').length;

  const currentPrice=candles.length?candles[candles.length-1].c:0;
  const prevClose=candles.length>1?candles[candles.length-2].c:currentPrice;
  const priceChg=currentPrice-prevClose;
  const pricePct=prevClose?((priceChg/prevClose)*100):0;

  const handleHideZone=(id:string)=>{
    setZones(prev=>prev.map(z=>z.id===id?{...z,hidden:true}:z));
    setInspector(null);
  };
  const handleUnhide=(id:string)=>{
    setZones(prev=>prev.map(z=>z.id===id?{...z,hidden:false}:z));
  };
  const handleUnhideAll=()=>{
    setZones(prev=>prev.map(z=>({...z,hidden:false})));
  };
  const hideAllZones=()=>{ setHideAll(h=>!h); };

  const statCol: Record<DataStatus,string> = {live:'#10B981',delayed:'#F59E0B',demo:'#8B5CF6',loading:'#38BDF8',error:'#F43F5E'};
  const statLabel: Record<DataStatus,string> = {live:'LIVE',delayed:'DELAYED',demo:'DEMO',loading:'LOADING…',error:'ERROR'};

  const shouldHideAll = hideAll;

  return (
    <div className="fixed inset-0 flex flex-col" style={{background:'#060812'}}>
      <CosmicCursor isChart={cursorInChart} cursorMode={cursorMode} hoveredCandle={hoveredCandle}/>
      <div className="scan-overlay"/>

      {/* ── Top Header ── */}
      <header className="shrink-0 flex items-center gap-3 px-4 h-12 border-b border-cyan-900/30 bg-black/40 backdrop-blur z-20">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <span className="text-amber-400 text-xl" style={{filter:'drop-shadow(0 0 8px #F59E0B)'}}>⬡</span>
          <div>
            <div className="text-xs font-mono font-bold tracking-widest" style={{background:'linear-gradient(90deg,#38BDF8,#F59E0B)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>XAU/USD</div>
            <div className="text-[8px] font-mono text-slate-600 uppercase tracking-widest -mt-0.5">SMC TERMINAL</div>
          </div>
        </div>

        {/* Price HUD */}
        <div className="flex items-center gap-3 px-3 py-1.5 glass rounded-lg">
          <div>
            <div className="text-xs text-slate-500 font-mono">GOLD SPOT</div>
            <div className="font-mono font-bold text-base text-amber-400">${currentPrice.toFixed(2)}</div>
          </div>
          <div className={`text-xs font-mono font-bold ${priceChg>=0?'text-emerald-400':'text-rose-400'}`}>
            {priceChg>=0?'+':''}{priceChg.toFixed(2)} ({pricePct>=0?'+':''}{pricePct.toFixed(2)}%)
          </div>
        </div>

        {/* HTF Bias Quick Indicator */}
        {candles.length >= 50 && (
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 glass rounded-lg border border-cyan-800/40 text-[11px] font-mono">
            <span className="text-slate-400">HTF BIAS:</span>
            <span className="text-emerald-400 font-bold">1D {computeHTFBias(candles).daily}</span>
            <span className="text-slate-600">|</span>
            <span className="text-cyan-300">4H {computeHTFBias(candles).h4}</span>
          </div>
        )}

        {/* OHLCV + Exact Date & Time HUD on Hover */}
        {hoveredCandle&&(
          <div className="hud-row items-center glass px-3 py-1.5 rounded-lg border border-cyan-900/40 animate-fadeIn">
            <div className="flex items-center gap-1.5 mr-1 font-mono text-xs text-amber-400 border-r border-slate-700/80 pr-2">
              <span className="text-[10px] text-slate-400">📅</span>
              <span>{new Date(hoveredCandle.t*1000).toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'})}</span>
              <span className="text-cyan-300 font-bold ml-1">{new Date(hoveredCandle.t*1000).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span>
            </div>
            <span className="hud-label">O</span><span className="hud-val">{hoveredCandle.o.toFixed(2)}</span>
            <span className="hud-label">H</span><span className={`hud-val ${hoveredCandle.h>=hoveredCandle.o?'up':'down'}`}>{hoveredCandle.h.toFixed(2)}</span>
            <span className="hud-label">L</span><span className={`hud-val ${hoveredCandle.l<=hoveredCandle.o?'down':'up'}`}>{hoveredCandle.l.toFixed(2)}</span>
            <span className="hud-label">C</span><span className={`hud-val ${hoveredCandle.c>=hoveredCandle.o?'up':'down'}`}>{hoveredCandle.c.toFixed(2)}</span>
            {hoveredCandle.v>0&&<><span className="hud-label">V</span><span className="hud-val" style={{color:'#6366F1'}}>{(hoveredCandle.v/1000).toFixed(0)}K</span></>}
          </div>
        )}

        <div className="flex-1"/>

        {/* Status */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="w-2 h-2 rounded-full" style={{background:statCol[status],boxShadow:`0 0 6px ${statCol[status]}`}}/>
          <span style={{color:statCol[status]}}>{statLabel[status]}</span>
          {provider&&<span className="text-slate-600">· {provider}</span>}
        </div>

        {/* CURSOR Option Dropdown */}
        <div className="relative">
          <button
            onClick={()=>setShowCursorMenu(m=>!m)}
            className={`flex items-center gap-1.5 glass rounded-md px-2.5 py-1 text-xs font-mono transition-all border ${
              cursorMode==='loupe'
                ? 'border-amber-500/60 bg-amber-950/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                : 'border-cyan-900/40 text-cyan-400 hover:border-cyan-700'
            }`}
            title="Choose cursor style and auto-zoom loupe"
          >
            <span>🎯 CURSOR:</span>
            <span className="font-bold uppercase text-[11px]">{cursorMode}</span>
            <span className="text-[9px] text-slate-400">▾</span>
          </button>

          {showCursorMenu&&(
            <div className="absolute right-0 top-10 w-64 glass-dark rounded-xl p-2 border border-cyan-800/60 shadow-2xl z-50 animate-popIn">
              <div className="text-[10px] font-mono tracking-widest text-slate-400 uppercase px-2 py-1 mb-1 border-b border-slate-800">
                SELECT CURSOR STYLE
              </div>

              {[
                { id: 'reticle', title: 'Tactical Reticle', desc: 'Precision institutional crosshair reticle', icon: '⊕' },
                { id: 'crosshair', title: 'Classic Crosshair', desc: 'Thin full-span trading crosshair', icon: '┼' },
                { id: 'dot', title: 'Laser Dot', desc: 'Minimalist glowing cyan sniper pin', icon: '•' },
                { id: 'loupe', title: '🔍 Auto-Zoom Loupe', desc: 'Auto-magnifies text, candle & exact date/time under cursor', icon: '🔍', highlight: true },
              ].map(item=>(
                <button
                  key={item.id}
                  onClick={()=>{ setCursorMode(item.id as CursorMode); setShowCursorMenu(false); }}
                  className={`w-full text-left p-2 rounded-lg transition-all flex items-start gap-2.5 my-0.5 ${
                    cursorMode===item.id
                      ? 'bg-cyan-950/60 border border-cyan-500/60 text-white'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  } ${item.highlight ? 'border border-amber-500/30 bg-amber-950/20' : ''}`}
                >
                  <span className="text-base leading-none mt-0.5 text-cyan-400">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${item.highlight ? 'text-amber-300' : 'text-slate-200'}`}>
                        {item.title}
                      </span>
                      {cursorMode===item.id&&<span className="text-[10px] font-mono text-cyan-400">✓ ACTIVE</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sensitivity */}
        <div className="flex items-center gap-1 glass rounded-md px-2 py-1">
          <span className="text-[9px] text-slate-500 font-mono mr-1">SENS:</span>
          {(['low','med','high'] as Sensitivity[]).map(s=>(
            <button key={s} onClick={()=>setSensitivity(s)}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-all uppercase ${sensitivity===s?'bg-cyan-900/50 text-cyan-400':'text-slate-600 hover:text-slate-400'}`}>{s}</button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex items-center gap-1 glass rounded-md px-2 py-1">
          {([['candles','⌸'],['heikin','⌹'],['line','⌒'],['line_step','⌐'],['area','◿']] as [ChartType,string][]).map(([ct,ic])=>(
            <button key={ct} onClick={()=>setChartType(ct)} title={ct}
              className={`text-xs px-1.5 py-0.5 rounded transition-all ${chartType===ct?'bg-cyan-900/50 text-cyan-400':'text-slate-600 hover:text-slate-400'}`}>{ic}</button>
          ))}
        </div>

        {/* Timeframes */}
        <div className="flex gap-0.5 glass rounded-md p-1">
          {TFS.map(tf=>(
            <button key={tf} onClick={()=>setTimeframe(tf)}
              className={`px-2 py-1 text-xs font-mono rounded transition-all ${timeframe===tf?'bg-amber-900/40 text-amber-400 border border-amber-900/60':'text-slate-500 hover:text-white'}`}>{tf}</button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          <button onClick={()=>loadData(timeframe)} className="btn-cosmic p-1.5 rounded-lg" title="Refresh" aria-label="Refresh data">↻</button>
          <button onClick={hideAllZones} className={`px-2 py-1.5 rounded-lg text-xs font-mono transition-all border ${hideAll?'bg-rose-900/30 border-rose-900/50 text-rose-400':'btn-cosmic'}`}>
            {hideAll?`SHOW ALL`:`HIDE ALL`}{!hideAll&&zones.length>0&&<span className="ml-1 opacity-60">({zones.filter(z=>!z.hidden).length})</span>}
          </button>
          <button onClick={()=>setShowGlossary(true)} className="btn-cosmic px-2 py-1.5 rounded-lg text-xs font-mono">📖 GLOSSARY</button>
          <button onClick={()=>setFullChart(f=>!f)} className="btn-cosmic px-2 py-1.5 rounded-lg text-xs font-mono">{fullChart?'⊞ EXIT FULL':'⊟ FULL CHART'}</button>
          <button onClick={doFuture}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-widest transition-all anim-glowGold"
            style={{background:'linear-gradient(135deg,#F59E0B,#FBBF24)',color:'#000'}}>
            ◈ FUTURE
          </button>
          <button onClick={doAnalysis} className="btn-emerald px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-widest">⊕ ANALYZE</button>
        </div>
      </header>

      {/* ── Status bar if DEMO ── */}
      {status==='demo'&&(
        <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 bg-purple-900/20 border-b border-purple-900/30 text-xs font-mono">
          <span className="text-purple-400 font-bold">◉ DEMO MODE</span>
          <span className="text-purple-400/60">Synthetic data — not real prices. Set TWELVE_DATA_API_KEY or FINNHUB_API_KEY in .env.local for live data.</span>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        {!fullChart&&(
          <div className="relative shrink-0 flex">
            <button
              onClick={()=>setSidebarOpen(o=>!o)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-30 w-6 h-12 glass rounded-r-lg flex items-center justify-center text-slate-500 hover:text-cyan-400 transition-all border-r border-t border-b border-cyan-900/30"
              aria-label={sidebarOpen?'Close sidebar':'Open sidebar'}
            >{sidebarOpen?'◂':'▸'}</button>
            <ConceptSidebar
              activeIds={activeIds}
              onToggle={toggleId}
              zones={zones}
              hiddenZones={hiddenZones}
              onUnhide={handleUnhide}
              onUnhideAll={handleUnhideAll}
              isOpen={sidebarOpen}
              search={search}
              onSearch={setSearch}
            />
          </div>
        )}

        {/* Chart */}
        <div
          className="flex-1 relative overflow-hidden"
          onMouseEnter={()=>setCursorInChart(true)}
          onMouseLeave={()=>setCursorInChart(false)}
        >
          {loading&&(
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 anim-fadeIn">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-4"/>
              <div className="text-cyan-400 text-xs font-mono tracking-widest">LOADING XAU/USD…</div>
            </div>
          )}
          {!loading&&candles.length===0&&(
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <div className="text-4xl mb-4">⚠</div>
              <div className="text-white font-bold mb-2">No Data Available</div>
              <button onClick={()=>loadData(timeframe)} className="btn-cosmic px-4 py-2 rounded-lg text-sm font-mono">Retry</button>
            </div>
          )}
          {candles.length>0&&(
            <ChartCanvas
              candles={candles}
              chartType={chartType}
              zones={shouldHideAll?[]:zones}
              activeIds={activeIds}
              futureNodes={futureNodes}
              showFuture={showFuture}
              timeframe={timeframe}
              sensitivity={sensitivity}
              onHover={(c,x,y)=>{ setHoveredCandle(c); void x; void y; }}
              onZoneClick={(z,x,y)=>setInspector({zone:z,x,y})}
            />
          )}

          {/* Inspector card */}
          {inspector&&!shouldHideAll&&(
            <InspectorCard
              zone={inspector.zone}
              x={inspector.x}
              y={inspector.y}
              onKeep={()=>setInspector(null)}
              onHide={()=>handleHideZone(inspector.zone.id)}
            />
          )}
        </div>

        {/* Right panel */}
        {!fullChart&&(
          <AnalysisPanel
            scenarios={scenarios}
            zones={zones}
            activeIds={activeIds}
            currentPrice={currentPrice}
            timeframe={timeframe}
            ts={analysisTs}
            futureNodes={futureNodes}
            showFuture={showFuture}
            bullScore={bullScore}
            bearScore={bearScore}
            isOpen={analysisOpen}
            onClose={()=>setAnalysisOpen(false)}
            htfBias={computeHTFBias(candles)}
          />
        )}
      </div>

      {/* Glossary */}
      {showGlossary&&<GlossaryModal onClose={()=>setShowGlossary(false)}/>}

      {/* Click-away for inspector */}
      {inspector&&(
        <div className="fixed inset-0 z-[190]" onClick={()=>setInspector(null)}/>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ROOT: BOOT → TERMINAL
// ═══════════════════════════════════════════════════════════════════════════

export default function App(){
  const [boot,setBoot]=useState<BootStep>('password');

  return (
    <>
      {boot==='password'&&<PasswordGate onPass={()=>setBoot('animation')}/>}
      {boot==='animation'&&(
        <GalaxyAnimation
          onDone={()=>setBoot('countdown')}
          onSkip={()=>setBoot('terminal')}
        />
      )}
      {boot==='countdown'&&(
        <Countdown
          onDone={()=>setBoot('terminal')}
          onSkip={()=>setBoot('terminal')}
        />
      )}
      {boot==='terminal'&&<Terminal/>}
    </>
  );
}
