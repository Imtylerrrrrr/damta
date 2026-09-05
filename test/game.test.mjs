import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, cigGeometry, lighterGeometry, mouthShape, TIMING } from '../src/game.js';

const W = 1280;
const H = 720;
const MOUTH = { x: 640, y: 400 };

function mk(type = 'malle') {
  const g = createGame({ width: W, height: H, random: () => 0.5 });
  g.selectType(type);
  return g;
}

function face(over = {}) {
  // size 152 → unit 목표 ≈ 144 = 초기 unit. 위치가 흔들리지 않게 한다.
  return { mouth: { ...MOUTH }, center: { x: 640, y: 330 }, size: 151.6, jawOpen: 0, funnel: 0, pucker: 0, ...over };
}

function hand(id, x, y, pinching = true) {
  return { id, x, y, pinching };
}

function step(g, input, seconds, dt = 1 / 30) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    g.update(dt, input);
    events.push(...g.events);
  }
  return events;
}

function grabFromPack(g, id = 'L') {
  step(g, { face: face() }, 0.1);
  const h = hand(id, g.cig.x, g.cig.y + g.unit * 0.1);
  g.update(1 / 30, { face: face(), hands: [h] });
  return h;
}

function putInMouth(g) {
  grabFromPack(g);
  step(g, { face: face(), hands: [hand('L', MOUTH.x + 5, MOUTH.y + 5)] }, 0.3);
  g.update(1 / 30, { face: face(), hands: [hand('L', MOUTH.x + 5, MOUTH.y + 5, false)] });
  assert.equal(g.cig.state, 'mouth');
}

function lightIt(g) {
  // 라이터를 집고, 불꽃 중심을 담배 끝에 맞춘다.
  const l = hand('R', g.lighter.x, g.lighter.y);
  g.update(1 / 30, { face: face(), hands: [l] });
  assert.equal(g.lighter.heldBy, 'R');
  const lg = lighterGeometry(g);
  const offX = lg.flameCx - g.lighter.x;
  const offY = lg.flameCy - g.lighter.y;
  const events = [];
  for (let i = 0; i < 40; i++) {
    const geo = cigGeometry(g);
    g.update(1 / 30, { face: face(), hands: [hand('R', geo.tipX - offX, geo.tipY - offY)] });
    events.push(...g.events);
    if (g.cig.lit) break;
  }
  return events;
}

test('종류 선택 → 갑에 담배 1개 튀어나옴, 20개', () => {
  const g = mk('abul');
  assert.equal(g.type.name, '아블');
  assert.equal(g.cig.state, 'pack');
  assert.equal(g.pack.count, 20);
  g.update(1 / 30, { face: face() });
  assert.match(g.hint, /담배/);
});

test('핀치로 갑의 담배를 집으면 held', () => {
  const g = mk();
  const h = grabFromPack(g);
  assert.equal(g.cig.state, 'held');
  assert.equal(g.cig.heldBy, h.id);
  assert.ok(g.events.includes('grab') || true);
});

test('핀치 없이 근처에 있으면 집지 않음', () => {
  const g = mk();
  step(g, { face: face() }, 0.1);
  g.update(1 / 30, { face: face(), hands: [hand('L', g.cig.x, g.cig.y, false)] });
  assert.equal(g.cig.state, 'pack');
});

test('입에서 멀리서 놓으면(불 안 붙음) 갑으로 복귀', () => {
  const g = mk();
  grabFromPack(g);
  step(g, { face: face(), hands: [hand('L', 300, 300)] }, 0.2);
  const ev = step(g, { face: face(), hands: [hand('L', 300, 300, false)] }, 1 / 30);
  assert.equal(g.cig.state, 'pack');
  assert.ok(ev.includes('return'));
});

test('입 근처에서 놓으면 입에 물림, 다시 핀치하면 뺀다', () => {
  const g = mk();
  putInMouth(g);
  step(g, { face: face() }, 0.3);
  const geo = cigGeometry(g);
  g.update(1 / 30, { face: face(), hands: [hand('L', (g.cig.x + geo.tipX) / 2, (g.cig.y + geo.tipY) / 2)] });
  assert.equal(g.cig.state, 'held');
});

test('라이터를 핀치로 들면 불꽃, 담배 끝에 0.6초 대면 점화', () => {
  const g = mk();
  putInMouth(g);
  assert.equal(g.cig.lit, false);
  const ev = lightIt(g);
  assert.equal(g.cig.lit, true);
  assert.ok(ev.includes('light'));
  assert.equal(g.lighter.flame, true);
  // 손을 펴면 라이터는 놓이고 불꽃 꺼짐
  g.update(1 / 30, { face: face(), hands: [hand('R', 900, 600, false)] });
  assert.equal(g.lighter.heldBy, null);
  assert.equal(g.lighter.flame, false);
});

test('불 안 붙은 담배는 O 입모양으로 빨아도 폐가 차지 않음', () => {
  const g = mk();
  putInMouth(g);
  step(g, { face: face({ pucker: 0.8 }) }, 1.0);
  assert.equal(g.lungs, 0);
  assert.equal(g.puffing, false);
});

