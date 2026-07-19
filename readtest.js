// 14-day dataset, magnesium boosts, short sleep hurts
const data=[];
for(let i=0;i<14;i++){const day='2026-07-'+String(i+1).padStart(2,'0');const mag=i%2===0;const sleep=(i%4===0)?5:7.5;const mood=(mag?7:4);const eng=mag?6:4;data.push({date:day,physical:{energy:6,comfort:7,sleep_quality:mag?7:5,sleep_hours:sleep},mental:{mood,calm:6,focus:6,engagement:eng},interventions:mag?['magnesium']:[],note:''});}
console.log('--- with 14 days ---');
console.log(nonaRead(data).replace(/<[^>]+>/g,''));
console.log('--- with 1 day ---');
console.log(nonaRead([data[0]]).replace(/<[^>]+>/g,''));
console.log('--- with 3 days ---');
console.log(nonaRead(data.slice(0,3)).replace(/<[^>]+>/g,''));
