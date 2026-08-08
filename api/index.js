const app = require("../backend/server.js");

const client_id = process.env.KAKAO_CLIENT_ID || "3c6b9b1d740c3c2cb76369773ea57471";

function getRedirectUri(req) {
  if (process.env.NODE_ENV === "production") {
    return "https://myplating.kr/api/v1/auth/redirect";
  }
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL}/api/v1/auth/redirect`;
  }
  const host = req.headers.host || "myplating.kr";
  const protocol = req.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${host}/api/v1/auth/redirect`;
}

module.exports = (req, res) => {
  try {
    const rawUrl = req.url || "";
    const pathname = rawUrl.split("?")[0];

    // 카카오 OAuth authorize 요청 최우선 경량 처리
    if (pathname === "/authorize" || pathname === "/api/v1/auth/authorize" || pathname === "/api/authorize") {
      const queryStr = rawUrl.includes("?") ? rawUrl.split("?")[1] : "";
      const searchParams = new URLSearchParams(queryStr);
      const scope = searchParams.get("scope");
      const scopeParam = scope ? `&scope=${encodeURIComponent(scope)}` : "";
      const redirectUri = getRedirectUri(req);
      const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code${scopeParam}`;
      
      console.log("[Vercel Direct Authorize] Redirecting to Kakao OAuth:", redirectUri);
      res.writeHead(302, { Location: kakaoAuthUrl });
      return res.end();
    }

    return app(req, res);
  } catch (err) {
    console.error("[Vercel Handler Error]", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "서버리스 처리 오류: " + err.message });
    }
  }
};
