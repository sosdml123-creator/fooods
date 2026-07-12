require("dotenv").config(); // 환경변수 로드
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const { corsOptions } = require("./middlewares");
const { syncDbsFromR2, hasR2Config } = require("./firebase");

// 라우터 모듈 로드
const authRouter = require("./routes/auth");
const postsRouter = require("./routes/posts");
const profileRouter = require("./routes/profile");
const uploadRouter = require("./routes/upload");
const adminRouter = require("./routes/admin");

const app = express();
const port = process.env.PORT || 4000;

// Render.com 등 리버스 프록시 환경에서 HTTPS 인식을 위한 설정
app.set('trust proxy', 1);

// HTTP 요청 로깅 (Morgan)
app.use(morgan("combined"));

// ETag 활성화
app.set('etag', true);

// 보안 헤더 설정 (Helmet)
app.use(helmet());

// Gzip 압축 설정 (Compression)
app.use(compression());

// CORS 허용 설정
app.use(corsOptions);

// JSON 및 URL-encoded 바디 파서
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProd = process.env.NODE_ENV === "production" || process.env.PORT !== undefined;

// Express Session 설정
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your session secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24시간
    },
  })
);

// R2에서 파일 데이터베이스(users, posts, reports 등) 동기화 구동
if (hasR2Config) {
  syncDbsFromR2().catch(err => console.error("R2 복원 실행 실패:", err));
}
const path = require("path");

// 서버 기동 시 정적 자산 경로 확인용 로그
const wwwPath = path.resolve(__dirname, "..", "www");
console.log(`[Plating Boot] Static assets path resolved to: ${wwwPath}`);
console.log(`[Plating Boot] index.html exists: ${require("fs").existsSync(path.join(wwwPath, "index.html"))}`);

// 프론트엔드 정적 파일 서빙 (Vite 빌드 결과물인 www 폴더)
app.use(express.static(wwwPath));

// 헬스 체크 API (Render 상태 모니터링용)
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// 웜업 및 핑용 루트 라우트 (Render Cold Start 방지)
app.get("/api", (req, res) => {
  res.json({ success: true, message: "Welcome to Plating API Server!", version: "1.0.0" });
});
app.get("/api/v1", (req, res) => {
  res.json({ success: true, message: "Plating REST API v1 is active!", timestamp: new Date() });
});

// API 라우터 등록 (REST v1 설계 규격 적용)
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", profileRouter);
app.use("/api/v1/upload", uploadRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1", postsRouter); // postsRouter는 내부에 /posts 및 /community 자원을 직접 매핑하고 있음

// SPA Fallback: API/헬스체크 이외의 모든 GET 요청은 index.html을 반환하여 React가 라우팅을 처리하게 함
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/health")) {
    return next();
  }
  
  const indexPath = path.join(wwwPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`[Plating SPA Error] Failed to send index.html: ${err.message}`);
      res.status(404).send("Plating Frontend Asset Not Found. Please check build logs.");
    }
  });
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.message);
  res.status(500).json({ success: false, message: "서버 내부 오류가 발생했습니다: " + err.message });
});

app.listen(port, () => {
  console.log(`🚀 Plating API Server is running at http://localhost:${port}`);
});
