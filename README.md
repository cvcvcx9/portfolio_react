# 조창훈 포트폴리오

문제를 쪼개고, 경계를 긋고, 덜어낸 뒤, 검증으로 닫는 백엔드 개발자의 포트폴리오입니다.
메인(`index.html`)은 **일하는 방식 6단계 → 테스트 콘솔 → 이전 작업**, 해결한 문제는 별도 페이지(`cases/index.html`, `/cases/`), 놀이터(젤리 물수제비)는 `play/index.html`(`/play/`, `src/play/`)입니다.
모든 문제는 같은 순서로 적습니다: **문제 → 판단 → 결과**. 문장은 산문 대신 개조식으로 씁니다.

## 실행

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 타입 체크 + dist/ 생성
npm run preview    # 빌드 결과 확인
```

## 기술 스택

| 영역 | 사용 |
| --- | --- |
| 빌드 | Vite 8 · TypeScript |
| 3D | Three.js(GPUComputationRenderer로 GPGPU 파티클 시뮬레이션) · GLSL(curl noise · 스프링) · postprocessing(Bloom · Vignette · Noise) |
| 모션 | GSAP(ScrollTrigger · SplitText) · Lenis |
| 글꼴 | Pretendard Variable · JetBrains Mono Variable(npm 패키지로 자체 호스팅) |

## 구조

```
index.html              모든 본문 콘텐츠(정적 HTML, 자바스크립트 없이도 읽힘)
src/main.ts             부트스트랩: 스크롤 · WebGL 스테이지 · 애니메이션 · 데모 연결
src/gl/stage.ts         렌더러 · GPGPU 시뮬레이션 · 후처리 · 포인터 반발 · 3D 라벨
src/gl/shapes.ts        파티클 목표 형태 9종(planet, split, bound, subtract, loop, grid, console, agent, constellation)
src/gl/glsl.ts          시뮬레이션 · 포인트 · 배경 셰이더
src/ui/*                스크롤(Lenis), 등장 애니메이션, 내비게이션, 커서, 섹션 ↔ 형태 연결
src/demos/*             인터랙티브 데모(배포 · 동기화 · 재시도 · 실패 지문 · 운영일 · 구조 테스트 · 요청 기록)
src/styles/*            토큰 · 레이아웃 · 섹션 · 데모 스타일
```

## 콘텐츠 수정

- 문장과 수치는 `index.html`에서 고칩니다. 섹션마다 `data-shape`(파티클 형태), `data-side`(left · right · center), `data-dim`(밝기)을 지정합니다.
- 새 문제는 같은 틀로 추가합니다: 문제 목록(`.problems__list`)에 한 줄, 본문에 `.case`(제목 = 문제, `.facts` = 상황, `.notes` = 판단 목록(세부 문제 → 판단) + `.result`, `details.record` = 전체 기록).
- 3D 라벨 문구는 `src/gl/shapes.ts`의 `anchor(...)`에 있습니다.
- `prefers-reduced-motion` 사용자는 부드러운 스크롤과 큰 모션 없이 같은 내용을 봅니다. WebGL2를 쓸 수 없으면 정적 배경으로 대체합니다.

## 공개 범위 원칙

- SPOS(사내 프로젝트)는 기술 판단과 공개 가능한 수치만 싣습니다.
- 내부 주소 · 이슈 번호 · 커밋 해시 · 노선/기관명 · 팀원 이름 · 개인 사진은 넣지 않습니다.
- 데모의 경로 · 커밋 SHA · 값은 모두 예시입니다.

## 배포

`vercel.json`이 Vite 프리셋과 빌드 출력(`dist`)을 지정합니다. 이전 Next.js 사이트의 상세 페이지 주소(`/keyProjects/*`, `/projects/*`)는 새 페이지의 해당 위치로 리다이렉트합니다.

## 연락

- GitHub: [cvcvcx9](https://github.com/cvcvcx9)
- Email: cvcvcx9@gmail.com
