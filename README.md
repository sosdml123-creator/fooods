# 플레이팅 (Plating) - 아키텍처 리팩토링 프로젝트

본 프로젝트는 오늘의집 스타일 푸드 커뮤니티 "플레이팅"의 성능과 확장성을 개선하기 위해 **프론트엔드(Vercel CDN)**와 **백엔드(Render Express API)**로 아키텍처를 물리 분리한 리팩토링 프로젝트입니다.

---

## 🏗️ 전체 시스템 구조

```
                    ┌─────────────────────────┐
                    │      Client Browser     │
                    └────────────┬────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           │ (HTTPS)                                   │ (HTTPS /api)
           ▼                                           ▼
┌─────────────────────────┐                 ┌─────────────────────────┐
│     Vercel Frontend     │                 │    Render Express API   │
│  (Static assets & SW)   │                 │     (Node.js Server)    │
└─────────────────────────┘                 └────────────┬────────────┘
                                                         │
                                    ┌────────────────────┴────────────────────┐
                                    ▼                                         ▼
                       ┌─────────────────────────┐               ┌─────────────────────────┐
                       │      Firebase SDK       │               │      Cloudflare R2      │
                       │ (Auth, Firestore, Msg)  │               │   (Image CDN Storage)   │
                       └─────────────────────────┘               └─────────────────────────┘
```

---

## 📁 프로젝트 폴더 구조

* **`frontend/`**: Vite + React 기반 정적 웹 자산 프로젝트 (Vercel 배포)
* **`backend/`**: Express + Firebase REST / R2 연동 API 서버 (Render 배포)
* **`www/`**: Capacitor 모바일 패키징용 정적 빌드 폴더 (Vite 빌드 아웃풋)

---

## 🚀 배포 방법 가이드

### 1. 프론트엔드 (Vercel 배포)

Vercel은 정적 리소스를 전 세계 CDN 엣지에 캐싱하여 빠른 첫 화면 로딩과 고대역폭 전송을 무상 지원합니다.

1. [Vercel Dashboard](https://vercel.com)에 로그인 후 **Add New Project**를 선택합니다.
2. 깃허브 저장소를 연동하고 **Root Directory**를 `frontend`로 지정합니다.
3. **Build & Development Settings**를 다음과 같이 확인합니다:
   - Build Command: `npm run build`
   - Output Directory: `../www` (Vite 설정에 따름. 또는 `dist`로 수동 조정 가능)
4. **Environment Variables**에 다음 환경 변수를 추가합니다:
   - `VITE_API_URL` = `https://api.myplating.kr` (실제 배포할 Express API 서버 도메인)
5. **Deploy**를 클릭하면 정적 파일 캐시 및 압축이 적용된 프론트엔드가 즉시 엣지 CDN을 통해 서비스됩니다.

### 2. 백엔드 (Render 배포)

Render는 동적 Express API 및 파일 IO를 안정적으로 컨테이너 기반 서빙합니다.

1. [Render Dashboard](https://render.com)에서 **New Web Service**를 생성합니다.
2. 깃허브 저장소를 연동하고 **Root Directory**를 `backend`로 지정합니다.
3. **Build & Start Settings**를 다음과 같이 확인합니다:
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. **Environment Variables (Advanced)**에 다음 환경 변수를 주입합니다:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (Render 내부 포트)
   - `FRONTEND_URL` = `https://myplating.kr` (Vercel 프론트엔드 도메인 - CORS 허용 목적)
   - `BACKEND_URL` = `https://api.myplating.kr` (Render 백엔드 도메인 - 카카오 리다이렉트 목적)
   - `SESSION_SECRET` = `[무작위 해시 문자열]`
   - `KAKAO_CLIENT_ID` = `[카카오 개발자 Client ID]`
   - `R2_ACCESS_KEY_ID` = `[R2 액세스 키]`
   - `R2_SECRET_ACCESS_KEY` = `[R2 시크릿 키]`
   - `R2_ENDPOINT` = `[R2 엔드포인트 URL]`
   - `R2_BUCKET_NAME` = `[R2 버킷명]`
   - `R2_PUBLIC_URL_PREFIX` = `[R2 CDN 퍼블릭 경로]`
   - `FIREBASE_API_KEY` = `[Firebase 프로젝트 API 키]`
5. **Create Web Service**를 완료하면 Render 상에서 API 전용 서버가 구동됩니다.
6. ⚠️ **카카오 개발자 콘솔 설정:**
   - 카카오 개발자 사이트 내 내 애플리케이션 -> 제품 설정 -> 카카오 로그인 -> Redirect URI 항목에 `https://api.myplating.kr/api/redirect` 를 추가 등록해주셔야 정상 로그인 동기화가 가능합니다.

---

## 💻 로컬 개발 환경 구동 방법

로컬에서는 프론트엔드 3000번 포트, 백엔드 4000번 포트로 구동하여 교차 출처(CORS) 연동 테스트를 수행합니다.

### 1단계: 백엔드 실행
```bash
cd backend
npm install
npm run dev
```
- 백엔드 주소: `http://localhost:4000`

### 2단계: 프론트엔드 실행
```bash
cd frontend
npm install
npm run dev
```
- 프론트엔드 주소: `http://localhost:3000`

---

## 🛠️ 성능 및 보안 최적화 내역
1. **정적 파일 전송 최소화:** 프론트엔드 코드를 Vercel CDN으로 옮겨 Render의 네트워크 대역폭 부담을 줄이고 Cold Start의 영향 범위를 API 호출로 한정했습니다.
2. **Helmet 헤더 적용:** 백엔드 Express 보안 취약성 방지를 위해 보안 헤더(XSS 방지, Clickjacking 보호 등)를 강제 장착했습니다.
3. **Compression 압축:** Express API 응답 데이터를 Gzip 압축 전송하여 모바일 하이브리드 환경의 JSON 파싱 속도를 끌어올렸습니다.
4. **ETag 브라우저 캐싱:** ETag 헤더를 활성화하여 변경되지 않은 API 데이터 요청 시 `304 Not Modified`를 반환하도록 하여 서버 네트워크 부하를 줄였습니다.
