#!/usr/bin/env python3
"""Build a source-attributed basketball-only archive and a bounded playable catalog.
Requires the optional requirements-assets.txt. HTML/image caches live outside git.
"""
import argparse,concurrent.futures,hashlib,io,json,re,threading,time,urllib.request
from datetime import datetime,timezone
from pathlib import Path
from lxml import html
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/basketball'
CACHE=ROOT.parent/'card-source-cache'/'basketball'
BASE='https://www.tcdb.com'
_lock=threading.Lock();_next=0
REQUEST_INTERVAL=.3
NAMES={'Michael Jordan':'迈克尔·乔丹','Kobe Bryant':'科比·布莱恩特','LeBron James':'勒布朗·詹姆斯','Stephen Curry':'斯蒂芬·库里','Shaquille O’Neal':'沙奎尔·奥尼尔',"Shaquille O'Neal":'沙奎尔·奥尼尔','Kevin Durant':'凯文·杜兰特','Tim Duncan':'蒂姆·邓肯','Allen Iverson':'阿伦·艾弗森','Yao Ming':'姚明','Ming Yao':'姚明','Victor Wembanyama':'维克托·文班亚马','Luka Doncic':'卢卡·东契奇','Nikola Jokic':'尼古拉·约基奇','Giannis Antetokounmpo':'扬尼斯·阿德托昆博','James Harden':'詹姆斯·哈登','Kareem Abdul-Jabbar':'卡里姆·阿卜杜勒-贾巴尔','Larry Bird':'拉里·伯德','Magic Johnson':'魔术师约翰逊','Bill Russell':'比尔·拉塞尔','Wilt Chamberlain':'威尔特·张伯伦','Kevin Garnett':'凯文·加内特','Dirk Nowitzki':'德克·诺维茨基','Dwyane Wade':'德维恩·韦德','Chris Paul':'克里斯·保罗','Kawhi Leonard':'科怀·伦纳德','Anthony Edwards':'安东尼·爱德华兹','Jayson Tatum':'杰森·塔图姆','Shai Gilgeous-Alexander':'谢伊·吉尔杰斯-亚历山大','Chet Holmgren':'切特·霍姆格伦','Paolo Banchero':'保罗·班凯罗','Franz Wagner':'弗朗茨·瓦格纳','Scottie Pippen':'斯科蒂·皮蓬','Charles Barkley':'查尔斯·巴克利','Tracy McGrady':'特雷西·麦克格雷迪','Vince Carter':'文斯·卡特','Steve Nash':'史蒂夫·纳什','Ray Allen':'雷·阿伦','Damian Lillard':'达米安·利拉德','Russell Westbrook':'拉塞尔·威斯布鲁克','Jamal Murray':'贾马尔·穆雷','Devin Booker':'德文·布克','Anthony Davis':'安东尼·戴维斯','Joel Embiid':'乔尔·恩比德','Kyrie Irving':'凯里·欧文','Donovan Mitchell':'多诺万·米切尔','Zion Williamson':'锡安·威廉森','Ja Morant':'贾·莫兰特','Tyrese Haliburton':'泰瑞斯·哈利伯顿','Caitlin Clark':'凯特琳·克拉克','Angel Reese':'安吉尔·里斯','A’ja Wilson':'阿贾·威尔逊'}
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def fetch(url,binary=False):
 global _next
 CACHE.mkdir(parents=True,exist_ok=True)
 path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+('.bin' if binary else '.html'))
 if path.exists():return path.read_bytes()
 with _lock:
  now=time.monotonic();wait=max(0,_next-now);_next=max(now,_next)+REQUEST_INTERVAL
 if wait:time.sleep(wait)
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=25) as response:
  data=response.read(8*1024*1024)
 if not binary and b'<html' not in data.lower():raise ValueError('Not an HTML document')
 path.write_bytes(data);return data

def links_for_year(year):
 doc=html.fromstring(fetch(f'{BASE}/ViewAll.cfm/sp/Basketball/year/{year}'))
 result={}
 for a in doc.xpath('//a[contains(@href,"/ViewSet.cfm/sid/")]'):
  name=a.text_content().strip();url=a.get('href');match=re.search(r'/sid/(\d+)',url)
  if not name or not match:continue
  section=a.xpath('preceding::h3[1]');category=section[0].text_content().strip() if section else 'Unclassified'
  if category in ['Account','Browse','Features','Resources','General Info']:continue
  sid=int(match.group(1));result[sid]={'id':f'BB{sid}','source_set_id':sid,'name':name,'year':year,'category':category,'source_url':BASE+url,'sport':'basketball'}
 return list(result.values())

