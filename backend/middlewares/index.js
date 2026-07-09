const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { readJsonFile, ADMIN_CONFIG_PATH } = require("../firebase");

// 동적 관리자 ID 로드
function getAdminIds() {
  const defaultAdminConfig = { admins: [4933844865] };
  const config = readJsonFile(ADMIN_CONFIG_PATH, defaultAdminConfig);
  if (!Array.isArray(config.admins)) {
    return [4933844865];
  }
  return config.admins;
}

// CORS 설정
const allowedOrigins = [
  "https://myplating.kr",
  "https://www.myplating.kr",
  "http://localhost:3000",
  "http://localhost:4000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000"
];

const corsOptions = cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true
});

// 관리자 권한 확인 미들웨어
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }
  const admins = getAdminIds();
  const isAdmin = req.session.user.kakao_id 
    ? admins.includes(req.session.user.kakao_id) 
    : (req.session.user.username === "google-tester" || req.session.user.role === "admin");
  if (!isAdmin) {
    return res.status(403).json({ success: false, message: "관리자 권한이 없습니다." });
  }
  next();
}

// 로그인 필수 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }
  next();
}

// 스팸 방지용 Rate Limiter
const communityWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: "스팸 방지를 위해 1분에 최대 5개까지만 글을 쓸 수 있습니다. 잠시 후 다시 시도해주세요." },
  standardHeaders: true,
  legacyHeaders: false
});

const signupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: "단시간 내 너무 많은 가입 시도가 감지되었습니다. 잠시 후 다시 시도해주세요." },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  corsOptions,
  requireAdmin,
  requireLogin,
  communityWriteLimiter,
  signupLimiter,
  getAdminIds
};
