"""Numbered basketball copies retain their identity through UI operations, fully offline art fallback."""
import json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=os.environ.get('TCG_TEST_URL','http://127.0.0.1:8765/')
repo=Path(__file__).resolve().parents[1]
card=next(c for c in json.loads((repo/'data/basketball/sets/BB9509/cards.json').read_text()) if c.get('serial_max')==50)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for mobile in [False,True]:
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},is_mobile=mobile,has_touch=mobile)
  ctx.add_init_script('const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return /webgl/.test(k)?null:old.call(this,k,...a)}')
  p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/data/basketball/previews/**',lambda r:r.abort());p.route('**/*tcdb.com/**',lambda r:r.abort())
  p.goto(ROOT,wait_until='domcontentloaded');p.wait_for_function('state.cards.length&&state.products')
  p.evaluate('(id)=>{const s=Shop.validate({version:1,counts:{[id]:2}});s.shop.cash=1000000;persistSave(s);setMode("collection")}',card['id']);p.wait_for_function('!state.collectionLoading&&state.save.shop.collectibles.rawCopies.length===2')
  copies=p.evaluate('state.save.shop.collectibles.rawCopies');assert copies[0]['instance_id']!=copies[1]['instance_id']
  p.wait_for_function('document.querySelectorAll("#cards .card-tile").length===2&&Array.from(document.querySelectorAll("#cards img")).every(i=>i.complete&&i.naturalWidth===600&&!i.hidden)')
  assert not p.evaluate('document.documentElement.scrollWidth>innerWidth')
  p.locator('#cards .card-tile').nth(1).get_by_role('button',name='送评',exact=True).click();p.wait_for_function('!state.collectionLoading');assert p.locator('#grading-card').input_value()==copies[1]['instance_id']
  p.locator('#grading-service').select_option('express');p.locator('#grading-submit').click();p.wait_for_function('state.save.shop.collectibles.jobs.length===1&&!state.collectionLoading')
  job=p.evaluate('state.save.shop.collectibles.jobs[0]');assert job['card']['instance_id']==copies[1]['instance_id'];assert job['card']['serial_number']==copies[1]['serial_number']
  p.reload(wait_until='domcontentloaded');p.wait_for_function('state.cards.length&&state.products');assert p.evaluate('state.save.shop.collectibles.jobs[0].card.serial_number')==copies[1]['serial_number']
  p.evaluate('setMode("grading")');p.locator('#grading-next-day').click();p.wait_for_function('state.save.shop.day===2');p.locator('#grading-collect').click();p.wait_for_function('state.save.shop.collectibles.slabs.length===1');assert p.evaluate('state.save.shop.collectibles.slabs[0].card.instance_id')==copies[1]['instance_id']
  p.locator('.slab-show').first.click();p.wait_for_function('state.showPool&&!state.showLoading');p.locator('#show-enter').click();p.locator('#show-own').select_option('raw:'+copies[0]['instance_id']);p.locator('#show-sell').click();p.wait_for_function('state.save.shop.collectibles.rawCopies.length===0');assert p.evaluate('state.save.shop.collectibles.slabs[0].card.serial_number')==copies[1]['serial_number']
  assert not errors,errors
  ctx.close();print('PASS', 'mobile' if mobile else 'desktop','offline generated faces, legacy migration, per-copy selection, grading/reload and card show sale preserve exact serial',flush=True)
 browser.close()
