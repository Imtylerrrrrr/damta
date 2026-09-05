// MediaPipe Tasks Vision 래퍼. 미러링된 픽셀 좌표와 정리된 신호만 내보낸다.
const VERSION = '1.0.1';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const PINCH_ON = 0.38; // 엄지끝–검지끝 거리 / 손 크기
const PINCH_OFF = 0.55;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;

export async function createTracker({ onStatus = () => {} } = {}) {
  onStatus('MediaPipe 불러오는 중…');
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);

  const make = async (label, factory) => {
    onStatus(`${label} 모델 불러오는 중…`);
    try {
      return await factory('GPU');
    } catch (e) {
      console.warn(`${label}: GPU 실패, CPU로 재시도`, e);
      return await factory('CPU');
    }
  };

  const hands = await make('손', (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  );
  const face = await make('얼굴', (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    }),
  );

  const pinchState = new Map();
  const smooth = { jawOpen: 0, funnel: 0, pucker: 0 };
  let lastTs = -1;

  function detect(video, tsMs, W, H) {
    if (tsMs <= lastTs) tsMs = lastTs + 1;
    lastTs = tsMs;
    const hr = hands.detectForVideo(video, tsMs);
    const fr = face.detectForVideo(video, tsMs);
    return { hands: parseHands(hr, W, H), face: parseFace(fr, W, H) };
  }

  function parseHands(hr, W, H) {
    const out = [];
    const used = new Set();
    const list = hr?.landmarks ?? [];
    for (let i = 0; i < list.length; i++) {
      const lm = list[i];
      const label = hr.handedness?.[i]?.[0]?.categoryName ?? `hand${i}`;
      let id = label;
      if (used.has(id)) id = `${label}2`;
      used.add(id);
      const px = (p) => ({ x: (1 - p.x) * W, y: p.y * H });
      const thumb = px(lm[4]);
      const index = px(lm[8]);
      const handSize = dist(px(lm[0]), px(lm[9])) || 1;
      const ratio = dist(thumb, index) / handSize;
      const prev = pinchState.get(id) ?? false;
      const pinching = prev ? ratio < PINCH_OFF : ratio < PINCH_ON;
      pinchState.set(id, pinching);
      out.push({
        id,
        pinching,
        pinchRatio: ratio,
        x: (thumb.x + index.x) / 2,
        y: (thumb.y + index.y) / 2,
        thumb,
        index,
      });
    }
    for (const id of [...pinchState.keys()]) if (!used.has(id)) pinchState.delete(id);
    return out;
  }

  function parseFace(fr, W, H) {
    const lm = fr?.faceLandmarks?.[0];
    if (!lm) {
      smooth.jawOpen = smooth.funnel = smooth.pucker = 0;
      return null;
    }
    const px = (p) => ({ x: (1 - p.x) * W, y: p.y * H });
    const upper = px(lm[13]);
    const lower = px(lm[14]);
    const size = dist(px(lm[33]), px(lm[263])) || 1;
    const cats = fr.faceBlendshapes?.[0]?.categories ?? [];
    const score = (name) => cats.find((c) => c.categoryName === name)?.score ?? 0;
    smooth.jawOpen = lerp(smooth.jawOpen, score('jawOpen'), 0.5);
    smooth.funnel = lerp(smooth.funnel, score('mouthFunnel'), 0.5);
    smooth.pucker = lerp(smooth.pucker, score('mouthPucker'), 0.5);
    return {
      mouth: { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2 },
      center: px(lm[1]),
      size,
      lipGap: dist(upper, lower) / size,
      jawOpen: smooth.jawOpen,
      funnel: smooth.funnel,
      pucker: smooth.pucker,
    };
  }

  return { detect };
}
