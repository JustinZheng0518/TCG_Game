#!/usr/bin/env python3
"""Cache every nonordinary card face, including newly enriched snapshots.
Never edits card metadata while enrichment is running. Writes verified assets + a manifest.
"""
import argparse,concurrent.futures,io,json,time,re
from pathlib import Path
from PIL import Image
import basketball_assets as a
WORK=a.ROOT.parent/'scratch'/'bb-enrich'
REPORT=a.ROOT.parent/'scratch'/'basketball-image-cache.json'
def download(card):
 dest=a.OUT/'previews'/(card['id'].replace(':','-')+'.webp');dest.parent.mkdir(exist_ok=True,parents=True)
 if dest.exists():
  with Image.open(dest) as image:image.verify()
  return {'id':card['id'],'image':dest.relative_to(a.ROOT).as_posix(),'source_url':card['source_url']}
 error=None
 # Both addresses refer to the very same card; a thumbnail is a resolution fallback, not a different card.
 thumb=card['source_url'].replace('/Images/Cards/','/Images/Thumbs/');thumb=re.sub(r'/(\d+)-([^/]+)Fr\.jpg$',r'/\1_\2Thumb.jpg',thumb)
 for url in dict.fromkeys([card['source_url'],thumb]):
  try:
   data=a.fetch(url,True)
   with Image.open(io.BytesIO(data)) as image:
    image.load();width,height=image.size
    if width<60 or height<60:raise ValueError('Image too small')
    image=image.convert('RGB');image.thumbnail((280,420));temp=dest.with_suffix('.tmp');image.save(temp,'WEBP',quality=78);temp.replace(dest)
   return {'id':card['id'],'image':dest.relative_to(a.ROOT).as_posix(),'source_url':card['source_url'],'downloaded_from':url,'source_size':[width,height]}
  except Exception as e:error=str(e)
 raise ValueError(error)
def main():
 p=argparse.ArgumentParser();p.add_argument('--follow-enrichment',action='store_true');p.add_argument('--workers',type=int,default=3);p.add_argument('--interval',type=float,default=.3);args=p.parse_args();a.REQUEST_INTERVAL=max(.15,args.interval)
 index=json.loads((a.OUT/'index.json').read_text());seen=set();scanned=set();jobs={};results={};errors={};last_report=0
 def add_cards(cards,executor):
  for c in cards:
   if c['basketball_kind'] in ['base','rookie'] or c['id'] in seen:continue
   seen.add(c['id']);jobs[executor.submit(download,c)]=c
 with concurrent.futures.ThreadPoolExecutor(max_workers=min(4,max(1,args.workers))) as executor:
  for s in index['sets']:add_cards(json.loads((a.ROOT/s['cards_path']).read_text()),executor)
  while True:
   if args.follow_enrichment:
    for path in WORK.glob('BB*.json'):
     if path.name in scanned:continue
     try:add_cards(json.loads(path.read_text()),executor);scanned.add(path.name)
     except json.JSONDecodeError:continue
   for f in list(jobs):
    if f.done():
     card=jobs.pop(f)
     try:results[card['id']]=f.result()
     except Exception as e:errors[card['id']]={'id':card['id'],'source_url':card['source_url'],'error':str(e)}
   if time.monotonic()-last_report>20:
    REPORT.write_text(json.dumps({'verified':results,'errors':errors,'queued':len(jobs),'total':len(seen)},ensure_ascii=False,indent=2)+'\n');last_report=time.monotonic();print('IMAGES',len(results),'verified',len(jobs),'queued',len(errors),'failed','sets',len(scanned),flush=True)
   if not jobs and (not args.follow_enrichment or (WORK/'metadata-done').exists() and len(scanned)==index['set_count']):break
   time.sleep(1)
 REPORT.write_text(json.dumps({'verified':results,'errors':errors,'queued':0,'total':len(seen)},ensure_ascii=False,indent=2)+'\n');print('DONE IMAGES',len(results),'failed',len(errors),flush=True)
if __name__=='__main__':main()
