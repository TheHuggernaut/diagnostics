// replicate pure analysis logic
let NORM=null;
function addDay(ds){const d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function avg(a){return a.reduce((x,y)=>x+y,0)/a.length;}
function who5(e){const v=[e.mental.mood,e.mental.calm,e.physical.energy,e.physical.sleep_quality,e.mental.engagement];if(v.some(x=>x==null||isNaN(x)))return null;return Math.round(v.reduce((a,b)=>a+b,0)/50*100);}
function outcomeVal(e,k){if(k==='who5')return who5(e);if(k==='mood')return e.mental.mood;return null;}
function factorActive(e,name){if(name==='Slept 7h+')return e.physical.sleep_hours>=7;return (e.interventions||[]).map(x=>x.toLowerCase()).includes(name.toLowerCase());}
function impact(sorted,name,outKey,lag){const dateMap={};sorted.forEach(e=>dateMap[e.date]=e);const w=[],wo=[];sorted.forEach(e=>{let t=e;if(lag===1){const x=dateMap[addDay(e.date)];if(!x)return;t=x;}const o=outcomeVal(t,outKey);if(o==null||isNaN(o))return;if(factorActive(e,name))w.push(o);else wo.push(o);});return {nWith:w.length,nWithout:wo.length,delta:(w.length&&wo.length)?(avg(w)-avg(wo)):null};}

// synthetic: magnesium present -> better mood; days
const data=[];
for(let i=0;i<12;i++){
  const day='2026-07-'+String(i+1).padStart(2,'0');
  const mag = i%2===0; // every other day
  const sleep = 6+(i%3); // 6,7,8
  data.push({date:day,physical:{energy:5,sleep_quality:5,sleep_hours:sleep},mental:{mood: mag?7:4, calm:6, engagement:5},interventions: mag?['magnesium']:[]});
}
console.log('magnesium same-day mood:', impact(data,'magnesium','mood',0));
console.log('magnesium next-day mood:', impact(data,'magnesium','mood',1));
console.log('Slept 7h+ same-day who5:', impact(data,'Slept 7h+','who5',0));
console.log('missing factor:', impact(data,'creatine','mood',0));
