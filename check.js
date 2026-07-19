
/* ============================================================
   SEED baseline embedded; ongoing readings -> localStorage.
   All dials 0-10, higher=better. interventions[] = the tracked
   FACTORS (structured toggles). note = free text (not correlated).
   ============================================================ */
const RUNNER_ID = "UNREGISTERED";
const SEED_DATA = [
  {
    date: "2026-06-27",
    status: "between-runs",
    physical: { energy: 5, comfort: 6, sleep_quality: 5, sleep_hours: 6, time_in_bed: null },
    mental: { mood: 3, calm: 6, focus: 6, engagement: 4 },
    training: null,
    symptoms: ["neck tightness (base of skull)", "muscle soreness — first BJJ"],
    interventions: ["escitalopram", "vyvanse", "BJJ training"],
    note: "First BJJ session at 38, sore & stiff; plans to keep the shell moving today. Baseline.",
    spiritual: ""
  }
];
const LS_KEY = "nona_readings_v1";
const FACTOR_KEY = "nona_factors_v1";
const BASE_FACTORS = ["escitalopram","vyvanse","BJJ training","caffeine","alcohol","magnesium","creatine","vitamin D","protein","hydration","sunlight","meditation","screens late","rest day"];
const DERIVED = ["Slept 7h+","Trained"];
const MIN_N = 3;
/* ============================================================ */

const C = {teal:'#84E3D4',teald:'#5FC4B5',lav:'#BCA9F2',peach:'#F2CE8A',rose:'#F0909C',
  ink:'#E8EDF4',ink2:'#9DB0C2',muted:'#6A7888',grid:'rgba(232,237,244,.07)'};
const statusMap={'between-runs':'BETWEEN RUNS','recovering':'RECOVERING','pre-contract':'PRE-CONTRACT','post-contract':'POST-CONTRACT','on-contract':'ON CONTRACT'};
let NORM=null, LAST_SORTED=[];

function migrate(r){
  const e=JSON.parse(JSON.stringify(r));
  e.physical=e.physical||{};e.mental=e.mental||{};
  if(e.physical.comfort==null && e.physical.pain!=null) e.physical.comfort=10-e.physical.pain;
  if(e.mental.calm==null && e.mental.anxiety!=null) e.mental.calm=10-e.mental.anxiety;
  return e;
}
function loadStored(){try{return (JSON.parse(localStorage.getItem(LS_KEY))||[]).map(migrate);}catch(e){return [];}}
function saveStored(a){localStorage.setItem(LS_KEY,JSON.stringify(a));}
function allData(){
  const m={};
  SEED_DATA.map(migrate).forEach(r=>m[r.date]=r);
  loadStored().forEach(r=>m[r.date]=r);
  return Object.values(m).sort((a,b)=>a.date<b.date?-1:1);
}
function getVocab(){try{const v=JSON.parse(localStorage.getItem(FACTOR_KEY));return (v&&v.length)?v:BASE_FACTORS.slice();}catch(e){return BASE_FACTORS.slice();}}
function addVocab(names){const v=getVocab();let ch=false;names.forEach(n=>{n=n.trim();if(n&&!v.some(x=>x.toLowerCase()===n.toLowerCase())){v.push(n);ch=true;}});if(ch)localStorage.setItem(FACTOR_KEY,JSON.stringify(v));}

