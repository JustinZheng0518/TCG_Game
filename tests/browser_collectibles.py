"""Optional real-browser regression: basketball, mixed grading and card shows.
Run a static server first; requires Playwright and Chromium.
"""
import json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=os.environ.get('TCG_TEST_URL','http://127.0.0.1:8765/')
repo=Path(__file__).resolve().parents[1]
pokemon=json.loads((repo/'data/pokemon/zh-CN/sets/CS1aC/cards.json').read_text())[0]
KEY='TCG_Game:collection:v1'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 for mobile in [False,True]:
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1050},is_mobile=mobile,has_touch=mobile,ignore_https_errors=True)
  ctx.add_init_script('if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps({'version':1,'counts':{pokemon['id']:2}}))+')')
  p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(ROOT,wait_until='domcontentloaded');p.wait_for_function('state.cards.length && state.products')
  p.locator('[data-universe=basketball]').click();p.wait_for_function('state.selected?.id==="BB400618" && state.cards[0]?.sport==="basketball"')
  assert p.locator('#basketball-home').is_visible()
  p.locator('#basketball-home [data-mode=draw]').click();p.locator('#draw-one').click();p.locator('.pack-tear').press('Enter');p.locator('.reveal-card').first.wait_for()
  assert p.locator('.reveal-card').count()==5
  assert p.evaluate('state.lastDraw.every(c=>c.sport==="basketball")')
  p.locator('#opening-skip').click();p.locator('.mode-tabs [data-mode=collection]').click();p.wait_for_function('!state.collectionLoading')
  assert set(p.evaluate('state.collectionCards.map(c=>c.sport||"pokemon")'))=={'pokemon','basketball'}
  p.locator('#collection-sport').select_option('basketball');assert p.evaluate('state.filtered.every(c=>c.sport==="basketball")')
  p.get_by_role('button',name='送评',exact=True).first.click();p.wait_for_function('!state.collectionLoading');p.locator('#grading-service').select_option('express')
  before=p.evaluate('JSON.stringify(state.save)')
  p.evaluate('()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error("quota")}}')
  p.locator('#grading-submit').click();assert p.evaluate('JSON.stringify(state.save)')==before
  p.evaluate('()=>{Storage.prototype.setItem=window.originalSet}');p.locator('#grading-submit').click();p.wait_for_function('state.save.shop.collectibles.jobs.length===1');p.wait_for_function('!state.collectionLoading')
  p.locator('#grading-card').select_option(pokemon['id']);p.locator('#grading-agency').select_option('BGS');p.locator('#grading-submit').click();p.wait_for_function('state.save.shop.collectibles.jobs.length===2')
  results=p.evaluate('JSON.stringify(state.save.shop.collectibles.jobs)');p.reload(wait_until='domcontentloaded');p.wait_for_function('state.cards.length');assert p.evaluate('JSON.stringify(state.save.shop.collectibles.jobs)')==results
  p.evaluate('setMode("grading")');p.locator('#grading-next-day').click();p.wait_for_function('state.save.shop.day===2');p.locator('#grading-collect').click();p.wait_for_function('state.save.shop.collectibles.slabs.length===2')
  assert {s['card']['sport'] for s in p.evaluate('state.save.shop.collectibles.slabs')}=={'pokemon','basketball'}
  p.locator('.slab-show').first.click();p.wait_for_function('state.showPool && !state.showLoading');assert p.locator('.show-offer').count()==12
  p.locator('#show-enter').click();p.locator('.show-buy').first.click();p.wait_for_function('state.save.shop.collectibles.show.used.length===1');assert p.locator('.show-buy').first.is_disabled()
  p.wait_for_function('!state.collectionLoading');p.locator('#show-own').select_option('raw:'+pokemon['id']);p.locator('.show-swap').nth(1).click();p.wait_for_function('state.save.shop.collectibles.show.used.length===2')
  p.wait_for_function('!state.collectionLoading');p.locator('#show-own').select_option('slab:G1');p.locator('#show-sell').click();p.wait_for_function('state.save.shop.collectibles.slabs.length===1')
  assert not p.evaluate('document.documentElement.scrollWidth>innerWidth')
  for image in p.locator('.show-offer img').all():
   image.scroll_into_view_if_needed();image.evaluate('(i)=>i.loading="eager"')
  p.wait_for_function('Array.from(document.querySelectorAll(".show-offer img")).every(i=>i.complete && i.naturalWidth>0)')
  assert not errors,errors
  ctx.close();print('PASS', 'mobile' if mobile else 'desktop','basketball pack, mixed grading, persistence, storage rollback, card show buy/swap/sell and visible faces')
 browser.close()
