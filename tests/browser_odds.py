"""Optional UI checks for illustrated series browsing and complete probability disclosure."""
import json,os,shutil,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=os.environ.get('TCG_TEST_URL','http://127.0.0.1:8765/')
repo=Path(__file__).resolve().parents[1]
def load(p):return json.loads((repo/p).read_text())
poke=load('data/pokemon/zh-CN/sets/CS1aC/cards.json')[0]
nba=load('data/basketball/sets/BB400618/cards.json')[0]
old=load('data/basketball/sets/BB2067/cards.json')[0]
products=load('data/shop/products.json')['products']
gift=next(k for k,p in products.items() if p['channel']=='gift' and len(load('data/pokemon/zh-CN/sets/'+k+'/cards.json'))>1)
special=next(k for k,p in products.items() if p['channel']=='special')
deck=next(k for k,p in products.items() if p['channel']=='deck')
KEY='TCG_Game:collection:v1';ARTIFACTS=Path(tempfile.mkdtemp(prefix='tcg-odds-ui-'))
def select(p,sid):
 p.evaluate('(id)=>jumpToSet(id,"draw")',sid);p.wait_for_function('(id)=>state.selected?.id===id&&state.cards.length>0&& !document.getElementById("open-odds").disabled',arg=sid)
def open_odds(p):
 p.locator('#open-odds').click();p.locator('.odds-card-row').first.wait_for();assert p.locator('#odds-dialog').is_visible()
def close_odds(p):p.locator('#odds-dialog [data-close-dialog]').click()
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 for mobile in [False,True]:
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1050},is_mobile=mobile,has_touch=mobile,ignore_https_errors=True)
  seed={'version':1,'counts':{c['id']:2 for c in [poke,nba,old]}}
  ctx.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(seed))+');const originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/.test(kind)?null:originalContext.call(this,kind,...args)};')
  p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(ROOT,wait_until='domcontentloaded');p.wait_for_function('state.cards.length&&state.setCovers');p.locator('.mode-tabs [data-mode=draw]').click()
  p.locator('#choose-set').click();p.locator('#channel-filter').select_option('');assert p.locator('.set-button').count()==236
  assert p.locator('.series-cover img').count()==236
  p.wait_for_function('Array.from(document.querySelectorAll(".series-cover img")).slice(0,2).every(i=>i.naturalWidth>0)')
  rect=p.locator('.set-button').first.bounding_box();assert rect['height']>=280
  assert not p.evaluate('document.getElementById("set-picker").scrollWidth>document.getElementById("set-picker").clientWidth')
  p.screenshot(path=str(ARTIFACTS/f'covers-{mobile}.png'),full_page=True)
  p.locator('#set-search').fill('CS1aC');p.locator('.set-button').first.click();p.wait_for_function('state.selected.id==="CS1aC"&&state.cards.length>0')
  before=p.evaluate('JSON.stringify(state.save)');open_odds(p)
  assert '保底' in p.locator('#odds-slots').inner_text()
  chase=p.evaluate('Game.packModel(state.cards).chase.cards[0].id');p.locator('#odds-card-search').fill(chase);assert p.locator('.odds-card-row').count()==1
  assert p.locator('.odds-card-chances').inner_text().find('%')>=0
  p.locator('#odds-card-search').fill('');p.locator('#odds-card-rarity').select_option('RR');assert all('RR' in t for t in p.locator('.odds-card-name span').all_inner_texts())
  assert not p.evaluate('document.getElementById("odds-dialog").scrollWidth>document.getElementById("odds-dialog").clientWidth')
  p.screenshot(path=str(ARTIFACTS/f'odds-{mobile}.png'),full_page=True);close_odds(p);assert p.evaluate('JSON.stringify(state.save)')==before
  select(p,'PROMOSVEVENT05');open_odds(p);content=p.locator('#odds-slots').inner_text();assert all(x in content for x in ['89%','10%','1%']);close_odds(p)
  select(p,special);open_odds(p);assert p.locator('.odds-slot').count()==1;close_odds(p)
  select(p,deck);open_odds(p);assert '60 张' in p.locator('#odds-summary').inner_text();assert '58 张' in p.locator('#odds-slots').inner_text();close_odds(p)
  select(p,gift);open_odds(p);assert '不随机' in p.locator('#odds-notes').inner_text();options=p.locator('#odds-choice option').evaluate_all('(xs)=>xs.map(x=>x.value)');p.locator('#odds-choice').select_option(options[1]);assert p.locator('#reward-card').input_value()==options[1];p.locator('#odds-card-search').fill(options[1]);assert '100%' in p.locator('.odds-card-chances').inner_text();close_odds(p)
  p.locator('[data-universe=basketball]').click();p.wait_for_function('state.selected?.id==="BB400618"&&state.cards.length');p.locator('#basketball-home [data-mode=draw]').click();open_odds(p)
  assert all(t in p.locator('#odds-slots').inner_text() for t in ['基础位','收藏位','低编收藏位','0.1%','1.9%']);close_odds(p)
  p.locator('#choose-set').click();assert p.locator('.series-cover img').count()==150
  p.wait_for_function('Array.from(document.querySelectorAll(".series-cover img")).slice(0,2).every(i=>i.naturalWidth>0)');assert p.locator('.series-cover-kind').first.inner_text()=='卡面预览';p.locator('#set-picker [data-close-dialog]').click()
  p.locator('.mode-tabs [data-mode=events]').click();p.locator('.community-hub [data-mode=grading]').click();p.wait_for_function('!state.collectionLoading');p.locator('#grading-card').select_option(nba['id']);p.locator('#grading-agency').select_option('BGS');p.locator('#grading-probabilities summary').click();assert 'Black Label' in p.locator('#grading-odds').inner_text();assert '0.234256%' in p.locator('#grading-odds').inner_text()
  p.locator('#grading-card').select_option(old['id']);assert '年份磨损' in p.locator('#grading-odds').inner_text();assert 'Black Label' not in p.locator('#grading-odds').inner_text()
  assert not p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not errors,errors
  ctx.close();print('PASS', 'mobile' if mobile else 'desktop','all series covers, category/search, Pokemon/basketball/event/deck/special/selected odds, card search and grading disclosure',flush=True)
 browser.close();print('Screenshots',ARTIFACTS)
