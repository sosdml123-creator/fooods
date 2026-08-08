const app = require("../backend/server.js");

module.exports = (req, res) => {
  try {
    return app(req, res);
  } catch (err) {
    console.error("[Vercel Handler Error]", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "서버리스 처리 오류: " + err.message });
    }
  }
};
