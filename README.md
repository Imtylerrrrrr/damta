# 담타 🚬

손과 입을 웹캠으로 인식해서 담배를 피우는(척하는) 웹 장난감. 재미로 만듦.

**▶ 바로 하기: https://imtylerrrrrr.github.io/damta/** (크롬 + 웹캠, 카메라 허용 필요)

- 담배 4종: **마쎄 · 말레 · 아블 · 아이스잭** (연기 색·농도·민트 반짝임이 다름)
- 🤏 엄지+검지 **핀치**로 갑에서 담배를 집는다 → 입 근처에서 손을 펴면 **입에 물린다**
- 🔥 라이터를 핀치로 들면 불꽃이 켜지고, 담배 끝에 0.6초 대면 불이 붙는다
- 😗 불 붙은 담배를 입에 대고 **'오~'** 입모양을 하면 빨린다 (폐 게이지 ↑, 담배가 타들어간다)
- 😶 빨기가 끝나면 **입을 다물고 잠깐 머금어야** 한다 ('오'를 계속 하고 있으면 안 나감 — 빨기↔내뿜기 루프 방지)
- 🍩 그 다음 **입을 벌리거나 도넛 입**을 하면 도넛(연기 링)이 나간다
- 다 타면 꽁초가 떨어지고 새 담배가 갑에서 나온다 (20개)

## 실행

```bash
npm start          # python3 -m http.server 8787
# → http://localhost:8787  (카메라는 localhost/https 에서만 열림)
```

빌드 없음. MediaPipe Tasks Vision(`@mediapipe/tasks-vision@1.0.1`)과 모델을 CDN에서 바로 받는다. 크롬 권장.

`d` 키 또는 우상단 **디버그** 버튼: FPS·blendshape 값(jawOpen / mouthFunnel / mouthPucker)·핀치 비율을 보여준다. 임계값은 `src/game.js`의 `THRESH`, 핀치 임계값은 `src/tracking.js`의 `PINCH_ON/OFF`.

## 테스트

```bash
npm test           # node --test (게임 상태 기계 15개)
```

## 구조

| 파일 | 역할 |
| --- | --- |
| `src/tracking.js` | MediaPipe HandLandmarker + FaceLandmarker(blendshapes) 래퍼. 미러링된 픽셀 좌표·핀치 히스테리시스·스무딩 |
| `src/game.js` | 상태 기계(갑 → 손 → 입 / 점화 / 빨기 / 내뿜기 / 타들어감)·파티클·링. DOM 의존 없음 |
| `src/render.js` | 캔버스 그리기(갑·라이터·담배·연기·도넛·손 커서·디버그) |
| `src/cigs.js` | 담배 4종 정의 |
| `src/app.js` | 카메라·모델 로딩·루프·HUD |

설계 메모: `docs/superpowers/specs/2026-09-05-damta-design.md`
