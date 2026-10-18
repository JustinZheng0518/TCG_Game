const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Odds=require('../web/draw-odds.js'),Game=require('../web/game-core.js'),Shop=require('../web/shop-core.js'),Basketball=require('../web/basketball-core.js'),C=require('../web/collectibles-core.js');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-11,`${a} != ${b}`);
const poke=(n,rarity)=>({id:`TEST:${n}`,set_id:'TEST',name:rarity,rarity,variant_code:0});
const nba=(n,kind,extra={})=>({...poke(n,kind),sport:'basketball',basketball_kind:kind,...extra});
const product=(channel,extra={})=>({id:'TEST',name:'Test',channel,cards_per_unit:5,retail_cents:4500,...extra});
const row=(m,id)=>m.cards.find(r=>r.card.id===id);
test('Pokemon exact per-card and group odds include every independent slot and highest nonempty chase',()=>{
 const cards=[poke(1,'C'),poke(2,'RR'),poke(3,'RRR'),poke(4,'AR'),poke(5,'AR'),poke(6,'SAR')],m=Odds.analyze(product('booster'),cards);
 near(row(m,'TEST:1').chance,1);near(row(m,'TEST:2').chance,1);near(row(m,'TEST:3').chance,.15);near(row(m,'TEST:4').chance,.06);near(row(m,'TEST:6').chance,.001);near(row(m,'TEST:6').ten,1-.999**10);near(m.groups.find(g=>g.label==='AR').chance,.12);near(m.cards.reduce((s,r)=>s+r.expected,0),5);
 const stream=[.1,.1,.1,.1,.9995,.1];assert.equal(Game.drawPacks(cards,1,()=>stream.shift()).at(-1).id,'TEST:1');
 const fixed=Odds.analyze(product('booster'),[poke(1,'SR'),poke(2,'SAR')]);near(row(fixed,'TEST:1').chance,1-.5**5);near(fixed.cards[0].ten,1-.5**50);
 const onlyRR=Odds.analyze(product('booster'),[poke(1,'RR')]);near(onlyRR.cards[0].chance,1);assert.ok(onlyRR.notes.some(n=>n.includes('没有千分之一')));
});
test('basketball public odds use the same pools, fallbacks and all-hit exception as the actual drawer',()=>{
 const cards=[nba(1,'base'),nba(2,'rookie'),nba(3,'numbered',{serial_max:10}),nba(4,'auto')],p=product('special',{sport:'basketball'}),m=Odds.analyze(p,cards);
 near(row(m,'TEST:3').chance,.001);near(row(m,'TEST:4').chance,.019);near(row(m,'TEST:2').chance,1-.5**4*(1-.59));near(m.cards.reduce((s,r)=>s+r.expected,0),5);
 const sequence=[0,0,0,0,0,0];assert.equal(Basketball.draw(cards,1,()=>sequence.shift()).at(-1).id,'TEST:3');
 const absent=Odds.analyze(p,cards.filter(c=>c.id!=='TEST:3'));near(row(absent,'TEST:4').chance,.019);assert.match(absent.slots[1].pools[0].note,/缺档/);
 const fixed=Odds.analyze(p,[cards[2],cards[3]]);near(fixed.cards[0].chance,1-.5**5);assert.equal(fixed.slots.length,1);
});
test('special packs, 60-card decks, weighted event variants and selected rewards disclose their real algorithms',()=>{
 const cards=[poke(1,'C'),poke(2,'RR'),poke(3,'RR')];const d=Odds.analyze(product('deck'),cards);near(row(d,'TEST:1').chance,1);near(row(d,'TEST:2').chance,.75);assert.equal(d.size,60);
 const s=Odds.analyze(product('special',{cards_per_unit:3}),cards.slice(1));near(s.cards[0].chance,.875);
 const eventCards=[0,1,2].flatMap(v=>[0,1].map(n=>({...poke(v*2+n+1,'PR'),variant_code:v}))),p=product('event',{variant_distribution:{0:.89,1:.1,2:.01}}),m=Odds.analyze(p,eventCards);
 near(m.cards[0].chance,.445);near(m.cards[2].chance,.05);near(m.cards[4].chance,.005);const seq=[.995,.5];assert.equal(Shop.acquire(Shop.validate({version:1,counts:{}}),p,eventCards,null,null,()=>seq.shift()).drawn[0].variant_code,2);
 const high=[1-Number.EPSILON/2,0];assert.equal(Shop.acquire(Shop.validate({version:1,counts:{}}),p,eventCards,null,null,()=>high.shift()).drawn[0].variant_code,2);
 for(const channel of ['gift','exchange']){const selected=Odds.analyze(product(channel),cards,'TEST:2');assert.equal(row(selected,'TEST:2').chance,1);assert.equal(row(selected,'TEST:1').chance,0);assert.equal(row(selected,'TEST:1').ten,0);}
 for(const channel of ['mission','bundle','event']){const m=Odds.analyze(product(channel),cards);near(m.cards[0].chance,1/3);assert.equal(m.size,1);}
});
test('every playable set has a complete valid probability model; expected cards and slot weights conserve totals',()=>{
 for(const [indexFile,productsFile] of [['data/pokemon/zh-CN/index.json','data/shop/products.json'],['data/basketball/index.json','data/basketball/products.json']]){
  const index=read(indexFile),products=read(productsFile).products;
  for(const set of index.sets){const cards=read(set.cards_path),model=Odds.analyze(products[set.id],cards);assert.equal(model.cards.length,cards.length);near(model.cards.reduce((s,r)=>s+r.expected,0),model.size);for(const slot of model.slots)near(slot.pools.reduce((s,p)=>s+p.chance,0),1);for(const row of [...model.cards,...model.groups])assert.ok(row.chance>=0&&row.chance<=1&&row.ten>=row.chance,`${set.id}:${row.card?.id||row.label}`);}
 }
});
test('all 386 set covers are local, decodeable WebP headers and correspond to the right source set',()=>{
 const covers=read('data/shop/set-covers.json').sets;let count=0;
 for(const file of ['data/pokemon/zh-CN/index.json','data/basketball/index.json'])for(const set of read(file).sets){const cover=covers[set.id];assert.ok(cover,set.id);assert.match(cover.image,/^data\//);const bytes=fs.readFileSync(path.join(root,cover.image));assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');if(cover.kind==='card'){const card=read(set.cards_path).find(c=>c.id===cover.card_id);assert.ok(card);assert.equal(card.source_url,cover.source_url);}else assert.match(cover.source_url,new RegExp(`/img/${set.source_collection_id}/cover.png$`));count++;}
 assert.equal(Object.keys(covers).length,count);assert.equal(count,386);
});
test('grading disclosure sums to one and matches every possible four-condition outcome through actual submission',()=>{
 const card=poke(1,'RR'),s=Shop.validate({version:1,counts:{'TEST:1':1}}),outcomes=C.CONDITION_OUTCOMES;
 for(const year of [undefined,1990,1970])for(const agency of ['PSA','BGS','CGC','SGC']){
  const c={...card,...(year?{year}:{})},distribution=C.gradeDistribution(c,agency),observed=new Map();
  for(const a of outcomes)for(const b of outcomes)for(const d of outcomes)for(const e of outcomes){const choices=[a,b,d,e],midpoints=choices.map(o=>o.ceiling-o.chance/2);let n=0;const job=C.submit(s,c,agency,'standard',null,()=>midpoints[n++]).shop.collectibles.jobs[0],key=`${job.grade}:${job.label}`;observed.set(key,(observed.get(key)||0)+choices.reduce((p,o)=>p*o.chance,1));}
  near(distribution.rows.reduce((sum,r)=>sum+r.chance,0),1);assert.equal(distribution.rows.length,observed.size);for(const r of distribution.rows)near(r.chance,observed.get(`${r.grade}:${r.label}`));
 }
 const bgs=C.gradeDistribution(card,'BGS');near(bgs.rows.find(r=>r.label==='Black Label').chance,.22**4);assert.ok(!C.gradeDistribution({...card,year:1970},'PSA').rows.some(r=>r.grade===10));
});
