# 📚 Portfolio – Nextra + React

## 소개

이 레포지토리는 **Nextra 4**와 **Next.js 16** 기반으로 만든 **개인 포트폴리오 사이트**입니다.  
조창훈님의 백엔드·프론트엔드 역량을 한눈에 보여줄 수 있도록 **대표 프로젝트**(갓생루팅, MongoDash)와 **기술 스택**, **연락처** 등을 정리했습니다.

## 주요 기능

- **다크 모드 & Tailwind CSS** 로 깔끔하고 반응형 UI 구현
- **사이드바**에 프로젝트 목록을 하위목록 형태로 표시
- **Scroll‑to‑Top** 버튼, **인‑페이지 목차(TOC)** 등 UX 향상 요소 포함
- **대표 프로젝트** 카드에서 바로 상세 페이지(`keyProjects/godLifeRouting`, `keyProjects/userEventDashboard`) 로 이동 가능

## 기술 스택

| 분야 | 사용 기술 |
|------|-----------|
| **Framework** | Next.js 16, Nextra 4 |
| **Styling**   | Tailwind CSS, vanilla CSS |
| **Language**  | JavaScript (React), MDX |
| **Backend**   | Kotlin, Spring Boot, MySQL, Redis, Kafka |
| **DevOps**    | Docker, Jenkins, GitHub Actions |
| **Cloud**     | AWS, Oracle Cloud |

## 로컬에서 실행하기

```bash
# 레포지토리 클론
git clone https://github.com/cvcvcx9/portfolio_react.git
cd portfolio_react

# 의존성 설치 (npm 혹은 yarn)
npm install   # 또는 yarn install

# 개발 서버 실행
npm run dev   # http://localhost:3000
```

> **Tip**: `npm run dev` 은 Turbopack 기반으로 빠른 HMR을 제공합니다.

## 배포

현재는 **Vercel** 혹은 **Netlify** 와 같은 정적 호스팅 서비스에 배포할 수 있습니다.
```bash
# Vercel CLI 사용 예시
npm i -g vercel
vercel
```

## 연락처

- **GitHub**: [cvcvcx9](https://github.com/cvcvcx9)
- **Email**: cvcvcx9@gmail.com

---

*이 README는 프로젝트를 처음 보는 사람에게 전체적인 흐름을 빠르게 파악시켜 주기 위해 작성되었습니다.*
