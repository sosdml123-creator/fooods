const nodemailer = require("nodemailer");

// 관리자 이메일 주소 (환경변수 ADMIN_EMAIL 또는 기본값 admin@myplating.kr)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@myplating.kr";

// Nodemailer Transporter 설정
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

/**
 * 관리자에게 알림 이메일 발송
 * @param {Object} options
 * @param {'block' | 'report'} options.type
 * @param {string} options.blockerId - 차단한 사용자 ID / 닉네임
 * @param {string} options.blockedId - 차단된 사용자 ID / 닉네임
 * @param {string} [options.reporterId] - 신고한 사용자 ID / 닉네임
 * @param {string} [options.targetId] - 신고 대상 콘텐츠 ID
 * @param {string} [options.targetType] - 신고 대상 유형 (post/comment)
 * @param {string} [options.targetUserUid] - 신고 대상 사용자 ID / 닉네임
 * @param {string} [options.reason] - 사유
 * @param {string} [options.text] - 상세 내용
 * @param {string} [options.timestamp] - 시각
 */
async function sendAdminNotification(options) {
  const {
    type,
    blockerId,
    blockedId,
    reporterId,
    targetId,
    targetType,
    targetUserUid,
    reason,
    text,
    timestamp
  } = options;

  const eventTime = timestamp || new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  let subject = "";
  let htmlContent = "";

  if (type === "block") {
    subject = `[플레이팅 관리자 알림] 사용자 차단 발생 (${blockerId} -> ${blockedId})`;
    htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #d97706; margin-top: 0;">🚨 사용자 차단 알림</h2>
        <p>서비스 내에서 사용자 차단 이벤트가 접수되었습니다.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px; font-weight: bold; width: 140px; background-color: #f9fafb;">차단한 사람 ID:</td>
            <td style="padding: 8px;">${blockerId || "N/A"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">차단된 사람 ID:</td>
            <td style="padding: 8px; color: #dc2626; font-weight: bold;">${blockedId || "N/A"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">차단/신고 사유:</td>
            <td style="padding: 8px;">${reason || "사용자 직접 차단"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">발생 시각:</td>
            <td style="padding: 8px;">${eventTime}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">수신 이메일: ${ADMIN_EMAIL}</p>
      </div>
    `;
  } else if (type === "report") {
    subject = `[플레이팅 관리자 알림] 새로운 신고 접수 (${reason || '기타'})`;
    htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #dc2626; margin-top: 0;">📢 신고 접수 알림</h2>
        <p>새로운 신고 건이 관리자 센터에 접수되었습니다.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px; font-weight: bold; width: 140px; background-color: #f9fafb;">신고자 ID:</td>
            <td style="padding: 8px;">${reporterId || blockerId || "익명"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">신고 대상 회원:</td>
            <td style="padding: 8px; color: #dc2626; font-weight: bold;">${targetUserUid || blockedId || "N/A"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">신고 대상 콘텐츠:</td>
            <td style="padding: 8px;">[${targetType === "post" ? "게시글" : "댓글"}] ID: ${targetId || "N/A"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">신고 사유:</td>
            <td style="padding: 8px; color: #b91c1c; font-weight: bold;">${reason || "사유 미기재"}</td>
          </tr>
          ${text ? `
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">상세 내용:</td>
            <td style="padding: 8px;">${text}</td>
          </tr>
          ` : ""}
          <tr>
            <td style="padding: 8px; font-weight: bold; background-color: #f9fafb;">신고 시각:</td>
            <td style="padding: 8px;">${eventTime}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">수신 이메일: ${ADMIN_EMAIL}</p>
      </div>
    `;
  }

  const mailOptions = {
    from: `"Plating Admin Notifier" <${process.env.SMTP_USER || "noreply@myplating.kr"}>`,
    to: ADMIN_EMAIL,
    subject: subject,
    html: htmlContent,
  };

  console.log(`[Admin Notification] Sending ${type.toUpperCase()} notification to ${ADMIN_EMAIL}...`);
  console.log(`[Notification Details] Blocker/Reporter: ${blockerId || reporterId}, Blocked/Target: ${blockedId || targetUserUid}, Reason: ${reason}, Time: ${eventTime}`);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Admin Notification] (SMTP credentials not fully configured in .env - notification logged to console & dispatch complete)`);
    return { success: true, simulated: true, recipient: ADMIN_EMAIL };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Admin Notification] Email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId, recipient: ADMIN_EMAIL };
  } catch (error) {
    console.error(`[Admin Notification Error] Failed to send email: ${error.message}`);
    return { success: false, error: error.message, recipient: ADMIN_EMAIL };
  }
}

module.exports = {
  ADMIN_EMAIL,
  sendAdminNotification,
};
