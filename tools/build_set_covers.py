#!/usr/bin/env python3
"""Bundle a real product cover or clearly attributed card preview for every playable set."""
import argparse,json,urllib.request
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
COMMIT='c3b6ac6ef803aad9d60e44d058359addf3a20883'
RAW=f'https://raw.githubusercontent.com/duanxr/PTCG-CHS-Datasets/{COMMIT}/'
def read(p):return json.loads((ROOT/p).read_text())
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,default=Path('/workspace/card-source-cache/chs-extra-images'));args=parser.parse_args()
 dest=ROOT/'data/shop/set-covers';dest.mkdir(parents=True,exist_ok=True);covers={}
 for sport,index in [('pokemon','data/pokemon/zh-CN/index.json'),('basketball','data/basketball/index.json')]:
  for series in read(index)['sets']:
   cards=read(series['cards_path']);sid=series['id']
   if sport=='basketball':
    card=next(c for c in cards if c.get('local_preview'))
    covers[sid]={'image':card['local_preview'],'kind':'card','sport':sport,'card_id':card['id'],'source_url':card['source_url']};continue
   source=f'img/{series["source_collection_id"]}/cover.png';cached=args.cache/source
   target=dest/f'{sid}.webp';kind='product';card=None
   try:
    if not cached.exists():
     cached.parent.mkdir(parents=True,exist_ok=True)
     req=urllib.request.Request(RAW+source,headers={'User-Agent':'TCG-Game-Asset-Preparation/1.0'})
     with urllib.request.urlopen(req,timeout=20) as response:cached.write_bytes(response.read())
    image=Image.open(cached);image.load();url=RAW+source
   except Exception:
    kind='card';card=next((c for c in cards if c['rarity'] in ['SAR','SR','AR','RR']),cards[0]);url=card['source_url']
    candidate=ROOT/card['thumbnail']
    if not candidate.exists():
     candidate=args.cache/'card-previews'/f'{sid}.png';candidate.parent.mkdir(parents=True,exist_ok=True)
     if not candidate.exists():
      with urllib.request.urlopen(url,timeout=30) as response:candidate.write_bytes(response.read())
    image=Image.open(candidate);image.load()
   image.thumbnail((360,360));image.convert('RGBA').save(target,'WEBP',quality=85,method=4)
   covers[sid]={'image':target.relative_to(ROOT).as_posix(),'kind':kind,'sport':sport,'source_url':url}
   if card:covers[sid]['card_id']=card['id']
 data={'schema_version':1,'note':'Real product artwork when available; otherwise an explicitly labeled card from this exact set. No fabricated sealed-product images.','sets':covers}
 (ROOT/'data/shop/set-covers.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 from collections import Counter
 print('COVERS',len(covers),Counter((x['sport'],x['kind']) for x in covers.values()))
if __name__=='__main__':main()
