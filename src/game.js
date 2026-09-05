// 담타 게임 로직 — DOM/캔버스 의존 없음. 픽셀 좌표(미러링 완료)만 받는다.
import { getCigType } from './cigs.js';

export const THRESH = {
  pucker: 0.45, // 입 오므림(O)
  funnel: 0.3, // 입 동그랗게(O, 도넛)
  jawOpen: 0.25, // 입 벌림
};

export const TIMING = {
  lightSeconds: 0.6,
  puffFillSeconds: 1.4,
  exhaleEmptySeconds: 1.6,
  ringInterval: 0.22,
  handGrace: 0.6,
  holdSeconds: 0.3, // 빨기 끝난 뒤 입을 다물고 머금어야 하는 시간
};

const FILTER_FRAC = 0.27;
const PACK_COUNT = 20;
const MAX_PARTICLES = 400;
const MAX_RINGS = 40;

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

export function mouthShape(face) {
  if (!face) return { o: false, open: false, donut: false, neutral: false };
  const o = face.pucker > THRESH.pucker || face.funnel > THRESH.funnel;
  const open = face.jawOpen > THRESH.jawOpen;
  const donut = face.funnel > THRESH.funnel && face.jawOpen < 0.45;
  const neutral = face.pucker < 0.3 && face.funnel < 0.2 && face.jawOpen < 0.15;
  return { o, open, donut, neutral };
}

// ---------- 지오메트리 (렌더러도 같은 함수를 쓴다) ----------
export function packGeometry(g) {
  const w = g.unit * 0.55;
  const h = g.unit * 0.85;
  return { x: g.pack.x, y: g.pack.y, w, h, top: g.pack.y - h / 2 };
}

export function cigGeometry(g) {
  const L = g.unit;
  const filterLen = L * FILTER_FRAC;
  const tobaccoLen = L * (1 - FILTER_FRAC) * g.cig.len;
  const total = filterLen + tobaccoLen;
  const dx = Math.cos(g.cig.angle);
  const dy = Math.sin(g.cig.angle);
  return {
    L,
    filterLen,
    tobaccoLen,
    total,
    dx,
    dy,
    thickness: L * 0.085,
    tipX: g.cig.x + dx * total,
    tipY: g.cig.y + dy * total,
  };
}

export function lighterGeometry(g) {
  const w = g.unit * 0.26;
  const h = g.unit * 0.5;
  const { x, y } = g.lighter;
  const topY = y - h / 2;
  return {
    x,
    y,
    w,
    h,
    topY,
    flameBaseY: topY - g.unit * 0.04,
    flameTipY: topY - g.unit * 0.36,
    flameCx: x,
    flameCy: topY - g.unit * 0.18,
  };
}

export function mouthRadius(g) {
  return g.unit * 0.38;
}

// ---------- 게임 ----------
export function createGame({ width, height, random = Math.random } = {}) {
  const g = {
    w: width,
    h: height,
    unit: height * 0.2,
    type: null,
    pack: { x: 0, y: 0, count: 0 },
    lighter: { x: 0, y: 0, homeX: 0, homeY: 0, heldBy: null, flame: false, missing: 0 },
    cig: freshCig(),
    lungs: 0,
    puffing: false,
    exhaling: false,
    exhaleLock: false, // 빨기 직후: 입을 다물고 머금기 전까지 내뿜기 금지
    holdTimer: 0,
    lightProgress: 0,
    ringTimer: 0,
    smokeTimer: 0,
    particles: [],
    rings: [],
    events: [],
    hint: '',
    time: 0,
    face: null,
    hands: [],
    random,
  };
  layoutHomes(g);
  g.lighter.x = g.lighter.homeX;
  g.lighter.y = g.lighter.homeY;

  g.selectType = (id) => {
    g.type = getCigType(id);
    g.pack.count = PACK_COUNT;
    g.cig = freshCig();
    g.cig.state = 'pack';
    placeInPack(g);
    g.lighter.heldBy = null;
    g.lighter.flame = false;
    g.lighter.x = g.lighter.homeX;
    g.lighter.y = g.lighter.homeY;
    g.lungs = 0;
    g.puffing = false;
    g.exhaling = false;
    g.exhaleLock = false;
    g.holdTimer = 0;
    g.lightProgress = 0;
    g.particles.length = 0;
    g.rings.length = 0;
    g.events.length = 0;
  };

  g.resize = (w, h) => {
    g.w = w;
    g.h = h;
    layoutHomes(g);
    if (!g.lighter.heldBy) {
      g.lighter.x = g.lighter.homeX;
      g.lighter.y = g.lighter.homeY;
    }
    if (g.cig.state === 'pack') placeInPack(g);
  };

  g.update = (dt, input = {}) => {
    dt = Math.min(Math.max(dt, 0), 0.05);
    g.time += dt;
    g.events.length = 0;
    g.face = input.face ?? null;
    g.hands = input.hands ?? [];
    if (g.face) {
      const target = clamp(g.face.size * 0.95, g.h * 0.12, g.h * 0.4);
      g.unit = lerp(g.unit, target, 0.08);
      layoutHomes(g);
      if (!g.lighter.heldBy) {
        g.lighter.x = lerp(g.lighter.x, g.lighter.homeX, 0.2);
        g.lighter.y = lerp(g.lighter.y, g.lighter.homeY, 0.2);
      }
    }
    if (g.type) {
      handleHands(g, dt);
      updateHeldObjects(g);
      updateLighting(g, dt);
      updateSmoking(g, dt);
      updateBurn(g, dt);
      updateDropping(g, dt);
    }
    updateParticles(g, dt);
    g.hint = computeHint(g);
  };

  return g;
}

