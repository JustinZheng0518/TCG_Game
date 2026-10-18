(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./shop-core.js'):root.TCGShop,node?require('./collectibles-state.js'):root.TCGCollectiblesState);if(node)module.exports=api;else root.TCGCollectibles=api;})(globalThis,function(Shop,State){
 'use strict';
 const {AGENCIES,SERVICES}=State;
 const CONDITION_OUTCOMES=State.CONDITION_OUTCOMES;
 const conditionAge=card=>card.year<1980?1:card.year<2000?.5:0;
 function record(save,amount,note){const n=save.shop.cash+amount;if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw Error(n<0?'现金不足。':'交易金额超出范围。');save.shop.cash=n;save.shop.ledger.unshift({day:save.shop.day,amount,note});save.shop.ledger.length=Math.min(50,save.shop.ledger.length);}
 const takeRaw=State.takeRaw;
 function addRaw(save,card){return State.addRaw(save,[card])[0];}
 const done=save=>Shop.validate(save);
 function gradeQuote(value,card,agency='PSA',service='standard',feed){if(!Object.hasOwn(AGENCIES,agency)||!Object.hasOwn(SERVICES,service))throw Error('请选择评级机构和服务。');const base=Shop.cardQuote(value,card,feed).market;return {fee:Math.ceil(SERVICES[service].fee*AGENCIES[agency].factor+base*(service==='express'?.02:.01)),ready:value.shop.day+SERVICES[service].days,days:SERVICES[service].days};}
 function gradeCondition(agency,condition){
  const scores=Object.values(condition),min=Math.min(...scores),average=scores.reduce((a,b)=>a+b,0)/4;
  let grade,label;
  if(agency==='BGS'){
   grade=Math.max(1,Math.min(Math.floor(average*2)/2,min+.5));
   if(min>=9.5&&average>=9.875)grade=10;
   label=grade===10?(min===10?'Black Label':'PRISTINE'):grade===9.5?'GEM MINT':grade>=9?'MINT':'NM-MT';
  }else{
   grade=min>=9&&average>=9.45?10:average>=8.8&&min>=8?9:Math.max(1,Math.min(Math.floor(average),Math.floor(min+1)));
   label=grade===10?(agency==='CGC'&&min>=9.5&&average>=9.875?'PRISTINE':'GEM MINT'):grade===9?'MINT':grade===8?'NM-MT':'VINTAGE / PLAYED';
  }
  return {grade,label,condition};
 }
 function gradeDistribution(card,agency){
  if(!Object.hasOwn(AGENCIES,agency))throw Error('请选择评级机构。');
  if(card.condition){const result=gradeCondition(agency,State.condition(card.condition));return {fixed:true,age:0,conditions:[],rows:[{grade:result.grade,label:result.label,chance:1}]};}
  const keys=['centering','corners','edges','surface'],rows=new Map(),age=conditionAge(card);
  function visit(depth,condition,chance){
   if(depth===4){const result=gradeCondition(agency,condition),key=`${result.grade}:${result.label}`,row=rows.get(key)||{grade:result.grade,label:result.label,chance:0};row.chance+=chance;rows.set(key,row);return;}
   for(const o of CONDITION_OUTCOMES)visit(depth+1,{...condition,[keys[depth]]:Math.max(1,o.value-age)},chance*o.chance);
  }
  visit(0,{},1);return {age,conditions:CONDITION_OUTCOMES.map(o=>({value:Math.max(1,o.value-age),chance:o.chance})),rows:[...rows.values()].sort((a,b)=>b.grade-a.grade||b.label.localeCompare(a.label))};
 }
 function submit(value,card,agency,service,feed,random=Math.random){
  const next=Shop.validate(value),extra=next.shop.collectibles;
  if(extra.jobs.length>=500)throw Error('待评队列已满，请先取回评级卡。');
  const clean=State.card(takeRaw(next,card,random)),quote=gradeQuote(next,clean,agency,service,feed);
  record(next,-quote.fee,`送评 ${clean.name} · ${agency} ${SERVICES[service].name}`);
  const uid=`G${++extra.nextId}`;
  extra.jobs.push({uid,card:clean,agency,service,submitted:next.shop.day,ready:quote.ready,fee:quote.fee,...gradeCondition(agency,clean.condition),certificate:`GAME-${agency}-${uid}`});
  return done(next);
 }
 function collect(value){
  const next=Shop.validate(value),extra=next.shop.collectibles,ready=extra.jobs.filter(job=>job.ready<=next.shop.day);
  if(!ready.length)throw Error('还没有可取回的评级卡，营业日推进后再来看看。');
  if(extra.slabs.length+ready.length>5000)throw Error('评级卡仓位已满，请先出售部分卡牌。');
  extra.slabs.push(...ready);extra.jobs=extra.jobs.filter(job=>job.ready>next.shop.day);record(next,0,`取回评级卡 ${ready.length} 张`);return done(next);
 }
 function slabValue(save,slab,feed){
  const base=Shop.cardQuote(save,slab.card,feed).market,grade=slab.grade;
  const factor=slab.label==='Black Label'?6.5:grade===10?(slab.label==='PRISTINE'?4.5:slab.agency==='PSA'?3.2:2.8):grade===9.5?2:grade===9?1.45:grade===8?1:grade>=7?.7:.45;
  return Math.max(1,Math.round(base*factor));
 }
 function sellSlab(value,uid,feed){const next=Shop.validate(value),extra=next.shop.collectibles,slab=extra.slabs.find(s=>s.uid===uid);if(!slab)throw Error('这张评级卡已不在卡柜。');const price=Math.max(1,Math.floor(slabValue(next,slab,feed)*.7));extra.slabs=extra.slabs.filter(s=>s.uid!==uid);record(next,price,`出售 ${slab.agency} ${slab.grade} ${slab.card.name}`);next.shop.progress.soldCards++;return done(next);}
 function showState(save){const extra=save.shop.collectibles;if(extra.show.day!==save.shop.day)extra.show={day:save.shop.day,entered:false,used:[],sold:0};return extra.show;}
 function attend(value){const next=Shop.validate(value),s=showState(next);if(s.entered)throw Error('今天已经入场。');record(next,-2000,'卡展入场券');s.entered=true;return done(next);}
 function offers(value,pool,sport='all'){
  const save=Shop.validate(value),show=showState(save),cards=pool.filter(c=>sport==='all'||(c.sport||'pokemon')===sport);
  if(!cards.length)return [];
  const result=[];const usedCards=new Set();
  for(let booth=0;booth<3;booth++)for(let slot=0;slot<4;slot++){
   let index=Shop.hash(`${save.shop.day}:${booth}:${slot}:${sport}`)%cards.length;
   for(let n=0;usedCards.has(cards[index].id)&&n<cards.length;n++)index=(index+1)%cards.length;
   const card=State.card(cards[index]);card.condition=State.seededCondition(card,`${save.shop.day}:${booth}:${slot}:${card.id}`);if(State.numbered(card))card.serial_number=Shop.hash(`${save.shop.day}:${booth}:${slot}:${card.id}`)%card.serial_max+1;usedCards.add(card.id);
   const graded=gradeCondition('PSA',card.condition),grade=slot===3?graded.grade:null;
   const fake=grade?{card,agency:'PSA',grade,label:graded.label}:null;
   const market=grade?slabValue(save,fake,null):Shop.cardQuote(save,card,null).market;
   const key=`${save.shop.day}-${booth}-${slot}`;
   result.push({key,booth,card,grade,agency:grade?'PSA':null,ask:Math.max(1,Math.round(market*1.08)),available:!show.used.includes(key)});
  }
  return result;
 }
 function refCard(save,ref){
  if(ref?.type==='slab'){const slab=save.shop.collectibles.slabs.find(s=>s.uid===ref.uid);if(!slab)throw Error('评级卡已经离开卡柜。');return {card:slab.card,slab};}
  if(ref?.type!=='raw')throw Error('请选择自己的散卡或评级卡。');const card=State.card(State.resolveRaw(save,ref.card));return {card,slab:null};
 }
 function showBid(value,ref,booth=0,feed){
  if(!Number.isInteger(booth)||booth<0||booth>2)throw Error('展位无效。');
  const save=Shop.validate(value),{card,slab}=refCard(save,ref),base=slab?slabValue(save,slab,feed):Shop.cardQuote(save,card,feed).market;
  const premium=booth===0&&card.is_rookie||booth===1&&(card.year<2000||card.rarity==='SAR')||booth===2&&slab;
  return Math.max(1,Math.floor(base*(premium?.89:.82)));
 }
 function takeRef(save,ref){const r=refCard(save,ref);if(r.slab)save.shop.collectibles.slabs=save.shop.collectibles.slabs.filter(s=>s.uid!==r.slab.uid);else r.card=takeRaw(save,r.card);return r;}
 function receiveOffer(save,offer){
  if(!offer.grade){addRaw(save,offer.card);return;}
  const extra=save.shop.collectibles;if(extra.slabs.length>=5000)throw Error('评级卡仓位已满。');
  const uid=`G${++extra.nextId}`,grade=offer.grade;
  extra.slabs.push({uid,card:State.mint(extra,offer.card),agency:'PSA',service:'standard',submitted:save.shop.day,ready:save.shop.day,fee:0,...gradeCondition('PSA',offer.card.condition),certificate:`GAME-PSA-${uid}`});
 }
 function deal(value,pool,key,action,ref,feed,sport='all'){
  const next=Shop.validate(value),show=showState(next);
  if(!show.entered)throw Error('请先购买今天的入场券。');
  if(action==='sell'){
   if(show.sold>=12)throw Error('今天的卡展收购额度已满。');
   const price=showBid(next,ref,Number(key),feed),r=takeRef(next,ref);record(next,price,`卡展售出 ${r.card.name}`);show.sold++;next.shop.progress.soldCards++;return done(next);
  }
  const offer=offers(next,pool,sport).find(o=>o.key===key);
  if(!offer||!offer.available)throw Error('这张展品已成交，或卡展已换日。');
  if(action==='buy'){record(next,-offer.ask,`卡展购入 ${offer.card.name}`);receiveOffer(next,offer);}
  else if(action==='swap'){
   const price=showBid(next,ref,offer.booth,feed),r=takeRef(next,ref);record(next,price-offer.ask,`卡展交换 ${r.card.name} → ${offer.card.name}（含差价）`);receiveOffer(next,offer);
  }else throw Error('未知卡展交易。');
  show.used.push(key);return done(next);
 }
 function allCounts(value){const counts={...value.counts};for(const item of [...value.shop.collectibles.jobs,...value.shop.collectibles.slabs])counts[item.card.id]=(counts[item.card.id]||0)+1;return counts;}
 return {AGENCIES,SERVICES,CONDITION_OUTCOMES,gradeCondition,gradeDistribution,gradeQuote,submit,collect,slabValue,sellSlab,attend,offers,showBid,deal,allCounts};
});