def checklist(source,parent,kind='base'):
 sid=source['source_set_id'];path=source['source_url'].replace('/ViewSet.cfm/','/Checklist.cfm/')
 first=html.fromstring(fetch(path));pages=[1]
 for u in first.xpath('//a/@href'):
  if u.startswith('?PageIndex='):
   match=re.search(r'PageIndex=(\d+)',u)
   if match:pages.append(int(match.group(1)))
 cards={};missing=0
 for page in range(1,max(pages)+1):
  doc=first if page==1 else html.fromstring(fetch(path+f'?PageIndex={page}'))
  for row in doc.xpath('//tr[.//a[contains(@href,"/ViewCard.cfm/")]]'):
   a=row.xpath('.//a[contains(@href,"/ViewCard.cfm/")]');href=a[0].get('href');match=re.search(r'/cid/(\d+)',href)
   if not match:continue
   player=row.xpath('.//a[contains(@href,"/Person.cfm/")]');team=row.xpath('.//a[contains(@href,"/Team.cfm/")]')
   name_cells=row.xpath('./td[@width="45%"]')
   if not player and not name_cells:continue
   number=next((x.text_content().strip() for x in a if x.text_content().strip()),'')
   if player:
    person=' / '.join(dict.fromkeys(p.text_content().strip() for p in player));cell=player[0].getparent();notes=cell.text_content().strip()
    for p in player:notes=notes.replace(p.text_content(),'')
   else:
    # Multi-player, team and checklist cards often have plain text rather than Person links.
    # Requiring a player link silently loses real cards, including dual/triple autographs.
    cell=name_cells[0];raw=' '.join(cell.text_content().split());marker=re.search(r'\s+(?:RC|AU|MEM|JSY|SN\d+|VAR|UER|ERR|SSP|SP|CL|TC|LL)(?:[ ,;]|$)',raw)
    person=raw[:marker.start()].strip() if marker else raw;notes=raw[len(person):].strip()
   if not person:continue
   teamname=' / '.join(dict.fromkeys(t.text_content().strip() for t in team)) if team else name_cells[-1].text_content().strip() if len(name_cells)>1 else ''
   notes=' '.join(notes.split())
   thumbs=row.xpath('.//img[contains(@src,"/Images/Thumbs/Basketball/")]/@src')
   front=next((u for u in thumbs if re.search(r'Thumb\.(?:jpg|png)$',u,re.I)),None)
   cid=int(match.group(1));key=f'{parent["id"]}:{cid}'
   if key in cards:continue
   if not front:missing+=1;continue
   token=re.search(r'/\d+_(.+?)Thumb\.(?:jpg|png)$',front,re.I)
   if not token:missing+=1;continue
   image_sid=re.search(r'/Basketball/(\d+)/',front).group(1)
   art=f'{BASE}/Images/Cards/Basketball/{image_sid}/{image_sid}-{token.group(1)}Fr.jpg'
   serial=re.search(r'\bSN\s*(\d+)',notes);serial_max=int(serial.group(1)) if serial else None
   au=bool(re.search(r'\bAU\b',notes) or re.search('autograph|signature',source['name'],re.I))
   mem=bool(re.search(r'\b(?:MEM|JSY)\b',notes) or re.search('jersey|patch|materials|memorabilia',source['name'],re.I))
   rookie=bool(re.search(r'\bRC\b',notes))
   group='auto_patch' if au and mem else 'auto' if au else 'memorabilia' if mem else 'numbered' if serial_max else 'parallel' if kind=='parallel' else 'insert' if kind=='insert' else 'rookie' if rookie else 'base'
   rarity={'auto_patch':'签字球衣','auto':'签字卡','memorabilia':'球衣卡','numbered':f'限编 /{serial_max}','parallel':'平行卡','insert':'特卡','rookie':'新秀 RC','base':'基础卡'}[group]
   cards[key]={'id':key,'set_id':parent['id'],'source_set_id':sid,'number':number,'name':NAMES.get(person,person),'original_name':person,'team':teamname,'rarity':rarity,'sport':'basketball','basketball_kind':group,'is_rookie':rookie,'serial_max':serial_max,'source_set_name':source['name'],'source_notes':notes,'year':parent['year'],'source_page':BASE+href.split('?')[0],'source_url':art,'back_url':art.replace('Fr.jpg','Bk.jpg'),'thumbnail':art,'image':art,'type':'篮球球星卡','illustrators':[],'variant_code':0,'is_chase':bool(re.search(r'Kaboom|Downtown|Color Blast|Blank Slate|Color Wheel|Stained Glass|Genesis|Tiger Stripe',source.get('short',source['name']),re.I)),'image_basis':'full-size URL derived from an existing front-thumbnail entry'}
 return list(cards.values()),missing