function freshCig() {
  return {
    state: 'none',
    x: 0,
    y: 0,
    angle: Math.PI / 2,
    len: 1,
    lit: false,
    ember: 0,
    ash: 0,
    heldBy: null,
    missing: 0,
    vx: 0,
    vy: 0,
    spin: 0,
  };
}

function layoutHomes(g) {
  g.pack.x = g.w * 0.14;
  g.pack.y = g.h * 0.8;
  g.lighter.homeX = g.w * 0.86;
  g.lighter.homeY = g.h * 0.83;
}

function placeInPack(g) {
  const p = packGeometry(g);
  g.cig.x = p.x + p.w * 0.12;
  g.cig.y = p.top - g.unit * 0.3;
  g.cig.angle = Math.PI / 2; // 필터 끝이 위, 몸통은 갑 속으로
}

function emit(g, name) {
  g.events.push(name);
}

// ---------- 손 ----------
function handleHands(g, dt) {
  const seen = new Set(g.hands.map((h) => h.id));
  for (const obj of [g.cig, g.lighter]) {
    if (obj.heldBy == null) continue;
    if (seen.has(obj.heldBy)) {
      obj.missing = 0;
      continue;
    }
    obj.missing += dt;
    if (obj.missing > TIMING.handGrace) release(g, obj);
  }

  for (const hand of g.hands) {
    const holdsCig = g.cig.heldBy === hand.id && g.cig.state === 'held';
    const holdsLighter = g.lighter.heldBy === hand.id;
    if (!hand.pinching) {
      if (holdsCig) release(g, g.cig);
      if (holdsLighter) release(g, g.lighter);
      continue;
    }
    if (holdsCig || holdsLighter) continue;

    const grabR = g.unit * 0.5;
    if (canGrabCig(g, hand, grabR)) {
      g.cig.state = 'held';
      g.cig.heldBy = hand.id;
      g.cig.missing = 0;
      emit(g, 'grab');
    } else if (g.lighter.heldBy == null && dist(hand.x, hand.y, g.lighter.x, g.lighter.y) < grabR) {
      g.lighter.heldBy = hand.id;
      g.lighter.missing = 0;
      g.lighter.flame = true;
      emit(g, 'lighter');
    }
  }
}

function canGrabCig(g, hand, grabR) {
  const c = g.cig;
  if (c.state === 'pack') {
    const ex = c.x + Math.cos(c.angle) * g.unit * 0.35;
    const ey = c.y + Math.sin(c.angle) * g.unit * 0.35;
    return distToSegment(hand.x, hand.y, c.x, c.y, ex, ey) < grabR;
  }
  if (c.state === 'mouth') {
    const geo = cigGeometry(g);
    return distToSegment(hand.x, hand.y, c.x, c.y, geo.tipX, geo.tipY) < grabR;
  }
  return false;
}

function release(g, obj) {
  obj.heldBy = null;
  obj.missing = 0;
  if (obj === g.lighter) {
    g.lighter.flame = false;
    return;
  }
  const c = g.cig;
  if (c.state !== 'held') return;
  if (g.face && dist(c.x, c.y, g.face.mouth.x, g.face.mouth.y) < mouthRadius(g)) {
    c.state = 'mouth';
    emit(g, 'mouth');
  } else if (c.lit) {
    c.state = 'dropping';
    c.vx = (g.random() - 0.5) * g.unit;
    c.vy = -g.unit * 0.4;
    c.spin = (g.random() - 0.5) * 8;
    emit(g, 'drop');
  } else {
    c.state = 'pack';
    placeInPack(g);
    emit(g, 'return');
  }
}

