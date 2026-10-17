#!/usr/bin/env python3
"""Classify products by names/types; do not infer acquisition from card count."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
index=json.loads((ROOT/'data/pokemon/zh-CN/index.json').read_text())
labels={'booster':'常规补充包','special':'特色零售包','deck':'预组与构筑','gift':'礼盒与套装','event':'赛事与活动','mission':'任务奖赏','exchange':'特典兑换目录','bundle':'组合附属包'}
products={}
for s in index['sets']:
    name=s['name'];code=s['id']
    if code.startswith('MISSION'): channel='mission'
    elif re.search('大师赛|世界锦标赛|城市赛|超级赛|高级赛|道馆|活动奖赏包|活动特别包',name) or code=='151C': channel='event'
    elif name.startswith('特典卡'): channel='exchange'
    elif code.startswith('CBB'): channel='special'
    elif s['source_goods_type']=='1': channel='booster'
    elif re.search('嗨皮包|改造包|奖赏包',name): channel='bundle'
    elif s['source_goods_type']=='2' or re.search('起始卡组|嗨皮组合|大师战略卡组|对战学院|对战派对.*[上下]$',name): channel='deck'
    elif re.search('专题包',name): channel='special'
    else: channel='gift'
    cents={'booster':1000,'special':1000,'deck':3000,'gift':12800}.get(channel,0)
    products[code]={'id':code,'name':name,'channel':channel,'channel_label':labels[channel],
      'retail_cents':cents,'price_kind':'simulation','cards_per_unit':5 if channel=='booster' else 60 if channel=='deck' else 4 if code.startswith('CBB') else 1,
      'classification_basis':'source_goods_type_and_product_name','source_url':('https://www.pokemon.cn/tcg/event/24186.html' if channel=='event' else 'https://www.pokemon.cn/tcg/other/20454.html' if channel=='mission' else s['source']),
      'notes':'按商品类型与名称归类；获取流程为游戏改编，不代表逐卡官方发放记录。'}
# Explicitly verified official MSRP; prices are not secondary-market quotations.
for code in ['CS1aC','CS1bC']:
    products[code].update(retail_cents=1000,price_kind='official_msrp',source_url='https://www.pokemon.cn/tcg/product/16268.html')
products['CS1DC'].update(retail_cents=3000,price_kind='official_msrp',source_url='https://www.pokemon.cn/tcg/product/16268.html')
products['CSVH6C'].update(retail_cents=2000,price_kind='official_msrp',source_url='https://www.pokemon.cn/tcg/product/23939.html')
products['PROMOSVEVENT05'].update(variant_distribution={'0':0.89,'1':0.10,'2':0.01}, source_url='https://www.pokemon.cn/tcg/other/23657.html')
products['PROMOGIFT05']['source_url']='https://www.pokemon.cn/tcg/other/23657.html'
products['MISSION10']['source_url']='https://www.pokemon.cn/tcg/other/23657.html'
for code in ['CS1aC','CS1bC','CS1DC']:products[code]['reference_date']='2023-04-30'
products['CSVH6C']['reference_date']='2026-09-21'
output={'schema_version':1,'currency':'CNY','labels':labels,'products':products}
(ROOT/'data/shop/products.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
from collections import Counter
print(Counter(p['channel'] for p in products.values()))
