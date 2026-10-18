(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TCGCollectiblesState=api;})(globalThis,function(){
 'use strict';
 const AGENCIES={PSA:{name:'PSA',factor:1},BGS:{name:'BGS',factor:1.1},CGC:{name:'CGC',factor:.85},SGC:{name:'SGC',factor:.9}};
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
  c.is_rookie=!!value.is_rookie;if(value.is_chase)c.is_chase=true;return c;
 }
 const empty=()=>({version:1,nextId:0,jobs:[],slabs:[],show:{day:1,entered:false,used:[],sold:0}});
 function validate(value){
  if(value===undefined)return empty();
  if(!value||value.version!==1||!Array.isArray(value.jobs)||!Array.isArray(value.slabs)||value.jobs.length>500||value.slabs.length>5000)throw Error('评级存档无效。');
  const next={version:1,nextId:integer(value.nextId),jobs:[],slabs:[],show:{}};const seen=new Set();
  function record(r){
   if(!r||!/^G[1-9]\d*$/.test(r.uid)||Number(r.uid.slice(1))>next.nextId||seen.has(r.uid)||!Object.hasOwn(AGENCIES,r.agency)||!Object.hasOwn(SERVICES,r.service))throw Error('评级记录重复或无效。');seen.add(r.uid);
   const condition={};for(const key of ['centering','corners','edges','surface']){const n=r.condition?.[key];if(typeof n!=='number'||n<1||n>10||!Number.isInteger(n*2))throw Error('品相资料无效。');condition[key]=n;}
   if(typeof r.grade!=='number'||r.grade<1||r.grade>10||!Number.isInteger(r.grade*2)||(r.agency==='PSA'&&!Number.isInteger(r.grade)))throw Error('评级分数无效。');
   const submitted=integer(r.submitted,1,1000010),ready=integer(r.ready,submitted,1000010);
   return {uid:r.uid,card:card(r.card),agency:r.agency,service:r.service,submitted,ready,fee:integer(r.fee),grade:r.grade,label:str(r.label,60),condition,certificate:`GAME-${r.agency}-${r.uid}`};
  }
  next.jobs=value.jobs.map(record);next.slabs=value.slabs.map(record);
  const show=value.show;if(!show||typeof show.entered!=='boolean'||!Array.isArray(show.used)||show.used.length>100||show.used.some(id=>!/^\d+-[0-2]-[0-3]$/.test(id)))throw Error('卡展交易记录无效。');
  next.show={day:integer(show.day,1,1000000),entered:show.entered,used:[...new Set(show.used)],sold:integer(show.sold,0,12)};
  return next;
 }
 return {AGENCIES,SERVICES,empty,validate,card};
});