function updateHeldObjects(g) {
  const L = g.unit;
  const c = g.cig;
  if (c.state === 'held') {
    const hand = g.hands.find((h) => h.id === c.heldBy);
    if (hand) {
      let dx = 0;
      let dy = -1;
      if (g.face) {
        dx = g.face.mouth.x - hand.x;
        dy = g.face.mouth.y - hand.y;
        const n = Math.hypot(dx, dy) || 1;
        dx /= n;
        dy /= n;
      }
      const tx = hand.x + dx * L * 0.12;
      const ty = hand.y + dy * L * 0.12;
      c.x = lerp(c.x, tx, 0.55);
      c.y = lerp(c.y, ty, 0.55);
      c.angle = lerpAngle(c.angle, Math.atan2(-dy, -dx), 0.35);
    }
  } else if (c.state === 'mouth' && g.face) {
    c.x = lerp(c.x, g.face.mouth.x, 0.6);
    c.y = lerp(c.y, g.face.mouth.y + L * 0.02, 0.6);
    const side = Math.cos(c.angle) >= 0 ? 1 : -1;
    const target = Math.atan2(Math.sin(0.45), side * Math.cos(0.45));
    c.angle = lerpAngle(c.angle, target, 0.08);
  }

  const l = g.lighter;
  if (l.heldBy != null) {
    const hand = g.hands.find((h) => h.id === l.heldBy);
    if (hand) {
      l.x = hand.x;
      l.y = hand.y;
    }
    l.flame = true;
  } else {
    l.x = lerp(l.x, l.homeX, 0.2);
    l.y = lerp(l.y, l.homeY, 0.2);
    l.flame = false;
  }
}

// ---------- 불 ----------
function updateLighting(g, dt) {
  const c = g.cig;
  const lightable = c.state === 'held' || c.state === 'mouth';
  if (lightable && !c.lit && g.lighter.flame) {
    const geo = cigGeometry(g);
    const lg = lighterGeometry(g);
    if (dist(lg.flameCx, lg.flameCy, geo.tipX, geo.tipY) < g.unit * 0.3) {
      g.lightProgress += dt / TIMING.lightSeconds;
      if (g.random() < 0.5) spawnSpark(g, geo.tipX, geo.tipY);
      if (g.lightProgress >= 1) {
        c.lit = true;
        c.ember = 1;
        c.ash = 0.05;
        g.lightProgress = 0;
        emit(g, 'light');
      }
      return;
    }
  }
  g.lightProgress = Math.max(0, g.lightProgress - dt * 2);
}

// ---------- 빨기 / 내뿜기 ----------
function filterNearMouth(g) {
  const c = g.cig;
  if (!g.face) return false;
  if (c.state === 'mouth') return true;
  if (c.state !== 'held') return false;
  return dist(c.x, c.y, g.face.mouth.x, g.face.mouth.y) < mouthRadius(g);
}

function updateSmoking(g, dt) {
  const c = g.cig;
  const shape = mouthShape(g.face);
  const before = g.lungs;

  const canPuff = c.lit && filterNearMouth(g) && shape.o && g.lungs < 1;
  const wasPuffing = g.puffing;
  g.puffing = canPuff;
  if (g.puffing) {
    if (!wasPuffing) emit(g, 'puff');
    g.lungs = Math.min(1, g.lungs + dt / TIMING.puffFillSeconds);
    c.len = Math.max(0, c.len - dt * 0.05 * g.type.burnRate);
    c.ember = 1;
    c.ash += dt * 0.08;
    if (before < 1 && g.lungs >= 1) emit(g, 'full');
  }
  // 빨기가 끝나면(가득 찼거나 입을 뗐거나) 같은 입모양으로 바로 내뿜지 못한다.
  // 입을 다물고 잠깐 머금은 뒤에야 내뿜기가 열린다 → '오' 유지 시 빨기↔내뿜기 루프 방지.
  if (wasPuffing && !g.puffing) {
    g.exhaleLock = true;
    g.holdTimer = TIMING.holdSeconds;
  }
  if (g.exhaleLock) {
    if (shape.neutral) {
      g.holdTimer -= dt;
      if (g.holdTimer <= 0) {
        g.exhaleLock = false;
        emit(g, 'hold');
      }
    }
    if (g.lungs <= 0.1) g.exhaleLock = false;
  }

  const wantExhale = g.lungs > 0.1 && !g.puffing && !g.exhaleLock && (shape.open || shape.o);
  const wasExhaling = g.exhaling;
  g.exhaling = wantExhale;
  if (g.exhaling) {
    if (!wasExhaling) {
      emit(g, 'exhale');
      g.ringTimer = 0;
    }
    g.ringTimer -= dt;
    if (g.ringTimer <= 0) {
      emitRing(g, shape);
      g.ringTimer = TIMING.ringInterval;
    }
    g.lungs = Math.max(0, g.lungs - dt / TIMING.exhaleEmptySeconds);
  }
}

