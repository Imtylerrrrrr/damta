import { CIG_TYPES } from './cigs.js';
import { createGame } from './game.js';
import { createRenderer } from './render.js';
import { createTracker } from './tracking.js';

const $ = (sel) => document.querySelector(sel);
const video = $('#cam');
const canvas = $('#scene');
const overlay = $('#overlay');
const hud = $('#hud');
const statusEl = $('#status');
const hintEl = $('#hint');
const lungsFill = $('#lungs-fill');
const brandName = $('#brand-name');
const packCount = $('#pack-count');
const cardsEl = $('#cards');

let game = null;
let tracker = null;
let renderer = null;
let running = false;
let busy = false;
let lastInput = { hands: [], face: null };
let lastVideoTime = -1;
let lastFrameAt = performance.now();

// ---------- 시작 화면 ----------
for (const t of CIG_TYPES) {
  const card = document.createElement('button');
  card.className = 'card';
  card.style.setProperty('--base', t.pack.base);
  card.style.setProperty('--accent', t.pack.accent);
  card.style.setProperty('--label', t.pack.label);
  card.innerHTML = `<span class="card-band"></span><span class="card-name">${t.name}</span><span class="card-tag">${t.tagline}</span>`;
  card.addEventListener('click', () => start(t.id));
  cardsEl.appendChild(card);
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

async function start(typeId) {
  if (busy) return;
  busy = true;
  cardsEl.classList.add('disabled');
  try {
    if (!window.isSecureContext) {
      throw new Error('카메라는 localhost 또는 https에서만 열려요. `npm start` 후 http://localhost:8787 로 접속해줘.');
    }
    if (!tracker) tracker = await createTracker({ onStatus: setStatus });
    if (!video.srcObject) {
      setStatus('카메라 켜는 중… (권한 허용 필요)');
      await startCamera();
    }
    if (!game) {
      game = createGame({ width: canvas.width, height: canvas.height });
      renderer = createRenderer(canvas);
    }
    game.selectType(typeId);
    overlay.hidden = true;
    hud.hidden = false;
    setStatus('');
    if (!running) {
      running = true;
      lastFrameAt = performance.now();
      requestAnimationFrame(loop);
    }
  } catch (e) {
    console.error(e);
    const msg =
      e?.name === 'NotAllowedError'
        ? '카메라 권한이 거부됐어. 주소창 왼쪽 🔒 → 카메라 허용 후 새로고침해줘.'
        : e?.name === 'NotFoundError'
          ? '카메라를 못 찾았어. 웹캠이 연결돼 있는지 확인해줘.'
          : e?.message || String(e);
    setStatus(msg, true);
  } finally {
    busy = false;
    cardsEl.classList.remove('disabled');
  }
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener('loadedmetadata', resolve, { once: true });
  });
  await video.play();
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
}

// ---------- 루프 ----------
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
  lastFrameAt = now;

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      lastInput = tracker.detect(video, now, canvas.width, canvas.height);
    } catch (e) {
      console.warn('detect 실패', e);
    }
  }

  game.update(dt, lastInput);
  renderer.draw(game);
  updateHud();
  requestAnimationFrame(loop);
}

function updateHud() {
  hintEl.textContent = game.hint;
  lungsFill.style.height = `${Math.round(game.lungs * 100)}%`;
  lungsFill.classList.toggle('full', game.lungs >= 0.999);
  brandName.textContent = game.type.name;
  packCount.textContent = `${game.pack.count}개 남음`;
}

// ---------- 버튼/키 ----------
$('#btn-change').addEventListener('click', () => {
  overlay.hidden = false;
});
$('#btn-debug').addEventListener('click', toggleDebug);
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') toggleDebug();
  if (e.key === 'Escape' && game) overlay.hidden = !overlay.hidden;
});
function toggleDebug() {
  if (!renderer) return;
  renderer.setDebug(!renderer.debug);
  $('#btn-debug').classList.toggle('on', renderer.debug);
}
