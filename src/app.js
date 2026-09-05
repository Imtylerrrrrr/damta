import { CIG_TYPES } from './cigs.js';
import { createGame } from './game.js';
import { createRenderer } from './render.js';
import { createTracker } from './tracking.js';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
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
let alternate = false; // 느린 기기: 손/얼굴 모델을 프레임마다 번갈아 실행
let frameNo = 0;
let wakeLock = null;

// ---------- 시작 화면 ----------
for (const t of CIG_TYPES) {
  const card = document.createElement('button');
  card.className = 'card';
  card.type = 'button';
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
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('이 브라우저는 카메라(getUserMedia)를 지원하지 않아요. 크롬/사파리 최신 버전으로 열어줘.');
    }
    if (!tracker) tracker = await createTracker({ onStatus: setStatus });
    if (!video.srcObject) {
      setStatus('카메라 켜는 중… (권한 허용 필요)');
      await startCamera();
    }
    if (!game) {
      game = createGame({ width: canvas.width, height: canvas.height });
      renderer = createRenderer(canvas);
      applyView();
    }
    game.selectType(typeId);
    overlay.hidden = true;
    hud.hidden = false;
    setStatus('');
    requestWakeLock();
    if (!running) {
      running = true;
      lastFrameAt = performance.now();
      requestAnimationFrame(loop);
    }
  } catch (e) {
    console.error(e);
    const msg =
      e?.name === 'NotAllowedError'
        ? '카메라 권한이 거부됐어. 주소창의 🔒(또는 설정 → 사이트 권한)에서 카메라를 허용하고 새로고침해줘.'
        : e?.name === 'NotFoundError'
          ? '카메라를 못 찾았어. 웹캠이 연결돼 있는지 확인해줘.'
          : e?.message || String(e);
    setStatus(msg, true);
  } finally {
    busy = false;
    cardsEl.classList.remove('disabled');
  }
}

// ---------- 카메라 ----------
function cameraConstraints() {
  // 세로 화면(폰)에서는 세로 스트림을 요청해서 object-fit: cover 크롭을 줄인다.
  const portrait = window.innerHeight > window.innerWidth;
  return {
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: portrait ? 720 : 1280 },
      height: { ideal: portrait ? 1280 : 720 },
    },
  };
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener('loadedmetadata', resolve, { once: true });
  });
  await video.play();
  syncCanvasToVideo();
}

function syncCanvasToVideo() {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    game?.resize(w, h);
  }
  applyView();
}

// object-fit: cover 로 잘려 나간 부분을 빼고, 실제로 보이는 캔버스 영역을 게임에 알려준다.
function applyView() {
  if (!game) return;
  const W = canvas.width;
  const H = canvas.height;
  const vw = stage.clientWidth || W;
  const vh = stage.clientHeight || H;
  const scale = Math.max(vw / W, vh / H);
  const w = Math.min(W, vw / scale);
  const h = Math.min(H, vh / scale);
  game.setView({ x: (W - w) / 2, y: (H - h) / 2, w, h });
}

// 기기 회전 → 스트림 크기가 바뀌면 video 'resize' 이벤트가 온다.
video.addEventListener('resize', syncCanvasToVideo);
window.addEventListener('resize', applyView);
window.addEventListener('orientationchange', () => setTimeout(syncCanvasToVideo, 300));

// ---------- 화면 꺼짐 방지 ----------
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running && !wakeLock) requestWakeLock();
});

// ---------- 루프 ----------
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
  lastFrameAt = now;

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    frameNo++;
    try {
      const run = alternate ? { hands: frameNo % 2 === 0, face: frameNo % 2 === 1 } : { hands: true, face: true };
      lastInput = tracker.detect(video, now, canvas.width, canvas.height, run);
      const total = lastInput.ms.hands + lastInput.ms.face;
      if (!alternate && total > 45) alternate = true; // 두 모델 합쳐 45ms 넘으면 번갈아 실행
      else if (alternate && total < 24) alternate = false;
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
