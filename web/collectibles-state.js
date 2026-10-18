(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TCGCollectiblesState=api;})(globalThis,function(){
 'use strict';
 const AGENCIES={PSA:{name:'PSA',factor:1},BGS:{name:'BGS',factor:1.1},CGC:{name:'CGC',factor:.85},SGC:{name:'SGC',factor:.9}};
 const CONDITION_KEYS=['centering','corners','edges','surface'];
 const CONDITION_OUTCOMES=[{value:7,chance:.02,ceiling:.02},{value:8,chance:.04,ceiling:.06},{value:8.5,chance:.10,ceiling:.16},{value:9,chance:.24,ceiling:.4},{value:9.5,chance:.38,ceiling:.78},{value:10,chance:.22,ceiling:1}];
 const SERVICES={standard:{name:'标准',days:3,fee:15000},express:{name:'加急',days:1,fee:30000}};
 const integer=(n,min=0,max=1000000000)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('评级或卡展存档数值无效。');return n;};
 const str=(value,max=200)=>{if(typeof value!=='string'||value.length>max)throw Error('卡牌资料无效。');return value;};
 function card(value){
  if(!value||!/^[-A-Za-z0-9_.]+:\d+$/.test(value.id)||value.set_id!==value.id.split(':')[0])throw Error('卡牌编号无效。');
  const c={id:value.id,set_id:value.set_id,name:str(value.name),rarity:str(value.rarity,30),sport:value.sport==='basketball'?'basketball':'pokemon',variant_code:integer(value.variant_code||0,0,100)};
  for(const key of ['number','original_name','team','basketball_kind','source_set_name'])if(value[key]!==undefined)c[key]=str(value[key],250);
  for(const key of ['source_url','source_page','thumbnail','image','local_preview'])if(value[key]){const u=str(value[key],1600);if(!/^https:\/\//.test(u)&&!/^data\/(pokemon|basketball|images)\/[A-Za-z0-9_./%-]+$/.test(u))throw Error('卡面地址无效。');c[key]=u;}
  if(value.year!==undefined)c.year=integer(value.year,1800,2100);
  if(value.serial_max!=null)c.serial_max=integer(value.serial_max,1,10000000);
  if(value.instance_id!==undefined){if(!/^R[1-9]\d*$/.test(value.instance_id))throw Error('副本编号无效。');c.instance_id=value.instance_id;}
  if(value.serial_number!==undefined){if(c.sport!=='basketball'||!c.serial_max)throw Error('限编无效。');c.serial_number=integer(value.serial_number,1,c.serial_max);}
  if(value.condition)c.condition=condition(value.condition);
  c.is_rookie=!!value.is_rookie;if(value.is_chase)c.is_chase=true;return c;
 }
 const empty=()=>({version:1,nextId:0,nextRawId:0,rawCopies:[],jobs:[],slabs:[],show:{day:1,entered:false,used:[],sold:0}});
 function validate(value){
  if(value===undefined)return empty();
  if(!value||value.version!==1||!Array.isArray(value.jobs)||!Array.isArray(value.slabs)||value.jobs.length>500||value.slabs.length>5000)throw Error('评级存档无效。');
  const next={version:1,nextId:integer(value.nextId),nextRawId:integer(value.nextRawId||0),rawCopies:[],jobs:[],slabs:[],show:{}};const seen=new Set();
  function record(r){
   if(!r||!/^G[1-9]\d*$/.test(r.uid)||Number(r.uid.slice(1))>next.nextId||seen.has(r.uid)||!Object.hasOwn(AGENCIES,r.agency)||!Object.hasOwn(SERVICES,r.service))throw Error('评级记录重复或无效。');seen.add(r.uid);
   const condition={};for(const key of ['centering','corners','edges','surface']){const n=r.condition?.[key];if(typeof n!=='number'||n<1||n>10||!Number.isInteger(n*2))throw Error('品相资料无效。');condition[key]=n;}
   if(typeof r.grade!=='number'||r.grade<1||r.grade>10||!Number.isInteger(r.grade*2)||(r.agency==='PSA'&&!Number.isInteger(r.grade)))throw Error('评级分数无效。');
   const submitted=integer(r.submitted,1,1000010),ready=integer(r.ready,submitted,1000010);
   return {uid:r.uid,card:card(r.card),agency:r.agency,service:r.service,submitted,ready,fee:integer(r.fee),grade:r.grade,label:str(r.label,60),condition,certificate:`GAME-${r.agency}-${r.uid}`};
  }
  const copies=value.rawCopies||[];if(!Array.isArray(copies)||copies.length>50000)throw Error('副本仓位无效。');
  const rawSeen=new Set();
  function checkCopy(c){if(!/^R[1-9]\d*$/.test(c.instance_id)||Number(c.instance_id.slice(1))>next.nextRawId||rawSeen.has(c.instance_id))throw Error('副本重复或无效。');rawSeen.add(c.instance_id);}
  next.rawCopies=copies.map(r=>{const c=card(r);if(!c.instance_id)throw Error('副本无效。');if(numbered(c)&&!c.serial_number)throw Error('限编副本无效。');c.condition=c.condition||legacyCondition(c);checkCopy(c);return rawCard(c);});
  next.jobs=value.jobs.map(record);next.slabs=value.slabs.map(record);for(const r of [...next.jobs,...next.slabs]){r.card.condition=r.card.condition||{...r.condition};if(!r.card.instance_id)r.card=mint(next,r.card);if(CONDITION_KEYS.some(k=>r.condition[k]!==r.card.condition[k]))throw Error('评级与卡牌品相不一致。');if(r.card.instance_id)checkCopy(r.card);}
  const show=value.show;if(!show||typeof show.entered!=='boolean'||!Array.isArray(show.used)||show.used.length>100||show.used.some(id=>!/^\d+-[0-2]-[0-3]$/.test(id)))throw Error('卡展交易记录无效。');
  next.show={day:integer(show.day,1,1000000),entered:show.entered,used:[...new Set(show.used)],sold:integer(show.sold,0,12)};
  return next;
 }
 const numbered=c=>c.sport==='basketball'&&Number.isInteger(c.serial_max)&&c.serial_max>0;
 function rawCard(value){const c=card(value);for(const key of ['source_url','source_page','thumbnail','image','local_preview'])delete c[key];return c;}
 function condition(value){const result={};for(const key of CONDITION_KEYS){const n=value?.[key];if(typeof n!=='number'||n<1||n>10||!Number.isInteger(n*2))throw Error('品相资料无效。');result[key]=n;}return result;}
 function rollCondition(c,random=Math.random){const age=c.year<1980?1:c.year<2000?.5:0,result={};for(const key of CONDITION_KEYS){const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw Error('随机数无效。');result[key]=Math.max(1,CONDITION_OUTCOMES.find(o=>n<o.ceiling).value-age);}return result;}
 function hash(value){let n=2166136261;for(const ch of value)n=Math.imul(n^ch.charCodeAt(0),16777619)>>>0;n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;n=Math.imul(n,0x846ca68b);return (n^(n>>>16))>>>0;}
 function seededCondition(c,seed){let index=0;return rollCondition(c,()=>hash(`${seed}:condition:${index++}`)/4294967296);}
 function legacyCondition(c){return seededCondition(c,c.instance_id||c.id);}
 function mint(extra,value,random=Math.random){const c=card(value);delete c.instance_id;c.instance_id=`R${++extra.nextRawId}`;if(numbered(c))c.serial_number=c.serial_number||hash(c.id+c.instance_id)%c.serial_max+1;c.condition=c.condition||rollCondition(c,random);return c;}
 function addRaw(save,cards,random=Math.random,restore=false){return cards.map(value=>{const extra=save.shop.collectibles;if(extra.rawCopies.length>=50000)throw Error('卡册已满，请先整理收藏。');const c=restore&&value.instance_id?card(value):mint(extra,value,random);c.condition=c.condition||legacyCondition(c);extra.rawCopies.push(rawCard(c));save.counts[c.id]=(save.counts[c.id]||0)+1;return c;});}
 function resolveRaw(save,value){if(!(save.counts[value.id]>0))throw Error('没有可用的这张散卡。');const rows=save.shop.collectibles.rawCopies;if(value.instance_id){const c=rows.find(c=>c.instance_id===value.instance_id&&c.id===value.id);if(!c)throw Error('这张副本已离开收藏。');return {...value,...c};}const found=rows.find(c=>c.id===value.id);return found?{...value,...found}:value;}
 function takeRaw(save,value,random=Math.random){let c=resolveRaw(save,value);const extra=save.shop.collectibles;if(!c.instance_id)c=mint(extra,c,random);extra.rawCopies=extra.rawCopies.filter(r=>r.instance_id!==c.instance_id);if(--save.counts[c.id]===0)delete save.counts[c.id];return c;}
 function hydrate(save,cards){let changed=false;const extra=save.shop.collectibles,tracked=new Map();for(const c of extra.rawCopies)tracked.set(c.id,(tracked.get(c.id)||0)+1);for(const c of cards){let missing=(save.counts[c.id]||0)-(tracked.get(c.id)||0);while(missing-->0&&extra.rawCopies.length<50000){extra.rawCopies.push(rawCard(mint(extra,c,()=>.5)));const last=extra.rawCopies.at(-1);last.condition=legacyCondition(last);changed=true;}}return changed;}
 return {AGENCIES,SERVICES,empty,validate,card,numbered,mint,addRaw,takeRaw,resolveRaw,hydrate,condition,rollCondition,seededCondition,CONDITION_KEYS,CONDITION_OUTCOMES};
});
