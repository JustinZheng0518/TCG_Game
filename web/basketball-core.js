(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TCGBasketball=api;})(globalThis,function(){
 'use strict';
 const ODDS=[{kind:'numbered_low',chance:.001,label:'低编收藏位'},{kind:'auto',chance:.019,label:'签字位'},{kind:'memorabilia',chance:.03,label:'球衣位'},{kind:'numbered',chance:.05,label:'限编位'},{kind:'parallel',chance:.15,label:'平行位'},{kind:'insert',chance:.15,label:'特卡位'},{kind:'rookie',chance:.2,label:'新秀位'}];
 const group=c=>c.basketball_kind==='numbered'&&c.serial_max<=10?'numbered_low':c.basketball_kind==='auto_patch'?'auto':c.basketball_kind||'base';
 function draw(cards,count,random=Math.random){
  if(!Array.isArray(cards)||!cards.length||cards.some(c=>c.sport!=='basketball')||!Number.isInteger(count)||count<1||count>10)throw Error('篮球卡包资料无效。');
  const unit=()=>{const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw Error('随机数无效。');return r;};
  const pick=pool=>pool[Math.floor(unit()*pool.length)];
  const base=cards.filter(c=>['base','rookie'].includes(group(c)));
  if(!base.length){const result=[];for(let i=0;i<count*5;i++)result.push(pick(cards));return result;}
  const groups=ODDS.map(o=>({...o,cards:cards.filter(c=>group(c)===o.kind)}));const result=[];
  for(let n=0;n<count;n++){for(let i=0;i<4;i++)result.push(pick(base));let r=unit(),ceiling=0,pool=base;for(const g of groups){ceiling+=g.chance;if(r<ceiling){pool=g.cards.length?g.cards:base;break;}}result.push(pick(pool));}
  return result;
 }
 function baseValue(card){
  const values={base:250,rookie:800,insert:1000,parallel:1800,numbered:5000,memorabilia:4500,auto:12000,auto_patch:30000};
  let value=values[card.basketball_kind]||250;
  const name=card.original_name||card.name;
  if(/Michael Jordan|Kobe Bryant|LeBron James|迈克尔·乔丹|科比·|勒布朗·/.test(name))value*=14;
  else if(/Stephen Curry|Victor Wembanyama|Luka Doncic|Giannis Antetokounmpo|Nikola Jokic|库里|文班亚马/.test(name))value*=7;
  else if(/Shaquille|Kevin Durant|Tim Duncan|Magic Johnson|Larry Bird|Yao Ming|Allen Iverson/.test(name))value*=4;
  if(card.is_rookie&&card.basketball_kind!=='rookie')value*=1.7;
  if(card.serial_max)value*=card.serial_max<=1?12:card.serial_max<=10?5:card.serial_max<=25?2:1;
  return Math.min(100000000,Math.round(value));
 }
 return {ODDS,group,draw,baseValue};
});
