#!/usr/bin/env python3
"""Audit every playable set and import full selected checklists balanced by card family.
Keeps every existing ID and source record; does not claim every source subset was imported.
"""
import concurrent.futures,json,re,collections,time,argparse
from pathlib import Path
import basketball_assets as a
from lxml import html
WORK=a.ROOT.parent/'scratch'/'bb-enrich';WORK.mkdir(parents=True,exist_ok=True)
ROLES=['numbered_low','auto','memorabilia','auto_patch','parallel','insert','numbered','case_hit']
AUTO=re.compile(r'autograph|signature|autographic|\bink\b|penmanship|scripts?|significance|scripted',re.I)
MEM=re.compile(r'jersey|materials|memorabilia|patch|swatch|relic|rise.*shine',re.I)
CHASE=re.compile(r'kaboom|downtown|color blast|blank slate|color wheel|stained glass|genesis|tiger stripe',re.I)
def group(c):
 if c.get('serial_max') and c['serial_max']<=10:return 'numbered_low'
 if c.get('is_chase'):return 'case_hit'
 return c['basketball_kind']
def audit(s):
 dest=a.OUT/'subset-audit'/(s['id']+'.json')
 if dest.exists():return json.loads(dest.read_text())
 url=s['source'].replace('/ViewSet.cfm/','/Inserts.cfm/');doc=html.fromstring(a.fetch(url));vals={};headers=[n.text_content().strip() for n in doc.xpath('//h3') if re.match('(Insert|Parallel) Sets',n.text_content().strip())]
 for n in doc.xpath('//a[contains(@href,"/Checklist.cfm/sid/")]'):
  name=n.text_content().strip();u=n.get('href');m=re.search(r'/sid/(\d+)',u)
  if not name or not m or int(m[1])==s['source_collection_id']:continue
  h=n.xpath('preceding::h3[1]');kind='parallel' if h and h[0].text_content().startswith('Parallel Sets') else 'insert'
  vals[int(m[1])]={'source_set_id':int(m[1]),'name':s['name']+' - '+name,'short':name,'source_url':a.BASE+u,'kind':kind}
 data={'set_id':s['id'],'source_url':url,'headings':headers,'subset_count':len(vals),'subsets':list(vals.values()),'status':'directory_checked'};a.write(dest,data);return data

def candidates(subs,role):
 def matches(v):
  n=v['short'];au=bool(AUTO.search(n));mem=bool(MEM.search(n))
  return {'auto':au and not mem,'auto_patch':au and mem,'memorabilia':mem and not au,'case_hit':bool(CHASE.search(n)),'parallel':v['kind']=='parallel' and not au and not mem,'insert':v['kind']=='insert' and not au and not mem and not CHASE.search(n),'numbered_low':bool(re.search(r'\bGold\b|\bBlack\b|\bRed\b|Superfractor|Emerald|Platinum',n,re.I)) and not au and not mem,'numbered':bool(re.search(r'Blue|Red|Gold|Green|Artist Proof|Spectrum|Aspirations|Status',n,re.I)) and not au and not mem}[role]
 def score(v):
  n=v['short'];priority=0
  if role=='parallel':priority=0 if re.fullmatch('Prizms Silver|Silver|Silver Prizms|Holo|Refractors|Press Proof',n,re.I) else 1
  elif role=='numbered_low':priority=0 if re.fullmatch('Prizms Gold|Gold|Red Refractors|Red Refractor|Black|Prizms Black|Emerald',n,re.I) else 1
  elif role=='numbered':priority=0 if re.fullmatch('Prizms Blue|Blue|Gold Refractors|Blue Refractors|Red|Artist Proof',n,re.I) else 1
  else:priority=bool(re.search(r'Prizm|Refractor|\bGold\b|\bBlack\b|\bBlue\b|\bRed\b|\bGreen\b|Laser|Wave|Hyper|Mojo|Premium',n,re.I))
  return priority,len(n),n
 return sorted([v for v in subs if matches(v)],key=score)

def enrich(s):
 path=a.ROOT/s['cards_path'];cards=json.loads(path.read_text());byid={c['id']:c for c in cards};directory=audit(s);subs=directory['subsets'];by_sid={v['source_set_id']:v for v in subs};seen={c['source_set_id'] for c in cards};checked=[];failures=[]
 # Restore classification from the exact subset, not the parent series title.
 for c in cards:
  v=by_sid.get(c['source_set_id']);c['is_chase']=bool(v and CHASE.search(v['short']))
 before=collections.Counter(group(c) for c in cards)
 parent={'id':s['id'],'year':s['year']}
 # Reparse previously imported checklists too: older versions silently omitted plain-text
 # multi-player/team rows. Preserve IDs and cached metadata, adding only recovered records.
 previous_sids={c['source_set_id'] for c in cards}|{v['source_set_id'] for v in directory.get('imported_this_run',[])}
 for sid in previous_sids:
  if sid not in by_sid:continue
  source=by_sid[sid]
  try:
   rows,_=a.checklist(source,parent,source['kind'])
   for c in rows:
    if c['id'] not in byid:byid[c['id']]=c
  except Exception as e:failures.append({'source_set_id':sid,'name':source['short'],'stage':'reparse_existing','error':str(e)})
 for role in ROLES:
  # Each family is independently researched; a single global subset cap cannot omit entire families.
  if sum(group(c)==role for c in byid.values())>=16:continue
  options=candidates(subs,role)
  for source in options[:6]:
   sid=source['source_set_id']
   if sid in seen:continue
   seen.add(sid)
   try:
    rows,missing=a.checklist(source,parent,source['kind']);checked.append({'source_set_id':sid,'name':source['short'],'family_requested':role,'cards_with_front':len(rows),'missing_fronts':missing})
    for c in rows:
     if c['id'] not in byid:byid[c['id']]=c
    if sum(group(c)==role for c in byid.values())>=16:break
   except Exception as e:failures.append({'source_set_id':sid,'name':source['short'],'error':str(e)})
 result=list(byid.values());after=collections.Counter(group(c) for c in result)
 audit_data={**directory,'imported_subset_count':len({c['source_set_id'] for c in result if c['source_set_id']!=s['source_collection_id']}),'imported_this_run':checked,'import_errors':failures,'card_count':len(result),'before_tiers':dict(before),'tiers':dict(after),'coverage_status':'partial' if len(seen-{s['source_collection_id']})<len(subs) or failures or any(x['missing_fronts'] for x in checked) else 'source_checklists_read'}
 a.write(a.OUT/'subset-audit'/(s['id']+'.json'),audit_data)
 temp=path.with_suffix('.tmp');a.write(temp,result);temp.replace(path)
 # Image worker reads completed snapshots only; it never races these metadata writes.
 a.write(WORK/(s['id']+'.json'),result)
 print('ENRICH',s['id'],s['name'],len(cards),'->',len(result),dict(after),'subsets',audit_data['imported_subset_count'],'/',len(subs),'errors',len(failures),flush=True)
 return s['id']

def main():
 p=argparse.ArgumentParser();p.add_argument('--sets',nargs='*');args=p.parse_args();index=json.loads((a.OUT/'index.json').read_text());sets=[s for s in index['sets'] if not args.sets or s['id'] in args.sets]
 # Recent series first, then older releases. Original card IDs and holdings are never discarded.
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
  jobs={ex.submit(enrich,s):s for s in sets}
  for job in concurrent.futures.as_completed(jobs):
   try:job.result()
   except Exception as e:print('ERROR',jobs[job]['id'],str(e),flush=True)
 (WORK/'metadata-done').write_text('done')
if __name__=='__main__':main()
