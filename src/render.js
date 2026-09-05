// 캔버스 렌더러. 게임 상태만 읽는다.
import { cigGeometry, lighterGeometry, packGeometry, mouthRadius } from './game.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let debug = false;
  let fps = 0;
  let lastFrame = performance.now();

  function draw(g) {
    const now = performance.now();
    fps = fps * 0.9 + (1000 / Math.max(1, now - lastFrame)) * 0.1;
    lastFrame = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!g.type) return;

    drawPack(ctx, g);
    drawLighter(ctx, g);
    if (g.cig.state !== 'pack' && g.cig.state !== 'none') drawCig(ctx, g);
    drawParticles(ctx, g);
    drawRings(ctx, g);
    drawLightProgress(ctx, g);
    drawHands(ctx, g);
    if (debug) drawDebug(ctx, g, fps);
  }

  return {
    draw,
    setDebug(v) {
      debug = v;
    },
    get debug() {
      return debug;
    },
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ---------- 담뱃갑 ----------
function drawPack(ctx, g) {
  const p = packGeometry(g);
  const t = g.type.pack;
  const r = p.w * 0.08;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = p.w * 0.2;
  ctx.shadowOffsetY = p.w * 0.06;
  roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, r);
  ctx.fillStyle = t.base;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // 열린 입구(안쪽)
  ctx.fillStyle = 'rgba(20,16,14,0.9)';
  roundRect(ctx, -p.w / 2 + p.w * 0.06, -p.h / 2 + p.w * 0.06, p.w * 0.88, p.h * 0.16, r * 0.6);
  ctx.fill();
  // 안쪽 다른 담배들 (필터 원)
  ctx.fillStyle = '#e2c08d';
  const cols = Math.min(4, g.pack.count - 1);
  for (let i = 0; i < cols; i++) {
    ctx.beginPath();
    ctx.arc(-p.w / 2 + p.w * (0.32 + i * 0.18), -p.h / 2 + p.h * 0.12, p.w * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (g.cig.state === 'pack') drawCig(ctx, g);

  // 앞판(담배 앞을 가림)
  ctx.save();
  ctx.translate(p.x, p.y);
  const frontTop = -p.h / 2 + p.h * 0.2;
  ctx.beginPath();
  ctx.roundRect(-p.w / 2, frontTop, p.w, p.h / 2 - frontTop, [0, 0, r, r]);
  ctx.fillStyle = t.base;
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-p.w / 2, frontTop, p.w, p.h * 0.22);
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.fillStyle = t.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 긴 이름(아이스잭)은 갑 폭에 맞춰 글자 크기를 줄인다
  let labelPx = p.w * 0.3;
  ctx.font = `700 ${Math.round(labelPx)}px "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif`;
  const labelW = ctx.measureText(g.type.name).width;
  if (labelW > p.w * 0.88) {
    labelPx *= (p.w * 0.88) / labelW;
    ctx.font = `700 ${Math.round(labelPx)}px "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif`;
  }
  ctx.fillText(g.type.name, 0, p.h * 0.17);
  ctx.font = `500 ${Math.round(p.w * 0.16)}px system-ui, sans-serif`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(`${g.pack.count}개`, 0, p.h * 0.36);
  ctx.globalAlpha = 1;
  // 얇은 테두리
  roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, r);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// ---------- 담배 ----------
function drawCig(ctx, g) {
  const c = g.cig;
  const geo = cigGeometry(g);
  const th = geo.thickness;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = th * 0.6;
  ctx.shadowOffsetY = th * 0.25;

  // 필터
  ctx.fillStyle = '#d7a45f';
  roundRect(ctx, 0, -th / 2, geo.filterLen, th, th * 0.45);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(120,70,20,0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const x = (geo.filterLen * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, -th / 2 + 1);
    ctx.lineTo(x, th / 2 - 1);
    ctx.stroke();
  }
  // 금띠
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(geo.filterLen - th * 0.18, -th / 2, th * 0.18, th);

  // 종이
  if (geo.tobaccoLen > 0.5) {
    ctx.fillStyle = '#f8f5ee';
    ctx.fillRect(geo.filterLen, -th / 2, geo.tobaccoLen, th);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(geo.filterLen, th * 0.2, geo.tobaccoLen, th * 0.3);
  }

  // 재 + 불씨
  if (c.lit) {
    const ashLen = Math.min(geo.tobaccoLen, g.unit * 0.22 * Math.min(1, c.ash / 0.3) + th * 0.3);
    const ax = geo.total - ashLen;
    ctx.fillStyle = '#9d9d9d';
    ctx.fillRect(ax, -th / 2, ashLen, th);
    ctx.fillStyle = '#6b6b6b';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(ax + (ashLen * (i + 0.2)) / 4, -th / 2 + (i % 2) * th * 0.5, ashLen / 8, th * 0.4);
    }
    const flick = 0.8 + Math.sin(g.time * 23) * 0.1 + Math.sin(g.time * 41) * 0.1;
    const glow = c.ember * flick;
    const grad = ctx.createRadialGradient(geo.total - th * 0.3, 0, 0, geo.total - th * 0.3, 0, th * (0.9 + glow * 0.8));
    grad.addColorStop(0, `rgba(255,240,180,${0.9 * glow})`);
    grad.addColorStop(0.35, `rgba(255,120,30,${0.8 * glow})`);
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(geo.total - th * 0.3, 0, th * (0.9 + glow * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,${Math.round(90 + 120 * glow)},20,${0.6 + 0.4 * glow})`;
    ctx.fillRect(geo.total - th * 0.35, -th / 2, th * 0.35, th);
  } else if (geo.tobaccoLen > 0.5) {
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(geo.total - th * 0.12, -th / 2, th * 0.12, th);
  }
  ctx.restore();
}

// ---------- 라이터 ----------
function drawLighter(ctx, g) {
  const lg = lighterGeometry(g);
  const { w, h } = lg;
  ctx.save();
  ctx.translate(lg.x, lg.y);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = w * 0.4;
  ctx.shadowOffsetY = w * 0.1;
  // 몸통
  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  body.addColorStop(0, '#ff8a5b');
  body.addColorStop(0.35, '#ffb08f');
  body.addColorStop(1, '#e0552b');
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h / 2 + h * 0.22, w, h * 0.78, w * 0.18);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // 가스 눈금(반투명 느낌)
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-w * 0.25, -h / 2 + h * 0.4, w * 0.12, h * 0.5);
  // 금속 캡
  const cap = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  cap.addColorStop(0, '#9aa0a8');
  cap.addColorStop(0.5, '#e8ebef');
  cap.addColorStop(1, '#8b9199');
  ctx.fillStyle = cap;
  roundRect(ctx, -w / 2, -h / 2, w, h * 0.26, w * 0.12);
  ctx.fill();
  // 노즐
  ctx.fillStyle = '#5b6068';
  ctx.fillRect(-w * 0.1, -h / 2 - h * 0.03, w * 0.2, h * 0.05);
  // 휠
  ctx.fillStyle = '#c5c9ce';
  ctx.beginPath();
  ctx.arc(w * 0.28, -h / 2 + h * 0.1, w * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (g.lighter.flame) drawFlame(ctx, g, lg);
}

function drawFlame(ctx, g, lg) {
  const x = lg.x;
  const base = lg.flameBaseY;
  const flick = 1 + Math.sin(g.time * 31) * 0.08 + Math.sin(g.time * 53 + 1) * 0.06;
  const fh = (base - lg.flameTipY) * flick;
  const fw = g.unit * 0.075 * (1 + Math.sin(g.time * 19) * 0.08);
  ctx.save();
  // 바깥 광
  const glow = ctx.createRadialGradient(x, base - fh * 0.45, 0, x, base - fh * 0.45, fh * 0.9);
  glow.addColorStop(0, 'rgba(255,170,60,0.35)');
  glow.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, base - fh * 0.45, fh * 0.9, 0, Math.PI * 2);
  ctx.fill();
  // 불꽃 본체
  const flame = (scale, c0, c1, c2) => {
    const h = fh * scale;
    const w = fw * scale;
    ctx.beginPath();
    ctx.moveTo(x, base - h);
    ctx.bezierCurveTo(x + w * 1.1, base - h * 0.45, x + w * 0.9, base + w * 0.2, x, base + w * 0.2);
    ctx.bezierCurveTo(x - w * 0.9, base + w * 0.2, x - w * 1.1, base - h * 0.45, x, base - h);
    const grad = ctx.createLinearGradient(0, base - h, 0, base);
    grad.addColorStop(0, c0);
    grad.addColorStop(0.6, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fill();
  };
  flame(1, 'rgba(255,140,40,0.55)', 'rgba(255,190,80,0.85)', 'rgba(120,160,255,0.9)');
  flame(0.62, 'rgba(255,220,120,0.8)', 'rgba(255,245,200,0.95)', 'rgba(170,200,255,0.9)');
  ctx.restore();
}

// ---------- 파티클/링 ----------
function drawParticles(ctx, g) {
  for (const p of g.particles) {
    const t = p.life / p.maxLife;
    if (p.kind === 'smoke' || p.kind === 'cloud') {
      const a = p.alpha * (1 - t) * (t < 0.15 ? t / 0.15 : 1);
      const [r, gg, b] = p.rgb;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
      grad.addColorStop(0.5, `rgba(${r},${gg},${b},${a * 0.45})`);
      grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'ash') {
      ctx.globalAlpha = p.alpha * (1 - t);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size * 1.6, p.size);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'sparkle') {
      ctx.save();
      ctx.globalAlpha = (1 - t) * p.alpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.seed + g.time * 3);
      const s = p.size * (1 + Math.sin(g.time * 20 + p.seed) * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? s * 3 : s;
        ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawRings(ctx, g) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const r of g.rings) {
    const t = r.life / r.maxLife;
    const fade = Math.pow(1 - t, 1.3) * (t < 0.1 ? t / 0.1 : 1);
    const [cr, cg, cb] = r.rgb;
    const path = () => {
      ctx.beginPath();
      const n = 36;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wob = 1 + 0.05 * Math.sin(3 * a + r.wobble) + 0.03 * Math.sin(5 * a - r.wobble * 1.7);
        const rr = r.r * wob;
        const x = r.x + Math.cos(a) * rr;
        const y = r.y + Math.sin(a) * rr * 0.92;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    path();
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${r.alpha * fade * 0.35})`;
    ctx.lineWidth = r.thickness * 2.2;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${r.alpha * fade})`;
    ctx.lineWidth = r.thickness;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${r.alpha * fade * 0.35})`;
    ctx.lineWidth = r.thickness * 0.35;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- 손·진행·디버그 ----------
function drawHands(ctx, g) {
  for (const h of g.hands) {
    const r = g.unit * 0.06;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.fillStyle = h.pinching ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.pinching ? r * 0.7 : r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawLightProgress(ctx, g) {
  if (g.lightProgress <= 0 || g.cig.lit) return;
  const geo = cigGeometry(g);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,200,80,0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(geo.tipX, geo.tipY, g.unit * 0.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.lightProgress);
  ctx.stroke();
  ctx.restore();
}

function drawDebug(ctx, g, fps) {
  ctx.save();
  ctx.font = '13px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';
  const lines = [
    `fps ${fps.toFixed(0)}  unit ${g.unit.toFixed(0)}  canvas ${ctx.canvas.width}x${ctx.canvas.height}  view ${g.view.w.toFixed(0)}x${g.view.h.toFixed(0)}`,
    `cig ${g.cig.state} lit=${g.cig.lit} len=${g.cig.len.toFixed(2)} ember=${g.cig.ember.toFixed(2)}`,
    `lungs ${g.lungs.toFixed(2)} puff=${g.puffing} exhale=${g.exhaling} light=${g.lightProgress.toFixed(2)}`,
    `lighter held=${g.lighter.heldBy} flame=${g.lighter.flame}`,
  ];
  if (g.face) {
    lines.push(
      `face size=${g.face.size.toFixed(0)} jawOpen=${g.face.jawOpen.toFixed(2)} funnel=${g.face.funnel.toFixed(2)} pucker=${g.face.pucker.toFixed(2)}`,
    );
  } else lines.push('face: none');
  for (const h of g.hands) lines.push(`hand ${h.id} pinch=${h.pinching} ratio=${h.pinchRatio.toFixed(2)}`);
  const x = 12;
  let y = canvasTopOffset(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 6, y - 6, Math.min(ctx.canvas.width - 12, 620), lines.length * 17 + 12);
  ctx.fillStyle = '#9dff9d';
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += 17;
  }
  ctx.strokeStyle = 'rgba(255,255,0,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(g.view.x + 1, g.view.y + 1, g.view.w - 2, g.view.h - 2);
  if (g.face) {
    ctx.strokeStyle = 'rgba(0,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(g.face.mouth.x, g.face.mouth.y, mouthRadius(g), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function canvasTopOffset(ctx) {
  return Math.round(ctx.canvas.height * 0.12);
}
