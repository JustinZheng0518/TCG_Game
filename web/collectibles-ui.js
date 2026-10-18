"use strict";
const Collectibles=globalThis.TCGCollectibles;
function cardImageURL(card,full=false){
  if(card.sport==='basketball')return card.local_preview||(full?(card.image||card.source_url):(card.thumbnail||card.source_url));
  return full&&state.localOriginals?(card.image||card.source_url):state.localImages?(card.thumbnail||card.source_url):card.source_url;
}
function applyCardImage(image,card,full=false){
  image._missingLabel?.remove();image._missingLabel=null;delete image.dataset.imageMissing;
  image._artToken=null;delete image.dataset.gameArt;image.hidden=false;if(card.sport==='basketball'){TCGBasketballArt.paint(image,card);return;}image.referrerPolicy='no-referrer';image.alt=`${card.name} · ${card.sport==='basketball'?'篮球原版卡面':'简中卡面'}`;
  const urls=[cardImageURL(card,full),card.local_preview,card.source_url];
  if(card.sport==='basketball'&&card.source_url){const thumb=card.source_url.replace('/Images/Cards/','/Images/Thumbs/').replace(/\/(\d+)-([^/]+)Fr\.jpg$/,'/$1_$2Thumb.jpg');urls.push(thumb);}
  const unique=[...new Set(urls.filter(Boolean))];let index=0;
  image.onerror=()=>{if(++index<unique.length)image.src=unique[index];else{image.hidden=true;image.dataset.imageMissing='true';if(image.parentElement){image._missingLabel=text('span','卡面暂未加载，点击查看卡牌资料','card-image-missing');image.parentElement.append(image._missingLabel);}}};
  if(unique.length)image.src=unique[0];else image.hidden=true;
}
function renderUniverse(){
  document.body.dataset.universe=state.universe;
  for(const button of document.querySelectorAll('[data-universe]'))button.setAttribute('aria-pressed',String(button.dataset.universe===state.universe));
  const labels=state.universe==='basketball'?{shop:'篮球柜台',draw:'买包开包',collection:'收藏卡册',events:'评级卡展'}:{shop:'我的卡店',draw:'采购开包',collection:'收藏卡册',events:'活动广场'};
  for(const button of document.querySelectorAll('.mode-tabs [data-mode]'))button.querySelector('span').textContent=labels[button.dataset.mode];
  if(state.basketballIndex)$('basketball-coverage').textContent=`${state.basketballIndex.set_count} 个系列 · ${state.basketballIndex.card_faces.toLocaleString('zh-CN')} 条篮球卡面资料`;
}
function chooseUniverse(universe){
  if(!['pokemon','basketball'].includes(universe)||!state.index)return;
  state.universe=universe;renderUniverse();$('series-filter').value='';$('channel-filter').value='';$('set-search').value='';
  const target=state.index.sets.find(s=>s.id===state.lastSeries[universe])||state.index.sets.find(s=>universe==='basketball'?s.id==='BB400618':s.source_goods_type==='1')||state.index.sets.find(s=>(s.sport||'pokemon')===universe);
  setMode('shop');if(target){const hash='#'+encodeURIComponent(target.id);if(location.hash===hash)selectSet();else location.hash=hash;}renderSets();
}
function collectiblesAction(action,message){
  try{ensureShopReady();persistSave(action());filterCards();renderCollectibles();$('shop-message').textContent=message;}
  catch(error){$('shop-message').textContent=error.message;}
}
function advanceCollectiblesDay(){
  try{ensureShopReady();const result=Shop.endDay(state.save,state.products,state.feed);persistSave(result.save);$('shop-message').textContent=`第 ${state.save.shop.day} 天，去看看评级进度吧。`;}
  catch(error){$('shop-message').textContent=error.message;}
}
function rawKey(card){return card.instance_id||card.id;}
function ownedRawCards(){return state.collectionCards.flatMap(c=>{const copies=state.save.shop.collectibles.rawCopies.filter(r=>r.id===c.id);return copies.length?copies.map(r=>({...c,...r})):state.save.counts[c.id]?[c]:[];});}
function rawLabel(c){return c.instance_id?`${c.name} · ${TCGBasketballArt.serial(c)}`:`${c.name} · ${c.rarity} ×${state.save.counts[c.id]}`;}
function startGrading(card){state.gradeTarget=rawKey(card);setMode('grading');}
function showRefFor(card){state.showRef=`raw:${rawKey(card)}`;setMode('cardshow');}
function selectedShowRef(){
  const value=$('show-own').value;
  if(value.startsWith('slab:'))return {type:'slab',uid:value.slice(5)};
  const card=ownedRawCards().find(c=>rawKey(c)===value.slice(4));return card?{type:'raw',card}:null;
}
function slabElement(slab){
  const item=text('article','','slab-item');item.dataset.uid=slab.uid;
  const shell=text('div','',`slab-shell slab-${slab.agency.toLowerCase()}`),label=text('div','','slab-label');
  label.append(text('strong',`${slab.agency} ${slab.grade}`),text('span',slab.label),text('small','GAME · 游戏评级'));
  const button=lineButton('',()=>showCard(slab.card),'slab-art-button'),image=document.createElement('img');image.loading='lazy';image.width=260;image.height=364;applyCardImage(image,slab.card);button.append(image);
  shell.append(label,button,text('span',slab.certificate,'slab-certificate'));item.append(shell,text('h4',slab.card.name));
  const amount=Math.max(1,Math.floor(Collectibles.slabValue(state.save,slab,state.feed)*.7));
  item.append(lineButton(`卖出 ${money(amount)}`,()=>collectiblesAction(()=>Collectibles.sellSlab(state.save,slab.uid,state.feed),'评级卡已售出。'),'slab-sell'),lineButton('带去卡展',()=>{state.showRef=`slab:${slab.uid}`;setMode('cardshow');},'slab-show'));
  const details=document.createElement('details');details.append(text('summary','品相与送评资料'));
  details.append(text('p',`居中 ${slab.condition.centering} · 四角 ${slab.condition.corners} · 边缘 ${slab.condition.edges} · 表面 ${slab.condition.surface}`),text('p',`游戏预检 · 送评花费 ${money(slab.fee)} · 本游戏证书，非真实认证`));item.append(details);return item;
}
function renderCollectionSlabs(){
  const area=$('collection-slab-area');if(!area)return;
  const rows=state.save.shop.collectibles.slabs.filter(s=>(!state.collectionSet||s.card.set_id===state.collectionSet)&&(state.collectionSport==='all'||s.card.sport===state.collectionSport));
  area.hidden=state.mode!=='collection'||!rows.length;$('collection-slabs').replaceChildren();if(!area.hidden)for(const slab of rows)$('collection-slabs').append(slabElement(slab));
}
function gradeTarget(){return ownedRawCards().find(c=>rawKey(c)===$('grading-card').value&&state.save.counts[c.id]);}
function renderGradingForm(){
  const card=gradeTarget();$('grading-card-preview').replaceChildren();$('grading-submit').disabled=!card||state.collectionLoading;
  renderGradingOdds(card,$('grading-agency').value);
  if(!card){$('grading-quote').textContent=state.collectionLoading?'整理散卡中…':'先开一包，或去卡展买张心仪的卡。';return;}
  state.gradeTarget=rawKey(card);const image=document.createElement('img');applyCardImage(image,card);image.width=160;image.height=224;$('grading-card-preview').append(image);
  const q=Collectibles.gradeQuote(state.save,card,$('grading-agency').value,$('grading-service').value,state.feed);
  $('grading-quote').textContent=`游戏费用 ${money(q.fee)} · 第 ${q.ready} 天可取回`;
}
function renderGrading(){
  if(state.mode!=='grading')return;
  const select=$('grading-card'),wanted=state.gradeTarget||select.value;
  const owned=ownedRawCards();select.replaceChildren(...owned.map(c=>new Option(rawLabel(c),rawKey(c))));
  if(owned.some(c=>rawKey(c)===wanted))select.value=wanted;
  renderGradingForm();const extra=state.save.shop.collectibles;$('grading-jobs').replaceChildren();
  for(const job of extra.jobs){const row=text('article','','grading-job'),left=Math.max(0,job.ready-state.save.shop.day);row.append(text('strong',job.card.name+(job.card.serial_number?' · '+TCGBasketballArt.serial(job.card):'')),text('span',`${job.agency} · ${left?`还有 ${left} 个营业日`:'已经到啦，去取回！'}`));$('grading-jobs').append(row);}
  if(!extra.jobs.length)$('grading-jobs').append(text('p','暂时没有在途卡牌。'));
  const ready=extra.jobs.filter(j=>j.ready<=state.save.shop.day).length;$('grading-collect').disabled=!ready;$('grading-collect').textContent=ready?`取回 ${ready} 张`:'等待评级中';
  $('grading-slabs').replaceChildren();for(const slab of extra.slabs)$('grading-slabs').append(slabElement(slab));
  if(!extra.slabs.length)$('grading-slabs').append(text('p','第一张评级卡，留给你最喜欢的那张。'));
}
async function loadShowPool(){
  if(state.showPool||state.showLoading)return;
  state.showLoading=true;$('show-note').textContent='布展中…';
  try{state.showPool=await readJSON('data/shop/show-pool.json');state.showError='';}
  catch(error){state.showError='展品暂时没读出，请点击重试。';}
  finally{state.showLoading=false;renderShow();}
}
function renderShowSale(){
  const ref=selectedShowRef(),show=state.save.shop.collectibles.show,entered=show.day===state.save.shop.day&&show.entered;
  $('show-sell').disabled=!ref||!entered||show.sold>=12;
  try{$('show-sell-quote').textContent=ref?`摊主收购 ${money(Collectibles.showBid(state.save,ref,Number($('show-booth').value),state.feed))}`:'选一张自己的散卡或评级卡';}
  catch{$('show-sell-quote').textContent='这张卡暂时不能交易。';$('show-sell').disabled=true;}
}
function renderShow(){
  if(state.mode!=='cardshow')return;
  if(!state.showPool&&!state.showError){loadShowPool();return;}
  const show=state.save.shop.collectibles.show,entered=show.day===state.save.shop.day&&show.entered;
  $('show-day').textContent=`第 ${state.save.shop.day} 天 · 城市卡展`;$('show-enter').disabled=entered;$('show-enter').textContent=entered?'今日已入场 ✓':'入场 · ¥20';
  const select=$('show-own'),wanted=state.showRef||select.value;select.replaceChildren(new Option('选择带来的卡…',''));
  for(const card of ownedRawCards())select.append(new Option(`散卡 · ${rawLabel(card)}`,`raw:${rawKey(card)}`));
  for(const slab of state.save.shop.collectibles.slabs)select.append(new Option(`${slab.agency} ${slab.grade} · ${slab.card.name}`,`slab:${slab.uid}`));
  if([...select.options].some(o=>o.value===wanted))select.value=wanted;else state.showRef='';renderShowSale();
  $('show-note').replaceChildren();
  if(state.showError){$('show-note').append(text('span',state.showError),lineButton('重试',()=>{state.showError='';loadShowPool();}));return;}
  $('show-offers').replaceChildren();
  const offers=Collectibles.offers(state.save,state.showPool,$('show-sport').value),ref=selectedShowRef();
  for(let booth=0;booth<3;booth++){
    const section=text('section','','show-booth');section.append(text('h3',['新秀与新面孔','经典收藏','评级收藏家'][booth]));const grid=text('div','','show-offer-grid');
    for(const offer of offers.filter(o=>o.booth===booth)){
      const item=text('article','',`show-offer${offer.available?'':' is-sold'}`);item.dataset.offer=offer.key;const image=document.createElement('img');image.loading='lazy';image.width=220;image.height=308;applyCardImage(image,offer.card);
      const art=lineButton('',()=>showCard(offer.card),'show-offer-art');art.append(image);item.append(art,text('small',offer.grade?`游戏评级 PSA ${offer.grade}`:offer.card.sport==='basketball'?'篮球散卡':'宝可梦散卡'),text('h4',offer.card.name),text('p',offer.available?money(offer.ask):'已成交'));
      const buy=lineButton('买下',()=>collectiblesAction(()=>Collectibles.deal(state.save,state.showPool,offer.key,'buy',null,state.feed,$('show-sport').value),'展品已买入。'),'show-buy');buy.disabled=!entered||!offer.available;item.append(buy);
      let swapText='选张卡来交换',valid=false;
      try{if(ref){const delta=offer.ask-Collectibles.showBid(state.save,ref,booth,state.feed);swapText=delta>=0?`交换 · 补 ${money(delta)}`:`交换 · 返 ${money(-delta)}`;valid=true;}}catch{}
      const swap=lineButton(swapText,()=>collectiblesAction(()=>Collectibles.deal(state.save,state.showPool,offer.key,'swap',selectedShowRef(),state.feed,$('show-sport').value),'交换完成，卡牌与差价已一起保存。'),'show-swap');swap.disabled=!entered||!offer.available||!valid;item.append(swap);grid.append(item);
    }
    section.append(grid);$('show-offers').append(section);
  }
}
function renderBasketballHome(){
  if(state.universe!=='basketball'||state.mode!=='shop'||!state.cards.length||state.selected?.sport!=='basketball')return;
  const cards=[...state.cards].sort((a,b)=>Number(!!b.local_preview)-Number(!!a.local_preview)||Game.tier(b)-Game.tier(a)).slice(0,3);$('basketball-hero-art').replaceChildren();
  for(const card of cards){const image=document.createElement('img');applyCardImage(image,card);image.width=240;image.height=336;$('basketball-hero-art').append(image);}
}
function renderCollectibles(){if(!state.save?.shop||!$('grading-room'))return;renderUniverse();renderGrading();renderShow();renderCollectionSlabs();renderBasketballHome();}
function initCollectibles(){
  for(const button of document.querySelectorAll('[data-universe]'))button.addEventListener('click',()=>chooseUniverse(button.dataset.universe));
  $('grading-form').addEventListener('submit',event=>{event.preventDefault();const card=gradeTarget();if(!card)return;collectiblesAction(()=>Collectibles.submit(state.save,card,$('grading-agency').value,$('grading-service').value,state.feed),'已送评，卡牌和费用一起锁定。');});
  for(const id of ['grading-card','grading-agency','grading-service'])$(id).addEventListener('change',renderGradingForm);
  $('grading-collect').addEventListener('click',()=>collectiblesAction(()=>Collectibles.collect(state.save),'评级卡取回啦！'));
  $('grading-next-day').addEventListener('click',advanceCollectiblesDay);
  $('show-enter').addEventListener('click',()=>collectiblesAction(()=>Collectibles.attend(state.save),'入场成功，逛逛今天的展品吧。'));
  $('show-own').addEventListener('change',()=>{state.showRef=$('show-own').value;renderShow();});$('show-booth').addEventListener('change',renderShowSale);$('show-sport').addEventListener('change',renderShow);
  $('show-sell').addEventListener('click',()=>collectiblesAction(()=>Collectibles.deal(state.save,state.showPool,$('show-booth').value,'sell',selectedShowRef(),state.feed,$('show-sport').value),'卡展售出，回款已到账。'));
  renderUniverse();
}