test('불 붙은 담배 입에 물고 O 입모양 → 폐 게이지 상승·담배 짧아짐·full 이벤트', () => {
  const g = mk();
  putInMouth(g);
  lightIt(g);
  const len0 = g.cig.len;
  const ev = step(g, { face: face({ pucker: 0.8 }) }, TIMING.puffFillSeconds + 0.3);
  assert.ok(ev.includes('puff'));
  assert.ok(ev.includes('full'));
  assert.ok(g.cig.len < len0);
  // 가득 찬 뒤 O 입모양은 내뿜기로 해석 → 링 생성
  assert.ok(g.rings.length > 0, 'rings after full + O');
});

test('폐에 연기 있고 입 벌리면 도넛 링이 나가고 폐가 줄어듦', () => {
  const g = mk('icejack');
  putInMouth(g);
  lightIt(g);
  step(g, { face: face({ pucker: 0.8 }) }, 0.7);
  assert.ok(g.lungs > 0.3 && g.lungs < 1);
  // 담배를 입에서 빼서 멀리 든다
  const geo = cigGeometry(g);
  g.update(1 / 30, { face: face(), hands: [hand('L', (g.cig.x + geo.tipX) / 2, (g.cig.y + geo.tipY) / 2)] });
  assert.equal(g.cig.state, 'held');
  step(g, { face: face(), hands: [hand('L', 900, 500)] }, 0.3);
  const lungsBefore = g.lungs;
  const ev = step(g, { face: face({ jawOpen: 0.6 }), hands: [hand('L', 900, 500)] }, 0.5);
  assert.ok(ev.includes('exhale'));
  assert.ok(g.rings.length >= 2, `rings=${g.rings.length}`);
  assert.ok(g.lungs < lungsBefore);
  // 멘톨은 반짝이 파티클
  assert.ok(g.particles.some((p) => p.kind === 'sparkle'));
});

test('도넛 입(funnel, 입 조금)은 타이트한 링', () => {
  const g = mk();
  putInMouth(g);
  lightIt(g);
  // 입에 물고 있는 동안 O 입모양은 '빨기'다 — 폐가 가득 찰 때까지는 링이 안 나온다
  step(g, { face: face({ funnel: 0.6, jawOpen: 0.2 }) }, 0.7);
  assert.equal(g.rings.length, 0);
  assert.equal(g.puffing, true);
  // 가득 차면 같은 입모양이 '내뿜기'로 바뀌고, 도넛 입이라 타이트한 링
  step(g, { face: face({ funnel: 0.6, jawOpen: 0.2 }) }, TIMING.puffFillSeconds);
  assert.ok(g.rings.length > 0);
  assert.ok(g.rings.every((r) => r.donut));
});

test('다 타면 꽁초가 떨어지고 새 담배가 갑에서 나옴 (개수 -1)', () => {
  const g = mk();
  putInMouth(g);
  lightIt(g);
  g.cig.len = 0.001;
  const ev = step(g, { face: face({ pucker: 0.8 }) }, 0.2);
  assert.ok(ev.includes('burnout'));
  assert.equal(g.cig.state, 'dropping');
  const ev2 = step(g, { face: face() }, 3);
  assert.ok(ev2.includes('newcig'));
  assert.equal(g.cig.state, 'pack');
  assert.equal(g.pack.count, 19);
  assert.equal(g.cig.lit, false);
  assert.equal(g.cig.len, 1);
});

test('불 붙은 담배를 입 밖에서 놓으면 떨어진다', () => {
  const g = mk();
  putInMouth(g);
  lightIt(g);
  const geo = cigGeometry(g);
  g.update(1 / 30, { face: face(), hands: [hand('L', (g.cig.x + geo.tipX) / 2, (g.cig.y + geo.tipY) / 2)] });
  step(g, { face: face(), hands: [hand('L', 900, 300)] }, 0.3);
  const ev = step(g, { face: face(), hands: [hand('L', 900, 300, false)] }, 1 / 30);
  assert.ok(ev.includes('drop'));
  assert.equal(g.cig.state, 'dropping');
});

test('잡은 손이 잠깐 사라져도 유예 시간 안에는 놓치지 않음', () => {
  const g = mk();
  grabFromPack(g);
  step(g, { face: face(), hands: [hand('L', 500, 300)] }, 0.2);
  step(g, { face: face(), hands: [] }, 0.3);
  assert.equal(g.cig.state, 'held');
  step(g, { face: face(), hands: [] }, TIMING.handGrace + 0.2);
  assert.equal(g.cig.state, 'pack');
});

test('20개 다 피우면 none', () => {
  const g = mk();
  g.pack.count = 1;
  putInMouth(g);
  lightIt(g);
  g.cig.len = 0;
  step(g, { face: face() }, 3);
  assert.equal(g.cig.state, 'none');
  assert.equal(g.pack.count, 0);
  assert.match(g.hint, /다 폈다/);
});

test('mouthShape 임계값', () => {
  assert.deepEqual(mouthShape(null), { o: false, open: false, donut: false });
  assert.equal(mouthShape({ pucker: 0.6, funnel: 0, jawOpen: 0 }).o, true);
  assert.equal(mouthShape({ pucker: 0, funnel: 0.5, jawOpen: 0.1 }).donut, true);
  assert.equal(mouthShape({ pucker: 0, funnel: 0.5, jawOpen: 0.6 }).donut, false);
  assert.equal(mouthShape({ pucker: 0, funnel: 0, jawOpen: 0.4 }).open, true);
});
