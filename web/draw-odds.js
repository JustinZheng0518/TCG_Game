(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./game-core.js'):root.TCGGame,node?require('./basketball-core.js'):root.TCGBasketball,node?require('./shop-core.js'):root.TCGShop);
  if(node)module.exports=api;else root.TCGDrawOdds=api;
})(globalThis,function(Game,Basketball,Shop){
  'use strict';
  const pool=(label,cards,chance=1,note='')=>({label,cards,chance,note});
  const slot=(label,draws,pools)=>({label,draws,pools});
  function recipe(product,cards,chosenId){
    if(!cards.length)throw Error('本系列卡表尚未加载。');
    let slots,notes=[],chosen=false;
    const channel=product.channel;
    if(product.sport==='basketball'){
      const model=Basketball.packModel(cards);
      if(model.fixed){slots=[slot('全卡池',5,[pool('本套全部卡面',cards)])];notes.push('本套没有普通基础位，5 张均从本套卡面等概率抽取，不适用一般篮球包的收藏位比例。');}
      else{
        slots=[slot('基础位',4,[pool('基础卡与新秀卡',model.base)]),slot('收藏位',1,[...model.groups.map(g=>pool(g.label,g.cards.length?g.cards:model.base,g.chance,g.cards.length?'':'本套缺档 → 基础卡池')),pool('基础卡回落',model.base,model.baseProbability)])];
        notes.push('低编收藏位只含类型为限编且 /10 及以下的卡；签字球衣归签字位。基础位本身也会出现新秀。');
      }
    }else if(channel==='booster'){
      const m=Game.packModel(cards);
      slots=[slot('基础位',3,[pool('本套基础卡池',m.base)]),slot('保底位',1,[pool(m.guaranteeLabel,m.guarantee)]),slot('机会位',1,[...m.groups.map(g=>pool(g.label,g.cards,g.probability)),pool('基础卡回落',m.base,m.baseProbability)])];
      notes.push(m.guaranteeLabel+'。'+(m.chase?'最高非空高稀有档为每包 0.1%；缺失档位的概率回落基础池。':'本套没有千分之一高稀有追逐档，按下列实际卡池抽取。'));
      if(m.fixed)notes=['本套全为高稀有卡，基础位、保底位与机会位均从本套卡面等概率抽取，不存在千分之一追逐档。'];
    }else if(channel==='deck'){
      const {base,ace}=Shop.deckPools(cards);slots=[slot('基础位',58,[pool('基础卡池',base)]),slot('主力位',2,[pool('RR / RRR；缺档回落基础池',ace)])];notes.push('每盒 60 张的随机游戏配方，允许重复，并非官方固定卡组清单。');
    }else if(channel==='event'&&product.variant_distribution){
      const labels={0:'平卡 / ex',1:'精灵球纹',2:'大师球纹'};
      slots=[slot('活动奖赏',1,Shop.eventPools(product,cards).map(g=>pool(labels[g.variant]||`加工 ${g.variant}`,g.cards,g.chance)))];
      if(slots[0].pools.some(p=>p.chance>0&&!p.cards.length))throw Error('活动卡表缺少配比对应卡池，当前不能领取。');
    }else if(['gift','exchange'].includes(channel)){
      const selected=cards.find(c=>c.id===chosenId)||cards[0];chosen=true;slots=[slot('指定领取',1,[pool('所选卡面', [selected])])];notes.push('自主选择，不随机：所选卡面 100%，其他卡面本次为 0%。更换所选卡面后概率随之更新。');
    }else{
      slots=[slot(channel==='special'?'等概率卡位':'随机奖赏',channel==='special'?product.cards_per_unit:1,[pool('本套全部卡面',cards)])];
    }
    notes.push('以下均为本游戏实际规则，不代表实体商品官方出货率。卡面记录包含不同加工版本；同名卡不会自动合并。');
    if(!chosen)notes.push('各次独立、允许重复，无累计保底；十次概率表示连续获取十份至少命中一次，不是必出承诺。');
    return {slots,notes,chosen,size:slots.reduce((sum,s)=>sum+s.draws,0),unit:channel==='deck'?'盒':Shop.RETAIL.includes(channel)?'包':'次'};
  }
  function hit(chance,count=1){return chance>=1?1:chance<=0?0:-Math.expm1(count*Math.log1p(-chance));}
  function analyze(product,cards,chosenId){
    const model=recipe(product,cards,chosenId),states=new Map(cards.map(c=>[c.id,{card:c,miss:1,expected:0}])),groups=new Map();
    for(const c of cards){const key=c.rarity||'未标注';if(!groups.has(key))groups.set(key,{label:key,count:0,miss:1,expected:0});groups.get(key).count++;}
    for(const s of model.slots){
      const distribution=new Map();
      for(const p of s.pools)if(p.chance>0&&p.cards.length)for(const c of p.cards)distribution.set(c.id,(distribution.get(c.id)||0)+p.chance/p.cards.length);
      const grouped=new Map();
      for(const [id,p] of distribution){const row=states.get(id);row.miss*=Math.pow(1-p,s.draws);row.expected+=p*s.draws;const key=row.card.rarity||'未标注';grouped.set(key,(grouped.get(key)||0)+p);}
      for(const [key,p] of grouped){const row=groups.get(key);row.miss*=Math.pow(Math.max(0,1-p),s.draws);row.expected+=p*s.draws;}
    }
    const result=row=>({...row,chance:Math.max(0,Math.min(1,1-row.miss)),ten:hit(Math.max(0,Math.min(1,1-row.miss)),10)});
    return {...model,cards:[...states.values()].map(result),groups:[...groups.values()].map(result)};
  }
  function percent(chance){if(chance===0)return '0%';if(chance===1)return '100%';return `${Number((chance*100).toFixed(8))}%`;}
  return {recipe,analyze,hit,percent};
});
