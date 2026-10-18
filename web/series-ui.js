"use strict";
const DrawOdds=globalThis.TCGDrawOdds;
let oddsContext=null,oddsRequest=0;
function seriesCover(set){
  const cover=state.setCovers?.[set.id],frame=text('span','',`series-cover series-cover-${cover?.kind||'card'}`);
  if(!cover){frame.append(text('span','封面暂未读出','cover-unavailable'));return frame;}
  const image=document.createElement('img');image.loading='lazy';image.decoding='async';image.width=250;image.height=240;image.alt=`${set.name} · ${cover.kind==='product'?'商品封面':'本系列卡面预览'}`;image.referrerPolicy='no-referrer';image.src=cover.image;
  image.onerror=()=>{image.hidden=true;frame.append(text('span','图片暂不可用','cover-unavailable'));};
  frame.append(image,text('span',cover.kind==='product'?'商品封面':'卡面预览','series-cover-kind'));return frame;
}
function oddsSummary(){
  if(!state.selected||!state.cards.length)return;
  try{
    const product=state.products[state.selected.id],model=DrawOdds.recipe(product,state.cards,$('reward-card').value);
    $('probability-summary').textContent=model.chosen?'自选卡面 · 所选 100%':`${model.size} 张 / ${model.unit} · ${model.slots.map(s=>`${s.draws} ${s.label}`).join(' + ')}`;
    const status=$('basketball-source-status');status.hidden=product.sport!=='basketball';
    if(product.source_coverage)status.textContent=`实卡资料体验池 · 已查 ${product.source_coverage.subsets_listed} 个子系列，已收录其中 ${product.source_coverage.subsets_imported} 个 · ${product.source_coverage.rare_local_images} 张稀有卡本地图`+((product.source_coverage.status==='partial')?' · 素材仍在补充':'');
    const highlights=$('probability-highlight');highlights.replaceChildren();
    const last=model.slots.at(-1);
    if(product.channel==='booster')highlights.append(text('span',`${model.slots[1].pools[0].label} · 100%`,'probability-chip'));
    if(last.pools.length>1){highlights.append(text('span',`${last.label}：`,'probability-highlight-label'));for(const p of last.pools)highlights.append(text('span',`${p.label} ${DrawOdds.percent(p.note?0:p.chance)}${p.note?'（当前未收录）':''}`,'probability-chip'));}
    else highlights.append(text('span',model.chosen?'所选卡面 100%':`${model.slots.length>1?last.label+'每款命中':`每款每${model.unit}至少 1 张`}：${DrawOdds.percent(DrawOdds.hit(1/last.pools[0].cards.length,last.draws))}${model.slots.length>1?'（仅此卡位）':''}`,'probability-chip'));
    $('probability-shortcut').hidden=state.mode!=='draw';
  }catch{$('probability-summary').textContent='概率暂未读出，请重试读取系列。';}
}
function probabilityTable(rows,headings){
  const wrap=text('div','','odds-table-scroll'),table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
  for(const heading of headings)tr.append(text('th',heading));thead.append(tr);const body=document.createElement('tbody');
  for(const row of rows){const line=document.createElement('tr');for(const cell of row)line.append(text('td',cell));body.append(line);}
  table.append(thead,body);wrap.append(table);return wrap;
}
async function openOdds(set=state.selected,focusId=''){
  if(!set)return;
  const request=++oddsRequest;oddsContext=null;$('odds-title').textContent=set.name;$('odds-summary').textContent='读取本系列概率中…';$('odds-slots').replaceChildren();$('odds-groups').replaceChildren();$('odds-card-list').replaceChildren();$('odds-notes').replaceChildren();$('odds-card-search').value='';$('odds-card-rarity').replaceChildren(new Option('全部卡种',''));
  if(!$('odds-dialog').open)$('odds-dialog').showModal();
  try{
    const cards=await readCardSet(set);if(request!==oddsRequest)return;
    const product=state.products[set.id],chosen=state.selected?.id===set.id?$('reward-card').value:focusId||cards[0].id;
    const model=DrawOdds.analyze(product,cards,chosen);oddsContext={set,product,cards,model,shown:0,filtered:[]};
    $('odds-summary').textContent=`${model.size} 张 / ${model.unit} · ${cards.length} 条卡面 · 游戏实际概率`;
    $('odds-notes').replaceChildren(...model.notes.map(note=>text('p',note)));
    if(model.chosen){const label=text('label','选择领取卡面','odds-choice-label'),select=document.createElement('select');select.id='odds-choice';select.append(...cards.map(c=>new Option(`${c.number} · ${c.name} · ${c.rarity}`,c.id)));select.value=model.slots[0].pools[0].cards[0].id;label.append(select);$('odds-notes').prepend(label);select.addEventListener('change',()=>{oddsContext.model=DrawOdds.analyze(product,cards,select.value);if(state.selected?.id===set.id){$('reward-card').value=select.value;renderAcquisition();}renderOddsModel();});}
    $('odds-card-rarity').append(...[...new Set(cards.map(c=>c.rarity))].map(r=>new Option(r,r)));
    if(focusId){const target=cards.find(c=>c.id===focusId);if(target)$('odds-card-search').value=target.id;}
    renderOddsModel();
  }catch(error){if(request===oddsRequest){$('odds-summary').textContent=`${error.message}，请重新打开重试。`;$('odds-card-count').textContent='资料尚未加载';$('odds-more').hidden=true;}}
}
// Only weighted rare tiers get artwork; ordinary pools and missing-tier fallbacks stay compact.
function rarePoolGallery(pool){
  const section=text('div','','odds-rare-preview');section.dataset.pool=pool.label;
  section.append(text('p',`${pool.label} · ${DrawOdds.percent(pool.chance)} · 可抽 ${pool.cards.length} 款`,'odds-rare-heading'));
  const grid=text('div','','odds-rare-grid'),more=text('button','','odds-rare-more');more.type='button';let shown=0;
  function append(count){
    for(const card of pool.cards.slice(shown,shown+count)){
      const button=text('button','','odds-rare-card');button.type='button';button.dataset.card=card.id;button.setAttribute('aria-label',`查看 ${card.name} ${card.number} ${card.rarity}`);
      const image=document.createElement('img');image.loading='lazy';image.decoding='async';image.width=180;image.height=250;applyCardImage(image,card);
      const art=text('span','','odds-rare-art');art.append(image);button.append(art,text('strong',card.name),text('span',`${card.number} · ${card.rarity}`));
      button.addEventListener('click',()=>{if($('card-dialog').open)$('card-dialog').close();showCard(card);});grid.append(button);
    }
    shown=Math.min(pool.cards.length,shown+count);more.hidden=shown===pool.cards.length;more.textContent=`再看 ${Math.min(8,pool.cards.length-shown)} 款 · 已展示 ${shown} / ${pool.cards.length}`;
  }
  more.addEventListener('click',()=>append(8));append(4);section.append(grid,more);return section;
}
function renderOddsModel(){
  const {model,product}=oddsContext;$('odds-slots').replaceChildren();
  for(const s of model.slots){
    const item=text('section','','odds-slot');item.append(text('h3',`${s.draws} 张 · ${s.label}`));
    for(const p of s.pools){
      const group=text('div','','odds-pool'),line=text('p','','odds-pool-line');
      line.append(text('span',`${p.label}${p.note?` · ${p.note}`:''}`),text('strong',DrawOdds.percent(p.chance)),text('small',p.cards.length?`池内 ${p.cards.length} 款 · 每款每个该卡位 ${DrawOdds.percent(p.chance/p.cards.length)}`:'当前无可抽卡面，不把基础卡当作该档卡面展示'));group.append(line);
      const basketballRare=product.sport==='basketball'&&p.label!=='新秀位'&&p.label!=='基础卡回落'&&s.label!=='基础位';
      if(p.chance>0&&!p.note&&p.cards.length&&p.label!=='基础卡回落'&&(basketballRare||s.pools.length>1&&p.chance<=.12))group.append(rarePoolGallery(p));
      item.append(group);
    }
    $('odds-slots').append(item);
  }
  $('odds-groups').replaceChildren(probabilityTable(model.groups.map(g=>[`${g.label}（${g.count} 款）`,DrawOdds.percent(g.chance),DrawOdds.percent(g.ten),Number(g.expected.toFixed(6))+' 张']),['卡种',`每${model.unit}至少 1 张`,`十${model.unit}至少 1 张`,'平均每份张数']));
  filterOddsCards();
}
function filterOddsCards(){
  if(!oddsContext)return;const query=$('odds-card-search').value.trim().toLocaleLowerCase(),rarity=$('odds-card-rarity').value;
  oddsContext.filtered=oddsContext.model.cards.filter(r=>(!rarity||r.card.rarity===rarity)&&(!query||`${r.card.name} ${r.card.original_name||''} ${r.card.number} ${r.card.id}`.toLocaleLowerCase().includes(query)));oddsContext.shown=0;$('odds-card-list').replaceChildren();appendOddsCards();
}
function appendOddsCards(){
  if(!oddsContext)return;const c=oddsContext,batch=c.filtered.slice(c.shown,c.shown+60);
  for(const row of batch){const item=text('article','','odds-card-row');item.dataset.card=row.card.id;const name=text('div','','odds-card-name');name.append(text('strong',row.card.name),text('span',`${row.card.number} · ${row.card.rarity}`));const chances=text('div','','odds-card-chances');chances.append(text('span',`每${c.model.unit} ${DrawOdds.percent(row.chance)}`),text('span',`十${c.model.unit} ${DrawOdds.percent(row.ten)}`));item.append(name,chances,text('small',row.chance===0?(row.card.draw_available===false?'卡面待补，暂不参与抽取':'当前规则不会获得'):row.chance===1?'本次必得':`平均约 ${Number((1/row.chance).toFixed(1)).toLocaleString('zh-CN')} ${c.model.unit}命中一次`));$('odds-card-list').append(item);}
  c.shown+=batch.length;$('odds-card-count').textContent=`${c.filtered.length} 条卡面 · 已展示 ${c.shown} 条`;$('odds-more').hidden=c.shown>=c.filtered.length;
}
function renderGradingOdds(card,agency){
  const target=$('grading-odds');target.replaceChildren();if(!card){target.append(text('p','先选择一张散卡，即可查看对应机构的评级概率。'));return;}
  const result=Collectibles.gradeDistribution(card,agency);target.append(text('p',`${card.name} · ${agency} · 当前游戏品相模型${result.age?`（年份磨损：四项各减 ${result.age}）`:''}`));
  target.append(probabilityTable(result.rows.map(r=>[`${r.grade} · ${r.label}`,DrawOdds.percent(r.chance)]),['评级结果','概率']));
  target.append(text('p',`居中、四角、边缘、表面各自独立抽取：${result.conditions.map(r=>`${r.value} 分 ${DrawOdds.percent(r.chance)}`).join('；')}。总分按所选机构的游戏公式合成。`));target.append(text('p',`10 分合计：${DrawOdds.percent(result.rows.filter(r=>r.grade===10).reduce((sum,r)=>sum+r.chance,0))}。未列出的分数 / 标签概率为 0%。`));target.append(text('p','以上是送评前概率，不泄露已保存结果；标准和加急仅改变等待及费用，不改变分数概率。卡展预制评级卡不经过此随机流程。'));
}
function initSeriesUI(){
  $('open-odds').addEventListener('click',()=>openOdds());
  $('odds-card-search').addEventListener('input',filterOddsCards);$('odds-card-rarity').addEventListener('change',filterOddsCards);$('odds-more').addEventListener('click',appendOddsCards);
  $('odds-dialog').addEventListener('click',event=>{if(event.target===$('odds-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
}
