const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const index=read('data/basketball/index.json'),all=new Map();
test('basketball catalog has unique real IDs, valid sources and consistent coverage',()=>{
 let previews=new Set();assert.equal(index.sets.length,index.set_count);
 for(const set of index.sets){const cards=read(set.cards_path);assert.equal(cards.length,set.card_faces);for(const card of cards){assert.equal(card.sport,'basketball');assert.equal(card.set_id,set.id);assert.ok(!all.has(card.id),card.id);assert.match(card.source_url,/^https:\/\/www\.tcdb\.com\/Images\/Cards\/Basketball\//);all.set(card.id,card);if(card.local_preview){assert.ok(fs.existsSync(path.join(root,card.local_preview)));previews.add(card.local_preview);}}}
 assert.equal(all.size,index.card_faces);const coverage=read('data/basketball/coverage.json');assert.equal(coverage.card_faces_with_front_reference,all.size);assert.equal(coverage.local_preview_count,previews.size);
});
test('every basketball product and locally illustrated exhibition card belongs to the catalog',()=>{
 const products=read('data/basketball/products.json').products;assert.equal(Object.keys(products).length,index.set_count);
 for(const set of index.sets){assert.equal(products[set.id].sport,'basketball');assert.equal(products[set.id].price_kind,'simulation');}
 for(const card of read('data/shop/show-pool.json').filter(c=>c.sport==='basketball')){assert.ok(all.has(card.id),card.id);assert.ok(card.local_preview);assert.ok(fs.existsSync(path.join(root,card.local_preview)));assert.equal(card.basketball_kind,all.get(card.id).basketball_kind);}
});