function emitRing(g, shape) {
  const m = g.face.mouth;
  const open = clamp(g.face.jawOpen, 0, 1);
  const donut = shape.donut && !shape.open;
  const u = g.unit;
  const r = g.random;
  g.rings.push({
    x: m.x,
    y: m.y + u * 0.02,
    r: u * (donut ? 0.1 : 0.12 + open * 0.18),
    thickness: u * (donut ? 0.045 : 0.07 + open * 0.05),
    life: 0,
    maxLife: donut ? 2.6 : 2.0,
    growth: u * (donut ? 0.28 : 0.42),
    vx: (r() - 0.5) * u * 0.15,
    vy: -u * (0.05 + r() * 0.06),
    wobble: r() * Math.PI * 2,
    spin: (r() - 0.5) * 0.6,
    alpha: g.type.smoke.alpha,
    rgb: g.type.smoke.rgb,
    donut,
  });
  if (g.rings.length > MAX_RINGS) g.rings.shift();

  if (!donut) {
    for (let i = 0; i < 4; i++) {
      spawnParticle(g, {
        kind: 'cloud',
        x: m.x + (r() - 0.5) * u * 0.2,
        y: m.y + (r() - 0.5) * u * 0.1,
        vx: (r() - 0.5) * u * 0.5,
        vy: -u * (0.1 + r() * 0.2),
        size: u * (0.12 + r() * 0.12),
        grow: u * 0.18,
        maxLife: 1.6 + r(),
        alpha: g.type.smoke.alpha * 0.5,
        rgb: g.type.smoke.rgb,
      });
    }
  }
  if (g.type.menthol) {
    for (let i = 0; i < 6; i++) {
      spawnParticle(g, {
        kind: 'sparkle',
        x: m.x + (r() - 0.5) * u * 0.3,
        y: m.y + (r() - 0.5) * u * 0.2,
        vx: (r() - 0.5) * u * 0.6,
        vy: -u * (0.1 + r() * 0.3),
        size: u * 0.02,
        grow: 0,
        maxLife: 0.8 + r() * 0.5,
        alpha: 0.9,
        color: g.type.sparkle,
      });
    }
  }
}

// ---------- 타들어감 ----------
function updateBurn(g, dt) {
  const c = g.cig;
  if (!c.lit || c.state === 'dropping' || c.state === 'none') return;
  if (!g.puffing) c.ember = lerp(c.ember, 0.35, dt * 3);
  c.len = Math.max(0, c.len - dt * 0.006 * g.type.burnRate);
  c.ash += dt * 0.02;
  const geo = cigGeometry(g);
  if (c.ash > 0.3) {
    for (let i = 0; i < 5; i++) spawnAsh(g, geo.tipX, geo.tipY);
    c.ash = 0.06;
    emit(g, 'ash');
  }
  g.smokeTimer -= dt;
  if (g.smokeTimer <= 0) {
    g.smokeTimer = g.puffing ? 0.2 : 0.07;
    const u = g.unit;
    const r = g.random;
    spawnParticle(g, {
      kind: 'smoke',
      x: geo.tipX + (r() - 0.5) * u * 0.03,
      y: geo.tipY,
      vx: (r() - 0.5) * u * 0.15,
      vy: -u * (0.25 + r() * 0.2),
      size: u * (0.03 + r() * 0.03),
      grow: u * 0.12,
      maxLife: 1.8 + r() * 1.2,
      alpha: g.type.smoke.alpha * (g.puffing ? 0.3 : 0.55),
      rgb: g.type.smoke.rgb,
    });
  }
  if (c.len <= 0) {
    c.state = 'dropping';
    c.heldBy = null;
    c.vx = (g.random() - 0.5) * g.unit * 0.6;
    c.vy = -g.unit * 0.5;
    c.spin = 5;
    emit(g, 'burnout');
  }
}

