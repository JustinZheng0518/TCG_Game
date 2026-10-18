#!/usr/bin/env python3
"""Attach verified local images and rebuild explicit per-set / per-tier coverage.
Run after enrich_basketball.py and cache_basketball_cards.py finish.
"""
import json,collections,argparse
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image
import basketball_assets as a
from enrich_basketball import group,candidates,ROLES

def main():
 p=argparse.ArgumentParser();p.add_argument('--allow-incomplete',action='store_true');args=p.parse_args()
 report_path=a.ROOT.parent/'scratch'/'basketball-image-cache.json';report=json.loads(report_path.read_text()) if report_path.exists() else {}
 if not args.allow_incomplete and (not Path('/workspace/scratch/bb-enrich/metadata-done').exists() or report.get('queued',1)):
  raise SystemExit('Metadata or images still running; refusing to publish incomplete results.')
 index=json.loads((a.OUT/'index.json').read_text());coverage=json.loads((a.OUT/'coverage.json').read_text());local=set();all_ids=set();before_only=0;after_only=0;new_imports=0;subset_total=0;import_total=0;unavailable=[];manifest={};all_tiers=collections.Counter()
 for s in index['sets']:
  audit=json.loads((a.OUT/'subset-audit'/(s['id']+'.json')).read_text());current_cards=json.loads((a.ROOT/s['cards_path']).read_text());audit['imported_subset_count']=len({c['source_set_id'] for c in current_cards}-{s['source_collection_id']});subset_total+=audit['subset_count'];import_total+=audit.get('imported_subset_count',0);new_imports+=len(audit.get('imported_this_run',[]));before=audit.get('before_tiers',{});before_only+=bool(before) and set(before)<={'base','rookie'}
  cards=json.loads((a.ROOT/s['cards_path']).read_text());tiers=collections.Counter();image_counts=collections.Counter()
  for card in cards:
   assert card['id'] not in all_ids,card['id'];all_ids.add(card['id'])
   if card.get('is_chase'):card['rarity']='追逐特卡'+(f' /{card["serial_max"]}' if card.get('serial_max') else '')
   preview=a.OUT/'previews'/(card['id'].replace(':','-')+'.webp')
   if preview.exists():
    with Image.open(preview) as image:image.verify()
    card['local_preview']=preview.relative_to(a.ROOT).as_posix();card['thumbnail']=card['local_preview'];local.add(card['local_preview']);card['image_status']='local_verified';card.pop('draw_available',None)
    manifest[card['id']]={'path':card['local_preview'],'source_url':card['source_url'],**{k:v for k,v in report.get('verified',{}).get(card['id'],{}).items() if k in ['downloaded_from','source_size']}}
   elif card['basketball_kind'] not in ['base','rookie']:
    card['image_status']='awaiting_image';card['draw_available']=False;unavailable.append(card['id'])
   kind=group(card);tiers[kind]+=1
   if card.get('local_preview'):image_counts[kind]+=1
  after_only+=set(tiers)<={'base','rookie'};all_tiers.update(tiers)
  status={}
  for role in ['base','rookie',*ROLES]:
   count=tiers[role];available=sum(group(c)==role and c.get('draw_available') is not False for c in cards)
   source_candidates=len(candidates(audit['subsets'],role)) if role in ROLES else 0
   status[role]={'status':'available' if available else 'pending_assets' if count or source_candidates else 'not_listed','records':count,'available_cards':available,'local_images':image_counts[role],'source_candidates':source_candidates}
  s.update(card_faces=len(cards),distinct_card_numbers=len({c['number'] for c in cards}),source_subset_count=audit['subset_count'],imported_subset_count=audit.get('imported_subset_count',0),rare_local_images=sum(c.get('local_preview') is not None and c['basketball_kind'] not in ['base','rookie'] for c in cards),tier_coverage=status,coverage_status='partial' if audit.get('coverage_status')=='partial' or s.get('missing_fronts',0)>0 or any(c.get('draw_available') is False for c in cards) else audit.get('coverage_status','partial'))
  audit['tiers']=dict(tiers);audit['local_images_by_tier']=dict(image_counts);audit['tier_coverage']=status;a.write(a.OUT/'subset-audit'/(s['id']+'.json'),audit);a.write(a.ROOT/s['cards_path'],cards)
 index['card_faces']=len(all_ids);a.write(a.OUT/'index.json',index)
 coverage.update(observed_at=datetime.now(timezone.utc).isoformat(),card_faces_with_front_reference=len(all_ids),local_preview_count=len(local),audited_set_count=len(index['sets']),source_subset_directory_count=subset_total,variant_checklists=import_total,new_checklists_read=new_imports,before_enrichment_base_rookie_only=before_only,after_enrichment_base_rookie_only=after_only,tiers=dict(all_tiers),rare_image_pending=len(unavailable),preview_errors=list(report.get('errors',{}).values()),note='All playable sets have independently audited insert/parallel directories. Selected full checklists are imported by card family; source directories and images can still be incomplete. Missing assets are never evidence that a physical product lacks a tier.')
 a.write(a.OUT/'coverage.json',coverage);a.write(a.OUT/'local-images.json',{'observed_at':coverage['observed_at'],'verified_count':len(manifest),'cards':manifest,'pending_rare_ids':unavailable})
 print('FINAL',len(index['sets']),'sets',len(all_ids),'cards',len(local),'local images','base-only',before_only,'->',after_only,'rare pending',len(unavailable),'subsets',import_total,'/',subset_total)
if __name__=='__main__':main()