function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDay(ds){const d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtDate(s){const d=new Date(s+'T00:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'2-digit'}).toUpperCase();}
function avg(a){return a.reduce((x,y)=>x+y,0)/a.length;}

function dialsOf(e){return {energy:e.physical.energy,mood:e.mental.mood,focus:e.mental.focus,
  sleep_q:e.physical.sleep_quality,comfort:e.physical.comfort,calm:e.mental.calm};}
function personalNormal(sorted){
  const keys=['energy','mood','focus','sleep_q','comfort','calm'];
  const s={};keys.forEach(k=>s[k]=0);
  sorted.forEach(e=>{const d=dialsOf(e);keys.forEach(k=>s[k]+=d[k]);});
  const n=sorted.length||1,o={};keys.forEach(k=>o[k]=s[k]/n);return o;
}
function integrityDev(e,norm){
  const d=dialsOf(e),keys=Object.keys(d);
  let tot=0;keys.forEach(k=>tot+=(d[k]-norm[k]));
  return Math.max(0,Math.min(100,50+(tot/keys.length)*10));
}
function who5(e){
  const v=[e.mental.mood,e.mental.calm,e.physical.energy,e.physical.sleep_quality,e.mental.engagement];
  if(v.some(x=>x==null||isNaN(x))) return null;
  return Math.round(v.reduce((a,b)=>a+b,0)/50*100);
}
function who5Band(v){if(v==null)return['—',C.muted];if(v>=68)return['GOOD',C.teal];if(v>=50)return['FAIR',C.lav];if(v>=29)return['LOW',C.peach];return['POOR',C.rose];}
function sleepEff(e){const t=e.physical.time_in_bed;if(!t||t<=0)return null;return Math.min(100,Math.round(e.physical.sleep_hours/t*100));}
function trainLoad(e){if(!e.training||!e.training.rpe||!e.training.min)return null;return Math.round(e.training.rpe*e.training.min);}
function smooth(arr,w){return arr.map((_,i)=>{const s=arr.slice(Math.max(0,i-w+1),i+1);return s.reduce((a,b)=>a+b,0)/s.length;});}
function band(v){if(v>=60)return['RISING',C.teal];if(v>=45)return['HOLDING',C.lav];if(v>=30)return['SLIPPING',C.peach];return['DEGRADED',C.rose];}

/* --- n-of-1 analysis --- */
function outcomeVal(e,key){
  switch(key){
    case 'who5':return who5(e);
    case 'integrity':return Math.round(integrityDev(e,NORM));
    case 'mood':return e.mental.mood;
    case 'energy':return e.physical.energy;
    case 'comfort':return e.physical.comfort;
    case 'calm':return e.mental.calm;
    case 'focus':return e.mental.focus;
    case 'sleep_q':return e.physical.sleep_quality;
  }
  return null;
}
function factorActive(e,name){
  if(name==='Slept 7h+') return e.physical.sleep_hours>=7;
  if(name==='Trained') return !!(e.training&&e.training.rpe>0) || (e.interventions||[]).some(x=>/bjj|train|grappl|lift|run|workout|roll/i.test(x));
  return (e.interventions||[]).map(x=>x.toLowerCase()).includes(name.toLowerCase());
}
function factorNames(sorted){
  const set=new Set();
  sorted.forEach(e=>(e.interventions||[]).forEach(i=>{const k=i.trim();if(k)set.add(k);}));
  const arr=[...set];
  DERIVED.forEach(d=>{if(!arr.some(x=>x.toLowerCase()===d.toLowerCase()))arr.push(d);});
  return arr;
}
function impact(sorted,name,outKey,lag){
  const dateMap={};sorted.forEach(e=>dateMap[e.date]=e);
  const withV=[],withoutV=[];
  sorted.forEach(e=>{
    let target=e;
    if(lag===1){const t=dateMap[addDay(e.date)];if(!t)return;target=t;}
    const o=outcomeVal(target,outKey);if(o==null||isNaN(o))return;
    if(factorActive(e,name))withV.push(o);else withoutV.push(o);
  });
  return {nWith:withV.length,nWithout:withoutV.length,
    delta:(withV.length&&withoutV.length)?(avg(withV)-avg(withoutV)):null};
}
function fmtDelta(d){
  if(d==null)return '<span class="dim">—</span>';
  const r=(d>0?'+':'')+d.toFixed(1);
  const col=d>0?'var(--teal)':(d<0?'var(--rose)':'var(--muted)');
  const arw=d>0?'▲':(d<0?'▼':'■');
  return `<span style="color:${col}">${arw} ${r}</span>`;
}
function activeFactors(e){
  const a=[...(e.interventions||[])];
  DERIVED.forEach(d=>{if(factorActive(e,d)&&!a.some(x=>x.toLowerCase()===d.toLowerCase()))a.push(d);});
  return a;
}
function renderAnalysis(sorted){
  const outKey=$('outSel').value;
  const impactBox=$('impactBox'), boardBox=$('boardBox');
  if(sorted.length<5){
    impactBox.innerHTML=`<div class="thin">The loom is still thin — associations need more threads before I will claim a pattern. Keep weaving; factor readouts begin around a week or two in. (${sorted.length} of ~5 minimum readings)</div>`;
    boardBox.innerHTML='';
    return;
  }
  const rows=factorNames(sorted).map(n=>({name:n,same:impact(sorted,n,outKey,0),next:impact(sorted,n,outKey,1)}))
    .filter(r=>r.same.nWith>=MIN_N && r.same.nWithout>=MIN_N);
  if(!rows.length){
    impactBox.innerHTML=`<div class="thin">No factor yet has enough days both on and off (≥${MIN_N} each) to compare fairly. Keep logging your choices — and their absences — and the contrasts will resolve.</div>`;
  }else{
    rows.sort((a,b)=>{const da=a.same.delta==null?-999:a.same.delta;const db=b.same.delta==null?-999:b.same.delta;return db-da;});
    let h=`<div class="irow h"><div>Factor · days on/off</div><div>Δ same-day</div><div>Δ next-day</div></div>`;
    rows.forEach(r=>{
      h+=`<div class="irow"><div class="iname">${r.name}<span class="in">${r.same.nWith}/${r.same.nWithout}</span></div>
        <div class="idelta">${fmtDelta(r.same.delta)}</div>
        <div class="idelta">${fmtDelta(r.next.delta)}</div></div>`;
    });
    impactBox.innerHTML=h;
  }
  /* best / worst */
  const scored=sorted.map(e=>({e,o:outcomeVal(e,outKey)})).filter(x=>x.o!=null).sort((a,b)=>b.o-a.o);
  const top=scored.slice(0,3), bot=scored.slice(-3).reverse();
  const dayCard=x=>`<div class="bday"><div class="bhead"><b>${fmtDate(x.e.date)}</b><span class="bval">${Math.round(x.o)}</span></div>
    <div class="chips">${activeFactors(x.e).map(f=>`<span class="chip iv">${f}</span>`).join('')||'<span class="tiny dim">no factors logged</span>'}</div>
    <div class="tiny dim" style="margin-top:6px;">${x.e.physical.sleep_hours}h sleep${x.e.note?' · '+x.e.note:''}</div></div>`;
  boardBox.innerHTML=`<div class="boardcol"><h3 style="color:var(--teal)">▲ Best days</h3>${top.map(dayCard).join('')}</div>
    <div class="boardcol"><h3 style="color:var(--rose)">▼ Worst days</h3>${bot.map(dayCard).join('')}</div>`;
}

let charts=[];
function clearCharts(){charts.forEach(c=>{try{c.destroy();}catch(e){}});charts=[];}

function renderAll(){
  const data=allData();
  document.getElementById('hd-runner').textContent=RUNNER_ID;
  document.getElementById('hd-count').textContent=data.length;
  document.getElementById('ft-stamp').textContent=new Date().toLocaleString('en-US',{hour12:false}).toUpperCase();
  const hasToday=data.some(d=>d.date===todayStr());
  document.getElementById('intake-status').textContent=hasToday?"Today's thread is woven. Open to revise it.":"No reading yet today.";

  clearCharts();
  if(!data.length){document.getElementById('empty').classList.remove('hide');document.getElementById('live').classList.add('hide');return;}
  document.getElementById('empty').classList.add('hide');
  document.getElementById('live').classList.remove('hide');

  const sorted=data, norm=personalNormal(sorted);
  NORM=norm; LAST_SORTED=sorted;
  const cur=sorted[sorted.length-1], prev=sorted.length>1?sorted[sorted.length-2]:cur;
  document.getElementById('hd-sync').textContent=fmtDate(cur.date);
  document.getElementById('m-current').textContent=fmtDate(cur.date)+' · vs your normal';

  const defs=[
    {k:'Energy',v:cur.physical.energy,b:norm.energy},
    {k:'Mood',v:cur.mental.mood,b:norm.mood},
    {k:'Comfort',v:cur.physical.comfort,b:norm.comfort},
    {k:'Calm',v:cur.mental.calm,b:norm.calm},
  ];
  const tiles=document.getElementById('tiles');tiles.innerHTML='';
  defs.forEach(d=>{
    const diff=+(d.v-d.b).toFixed(1);
    let cls='delta-flat',arrow='■';
    if(diff!==0){cls=diff>0?'delta-up':'delta-dn';arrow=diff>0?'▲':'▼';}
    const el=document.createElement('div');el.className='tile';
    el.innerHTML=`<div class="k">${d.k}</div><div class="v">${d.v}<small>/10</small></div>
      <div class="d ${cls}">${arrow} ${diff>0?'+':''}${diff} vs normal</div>`;
    tiles.appendChild(el);
  });

  const sl=document.getElementById('statline');sl.innerHTML='';
  const addStat=(k,v)=>{const d=document.createElement('div');d.className='s';d.innerHTML=`<div class="k">${k}</div><div class="v">${v}</div>`;sl.appendChild(d);};
  document.getElementById('m-status').textContent=statusMap[cur.status]||cur.status||'—';
  addStat('Sleep',`${cur.physical.sleep_hours}<small> h</small>`);
  const eff=sleepEff(cur); if(eff!=null) addStat('Sleep efficiency',`${eff}<small>% ${eff>=85?'·ok':'·low'}</small>`);
  const tl=trainLoad(cur); if(tl!=null) addStat('Training load',`${tl}<small> AU</small>`);
  const w=who5(cur); if(w!=null) addStat('WHO-5',`${w}<small>/100</small>`);

  const ivc=document.getElementById('iv-chips');ivc.innerHTML='';
  (cur.interventions&&cur.interventions.length?cur.interventions:['—']).forEach(i=>{const s=document.createElement('span');s.className='chip iv';s.textContent=i;ivc.appendChild(s);});
  const syc=document.getElementById('sym-chips');syc.innerHTML='';
  (cur.symptoms&&cur.symptoms.length?cur.symptoms:['none reported']).forEach(i=>{const s=document.createElement('span');s.className='chip sym';s.textContent=i;syc.appendChild(s);});

  const rawIdx=sorted.map(e=>integrityDev(e,norm));
  const smIdx=smooth(rawIdx,3);
  const curI=Math.round(smIdx[smIdx.length-1]);
  const prevI=Math.round(smIdx.length>1?smIdx[smIdx.length-2]:smIdx[smIdx.length-1]);
  const [bl,bc]=band(curI);
  let el=document.getElementById('integ-num');el.textContent=curI;el.style.color=bc;
  el=document.getElementById('integ-band');el.textContent=bl;el.style.borderColor=bc;el.style.color=bc;
  const dI=curI-prevI;
  document.getElementById('integ-delta').innerHTML=(sorted.length>1?
    `<span class="${dI>=0?'delta-up':'delta-dn'}">${dI>=0?'▲ +':'▼ '}${dI} vs last thread</span> &nbsp;<span class="dim">raw ${Math.round(rawIdx[rawIdx.length-1])}</span>`:
    `<span class="dim">50 = your normal · first thread sets the loom</span>`);

  charts.push(new Chart(document.getElementById('ringChart'),{type:'doughnut',
    data:{datasets:[{data:[curI,100-curI],backgroundColor:[bc,'rgba(232,237,244,.08)'],borderWidth:0}]},
    options:{cutout:'74%',plugins:{legend:{display:false},tooltip:{enabled:false}},responsive:false}}));

  const who5arr=sorted.map(who5);
  const curW=who5arr[who5arr.length-1];
  const [wbl,wbc]=who5Band(curW);
  el=document.getElementById('who5-num');el.textContent=(curW==null?'—':curW);el.style.color=wbc;
  el=document.getElementById('who5-band');el.textContent=wbl;el.style.borderColor=wbc;el.style.color=wbc;

  const labels=sorted.map(e=>fmtDate(e.date));
  const baseGrid={grid:{color:C.grid},ticks:{color:C.muted,font:{family:'monospace',size:10}}};
  const noLeg={legend:{display:false}};
  const ds=(l,d,c,f)=>({label:l,data:d,borderColor:c,backgroundColor:f||c,borderWidth:2,tension:.3,pointRadius:3,pointBackgroundColor:c,pointBorderWidth:0,spanGaps:true});

  charts.push(new Chart(document.getElementById('integTrend'),{type:'line',
    data:{labels,datasets:[
      {label:'normal',data:labels.map(()=>50),borderColor:'rgba(157,176,194,.45)',borderWidth:1,borderDash:[4,4],pointRadius:0,tension:0},
      {label:'raw',data:rawIdx,borderColor:'rgba(132,227,212,.30)',backgroundColor:'transparent',borderWidth:1,tension:.3,pointRadius:0},
      ds('Integrity (3-day)',smIdx,C.teal,'rgba(132,227,212,.10)')]},
    options:{responsive:true,maintainAspectRatio:false,plugins:noLeg,scales:{y:{min:0,max:100,...baseGrid},x:baseGrid}}}));

  charts.push(new Chart(document.getElementById('who5Trend'),{type:'line',
    data:{labels,datasets:[
      {label:'thresh',data:labels.map(()=>50),borderColor:'rgba(240,144,156,.40)',borderWidth:1,borderDash:[4,4],pointRadius:0,tension:0},
      ds('WHO-5',who5arr,C.lav,'rgba(188,169,242,.10)')]},
    options:{responsive:true,maintainAspectRatio:false,plugins:noLeg,scales:{y:{min:0,max:100,...baseGrid},x:baseGrid}}}));

  charts.push(new Chart(document.getElementById('vitalsChart'),{type:'line',
    data:{labels,datasets:[
      ds('Energy',sorted.map(e=>e.physical.energy),C.teal),
      ds('Mood',sorted.map(e=>e.mental.mood),C.lav),
      ds('Focus',sorted.map(e=>e.mental.focus),C.peach),
      ds('Engagement',sorted.map(e=>e.mental.engagement),C.ink2)]},
    options:{responsive:true,maintainAspectRatio:false,plugins:noLeg,interaction:{intersect:false,mode:'index'},scales:{y:{min:0,max:10,...baseGrid},x:baseGrid}}}));

  charts.push(new Chart(document.getElementById('easeChart'),{type:'line',
    data:{labels,datasets:[ds('Comfort',sorted.map(e=>e.physical.comfort),C.teal),ds('Calm',sorted.map(e=>e.mental.calm),C.lav)]},
    options:{responsive:true,maintainAspectRatio:false,plugins:noLeg,interaction:{intersect:false,mode:'index'},scales:{y:{min:0,max:10,...baseGrid},x:baseGrid}}}));

  charts.push(new Chart(document.getElementById('sleepChart'),{type:'bar',
    data:{labels,datasets:[
      {type:'bar',label:'Hours',data:sorted.map(e=>e.physical.sleep_hours),backgroundColor:'rgba(157,176,194,.25)',borderColor:C.ink2,borderWidth:1,yAxisID:'y',order:2},
      {type:'line',label:'Quality',data:sorted.map(e=>e.physical.sleep_quality),borderColor:C.teal,backgroundColor:C.teal,borderWidth:2,tension:.3,pointRadius:3,yAxisID:'y1',order:1}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:noLeg,scales:{y:{min:0,max:12,...baseGrid,position:'left'},y1:{min:0,max:10,grid:{drawOnChartArea:false},ticks:{color:C.teal,font:{size:10}},position:'right'},x:baseGrid}}}));

  const freq={};sorted.forEach(e=>(e.interventions||[]).forEach(i=>{const k=i.trim();if(k&&k!=='—')freq[k]=(freq[k]||0)+1;}));
  const fk=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]);
  if(fk.length){
    charts.push(new Chart(document.getElementById('ivChart'),{type:'bar',
      data:{labels:fk,datasets:[{data:fk.map(k=>freq[k]),backgroundColor:C.lav,borderColor:C.ink,borderWidth:1}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:noLeg,
        scales:{x:{beginAtZero:true,ticks:{stepSize:1,color:C.muted,font:{size:10}},grid:{color:C.grid}},y:{ticks:{color:C.ink2,font:{size:10}},grid:{display:false}}}}}));
  }

  const lt=document.getElementById('logTable');lt.innerHTML='';
  new gridjs.Grid({
    columns:['Date','Status',{name:'Integ',sort:true},{name:'WHO-5',sort:true},'Energy','Mood','Comfort','Calm','Sleep','Factors'],
    data:sorted.slice().reverse().map(e=>[fmtDate(e.date),(statusMap[e.status]||e.status||'—'),Math.round(integrityDev(e,norm)),(who5(e)==null?'—':who5(e)),
      e.physical.energy,e.mental.mood,e.physical.comfort,e.mental.calm,e.physical.sleep_hours+'h',
      (e.interventions||[]).join(', ')||'—']),
    sort:true,search:true,pagination:{limit:10},
  }).render(lt);

  renderAnalysis(sorted);
}

/* ---------- intake form ---------- */
const $=id=>document.getElementById(id);
[['energy','v-energy'],['comfort','v-comfort'],['mood','v-mood'],['calm','v-calm'],['focus','v-focus'],['engage','v-engage'],['sq','v-sq'],['rpe','v-rpe']].forEach(([f,v])=>{
  $('f-'+f).addEventListener('input',e=>$(v).textContent=e.target.value);
});
function buildFactorChips(){
  const box=$('ivQuick');box.innerHTML='';
  getVocab().forEach(name=>{
    const c=document.createElement('span');c.className='qchip';c.textContent=name;
    c.onclick=()=>{
      c.classList.toggle('on');
      const cur=$('f-iv').value.split(',').map(s=>s.trim()).filter(Boolean);
      const i=cur.findIndex(x=>x.toLowerCase()===name.toLowerCase());
      if(c.classList.contains('on')){if(i<0)cur.push(name);}else{if(i>=0)cur.splice(i,1);}
      $('f-iv').value=cur.join(', ');
    };
    box.appendChild(c);
  });
  syncQuickChips();
}
function syncQuickChips(){
  const cur=$('f-iv').value.split(',').map(s=>s.trim().toLowerCase());
  [...$('ivQuick').children].forEach(c=>c.classList.toggle('on',cur.includes(c.textContent.toLowerCase())));
}
$('f-iv').addEventListener('input',syncQuickChips);
function setRange(f,v,val){$('f-'+f).value=val;$(v).textContent=val;}
function openForm(){
  const ex=allData().find(d=>d.date===todayStr());
  $('f-date').value=todayStr();
  if(ex){
    $('f-status').value=ex.status||'between-runs';
    setRange('energy','v-energy',ex.physical.energy);
    setRange('comfort','v-comfort',ex.physical.comfort);
    setRange('mood','v-mood',ex.mental.mood);
    setRange('calm','v-calm',ex.mental.calm);
    setRange('focus','v-focus',ex.mental.focus);
    setRange('engage','v-engage',ex.mental.engagement!=null?ex.mental.engagement:5);
    setRange('sq','v-sq',ex.physical.sleep_quality);
    $('f-hours').value=ex.physical.sleep_hours;
    $('f-tib').value=ex.physical.time_in_bed!=null?ex.physical.time_in_bed:'';
    setRange('rpe','v-rpe',ex.training?ex.training.rpe:0);
    $('f-min').value=ex.training?ex.training.min:'';
    $('f-sym').value=(ex.symptoms||[]).join(', ');
    $('f-iv').value=(ex.interventions||[]).join(', ');
    $('f-note').value=ex.note||'';
    $('f-spirit').value=ex.spiritual||'';
  }else{
    $('f-iv').value='';
  }
  buildFactorChips();
  $('intake').classList.remove('hide');
  $('intake').scrollIntoView({behavior:'smooth',block:'start'});
}
function closeForm(){$('intake').classList.add('hide');$('form-msg').textContent='';}
$('openIntake').onclick=openForm;
$('cancelReading').onclick=closeForm;
$('saveReading').onclick=()=>{
  const splitList=s=>s.split(',').map(x=>x.trim()).filter(Boolean);
  const tib=$('f-tib').value!==''?+$('f-tib').value:null;
  const rpe=+$('f-rpe').value, min=$('f-min').value!==''?+$('f-min').value:0;
  const factors=splitList($('f-iv').value);
  const rec={
    date:$('f-date').value||todayStr(),
    status:$('f-status').value,
    physical:{energy:+$('f-energy').value,comfort:+$('f-comfort').value,sleep_quality:+$('f-sq').value,sleep_hours:+$('f-hours').value,time_in_bed:tib},
    mental:{mood:+$('f-mood').value,calm:+$('f-calm').value,focus:+$('f-focus').value,engagement:+$('f-engage').value},
    training:(rpe>0&&min>0)?{rpe:rpe,min:min}:null,
    symptoms:splitList($('f-sym').value),
    interventions:factors,
    note:$('f-note').value.trim(),
    spiritual:$('f-spirit').value.trim()
  };
  addVocab(factors);
  const stored=loadStored().filter(r=>r.date!==rec.date);
  stored.push(rec);saveStored(stored);
  $('form-msg').textContent='Thread woven. The pattern updates.';
  renderAll();
  setTimeout(closeForm,900);
};
$('exportBtn').onclick=()=>{
  const json=JSON.stringify(allData(),null,2);
  $('exportText').value=json;
  $('importDrawer').classList.add('hide');
  $('exportDrawer').classList.toggle('hide');
  if(!$('exportDrawer').classList.contains('hide')){try{navigator.clipboard.writeText(json);}catch(e){}$('exportText').scrollIntoView({behavior:'smooth',block:'nearest'});}
};
$('importBtn').onclick=()=>{$('exportDrawer').classList.add('hide');$('importDrawer').classList.toggle('hide');if(!$('importDrawer').classList.contains('hide'))$('importText').scrollIntoView({behavior:'smooth',block:'nearest'});};
$('doImport').onclick=()=>{
  try{
    const arr=JSON.parse($('importText').value);
    if(!Array.isArray(arr))throw 0;
    const map={};loadStored().forEach(r=>map[r.date]=r);
    let n=0;arr.map(migrate).forEach(r=>{if(r&&r.date){map[r.date]=r;n++;}});
    saveStored(Object.values(map));
    $('importMsg').textContent='Restored '+n+' threads.';
    renderAll();
  }catch(e){$('importMsg').textContent='Could not read that weave — check it is the exported JSON.';}
};
$('outSel').addEventListener('change',()=>renderAnalysis(LAST_SORTED));

buildFactorChips();
renderAll();
