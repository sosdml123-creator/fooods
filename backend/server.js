require("dotenv").config(); // 환경변수 로드
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const axios = require("axios");
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

// Google AdMob 크롤러 최우선 서빙 라우트 (301 리다이렉트 없이 200 OK text/plain 즉시 응답)
app.get(["/app-ads.txt", "/app-ads", "/api/app-ads.txt"], (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send("google.com, pub-3878859120989916, DIRECT, f08c47fec0942fa0\n");
});

app.get(["/robots.txt"], (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send("User-agent: Google-adstxt\nDisallow:\n\nUser-agent: Mediapartners-Google\nDisallow:\n\nUser-agent: Googlebot\nDisallow:\n\nUser-agent: *\nAllow: /app-ads.txt\nAllow: /\n");
});

// myplating.kr 접속 시 www.myplating.kr로 301 캐노니컬 리다이렉트 처리
app.use((req, res, next) => {
  if (req.path === "/app-ads.txt" || req.path === "/app-ads" || req.path === "/robots.txt") return next();
  if (process.env.NODE_ENV === "production" && req.headers.host === "myplating.kr") {
    console.log(`[Canonical Redirect] ${req.headers.host}${req.url} -> www.myplating.kr`);
    return res.redirect(301, `https://www.myplating.kr${req.url}`);
  }
  next();
});

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

// JSON 및 URL-encoded 바디 파서 (대용량 base64 프로필 이미지 업로드 허용)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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

// Google AdMob 크롤러 전용 app-ads.txt 명시적 서빙 라우트 (AdMob 크롤러 100% 검증 통과)
app.get(["/app-ads.txt", "/app-ads", "/api/app-ads.txt"], (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send("google.com, pub-3878859120989916, DIRECT, f08c47fec0942fa0\n");
});

// 외부 링크(쿠팡 단축링크, 네이버 지도, 외부 쇼핑몰 등) 딥링크 해제 및 OG/JSON-LD 메타데이터 파싱 API
app.get(["/api/link-meta", "/api/v1/link-meta"], async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ success: false, message: "URL이 누락되었습니다." });
  }

  try {
    const meta = await fetchDeepLinkMeta(targetUrl);
    return res.json({
      success: true,
      title: meta.title,
      image: meta.image,
      price: meta.price,
      brand: meta.brand,
      host: meta.host
    });
  } catch (err) {
    console.error("[Link Meta API Error]:", err.message);
    let host = "link";
    try { host = new URL(targetUrl).hostname.replace("www.", ""); } catch(e) {}
    if (host.includes("coupang")) host = "쿠팡";
    return res.json({
      success: true,
      title: host === "쿠팡" ? "쿠팡 추천 상품 정보" : `상세 링크 (${host})`,
      image: host === "쿠팡" 
        ? "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&q=80&w=400" 
        : "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
      price: "",
      host
    });
  }
});

