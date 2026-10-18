(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TCGBasketball=api;})(globalThis,function(){
 'use strict';
 const ODDS=[{kind:'numbered_low',chance:.001,label:'低编收藏位'},{kind:'case_hit',chance:.001,label:'追逐特卡位'},{kind:'auto',chance:.019,label:'签字位'},{kind:'memorabilia',chance:.03,label:'球衣位'},{kind:'numbered',chance:.05,label:'限编位'},{kind:'parallel',chance:.15,label:'平行位'},{kind:'insert',chance:.15,label:'特卡位'},{kind:'rookie',chance:.2,label:'新秀位'}];
 // A /10-or-lower autograph is a low-numbered chase, not an ordinary autograph hit.
 const group=c=>c.serial_max>0&&c.serial_max<=10?'numbered_low':c.is_chase?'case_hit':c.basketball_kind==='auto_patch'?'auto':c.basketball_kind||'base';
 function packModel(cards){
  const available=cards.filter(c=>c.draw_available!==false);
  if(!available.length)throw Error('本系列的卡面尚未就绪，暂不能开包。');
  const base=available.filter(c=>['base','rookie'].includes(group(c)));
  return {cards:available,base:base.length?base:available,fixed:!base.length,groups:ODDS.map(o=>({...o,cards:available.filter(c=>group(c)===o.kind)})),baseProbability:1-ODDS.reduce((sum,o)=>sum+o.chance,0)};
 }
 function draw(cards,count,random=Math.random){
  if(!Array.isArray(cards)||!cards.length||cards.some(c=>c.sport!=='basketball')||!Number.isInteger(count)||count<1||count>10)throw Error('篮球卡包资料无效。');
  const unit=()=>{const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw Error('随机数无效。');return r;};
  const pick=pool=>pool[Math.floor(unit()*pool.length)];
  const {base,groups,fixed,cards:available}=packModel(cards);
  if(fixed){const result=[];for(let i=0;i<count*5;i++)result.push(pick(available));return result;}
  const result=[];
  for(let n=0;n<count;n++){for(let i=0;i<4;i++)result.push(pick(base));let r=unit(),ceiling=0,pool=base;for(const g of groups){ceiling+=g.chance;if(r<ceiling){pool=g.cards.length?g.cards:base;break;}}result.push(pick(pool));}
  return result;
 }
 function baseValue(card){
  const values={base:250,rookie:800,insert:1000,parallel:1800,numbered:5000,memorabilia:4500,auto:12000,auto_patch:30000};
  let value=card.is_chase?100000:values[card.basketball_kind]||250;
  const name=card.original_name||card.name;
  if(/Michael Jordan|Kobe Bryant|LeBron James|迈克尔·乔丹|科比·|勒布朗·/.test(name))value*=14;
  else if(/Stephen Curry|Victor Wembanyama|Luka Doncic|Giannis Antetokounmpo|Nikola Jokic|库里|文班亚马/.test(name))value*=7;
  else if(/Shaquille|Kevin Durant|Tim Duncan|Magic Johnson|Larry Bird|Yao Ming|Allen Iverson/.test(name))value*=4;
  if(card.is_rookie&&card.basketball_kind!=='rookie')value*=1.7;
  if(card.serial_max)value*=card.serial_max<=1?12:card.serial_max<=10?5:card.serial_max<=25?2:1;
  return Math.min(100000000,Math.round(value));
 }
 return {ODDS,group,packModel,draw,baseValue};
});
