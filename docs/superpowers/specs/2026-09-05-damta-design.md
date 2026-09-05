# 담타(damta) — 손·입 인식 담배 피우기 웹 토이 설계

날짜: 2026-09-05 · 상태: 구현 진행 (자율 실행 모드라 사용자 승인 없이 작성·구현. 요청 문장 자체를 승인으로 간주)

## 목적
재미용. 웹캠 앞에서 손으로 담배를 집어 입에 대고 "오~" 입모양으로 빨고, 입을 벌리거나 도넛 입을 만들면 도넛(연기 링)이 나가는 장난감. 라이터로 불 붙이기 포함.

## 범위
- 담배 4종: 마쎄·말레·아블·아이스잭 (연기 색·농도·민트 반짝임만 다름. 실제 브랜드 표기 없음)
- 손 인식: MediaPipe HandLandmarker (최대 2손). 엄지+검지 끝을 붙이는 **핀치**가 유일한 "잡기" 제스처.
- 얼굴 인식: MediaPipe FaceLandmarker + blendshapes(jawOpen·mouthFunnel·mouthPucker).
- 빌드 없음. 정적 HTML + ES 모듈. CDN(jsdelivr)에서 tasks-vision 1.0.1 로드.

## 상태 기계 (src/game.js — DOM 의존 없음, node 테스트 가능)
담배 `cig.state`: `pack → held → mouth | dropping → pack | none`
- **잡기**: 핀치 중 + 빈손 + 담배(갑에서 튀어나온 부분/입에 물린 담배)에 가까우면 `held`. 라이터도 같은 규칙.
- **놓기**: 핀치 해제. 필터 끝이 입 근처면 `mouth`(입에 물림), 아니면 불 안 붙은 담배는 갑으로 복귀, 불 붙은 담배는 낙하(`dropping`) → 새 담배.
- **손 사라짐 유예** 0.6s: 트래킹 끊겨도 바로 놓치지 않음.
- **불 붙이기**: 라이터를 핀치로 들면 불꽃 ON. 불꽃 끝이 담배 끝에 0.6s 머물면 `lit`.
- **빨기(puff)**: `lit` + 필터가 입 근처 + O 입모양(pucker>0.45 또는 funnel>0.30) + 폐<1 → 폐 게이지 상승(1.4s에 가득), 담배 길이 감소.
- **내뿜기(exhale)**: 폐>0.1 + 빨고 있지 않음 + (jawOpen>0.25 또는 O 입모양) → 0.22s마다 도넛 링 방출, 폐 감소. 폐가 가득 차면 O 입모양은 빨기가 아닌 내뿜기로 해석된다.
- **타들어감**: `lit`이면 천천히 길이 감소·재 축적/낙하. 길이 0 → 꽁초 낙하 → 갑 개수 -1 → 새 담배(0이면 `none`).

## 파일
- `index.html` / `style.css` — 시작 화면(4갑 선택), 비디오·캔버스, HUD·힌트
- `src/tracking.js` — MediaPipe 래퍼. 미러링된 픽셀 좌표의 `{hands:[{id,pinching,x,y}], face:{mouth,size,jawOpen,funnel,pucker}}` 반환. 핀치 히스테리시스·EMA 스무딩.
- `src/game.js` — 상태 기계·파티클·링 (순수 로직)
- `src/render.js` — 캔버스 그리기(갑·라이터·담배·연기·링·손 커서·디버그)
- `src/cigs.js` — 4종 정의
- `src/app.js` — 카메라·모델 로딩·루프·HUD 연결
- `test/game.test.mjs` — `node --test`

## 검증
- 단위 테스트: 잡기/놓기/입에 물기/점화/빨기/내뿜기/타들어감/손 유예.
- 브라우저: `npm start`(python http.server) → Chrome에서 카메라 허용 후 수동 플레이. 임계값은 `d` 키 디버그 오버레이로 조정.

## 가정
- 로컬(localhost) 또는 https에서만 카메라 동작.
- 사운드 없음(요청에 없음).