// 리다이렉트 추적 및 OG / JSON-LD / 가격 스마트 파서 헬퍼
async function fetchDeepLinkMeta(initialUrl) {
  let finalHtml = "";
  let finalUrl = initialUrl;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache"
  };

  // 1단계: HTTP Redirect (301, 302, 307, 308) 10회 추적
  try {
    const res = await axios.get(initialUrl, {
      timeout: 7000,
      headers,
      maxRedirects: 10,
      validateStatus: (status) => status >= 200 && status < 400
    });

    finalHtml = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    if (res.request && res.request.res && res.request.res.responseUrl) {
      finalUrl = res.request.res.responseUrl;
    } else if (res.config && res.config.url) {
      finalUrl = res.config.url;
    }
  } catch (err) {
    console.warn("[LinkMeta Redirect Catch]:", err.message);
  }

  // 2단계: Deeplink Redirect 중간 페이지 감지 시 JS/Meta Refresh 주소 추출 2차 GET
  if (finalHtml.includes("Deeplink Redirect") || finalHtml.includes("deeplink") || finalHtml.includes("http-equiv=\"refresh\"")) {
    const refreshMatch = finalHtml.match(/content=["']\d+;\s*url=([^"']+)["']/i) ||
                         finalHtml.match(/location\.(?:href|replace)\s*=\s*["']([^"']+)["']/i) ||
                         finalHtml.match(/(https:\/\/www\.coupang\.com\/vp\/products\/[^\s"'<]+)/i);

    if (refreshMatch && refreshMatch[1]) {
      let nextUrl = refreshMatch[1].replace(/&amp;/g, "&");
      if (nextUrl.startsWith("/")) {
        try {
          const u = new URL(finalUrl);
          nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
        } catch(e) {}
      }
      try {
        const res2 = await axios.get(nextUrl, { timeout: 7000, headers, maxRedirects: 10 });
        finalHtml = typeof res2.data === "string" ? res2.data : JSON.stringify(res2.data);
        finalUrl = nextUrl;
      } catch (err2) {
        console.warn("[LinkMeta Refresh Fetch Error]:", err2.message);
      }
    }
  }

  let host = "link";
  try {
    host = new URL(finalUrl).hostname.replace("www.", "");
  } catch(e) {}

  let title = "";
  let image = "";
  let price = "";
  let brand = "";

  // 3단계: JSON-LD (schema.org) Product 파싱 (우선순위 3)
  try {
    const jsonLdMatches = finalHtml.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const m of jsonLdMatches) {
        const jsonText = m.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
        try {
          const data = JSON.parse(jsonText);
          const target = Array.isArray(data) ? data.find(item => item["@type"] === "Product") || data[0] : data;
          if (target && (target["@type"] === "Product" || target.name)) {
            if (!title && target.name) title = target.name;
            if (!image && target.image) {
              image = Array.isArray(target.image) ? target.image[0] : (target.image.url || target.image);
            }
            if (!price && target.offers) {
              const offer = Array.isArray(target.offers) ? target.offers[0] : target.offers;
              if (offer && offer.price) price = String(offer.price);
            }
            if (!brand && target.brand) {
              brand = typeof target.brand === "object" ? target.brand.name : target.brand;
            }
          }
        } catch(e) {}
      }
    }
  } catch(e) {}

  // 4단계: OpenGraph & Meta Tag 우선순위 파싱
  // 제목 우선순위: 1. og:title -> 2. product:title -> 3. schema.org -> 4. <title>
  const ogTitle = (finalHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                   finalHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i))?.[1];
  const productTitle = (finalHtml.match(/<meta[^>]*property=["']product:title["'][^>]*content=["']([^"']+)["']/i) ||
                       finalHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:title["']/i))?.[1];
  const pageTitle = (finalHtml.match(/<title[^>]*>([^<]+)<\/title>/i))?.[1];

  if (ogTitle && !ogTitle.includes("Deeplink Redirect")) {
    title = ogTitle.trim();
  } else if (productTitle && !productTitle.includes("Deeplink Redirect")) {
    title = productTitle.trim();
  } else if (!title && pageTitle && !pageTitle.includes("Deeplink Redirect")) {
    title = pageTitle.trim();
  }

  // 이미지 우선순위: 1. og:image -> 2. Product image (완료) -> 3. twitter:image
  if (!image) {
    const ogImage = (finalHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                     finalHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i))?.[1];
    const twitterImage = (finalHtml.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                         finalHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i))?.[1];
    image = ogImage || twitterImage || "";
  }

  // 가격 (Price) 추가 추출
  if (!price) {
    const ogPrice = (finalHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i) ||
                     finalHtml.match(/<meta[^>]*property=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i))?.[1];
    if (ogPrice) {
      price = ogPrice.trim();
    } else {
      const priceMatch = finalHtml.match(/class=["'][^"']*total-price[^"']*["'][^>]*>[\s\S]*?strong[^>]*>([\d,]+)/i) ||
                         finalHtml.match(/class=["'][^"']*prod-sale-price[^"']*["'][^>]*>[\s\S]*?span[^>]*>([\d,]+)/i) ||
                         finalHtml.match(/(\d{1,3}(?:,\d{3})+)\s*원/);
      if (priceMatch && priceMatch[1]) {
        price = priceMatch[1].replace(/,/g, "");
      }
    }
  }

  // HTML Entity 디코딩 및 수식어 정제
  if (title) {
    title = title
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/^쿠팡!\s*-\s*/i, "")
      .replace(/\s*\|\s*쿠팡$/i, "")
      .replace(/^\[네이버\s*지도\]\s*/i, "")
      .replace(/\s*-\s*네이버\s*지도$/i, "")
      .trim();
  }

  // "Deeplink Redirect" 텍스트 차단 필터
  if (!title || title.includes("Deeplink Redirect") || title === "Deep Link") {
    if (host.includes("coupang")) {
      title = "쿠팡 추천 상품 정보";
    } else if (host.includes("naver") || host.includes("map")) {
      title = "네이버 장소 / 맛집 정보";
    } else {
      title = `상세 링크 (${host})`;
    }
  }

  // 상대경로 이미지 정제
  if (image && !image.startsWith("http")) {
    try {
      const u = new URL(finalUrl);
      if (image.startsWith("//")) image = `https:${image}`;
      else if (image.startsWith("/")) image = `${u.protocol}//${u.host}${image}`;
    } catch(e) {}
  }

  if (!image) {
    if (host.includes("coupang")) {
      image = "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&q=80&w=400";
    } else if (host.includes("naver") || host.includes("map")) {
      image = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=400";
    } else {
      image = "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400";
    }
  }

  let formattedPrice = "";
  if (price && !isNaN(Number(price))) {
    formattedPrice = `${Number(price).toLocaleString()}원`;
  } else if (price) {
    formattedPrice = price.includes("원") ? price : `${price}원`;
  }

  return {
    title,
    image,
    price: formattedPrice,
    brand,
    host: host.includes("coupang") ? "쿠팡" : host
  };
}

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