function updateDropping(g, dt) {
  const c = g.cig;
  if (c.state !== 'dropping') return;
  c.vy += g.h * 1.8 * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.angle += c.spin * dt;
  if (c.lit && g.random() < 0.3) {
    const geo = cigGeometry(g);
    spawnSpark(g, geo.tipX, geo.tipY);
  }
  if (c.y > g.h + g.unit) nextCig(g);
}

function nextCig(g) {
  g.pack.count = Math.max(0, g.pack.count - 1);
  g.cig = freshCig();
  if (g.pack.count > 0) {
    g.cig.state = 'pack';
    placeInPack(g);
    emit(g, 'newcig');
  } else {
    g.cig.state = 'none';
    emit(g, 'empty');
  }
}

// ---------- 파티클 ----------
function spawnParticle(g, p) {
  g.particles.push({ life: 0, seed: g.random() * 10, ...p });
  if (g.particles.length > MAX_PARTICLES) g.particles.shift();
}

function spawnSpark(g, x, y) {
  const u = g.unit;
  const r = g.random;
  spawnParticle(g, {
    kind: 'spark',
    x,
    y,
    vx: (r() - 0.5) * u * 1.2,
    vy: -u * (0.2 + r() * 0.8),
    size: u * 0.012,
    grow: 0,
    maxLife: 0.3 + r() * 0.3,
    alpha: 1,
    color: '#ffb347',
  });
}

function spawnAsh(g, x, y) {
  const u = g.unit;
  const r = g.random;
  spawnParticle(g, {
    kind: 'ash',
    x: x + (r() - 0.5) * u * 0.04,
    y,
    vx: (r() - 0.5) * u * 0.3,
    vy: u * (0.1 + r() * 0.2),
    size: u * (0.008 + r() * 0.012),
    grow: 0,
    maxLife: 1.2 + r() * 0.6,
    alpha: 0.9,
    color: '#9a9a9a',
  });
}

function updateParticles(g, dt) {
  const u = g.unit;
  const t = g.time;
  const ps = g.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      ps.splice(i, 1);
      continue;
    }
    if (p.kind === 'smoke' || p.kind === 'cloud') {
      p.vx += Math.sin(t * 1.3 + p.seed) * u * 0.5 * dt;
      p.vy -= u * 0.08 * dt;
      p.vx *= 1 - 0.8 * dt;
      p.size += p.grow * dt;
    } else if (p.kind === 'ash' || p.kind === 'spark') {
      p.vy += g.h * (p.kind === 'ash' ? 0.35 : 1.2) * dt;
    } else if (p.kind === 'sparkle') {
      p.vy -= u * 0.2 * dt;
      p.vx *= 1 - 1.5 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  const rs = g.rings;
  for (let i = rs.length - 1; i >= 0; i--) {
    const r = rs[i];
    r.life += dt;
    if (r.life >= r.maxLife) {
      rs.splice(i, 1);
      continue;
    }
    const k = 1 - (r.life / r.maxLife) * 0.6;
    r.r += r.growth * dt * k;
    r.thickness += r.growth * dt * 0.12;
    r.vx += Math.sin(t * 0.9 + r.wobble) * u * 0.2 * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.wobble += r.spin * dt;
  }
}

// ---------- 힌트 ----------
function computeHint(g) {
  if (!g.type) return '';
  const c = g.cig;
  if (c.state === 'none') return '담배 다 폈다! 🚬 다른 종류를 골라봐';
  if (!g.face) return '얼굴이 보이게 카메라 앞에 앉아봐 📷';
  if (g.exhaling) return '후우~ 🍩';
  if (g.puffing) return '쓰~읍…';
  if (g.exhaleLock && g.lungs > 0.1) return '입 다물고 잠깐 머금어… 😶';
  if (g.lungs >= 0.999) return '후~ 입을 벌리거나 도넛 입으로 내뿜어봐 🍩';
  if (c.state === 'pack') {
    return g.hands.length ? '🤏 엄지+검지로 갑에서 담배를 집어봐' : '손을 들어봐 ✋ 엄지+검지로 담배를 집는 거야';
  }
  if (c.state === 'dropping') return '앗… 떨어졌다. 새 담배를 꺼내';
  if (!c.lit) {
    if (c.state === 'mouth') return '🔥 라이터를 집어(핀치) 담배 끝에 갖다 대';
    return '입에 물어 두고(입 근처에서 손 펴기) 라이터로 불 붙여 🔥';
  }
  if (filterNearMouth(g)) return "'오~' 입모양으로 쓰읍 빨아봐";
  if (g.lungs > 0.1) return '후~ 입을 벌리거나 도넛 입으로 내뿜어봐 🍩';
  return "입으로 가져가서 '오~' 하고 빨아봐";
}
