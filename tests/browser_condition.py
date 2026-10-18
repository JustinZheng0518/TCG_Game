"""Desktop/mobile: inspect acquired condition and grade the selected exact copy without reroll."""
import json,os,shutil,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=os.environ.get('TCG_TEST_URL','http://127.0.0.1:8765/');repo=Path(__file__).resolve().parents[1];OUT=Path(tempfile.mkdtemp(prefix='tcg-condition-'))
poke=json.loads((repo/'data/pokemon/zh-CN/sets/CS1aC/cards.json').read_text())[0]
nba=next(c for c in json.loads((repo/'data/basketball/sets/BB9509/cards.json').read_text()) if c.get('serial_max')==50)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for mobile in [False,True]:
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},is_mobile=mobile,has_touch=mobile)
  ctx.add_init_script('const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return /webgl/.test(k)?null:old.call(this,k,...a)}')
  p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(ROOT,wait_until='domcontentloaded');p.wait_for_function('state.cards.length&&state.products')
  p.evaluate('([poke,nba])=>{const s=Shop.validate({version:1,counts:{}});s.shop.cash=1000000;const cards=[...TCGCollectiblesState.addRaw(s,[poke,nba],()=>.99),...TCGCollectiblesState.addRaw(s,[poke,nba],()=>0)];persistSave(s);state.lastDraw=cards;setMode("draw");opening.open(cards,"品相检查",4)}',[poke,nba])
  acquired=p.evaluate('state.save.shop.collectibles.rawCopies');p.locator('.pack-tear').press('Enter');p.locator('.reveal-card').first.wait_for()
  p.locator('.reveal-card').nth(3).click();p.locator('.reveal-card').nth(3).click();p.wait_for_function('document.getElementById("card-dialog").open')
  assert ('居中 '+str(acquired[3]['condition']['centering']).removesuffix('.0')) in p.locator('#dialog-condition').inner_text()
  p.locator('#dialog-grade').click();p.wait_for_function('!state.collectionLoading&&state.mode==="grading"');assert not p.locator('#opening-dialog').is_visible();assert p.locator('#grading-card').input_value()==acquired[3]['instance_id']
  assert p.locator('#grading-condition').inner_text().startswith('居中');assert '评级后回收' in p.locator('#grading-quote').inner_text()
  p.locator('#grading-service').select_option('express');p.locator('#grading-submit').click();p.wait_for_function('state.save.shop.collectibles.jobs.length===1&&!state.collectionLoading')
  job=p.evaluate('state.save.shop.collectibles.jobs[0]');assert job['card']['instance_id']==acquired[3]['instance_id'];assert job['condition']==acquired[3]['condition']
  p.reload(wait_until='domcontentloaded');p.wait_for_function('state.cards.length&&state.products');assert p.evaluate('state.save.shop.collectibles.jobs[0].condition')==acquired[3]['condition']
  p.evaluate('setMode("collection")');p.wait_for_function('!state.collectionLoading');assert p.locator('.condition-badge').count()==3;assert set(p.locator('.condition-badge').all_inner_texts())=={'完好','明显磨损'}
  p.locator('#cards img').evaluate_all('(xs)=>xs.forEach(i=>i.loading="eager")');p.wait_for_function('Array.from(document.querySelectorAll("#cards img")).every(i=>i.complete&&i.naturalWidth>0)');assert not p.evaluate('document.documentElement.scrollWidth>innerWidth')
  p.screenshot(path=str(OUT/f'collection-{mobile}.png'));p.locator('.condition-badge').first.click();p.wait_for_function('document.getElementById("dialog-image").naturalWidth>0');p.screenshot(path=str(OUT/f'inspect-{mobile}.png'))
  assert '虚拟' not in p.locator('#card-dialog').inner_text();assert not errors,errors
  ctx.close();print('PASS','mobile' if mobile else 'desktop','open-time condition, per-copy inspection, direct grading navigation, original condition persisted, full-art display',flush=True)
 browser.close();print('Screenshots',OUT)
