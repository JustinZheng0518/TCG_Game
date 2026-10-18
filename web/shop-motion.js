(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TCGMotion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function axes(x, y, deadzone = .12) {
    const length = Math.hypot(x, y);
    if (length <= deadzone) return {x: 0, y: 0};
    const strength = clamp((length - deadzone) / (1 - deadzone), 0, 1);
    return {x: x / length * strength, y: y / length * strength};
  }
  function displace(position, dx, dz, canWalk) {
    const next = {...position}, steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .055));
    for (let step = 0; step < steps; step++) {
      if (canWalk(next.x + dx / steps, next.z)) next.x += dx / steps;
      if (canWalk(next.x, next.z + dz / steps)) next.z += dz / steps;
    }
    return next;
  }
  function advance(position, velocity, forward, side, heading, dt, canWalk) {
    dt = clamp(dt, 0, .15);
    const length = Math.max(1, Math.hypot(forward, side)), speed = 1.85;
    const target = {x: (Math.sin(heading) * forward + Math.cos(heading) * side) / length * speed,
      z: (-Math.cos(heading) * forward + Math.sin(heading) * side) / length * speed};
    // Integrate exponential acceleration analytically so 30 and 144 Hz travel alike.
    const response = forward || side ? 15 : 23, decay = Math.exp(-response * dt);
    const travel = key => target[key] * dt + (velocity[key] - target[key]) * (1 - decay) / response;
    const next = displace(position, travel("x"), travel("z"), canWalk);
    const result = {x: target.x + (velocity.x - target.x) * decay, z: target.z + (velocity.z - target.z) * decay};
    if (Math.abs(next.x - position.x) < 1e-8) result.x = 0;
    if (Math.abs(next.z - position.z) < 1e-8) result.z = 0;
    if (Math.abs(result.x) < .001) result.x = 0;
    if (Math.abs(result.z) < .001) result.z = 0;
    return {position: next, velocity: result};
  }
  function fov(aspect) {
    return clamp(2 * Math.atan(Math.tan(82 * Math.PI / 360) / aspect) * 180 / Math.PI, 40, 78);
  }
  return {axes, displace, advance, fov, smooth: (current, target, dt) => current + (target - current) * (1 - Math.exp(-22 * dt))};
});
