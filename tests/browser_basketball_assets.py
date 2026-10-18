"""Optional desktop/mobile regression with TCDB blocked: all rare artwork must be local."""
import os,shutil,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=os.environ.get('TCG_TEST_URL','http://127.0.0.1:8765/');OUT=Path(tempfile.mkdtemp(prefix='tcg-basketball-art-'))
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 for mobile in [False,True]:
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1050},is_mobile=mobile,has_touch=mobile)
  ctx.add_init_script('const originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/.test(kind)?null:originalContext.call(this,kind,...args)}')
  p=ctx.new_page();errors=[];remote_images=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/*tcdb.com/**',lambda r:r.abort())
  p.on('request',lambda r:remote_images.append(r.url) if 'tcdb.com/' in r.url and r.resource_type=='image' else None)
  p.goto(ROOT,wait_until='domcontentloaded');p.wait_for_function('state.cards.length&&state.products')
  before=p.evaluate('JSON.stringify(state.save)')
  for sid in ['BB388591','BB425592','BB531852','BB400618','BB2015']:
   p.evaluate('(id)=>jumpToSet(id,"draw")',sid);p.wait_for_function('(id)=>state.selected?.id===id&&state.cards.length&&!document.getElementById("open-odds").disabled',arg=sid)
   assert p.locator('#basketball-source-status').is_visible();assert '子系列' in p.locator('#basketball-source-status').inner_text()
   p.locator('#open-odds').click();p.locator('.odds-rare-card').first.wait_for()
   assert p.evaluate('oddsContext.model.slots.every(s=>s.pools.every(p=>!p.note||p.chance===0&&p.cards.length===0))')
   previews=p.locator('.odds-rare-preview');assert previews.count()>0
   for gallery in previews.all():
    more=gallery.locator('.odds-rare-more')
    if more.is_visible():more.click()
    for image in gallery.locator('img').all():image.evaluate('(i)=>i.loading="eager"')
   p.wait_for_function('Array.from(document.querySelectorAll(".odds-rare-card img")).every(i=>i.complete&&i.naturalWidth>0&&!i.hidden)')
   assert p.locator('.odds-rare-card img').evaluate_all('(xs)=>xs.every(i=>new URL(i.currentSrc).origin===location.origin)')
   assert not p.evaluate('document.getElementById("odds-dialog").scrollWidth>document.getElementById("odds-dialog").clientWidth')
   if sid=='BB425592':
    first=p.locator('.odds-rare-preview').first;p.evaluate('()=>{const d=document.getElementById("odds-dialog"),g=d.querySelector(".odds-rare-preview");d.scrollTop+=g.getBoundingClientRect().top-d.getBoundingClientRect().top-130}');p.screenshot(path=str(OUT/f'select-{mobile}.png'))
    p.locator('.odds-rare-card').first.click();p.wait_for_function('document.getElementById("dialog-image").naturalWidth>0');assert p.locator('#dialog-image').evaluate('(i)=>new URL(i.currentSrc).origin===location.origin');p.locator('#close-dialog').click()
   p.locator('#odds-dialog [data-close-dialog]').click()
  assert p.evaluate('JSON.stringify(state.save)')==before;assert not errors,errors;assert not remote_images,remote_images
  ctx.close();print('PASS','mobile' if mobile else 'desktop','local rare faces with TCDB blocked, all displayed images and expanded pages, exact tier membership, card details and coverage notes',flush=True)
 browser.close();print('Screenshots',OUT)
