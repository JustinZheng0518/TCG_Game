#!/usr/bin/env python3
"""Generate game-only basketball pack prices and the mixed show reference pool."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(path):return json.loads((ROOT/path).read_text())
def save(path,value):
 dest=ROOT/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
index=load('data/basketball/index.json');products={}
for s in index['sets']:
 price=8500 if re.search('Prizm|Chrome|Select|Mosaic',s['name']) else 65000 if 'National Treasures' in s['name'] else 4500
 products[s['id']]={'id':s['id'],'name':s['name'],'sport':'basketball','channel':'special','channel_label':'篮球体验包','retail_cents':price,'price_kind':'simulation','cards_per_unit':5,'source_url':s['source'],'notes':'历史实卡资料组成的数字体验包；5张封入、概率与价格为游戏设计，不是实体 Hobby/Retail 配置。'}
save('data/basketball/products.json',{'schema_version':1,'currency':'CNY','products':products})
pool=[]
for series in index['sets']:
 cards=load(series['cards_path'])
 # The exhibition uses validated local previews, so every booth is illustrated.
 pool.extend([c for c in cards if c.get('local_preview')][:4])
pokemon=load('data/pokemon/zh-CN/index.json')['sets']
for s in pokemon:
 cards=load(s['cards_path'])
 featured=next((c for c in cards if re.match('SAR|SR|UR|AR',c['rarity'])),cards[0])
 for c in {featured['id']:featured,cards[0]['id']:cards[0]}.values():pool.append(c)
save('data/shop/show-pool.json',pool)
print('Basketball products',len(products),'mixed show pool',len(pool))
