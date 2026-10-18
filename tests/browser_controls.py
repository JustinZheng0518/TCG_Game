"""Optional first-person control regression tests; requires Playwright + Chromium."""
import math
import os
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=os.environ.get('TCG_TEST_URL','http://127.0.0.1:8765/')
ARTIFACTS=Path(tempfile.mkdtemp(prefix='tcg-controls-'))
def ready(page):
 page.goto(ROOT,wait_until='domcontentloaded')
 page.wait_for_function('typeof businessScene!=="undefined" && businessScene && state.cards.length')
def position(page):return page.evaluate('({...businessScene.world.player})')
def distance(a,b):return math.hypot(a['x']-b['x'],a['z']-b['z'])
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 ready(page)
 assert page.evaluate('businessScene.world.firstCamera.fov')<65
 canvas=page.locator('.shop-world-canvas');canvas.scroll_into_view_if_needed();r=canvas.bounding_box();x=r['x']+r['width']*.5;y=r['y']+r['height']*.45
 initial=page.evaluate('({yaw:businessScene.world.lookYaw,pitch:businessScene.world.pitch})')
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+110,y-50,steps=12);page.mouse.up();page.wait_for_timeout(200)
 assert page.evaluate('businessScene.world.lookYaw')>initial['yaw']+.2
 assert page.evaluate('businessScene.world.pitch')>initial['pitch']+.05
 assert not page.locator('dialog[open]').count()
 # Braking settles within a short distance and camera height remains stable.
 page.locator('#world-reset').click();canvas.focus();page.keyboard.down('w');page.wait_for_timeout(600);page.keyboard.up('w');stopped=position(page);page.wait_for_timeout(400)
 assert distance(position(page),stopped)<.12
 assert page.evaluate('Math.hypot(businessScene.world.velocity.x,businessScene.world.velocity.z)')<.01
 assert page.evaluate('businessScene.world.camera.position.y')==1.65
 # Modal and lost focus immediately clear inputs and velocity.
 page.keyboard.down('w');page.wait_for_timeout(200);page.evaluate('openDesk("stock")');frozen=position(page);page.wait_for_timeout(250)
 assert distance(position(page),frozen)<.001
 assert page.evaluate('businessScene.world.keys.size')==0
 page.keyboard.up('w');page.locator('#desk-dialog [data-close-dialog]').click()
 page.keyboard.down('w');page.evaluate('window.dispatchEvent(new Event("blur"))');page.keyboard.up('w')
 assert page.evaluate('Math.hypot(businessScene.world.velocity.x,businessScene.world.velocity.z)')==0
 # Opt-in mouse lock is real; Esc reliably releases it.
 page.bring_to_front();page.locator('#world-look').click();page.wait_for_function('document.pointerLockElement===businessScene.world.canvas',timeout=5000)
 yaw=page.evaluate('businessScene.world.lookYaw');page.mouse.move(1000,500,steps=5);page.wait_for_timeout(100)
 assert abs(page.evaluate('businessScene.world.lookYaw')-yaw)>.03
 page.keyboard.press('Escape');page.wait_for_function('document.pointerLockElement===null')
 assert page.locator('#world-look').get_attribute('aria-pressed')=='false'
 # Aiming at the register exposes a clear action button.
 page.locator('#world-reset').click();page.evaluate('()=>{const w=businessScene.world;w.lookYaw=Math.atan2(2.3-w.player.x,w.player.z-1.39);w.pitch=Math.atan2(.82-1.65,Math.hypot(2.3-w.player.x,1.39-w.player.z));w.updateCamera()}')
 page.locator('#world-interact').wait_for(state='visible');page.locator('#world-interact').click();page.locator('#desk-dialog[open]').wait_for();page.locator('#desk-dialog [data-close-dialog]').click()
 page.locator('#world-reset').click();page.screenshot(path=str(ARTIFACTS/'desktop.png'),full_page=True)
 assert not errors,errors
 print('PASS desktop: right/up look direction, stable height, smooth braking, modal/blur stop, mouse lock/Esc, contextual action',flush=True)
 page.close()
 ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));ready(page)
 assert page.locator('.move-joystick').is_visible() and page.locator('.walk-pad').is_hidden()
 assert page.locator('#world-look').is_hidden()
 page.locator('#world-expand').click();page.wait_for_function('businessScene.world.expanded && document.querySelector(".store-scene").clientHeight===innerHeight')
 assert page.locator('.store-scene').bounding_box()['y']==0
 stick=page.locator('.joystick-base');r=stick.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
 canvas=page.locator('.shop-world-canvas').bounding_box();rx=canvas['x']+canvas['width']*.65;ry=canvas['y']+canvas['height']*.43
 c=ctx.new_cdp_session(page)
 def touch(kind,points):c.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
 def finger(i,x,y):return {'id':i,'x':x,'y':y}
 initial=position(page);heading=page.evaluate('businessScene.world.lookYaw')
 touch('touchStart',[finger(1,x,y)])
 touch('touchMove',[finger(1,x+15,y-30)])
 assert page.evaluate('businessScene.world.joy.y')>.3
 touch('touchStart',[finger(1,x+15,y-30),finger(2,rx,ry)])
 touch('touchMove',[finger(1,x+15,y-30),finger(2,rx+65,ry-30)])
 page.wait_for_timeout(600)
 assert distance(position(page),initial)>.2
 assert page.evaluate('businessScene.world.lookYaw')>heading+.1
 touch('touchEnd',[]);stopped=position(page);page.wait_for_timeout(400)
 assert distance(position(page),stopped)<.12
 assert page.evaluate('Math.hypot(businessScene.world.joy.x,businessScene.world.joy.y)')==0
 assert page.evaluate('Math.hypot(businessScene.world.velocity.x,businessScene.world.velocity.z)')<.01
 assert stick.evaluate('e=>e.style.getPropertyValue("--stick-x")')=='0px'
 # Cancellation and a popup while the finger is down must not leave movement stuck.
 touch('touchStart',[finger(3,x,y)]);touch('touchMove',[finger(3,x,y-32)]);page.wait_for_timeout(100);touch('touchCancel',[])
 assert page.evaluate('Math.hypot(businessScene.world.joy.x,businessScene.world.joy.y)')==0
 touch('touchStart',[finger(4,x,y)]);touch('touchMove',[finger(4,x,y-32)]);page.evaluate('openDesk("stock")');frozen=position(page);page.wait_for_timeout(200)
 assert distance(position(page),frozen)<.001
 touch('touchEnd',[]);page.locator('#desk-dialog [data-close-dialog]').click()
 assert page.evaluate('Math.hypot(businessScene.world.velocity.x,businessScene.world.velocity.z)')==0
 # Business remains playable in expanded mode; settlement is above the scene.
 page.locator('#world-business-toggle').click();assert page.evaluate('state.save.shop.business.open')
 page.locator('#world-business-toggle').click();page.locator('#settlement-dialog[open]').wait_for();page.locator('#settlement-continue').click()
 assert page.evaluate('state.save.shop.day')==2
 page.locator('#world-reset').click();page.screenshot(path=str(ARTIFACTS/'mobile-expanded.png'))
 page.locator('.collection-spot').click();page.wait_for_function('state.mode==="collection"')
 assert not page.evaluate('businessScene.world.expanded') and not page.locator('body').get_attribute('class')
 assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
 assert not errors,errors
 print('PASS mobile: simultaneous joystick/look, release and cancel, popup stop, expanded business/settlement, scene exit',flush=True)
 c.detach();ctx.close();browser.close()
