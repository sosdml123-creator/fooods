require("dotenv").config(); // 환경변수 로드
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const compression = require("compression");
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

// 웜업 및 핑용 루트 라우트 (Render Cold Start 방지)
app.get("/api", (req, res) => {
  res.json({ success: true, message: "Welcome to Plating API Server!", timestamp: new Date() });
});

// API 라우터 등록
app.use("/api", authRouter);
app.use("/api", postsRouter);
app.use("/api", profileRouter);
app.use("/api", uploadRouter);
app.use("/api", adminRouter);

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.message);
  res.status(500).json({ success: false, message: "서버 내부 오류가 발생했습니다: " + err.message });
});

app.listen(port, () => {
  console.log(`🚀 Plating API Server is running at http://localhost:${port}`);
});
