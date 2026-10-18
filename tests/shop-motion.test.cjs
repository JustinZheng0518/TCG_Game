const test = require('node:test');
const assert = require('node:assert/strict');
const Motion = require('../web/shop-motion.js');
const run = (rate, forward=1, side=0) => {
  let p={x:0,z:0},v={x:0,z:0};
  for(let i=0;i<rate*2;i++){const r=Motion.advance(p,v,forward,side,0,1/rate,()=>true);p=r.position;v=r.velocity;}
  return {p,v};
};
test('walking speed and acceleration are stable across frame rates; diagonal movement is normalized',()=>{
  const baseline=run(60);
  for(const rate of [15,30,144]) assert.ok(Math.abs(run(rate).p.z-baseline.p.z)<1e-6);
  const diagonal=run(60,1,1);assert.ok(Math.abs(Math.hypot(diagonal.p.x,diagonal.p.z)-Math.abs(baseline.p.z))<1e-6);
  assert.ok(Math.abs(baseline.p.z)<3.7 && Math.abs(baseline.p.z)>3.5);
});
test('release brakes smoothly and settles quickly without an endless drift',()=>{
  const moving=run(60);let p=moving.p,v=moving.v;
  for(let i=0;i<30;i++){const r=Motion.advance(p,v,0,0,0,1/60,()=>true);p=r.position;v=r.velocity;}
  assert.ok(Math.abs(p.z-moving.p.z)<.09);assert.equal(v.z,0);
});
test('collision substeps prevent tunneling through a thin obstacle and allow wall sliding',()=>{
  const wall=(x,z)=>!(x>.1&&x<.2);
  const p=Motion.displace({x:0,z:0},1,1,wall);
  assert.ok(p.x<=.1);assert.ok(p.z>.99);
});
test('joystick has a deadzone, analog speed and clamped diagonal input; FOV limits distortion',()=>{
  assert.deepEqual(Motion.axes(.05,-.03),{x:0,y:0});
  assert.ok(Motion.axes(.5,0).x>.3&&Motion.axes(.5,0).x<.6);
  assert.ok(Math.abs(Math.hypot(...Object.values(Motion.axes(2,2)))-1)<1e-9);
  for(const a of [.4,.7,1,2,3])assert.ok(Motion.fov(a)>=40&&Motion.fov(a)<=78);
});