def variants(parent):
 url=parent['source_url'].replace('/ViewSet.cfm/','/Inserts.cfm/');doc=html.fromstring(fetch(url));values={}
 for a in doc.xpath('//a[contains(@href,"/Checklist.cfm/sid/")]'):
  name=a.text_content().strip();url=a.get('href');m=re.search(r'/sid/(\d+)',url)
  if not name or not m:continue
  group=a.xpath('preceding::h3[1]');kind='parallel' if group and 'Parallel' in group[0].text_content() else 'insert'
  sid=int(m.group(1))
  if sid==parent['source_set_id']:continue
  values[sid]={'source_set_id':sid,'name':parent['name']+' - '+name,'source_url':BASE+url,'kind':kind,'short':name}
 # Directory discovery is complete; per-family imports are handled by enrich_basketball.py.
 return list(values.values())

def choose_sets(archive,maximum):
 candidates=[s for s in archive if (s['category'] in ['Major Releases','WNBA'] or s['year']<=1961 and re.search('Bowman|Topps|Fleer',s['name'])) and not re.search('sticker|playing cards|on.demand|digital|instant|now|draft|university|college|schedules',s['name'],re.I)]
 preferred=re.compile(r'^\d{4}(?:-\d{2})? (?:Bowman|Topps|Fleer|Hoops|Upper Deck|Panini Prizm|Topps Chrome|Donruss)$')
 selected=[];seen=set()
 def add(s):
  if s['id'] not in seen and len(selected)<maximum:selected.append(s);seen.add(s['id'])
 for s in candidates:
  if re.fullmatch(r'(1948 Bowman|1986-87 Fleer|1996-97 Topps Chrome|2003-04 Topps Chrome|2012-13 Panini Prizm|2023-24 Panini Prizm|2023-24 Panini Select|2024-25 Panini Prizm|2025-26 Topps Chrome)',s['name']):add(s)
 for year in sorted({s['year'] for s in candidates}):
  pool=[s for s in candidates if s['year']==year]
  if pool:add(sorted(pool,key=lambda s:(not bool(preferred.match(s['name'])),s['name']))[0])
 for year in [2023,2024,2025,2012,1996,2003,2009,2018,2019,2020,1986,1997,1998,2022,2021]:
  pool=[s for s in candidates if s['year']==year]
  for s in sorted(pool,key=lambda s:(not bool(re.search(r'Prizm$|Select$|Optic$|Mosaic$|Topps Chrome$|Upper Deck$|Finest$|Hoops$|Fleer$|National Treasures$|Court Kings$',s['name'])),s['name']))[:8]:add(s)
 for s in sorted(candidates,key=lambda s:(not bool(preferred.match(s['name'])),s['year'],s['name'])):add(s)
 return selected

