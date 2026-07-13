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

// 보안 헤더 설정 (Helmet - Firebase, Kakao OAuth, AdMob 허용하는 CSP 정책 적용)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "*.googleapis.com",
          "firestore.googleapis.com",
          "identitytoolkit.googleapis.com",
          "wss://*.firebaseio.com",
          "*.firebaseio.com",
          "*.firebaseapp.com",
          "kauth.kakao.com",
          "kapi.kakao.com",
          "*.doubleclick.net",
          "*.googleadservices.com",
          "*.googlesyndication.com"
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "apis.google.com",
          "www.gstatic.com",
          "pagead2.googlesyndication.com",
          "*.googlesyndication.com",
          "*.googleadservices.com",
          "cdn.jsdelivr.net",
          "cdn.tailwindcss.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "fonts.googleapis.com",
          "cdnjs.cloudflare.com",
          "cdn.jsdelivr.net"
        ],
        fontSrc: [
          "'self'",
          "fonts.gstatic.com",
          "cdnjs.cloudflare.com",
          "cdn.jsdelivr.net"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https:"
        ],
        frameSrc: [
          "'self'",
          "accounts.kakao.com",
          "*.firebaseapp.com",
          "*.doubleclick.net",
          "googleads.g.doubleclick.net"
        ]
      }
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false
  })
);

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
let dbSynced = false;
if (hasR2Config) {
  syncDbsFromR2()
    .then(() => { dbSynced = true; })
    .catch(err => console.error("R2 복원 실행 실패:", err));
}

// Vercel 서버리스 콜드 스타트 시 데이터베이스 동기화 완료를 보장하는 미들웨어
app.use(async (req, res, next) => {
  if (!dbSynced && process.env.VERCEL && hasR2Config) {
    console.log("🔄 [Vercel Cold Start] Waiting for lazy database sync from R2...");
    try {
      await syncDbsFromR2();
      dbSynced = true;
      console.log("✅ [Vercel Cold Start] Lazy database sync completed!");
    } catch (err) {
      console.error("🚨 [Vercel Cold Start] Lazy database sync failed:", err.message);
    }
  }
  next();
});
const path = require("path");

// 서버 기동 시 정적 자산 경로 확인용 로그
const wwwPath = path.join(__dirname, "www");
console.log(`[Plating Boot] Static assets path resolved to: ${wwwPath}`);
console.log(`[Plating Boot] index.html exists: ${require("fs").existsSync(path.join(wwwPath, "index.html"))}`);

// 프론트엔드 정적 파일 서빙 (Vite 빌드 결과물인 www 폴더)
app.use(express.static(wwwPath));

// 헬스 체크 API (Render 상태 모니터링용)
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// 로그아웃 요청 처리 (GET 및 POST 모두 지원하여 404 차단)
app.all(["/api/profile/logout", "/api/v1/auth/logout"], (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error during logout:", err);
      return res.status(500).json({ success: false, message: "로그아웃 실패" });
    }
    res.clearCookie("connect.sid");
    return res.json({ success: true, message: "로그아웃 성공" });
  });
});

// 하위 호환성 (v1 API 호환)을 위한 URL Rewrite 미들웨어
app.use((req, res, next) => {
  const originalPath = req.url;
  
  if (req.path === "/api/profile") {
    req.url = req.url.replace("/api/profile", "/api/v1/users/profile");
  } else if (req.path === "/api/profile/logout") {
    req.url = req.url.replace("/api/profile/logout", "/api/v1/auth/logout");
  } else if (req.path === "/api/search/posts") {
    req.url = req.url.replace("/api/search/posts", "/api/v1/search/posts");
  } else if (req.path === "/api/search/users") {
    req.url = req.url.replace("/api/search/users", "/api/v1/search/users");
  } else if (req.path === "/authorize") {
    req.url = req.url.replace("/authorize", "/api/v1/auth/authorize");
  }
  
  if (originalPath !== req.url) {
    console.log(`[URL Rewrite] ${originalPath} -> ${req.url}`);
  }
  next();
});

// API 라우터 등록 (REST v1 설계 규격 적용)
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", profileRouter);
app.use("/api/v1/upload", uploadRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1", postsRouter); // postsRouter는 내부에 /posts 및 /community 자원을 직접 매핑하고 있음

// SPA Fallback: API/헬스체크 이외의 모든 GET 요청은 index.html을 반환하여 React가 라우팅을 처리하게 함
app.get("*all", (req, res, next) => {
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

// Express 인스턴스 익스포트 (Vercel 및 테스트 런타임 용)
module.exports = app;

// Vercel 서버리스 환경이 아닐 때만 직접 포트 기동 및 Graceful Shutdown 활성화
if (!process.env.VERCEL) {
  const server = app.listen(port, () => {
    console.log(`🚀 [Plating Boot] Plating API Server is running at http://localhost:${port}`);
  });

  // Graceful Shutdown (우아한 종료 프로세스)
  const gracefulShutdown = (signal) => {
    console.log(`⚠️ [Plating Shutdown] Received ${signal}. Starting graceful shutdown...`);
    
    server.close(() => {
      console.log('✨ [Plating Shutdown] Express server closed.');
      console.log('👋 [Plating Shutdown] Process terminated successfully.');
      process.exit(0);
    });

    // 10초 타임아웃 강제 종료 안전장치
    setTimeout(() => {
      console.error('🚨 [Plating Shutdown] Force terminating process due to timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
