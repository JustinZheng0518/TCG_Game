const test=require('node:test'),assert=require('node:assert/strict');
const Shop=require('../web/shop-core.js'),C=require('../web/collectibles-core.js'),B=require('../web/basketball-core.js'),Game=require('../web/game-core.js');
const P=require('../data/pokemon/zh-CN/sets/CS1aC/cards.json')[0];
const catalog=require('../data/basketball/products.json').products;
const product=catalog.BB400618;
const basketball=require('../data/basketball/sets/BB400618/cards.json');
const card=basketball.find(c=>c.basketball_kind==='base');
const first=()=>{const s=Shop.validate({version:1,counts:{[P.id]:3,[card.id]:3}});s.shop.cash=1000000;return s;};
const pool=[P,card,...basketball.filter(c=>c.basketball_kind!=='base').slice(0,14)];
function nextDay(s){return Shop.endDay(s,catalog,null).save;}
test('old saves migrate without losing collection, cash or pending sales; extras roundtrip',()=>{
 const s=first();delete s.shop.collectibles;const clean=Shop.validate(s);assert.equal(clean.counts[P.id],3);assert.equal(clean.shop.cash,1000000);assert.deepEqual(clean.shop.collectibles.jobs,[]);assert.deepEqual(Shop.validate(JSON.parse(JSON.stringify(clean))),clean);
});
test('basketball packs have their own slots and preserve exact real card identities, never RR collation',()=>{
 const original=first(),bought=Shop.buyStock(original,product,2,null);const opened=Shop.openStock(bought,product,basketball,2,()=>.5);
 assert.equal(opened.drawn.length,10);assert.ok(opened.drawn.every(c=>c.sport==='basketball'));assert.equal(opened.save.shop.stock[product.id],undefined);assert.equal(opened.save.shop.cash,bought.shop.cash);assert.equal(Game.stats(opened.save).total,16);
 const onlyHits=basketball.filter(c=>c.basketball_kind==='auto');assert.ok(B.draw(onlyHits,1,()=>.5).every(c=>c.basketball_kind==='auto'));
 assert.throws(()=>B.draw(basketball,1,()=>NaN));assert.throws(()=>B.draw([P],1));assert.equal(original.shop.cash,1000000);
});
test('both sports can be submitted; fees and the raw card move together; result is fixed through reload',()=>{
 for(const target of [P,card])for(const agency of ['PSA','BGS','CGC','SGC']){
  const s=first(),before=JSON.stringify(s),quote=C.gradeQuote(s,target,agency,'express');
  const sent=C.submit(s,target,agency,'express',null,()=>.9);assert.equal(sent.counts[target.id],s.counts[target.id]-1);assert.equal(sent.shop.cash,s.shop.cash-quote.fee);assert.equal(sent.shop.collectibles.jobs.length,1);assert.equal(C.allCounts(sent)[target.id],s.counts[target.id]);
  assert.throws(()=>C.collect(sent),/还没有/);assert.equal(JSON.stringify(s),before);
  const reloaded=Shop.validate(JSON.parse(JSON.stringify(sent))),arrived=C.collect(nextDay(reloaded));assert.equal(arrived.shop.collectibles.jobs.length,0);assert.equal(arrived.shop.collectibles.slabs[0].uid,'G1');assert.equal(arrived.shop.collectibles.slabs[0].grade,sent.shop.collectibles.jobs[0].grade);assert.match(arrived.shop.collectibles.slabs[0].certificate,/^GAME-/);assert.throws(()=>C.collect(arrived));assert.deepEqual(Shop.validate(JSON.parse(JSON.stringify(arrived))),arrived);
 }
});
test('failed grading, missing ownership, invalid agency and RNG never mutate funds or inventory',()=>{
 const s=first(),before=JSON.stringify(s);assert.throws(()=>C.submit(s,P,'PSA','standard',null,()=>1));assert.throws(()=>C.submit(s,P,'constructor','standard'));assert.throws(()=>C.submit(s,P,'PSA','prototype'));const poor=first();poor.shop.cash=0;assert.throws(()=>C.submit(poor,P,'PSA','standard'),/现金不足/);delete poor.counts[P.id];assert.throws(()=>C.submit(poor,P,'PSA','standard'));assert.equal(JSON.stringify(s),before);
});
test('graded cards are individual items; selling once cannot pay twice or return a raw copy',()=>{
 let s=C.submit(first(),P,'BGS','express',null,()=>.999);s=C.collect(nextDay(s));const slab=s.shop.collectibles.slabs[0];assert.equal(slab.label,'Black Label');const cash=s.shop.cash,raw=s.counts[P.id],quoted=C.slabValue(s,slab);const sold=C.sellSlab(s,slab.uid);assert.equal(sold.shop.cash,cash+Math.floor(quoted*.7));assert.equal(sold.counts[P.id],raw);assert.equal(sold.shop.collectibles.slabs.length,0);assert.throws(()=>C.sellSlab(sold,slab.uid));assert.equal(s.shop.collectibles.slabs.length,1);
});
test('show inventory is stable by day and one-time across buy and swap; raw + graded offers work',()=>{
 let s=first();assert.throws(()=>C.deal(s,pool,'1-0-0','buy'),/入场/);s=C.attend(s);const fee=s.shop.cash;assert.throws(()=>C.attend(s));const offers=C.offers(s,pool);assert.deepEqual(C.offers(s,pool),offers);assert.equal(offers.length,12);
 let offer=offers.find(o=>!o.grade),next=C.deal(s,pool,offer.key,'buy');assert.equal(next.shop.cash,fee-offer.ask);assert.equal(next.counts[offer.card.id],(s.counts[offer.card.id]||0)+1);assert.throws(()=>C.deal(next,pool,offer.key,'buy'));assert.throws(()=>C.deal(next,pool,offer.key,'swap',{type:'raw',card:P}));
 offer=C.offers(next,pool).find(o=>o.available&&o.grade);const slabbed=C.deal(next,pool,offer.key,'buy');assert.equal(slabbed.shop.collectibles.slabs.length,1);assert.equal(slabbed.shop.collectibles.slabs[0].grade,offer.grade);
 assert.ok(C.offers(nextDay(slabbed),pool).every(o=>o.available));assert.throws(()=>C.deal(nextDay(slabbed),pool,offer.key,'buy'),/入场/);
});
test('show swaps conserve both sides and exact cash difference; insufficient funds and stale offers are atomic',()=>{
 let s=C.attend(first());const offer=C.offers(s,pool).find(o=>!o.grade&&o.card.id!==P.id),ref={type:'raw',card:P},bid=C.showBid(s,ref,offer.booth),before=JSON.stringify(s);
 const swapped=C.deal(s,pool,offer.key,'swap',ref);assert.equal(swapped.counts[P.id],s.counts[P.id]-1);assert.equal(swapped.counts[offer.card.id],(s.counts[offer.card.id]||0)+1);assert.equal(swapped.shop.cash,s.shop.cash+bid-offer.ask);assert.equal(JSON.stringify(s),before);
 const poor=first();poor.shop.collectibles.show={day:1,entered:true,used:[],sold:0};poor.shop.cash=0;const expensive=C.offers(poor,pool).find(o=>o.ask>0);const original=JSON.stringify(poor);assert.throws(()=>C.deal(poor,pool,expensive.key,'buy'),/现金不足/);assert.equal(JSON.stringify(poor),original);assert.throws(()=>C.deal(swapped,pool,'0-0-0','swap',ref));
});
test('show can sell raw or graded copies with a daily quota, keeping untraded copies and jobs untouched',()=>{
 let s=C.submit(first(),card,'PSA','express',null,()=>.9);s=C.collect(nextDay(s));s=C.attend(s);const ref={type:'slab',uid:s.shop.collectibles.slabs[0].uid},bid=C.showBid(s,ref,2),cash=s.shop.cash;
 let sold=C.deal(s,pool,'2','sell',ref);assert.equal(sold.shop.cash,cash+bid);assert.equal(sold.shop.collectibles.slabs.length,0);assert.throws(()=>C.deal(sold,pool,'2','sell',ref));const raw=sold.counts[P.id];sold=C.deal(sold,pool,'0','sell',{type:'raw',card:P});assert.equal(sold.counts[P.id],raw-1);sold.shop.collectibles.show.sold=12;assert.throws(()=>C.deal(sold,pool,'0','sell',{type:'raw',card:P}),/额度/);
});
test('malformed, duplicate grading IDs and fake grades are rejected without breaking valid old saves',()=>{
 let s=C.submit(first(),P,'PSA','express',null,()=>.9);let bad=structuredClone(s);bad.shop.collectibles.jobs.push({...bad.shop.collectibles.jobs[0]});assert.throws(()=>Shop.validate(bad));bad=structuredClone(s);bad.shop.collectibles.jobs[0].grade=9.5;assert.throws(()=>Shop.validate(bad));bad=structuredClone(s);bad.shop.collectibles.jobs[0].card.source_url='javascript:alert(1)';assert.throws(()=>Shop.validate(bad));
});