def build(maximum):
 doc=html.fromstring(fetch(BASE+'/ViewAll.cfm/sp/Basketball?MODE=Years'))
 years=sorted({int(re.search(r'/year/(\d+)',u).group(1)) for u in doc.xpath('//a/@href') if re.search(r'/year/(\d+)',u)})
 archive=[];errors=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
  work={ex.submit(links_for_year,y):y for y in years}
  for task in concurrent.futures.as_completed(work):
   try:archive+=task.result()
   except Exception as e:errors.append({'year':work[task],'error':str(e)})
 archive=list({s['id']:s for s in archive}.values());archive.sort(key=lambda s:(s['year'],s['name']))
 write(OUT/'archive-sets.json',{'sport':'basketball','source':BASE+'/ViewAll.cfm/sp/Basketball','observed_at':datetime.now(timezone.utc).isoformat(),'year_count':len(years),'set_count':len(archive),'sets':archive,'errors':errors})
 print(f'ARCHIVE {len(years)} seasons, {len(archive)} sets; failures {len(errors)}',flush=True)
 selected=choose_sets(archive,maximum);indexes=[];pool=[];missing=0;variant_count=0
 def collect(s):
  base,absent=checklist(s,s)
  # This is the base stage only. Never delete previously imported variants or local images.
  existing_path=OUT/'sets'/s['id']/'cards.json'
  existing=json.loads(existing_path.read_text()) if existing_path.exists() else []
  unique={c['id']:c for c in existing}
  for card in base:
   old=unique.get(card['id'],{})
   for key in ['local_preview','image_status','draw_available']:
    if key in old:card[key]=old[key]
   if card.get('local_preview'):card['thumbnail']=card['local_preview']
   unique[card['id']]=card
  return s,list(unique.values()),absent,len({c['source_set_id'] for c in unique.values()}-{s['source_set_id']})

 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
  work={ex.submit(collect,s):s for s in selected}
  for task in concurrent.futures.as_completed(work):
   try:s,cards,miss,subs=task.result()
   except Exception as e:errors.append({'set':work[task]['id'],'error':str(e)});continue
   missing+=miss;variant_count+=subs
   if len(cards)<10:continue
   write(OUT/'sets'/s['id']/'cards.json',cards)
   indexes.append({'id':s['id'],'name':s['name'],'sport':'basketball','year':s['year'],'series':f'篮球 · {s["year"]//10*10}年代','release_date':None,'source_collection_id':s['source_set_id'],'source_goods_type':'basketball','cards_path':f'data/basketball/sets/{s["id"]}/cards.json','card_faces':len(cards),'distinct_card_numbers':len({c['number'] for c in cards}),'source':s['source_url'],'missing_fronts':miss})
   # A small, reproducible show pool; the full card list remains available per set.
   ranked=sorted(cards,key=lambda c:(c['basketball_kind']=='base',c['original_name'] not in NAMES,c['id']))
   pool+=ranked[:4]
   print(f'CARDS {s["id"]} {s["name"]}: {len(cards)} fronts, {subs} variants, {miss} missing',flush=True)
 indexes.sort(key=lambda s:(-s['year'],s['name']))
 write(OUT/'index.json',{'schema_version':1,'sport':'basketball','language':'original','set_count':len(indexes),'card_faces':sum(s['card_faces'] for s in indexes),'sets':indexes})
 write(OUT/'show-pool.json',pool)
 write(OUT/'coverage.json',{'observed_at':datetime.now(timezone.utc).isoformat(),'archive_set_count':len(archive),'archive_year_count':len(years),'playable_set_count':len(indexes),'card_faces_with_front_reference':sum(s['card_faces'] for s in indexes),'variant_checklists':variant_count,'missing_front_entries_excluded':missing,'local_preview_count':sum(bool(c.get('local_preview')) for entry in indexes for c in json.loads((ROOT/entry['cards_path']).read_text())),'errors':errors,'note':'Checklist-wide front references, not a claim of complete worldwide basketball coverage. Full-size image paths are derived from present front thumbnails; local downloads are separately verified.'})
 print('BASE STAGE DONE',len(indexes),sum(s['card_faces'] for s in indexes),'Next: enrich_basketball.py -> cache_basketball_cards.py -> finalize_basketball_assets.py',flush=True)

def previews(per_set):
 index=json.loads((OUT/'index.json').read_text());local=0;failed=[]
 def download(card):
  dest=OUT/'previews'/(card['id'].replace(':','-')+'.webp')
  if not dest.exists():
   image=Image.open(io.BytesIO(fetch(card['source_url'],True))).convert('RGB');image.thumbnail((280,420));dest.parent.mkdir(parents=True,exist_ok=True);image.save(dest,'WEBP',quality=78)
  return card['id'],dest.relative_to(ROOT).as_posix()
 for s in index['sets']:
  path=ROOT/s['cards_path'];cards=json.loads(path.read_text());ranked=sorted(cards,key=lambda c:(c['original_name'] not in NAMES,c['basketball_kind']=='base',c['id']))
  chosen=list({c['id']:c for c in ranked[:per_set]+[next((c for c in cards if c['basketball_kind']==k),cards[0]) for k in ['base','rookie','parallel','auto','memorabilia','numbered']]}.values())
  mapping={}
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
   work={ex.submit(download,c):c for c in chosen}
   for task in concurrent.futures.as_completed(work):
    try:key,url=task.result();mapping[key]=url;local+=1
    except Exception as e:failed.append({'card':work[task]['id'],'error':str(e)})
  for c in cards:
   if c['id'] in mapping:c['thumbnail']=mapping[c['id']];c['local_preview']=mapping[c['id']]
  write(path,cards)
  print(f'PREVIEWS {s["id"]} {len(mapping)}',flush=True)
 pool=json.loads((OUT/'show-pool.json').read_text())
 for c in pool:
  path=OUT/'previews'/(c['id'].replace(':','-')+'.webp')
  if path.exists():c['thumbnail']=path.relative_to(ROOT).as_posix();c['local_preview']=c['thumbnail']
 write(OUT/'show-pool.json',pool)
 coverage=json.loads((OUT/'coverage.json').read_text());coverage.update(local_preview_count=local,preview_errors=failed);write(OUT/'coverage.json',coverage)
 print('VERIFIED PREVIEWS',local,'failed',len(failed),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('command',choices=['catalog','previews']);p.add_argument('--max-sets',type=int,default=140);p.add_argument('--per-set',type=int,default=6);args=p.parse_args()
 if args.command=='catalog':build(args.max_sets)
 else:previews(args.per_set)
