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
test('every nonordinary basketball card has a verified local face, independent of third-party availability',()=>{
 const manifest=read('data/basketball/local-images.json');let rare=0;
 for(const card of all.values())if(!['base','rookie'].includes(card.basketball_kind)){
  rare++;assert.ok(card.local_preview,card.id);assert.equal(card.image_status,'local_verified');assert.notEqual(card.draw_available,false);assert.equal(manifest.cards[card.id].source_url,card.source_url);assert.equal(manifest.cards[card.id].path,card.local_preview);
 }
 assert.equal(read('data/basketball/coverage.json').rare_image_pending,0);assert.ok(rare>24000);
});
test('all basketball series have audited directories and report partial coverage without claiming absent physical tiers',()=>{
 let dirs=0,imported=0;
 for(const set of index.sets){const audit=read(`data/basketball/subset-audit/${set.id}.json`);assert.equal(audit.set_id,set.id);assert.equal(audit.subsets.length,set.source_subset_count);dirs+=set.source_subset_count;imported+=set.imported_subset_count;
  for(const c of read(set.cards_path)){assert.equal(c.set_id,set.id);if(c.source_set_id!==set.source_collection_id)assert.ok(audit.subsets.some(v=>v.source_set_id===c.source_set_id),c.id);}
  assert.ok(['partial','source_checklists_read'].includes(set.coverage_status));
 }
 const coverage=read('data/basketball/coverage.json');assert.equal(dirs,coverage.source_subset_directory_count);assert.equal(imported,coverage.variant_checklists);
 for(const id of ['BB388591','BB425592','BB531852']){const rows=read(`data/basketball/sets/${id}/cards.json`);assert.ok(rows.some(c=>['memorabilia','auto_patch'].includes(c.basketball_kind)),id);assert.ok(rows.some(c=>c.basketball_kind==='auto'||c.basketball_kind==='auto_patch'),id);}
 // Trios with plain-text names and 1948 Bowman's non-player cards were previously discarded.
 assert.ok(read('data/basketball/sets/BB2015/cards.json').some(c=>c.source_set_id===8765));
 assert.equal(read('data/basketball/sets/BB2006/cards.json').length,72);
});
