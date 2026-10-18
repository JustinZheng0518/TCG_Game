"""Optional UI regression checks. Start the static server, then run this file.
Requires Playwright and Chromium; TCG_TEST_URL can point to another HTTP server.
"""
import json
import os
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=os.environ.get('TCG_TEST_URL','http://127.0.0.1:8765/')
ARTIFACTS=Path(tempfile.mkdtemp(prefix='tcg-ui-check-'))
repo=Path(__file__).resolve().parents[1]
a=json.loads((repo/'data/pokemon/zh-CN/sets/CS1aC/cards.json').read_text())
bb=json.loads((repo/'data/pokemon/zh-CN/sets/CS1bC/cards.json').read_text())
fixture=[a[0],a[1],bb[-1]];counts={fixture[0]['id']:3,fixture[1]['id']:1,fixture[2]['id']:2}
KEY='TCG_Game:collection:v1'
def ready(p):p.wait_for_function('typeof businessScene!=="undefined" && businessScene && state.cards.length && state.products')
def nav(p,m):p.locator('.mode-tabs [data-mode="'+m+'"]').click()
def collected(p):p.wait_for_function('!state.collectionLoading && state.mode==="collection"')
def snapshot(p):return p.evaluate('JSON.stringify(state.save)')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 for mobile in [False,True]:
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1050},is_mobile=mobile,has_touch=mobile)
  ctx.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps({'version':1,'counts':counts}))+')')
  p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(ROOT,wait_until='domcontentloaded');ready(p)
  assert p.evaluate('businessScene.world.camera.isPerspectiveCamera')
  assert p.evaluate('businessScene.world.camera.position.y')==1.65
  assert p.locator('.store-scene').get_attribute('class').find('is-first-person')>=0
  assert p.locator('#customer-status').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')>=16
  assert not p.evaluate('document.documentElement.scrollWidth>innerWidth')
  # Real keyboard input, not an animated orbit.
  old=p.evaluate('businessScene.world.player.z')
  p.locator('.shop-world-canvas').focus();p.keyboard.down('w');p.wait_for_timeout(650);p.keyboard.up('w')
  assert p.evaluate('businessScene.world.player.z')<old-.1
  # Collision blocks walking into walls and furniture.
  assert p.evaluate('(()=>{const w=businessScene.world;w.player={x:.35,z:3.2};w.lookYaw=0;for(let i=0;i<200;i++)w.walk(1,0,.05);return w.player.z>=-3.65 && !w.canWalk(-1.6,-.6) && !w.canWalk(2.5,.8)})()')
  p.locator('#world-reset').click();assert p.evaluate('businessScene.world.player.z')==3.2
  p.keyboard.down('w');p.wait_for_timeout(350);p.keyboard.up('w');assert p.evaluate('businessScene.world.player.z')<3.15
  p.locator('#world-reset').click()
  # On-screen pad also works for touch and releases keys when lifted.
  pad=p.locator('[data-walk="w"]');pad.scroll_into_view_if_needed();box=pad.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
  if mobile:
   c=ctx.new_cdp_session(p);c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});p.wait_for_timeout(550);c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});c.detach()
  else:p.mouse.move(x,y);p.mouse.down();p.wait_for_timeout(550);p.mouse.up()
  assert p.evaluate('businessScene.world.player.z')<3.1
  assert not p.evaluate('businessScene.world.keys.size')
  p.locator('#world-view').click();assert p.evaluate('businessScene.world.camera.isOrthographicCamera')
  p.locator('#world-view').click();assert p.evaluate('businessScene.world.camera.isPerspectiveCamera')
  p.locator('#world-reset').click()
  # Drag rotates the view. No click action after a drag.
  canvas=p.locator('.shop-world-canvas');box=canvas.bounding_box();x=box['x']+box['width']*.5;y=box['y']+box['height']*.45
  old=p.evaluate('businessScene.world.lookYaw');p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+50,y+10,steps=10);p.mouse.up()
  assert abs(p.evaluate('businessScene.world.lookYaw')-old)>.1
  p.locator('#world-reset').click();p.screenshot(path=str(ARTIFACTS/f'shop-{mobile}.png'),full_page=True)
  p.evaluate('()=>{const w=businessScene.world;w.lookYaw=Math.atan2(2.3-w.player.x,w.player.z-1.39);w.pitch=Math.atan2(.82-1.65,Math.hypot(2.3-w.player.x,1.39-w.player.z));w.updateCamera()}')
  p.locator('.shop-world-canvas').focus();p.keyboard.press('e');p.locator('#desk-dialog[open]').wait_for()
  assert p.locator('[data-desk-pane=stock]').is_visible();p.locator('#desk-dialog [data-close-dialog]').click()
  nav(p,'collection');collected(p)
  assert p.locator('#cards .card-tile').count()==3
  assert set(p.evaluate('state.filtered.map(c=>c.set_id)'))=={'CS1aC','CS1bC'}
  assert p.locator('#set-title').is_hidden() and p.locator('#choose-set').is_hidden()
  assert p.locator('#collection-set').input_value()==''
  assert p.locator('#collection-set option').count()==3
  assert p.locator('.card-name').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=18
  p.screenshot(path=str(ARTIFACTS/f'collection-{mobile}.png'),full_page=True)
  p.locator('#collection-set').select_option('CS1bC');assert p.locator('#cards .card-tile').count()==1
  p.locator('#collection-set').select_option('');p.locator('#card-search').fill('CS1aC');assert p.locator('#cards .card-tile').count()==2
  p.locator('#card-search').fill('')
  p.locator('#sell-duplicates').click();collected(p)
  assert sorted(p.evaluate('Object.values(state.save.counts)'))==[1,1,1]
  assert p.locator('#cards .card-tile').count()==3
  # A card from a different series can be listed directly from the combined album.
  tile=p.locator('.card-tile').filter(has=p.locator('.card-label span',has_text='CS1bC'))
  tile.get_by_role('button',name='上架',exact=True).click();collected(p)
  assert p.locator('#cards .card-tile').count()==2
  nav(p,'shop');p.locator('.counter-spot').click();p.locator('#desk-tabs [data-desk="listings"]').click()
  p.locator('#listing-list button').first.click();p.locator('#desk-dialog [data-close-dialog]').click()
  nav(p,'collection');collected(p);assert p.locator('#cards .card-tile').count()==3
  # Failed storage leaves the collection unchanged and reports the issue.
  before=snapshot(p)
  p.evaluate('()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error("quota")}}')
  p.get_by_role('button',name='上架',exact=True).first.click();assert snapshot(p)==before
  p.evaluate('()=>{Storage.prototype.setItem=window.originalSet}')
  # Set selection for procurement remains independent of the collection filter.
  nav(p,'draw');p.locator('#choose-set').click();p.locator('#set-search').fill('CS1aC')
  p.locator('#set-list .set-button').filter(has=p.locator('small span',has_text='CS1aC')).first.click()
  p.wait_for_function('state.selected.id==="CS1aC" && state.cards.length>0')
  p.locator('#draw-one').click();p.locator('.pack-tear').press('Enter');p.locator('.reveal-card').first.wait_for()
  assert p.locator('.reveal-card').count()==5;p.locator('#opening-skip').click()
  nav(p,'collection');collected(p);assert p.locator('#collection-set').input_value()==''
  assert set(p.evaluate('state.filtered.map(c=>c.set_id)'))=={'CS1aC','CS1bC'}
  # All essential management controls stay reachable with larger fonts.
  p.locator('#open-settings').click()
  for pane in ['tasks','news','ledger','stock','settings']:
   p.locator('#desk-tabs [data-desk="'+pane+'"]').click();assert p.locator('[data-desk-pane="'+pane+'"]').is_visible()
  p.locator('#desk-dialog [data-close-dialog]').click()
  assert not p.evaluate('document.documentElement.scrollWidth>innerWidth')
  assert not errors,errors
  print('PASS', 'mobile touch' if mobile else 'desktop','first-person walk/look, collision, pad release, overview, readable UI, cross-set collection/filter/search, duplicates, list/cancel, storage rollback, opening and manager',flush=True)
  ctx.close()
 # Metadata failure must never silently hide owned cards without a retry.
 ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps({'version':1,'counts':counts}))+')')
 p=ctx.new_page();p.route('**/sets/CS1bC/cards.json',lambda r:r.fulfill(status=503,body='unavailable'))
 p.goto(ROOT,wait_until='domcontentloaded');ready(p);nav(p,'collection');collected(p)
 assert p.locator('#cards .card-tile').count()==2 and p.locator('#retry-collection').is_visible()
 assert p.evaluate('Object.keys(state.save.counts).length')==3 and p.locator('#sell-duplicates').is_disabled()
 p.unroute('**/sets/CS1bC/cards.json');p.locator('#retry-collection').click();collected(p)
 assert p.locator('#cards .card-tile').count()==3 and p.locator('#retry-collection').is_hidden()
 print('PASS collection metadata outage/retry preserves every owned card',flush=True);ctx.close()
 ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script('const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return /webgl/.test(k)?null:get.call(this,k,...a)}')
 p=ctx.new_page();p.goto(ROOT,wait_until='domcontentloaded');ready(p)
 assert p.evaluate('businessScene.world.mode')=='2.5d';p.locator('.supply-spot').click();assert p.locator('#catalog-area').is_visible()
 print('PASS no WebGL: 2.5D scene and actions remain usable',flush=True);ctx.close();browser.close()
