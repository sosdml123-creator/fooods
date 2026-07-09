const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const { requireAdmin, requireLogin, reportLimiter } = require("../middlewares");
const {
  readJsonFile,
  writeJsonFile,
  REPORTS_DB_PATH,
  MODERATION_RULES_PATH,
  ADMIN_LOGS_PATH,
  readUsers,
  writeUsers
} = require("../firebase");

const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1/projects/plating-app-db29f/databases/(default)/documents";

// 1. 신고 제출 API (로그인 필요)
router.post("/reports", requireLogin, async (req, res) => {
  try {
    const { targetType, targetId, reason, author, text } = req.body;
    if (!targetType || !targetId || !reason) {
      return res.status(400).json({ success: false, message: "필수 항목이 누락되었습니다." });
    }

    const reports = readJsonFile(REPORTS_DB_PATH, []);
    const newReport = {
      id: crypto.randomUUID(),
      targetType, // "post" 또는 "comment"
      targetId,
      author: author || "알 수 없음",
      text: text || "",
      reason,
      reporter: req.session.user.nickname,
      reporterKakaoId: req.session.user.kakao_id || null,
      timestamp: new Date().toISOString(),
      status: "Pending", // "Pending" -> "Resolved"
      adminMemo: ""
    };

    reports.unshift(newReport);
    writeJsonFile(REPORTS_DB_PATH, reports);

    return res.json({ success: true, message: "신고가 정상 접수되었습니다." });
  } catch (error) {
    console.error("신고 제출 오류:", error);
    return res.status(500).json({ success: false, message: "신고 제출 중 서버 오류가 발생했습니다." });
  }
});

// 2. 신고 목록 조회 API (관리자 전용)
router.get("/reports", requireAdmin, (req, res) => {
  const reports = readJsonFile(REPORTS_DB_PATH, []);
  res.json({ success: true, reports });
});

// 3. 신고 처리 API (관리자 전용)
router.post("/reports/handle", requireAdmin, (req, res) => {
  try {
    const { reportId, action, adminMemo } = req.body; // action: "delete", "keep", "block", "ignore"
    if (!reportId || !action) {
      return res.status(400).json({ success: false, message: "필수 항목이 누락되었습니다." });
    }

    const reports = readJsonFile(REPORTS_DB_PATH, []);
    const reportIdx = reports.findIndex(r => r.id === reportId);
    if (reportIdx === -1) {
      return res.status(404).json({ success: false, message: "존재하지 않는 신고 건입니다." });
    }

    const report = reports[reportIdx];
    const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
    const logs = readJsonFile(ADMIN_LOGS_PATH, []);

    let actionDetail = "";

    if (action === "delete") {
      if (report.targetType === "post") {
        if (!rules.deletedPosts.includes(report.targetId)) {
          rules.deletedPosts.push(report.targetId);
        }
      } else if (report.targetType === "comment") {
        if (!rules.deletedComments.includes(report.targetId)) {
          rules.deletedComments.push(report.targetId);
        }
      }
      actionDetail = `콘텐츠 삭제 (유형: ${report.targetType}, ID: ${report.targetId})`;
    } else if (action === "block") {
      const isAlreadyBlocked = rules.blockedUsers.some(b => b.nickname === report.author);
      if (!isAlreadyBlocked) {
        rules.blockedUsers.push({
          nickname: report.author,
          blocked_at: new Date().toISOString(),
          reason: report.reason
        });
      }
      actionDetail = `사용자 차단 (닉네임: ${report.author})`;
    } else if (action === "keep") {
      actionDetail = `유지 결정 (ID: ${report.targetId})`;
    } else if (action === "ignore") {
      actionDetail = `신고 무시 (ID: ${report.targetId})`;
    }

    // 상태 업데이트
    report.status = "Resolved";
    report.adminMemo = adminMemo || "";
    reports[reportIdx] = report;
    writeJsonFile(REPORTS_DB_PATH, reports);
    writeJsonFile(MODERATION_RULES_PATH, rules);

    // 로그 남기기
    const newLog = {
      id: crypto.randomUUID(),
      admin: req.session.user.nickname,
      adminKakaoId: req.session.user.kakao_id || null,
      action: action,
      targetType: report.targetType,
      targetId: report.targetId,
      detail: actionDetail,
      memo: adminMemo || "",
      timestamp: new Date().toISOString()
    };
    logs.unshift(newLog);
    writeJsonFile(ADMIN_LOGS_PATH, logs);

    res.json({ success: true, message: "신고 처리가 완료되었습니다." });
  } catch (error) {
    console.error("신고 처리 오류:", error);
    res.status(500).json({ success: false, message: "신고 처리 중 오류가 발생했습니다." });
  }
});

// 4. 수동 콘텐츠 중재 API (삭제 - 관리자 전용)
router.post("/moderate/delete", requireAdmin, (req, res) => {
  try {
    const { targetType, targetId, author } = req.body;
    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, message: "필수 항목이 누락되었습니다." });
    }

    const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
    const logs = readJsonFile(ADMIN_LOGS_PATH, []);

    if (targetType === "post") {
      if (!rules.deletedPosts.includes(targetId)) {
        rules.deletedPosts.push(targetId);
      }
    } else if (targetType === "comment") {
      if (!rules.deletedComments.includes(targetId)) {
        rules.deletedComments.push(targetId);
      }
    }

    const newLog = {
      id: crypto.randomUUID(),
      admin: req.session.user.nickname,
      adminKakaoId: req.session.user.kakao_id || null,
      action: "delete",
      targetType: targetType,
      targetId: targetId,
      detail: `수동 콘텐츠 삭제 (유형: ${targetType}, ID: ${targetId}, 작성자: ${author || 'N/A'})`,
      memo: "직접 관리자 삭제",
      timestamp: new Date().toISOString()
    };
    logs.unshift(newLog);
    writeJsonFile(MODERATION_RULES_PATH, rules);
    writeJsonFile(ADMIN_LOGS_PATH, logs);

    res.json({ success: true, message: "콘텐츠 중재가 정상적으로 저장되었습니다." });
  } catch (error) {
    console.error("수동 콘텐츠 삭제 중재 에러:", error);
    res.status(500).json({ success: false, message: "처리에 실패했습니다." });
  }
});

// 5. 수동 콘텐츠 숨김/노출 API (관리자 전용)
router.post("/moderate/hide", requireAdmin, (req, res) => {
  try {
    const { postId, isHidden } = req.body;
    if (!postId) {
      return res.status(400).json({ success: false, message: "postId가 필요합니다." });
    }

    const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
    const logs = readJsonFile(ADMIN_LOGS_PATH, []);

    if (isHidden) {
      if (!rules.hiddenPosts.includes(postId)) {
        rules.hiddenPosts.push(postId);
      }
    } else {
      rules.hiddenPosts = rules.hiddenPosts.filter(id => id !== postId);
    }
    writeJsonFile(MODERATION_RULES_PATH, rules);

    const newLog = {
      id: crypto.randomUUID(),
      admin: req.session.user.nickname,
      adminKakaoId: req.session.user.kakao_id || null,
      action: isHidden ? "hide" : "unhide",
      targetType: "post",
      targetId: postId,
      detail: `게시글 숨김 설정 (상태: ${isHidden ? '숨김' : '노출'}, ID: ${postId})`,
      memo: "",
      timestamp: new Date().toISOString()
    };
    logs.unshift(newLog);
    writeJsonFile(ADMIN_LOGS_PATH, logs);

    res.json({ success: true, message: isHidden ? "게시글이 숨김 처리되었습니다." : "게시글 숨김이 해제되었습니다." });
  } catch (error) {
    console.error("게시글 숨김 설정 오류:", error);
    res.status(500).json({ success: false, message: "숨김 설정에 실패했습니다." });
  }
});

// 6. 수동 사용자 차단 API (관리자 전용)
router.post("/moderate/block-user", requireAdmin, (req, res) => {
  try {
    const { nickname, reason } = req.body;
    if (!nickname) {
      return res.status(400).json({ success: false, message: "nickname이 필요합니다." });
    }

    const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
    const logs = readJsonFile(ADMIN_LOGS_PATH, []);

    const isAlreadyBlocked = rules.blockedUsers.some(b => b.nickname === nickname);
    if (!isAlreadyBlocked) {
      rules.blockedUsers.push({
        nickname: nickname,
        blocked_at: new Date().toISOString(),
        reason: reason || "관리자에 의한 수동 차단"
      });
      writeJsonFile(MODERATION_RULES_PATH, rules);

      const newLog = {
        id: crypto.randomUUID(),
        admin: req.session.user.nickname,
        adminKakaoId: req.session.user.kakao_id || null,
        action: "block",
        targetType: "user",
        targetId: nickname,
        detail: `사용자 수동 차단 (닉네임: ${nickname})`,
        memo: reason || "",
        timestamp: new Date().toISOString()
      };
      logs.unshift(newLog);
      writeJsonFile(ADMIN_LOGS_PATH, logs);
    }

    res.json({ success: true, message: "사용자가 정상적으로 차단되었습니다." });
  } catch (error) {
    console.error("사용자 수동 차단 오류:", error);
    res.status(500).json({ success: false, message: "사용자 차단에 실패했습니다." });
  }
});

// 7. 중재 규칙(필터링용 데이터) 조회 API
router.get("/moderation-rules", (req, res) => {
  const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
  res.json({ success: true, rules });
});

// 8. 관리자 로그 조회 API (관리자 전용)
router.get("/logs", requireAdmin, (req, res) => {
  const logs = readJsonFile(ADMIN_LOGS_PATH, []);
  res.json({ success: true, logs });
});


// 10. FCM 푸시 알림 발송 API
router.post("/send-push", async function (req, res) {
  const { targetUid, title, body, type, postId } = req.body;
  if (!targetUid || !title || !body) {
    return res.status(400).json({ success: false, message: "대상 UID, 제목, 본문은 필수 입력 사항입니다." });
  }

  try {
    const docUrl = `${FIRESTORE_BASE_URL}/users/${targetUid}`;
    let userDoc;
    try {
      userDoc = await axios.get(docUrl);
    } catch (docErr) {
      if (docErr.response && docErr.response.status === 404) {
        return res.json({ success: false, message: "User document not found" });
      }
      throw docErr;
    }

    const fields = userDoc.data.fields || {};
    const fcmToken = fields.fcmToken?.stringValue;
    if (!fcmToken) {
      return res.json({ success: false, message: "No FCM token for user" });
    }

    let notificationSettings = {};
    if (fields.notificationSettings && fields.notificationSettings.mapValue) {
      const mapFields = fields.notificationSettings.mapValue.fields || {};
      for (const [key, val] of Object.entries(mapFields)) {
        notificationSettings[key] = val.booleanValue;
      }
    }

    const isLikeEnabled = notificationSettings.like !== false;
    const isCommentEnabled = notificationSettings.comment !== false;
    const isNewPostEnabled = notificationSettings.newPost !== false;

    if (type === "like" && !isLikeEnabled) {
      return res.json({ success: true, message: "Likes notification disabled" });
    }
    if (type === "comment" && !isCommentEnabled) {
      return res.json({ success: true, message: "Comments notification disabled" });
    }
    if (type === "newPost" && !isNewPostEnabled) {
      return res.json({ success: true, message: "New post notification disabled" });
    }

    const serverKey = process.env.FCM_SERVER_KEY || process.env.FIREBASE_API_KEY || "AIzaSyBKat-tCeDuoRr-uzdOeoQXT6PpXHBWJno";
    const fcmUrl = "https://fcm.googleapis.com/fcm/send";
    const payload = {
      to: fcmToken,
      notification: {
        title: title,
        body: body,
        sound: "default",
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      },
      data: {
        type: type || "",
        postId: postId || "",
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      }
    };

    const fcmRes = await axios.post(fcmUrl, payload, {
      headers: {
        "Authorization": `key=${serverKey}`,
        "Content-Type": "application/json"
      }
    });

    return res.json({ success: true, result: fcmRes.data });
  } catch (err) {
    console.error("[FCM Push Error] Failed:", err.response ? err.response.data : err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 11. 익명/일반 사용자용 신고 API (누적 5회 시 블라인드)
router.post("/report", reportLimiter, async function (req, res) {
  const { postId, commentId, reason, reporterId } = req.body;
  if (!postId || !reason) {
    return res.status(400).json({ success: false, message: "신고 대상 ID와 사유는 필수입니다." });
  }

  const finalReporterId = reporterId || req.ip;

  try {
    const reportQueryUrl = `${FIRESTORE_BASE_URL}:runQuery`;
    const checkPayload = {
      structuredQuery: {
        from: [{ collectionId: "reports" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "postId" }, op: "EQUAL", value: { stringValue: postId } } },
              { fieldFilter: { field: { fieldPath: "reporterId" }, op: "EQUAL", value: { stringValue: finalReporterId } } },
              { fieldFilter: { field: { fieldPath: "commentId" }, op: "EQUAL", value: { stringValue: commentId || "" } } }
            ]
          }
        },
        limit: 1
      }
    };

    const duplicateCheck = await axios.post(reportQueryUrl, checkPayload);
    if (duplicateCheck.data && Array.isArray(duplicateCheck.data) && duplicateCheck.data.length > 0 && duplicateCheck.data[0].document) {
      return res.status(400).json({ success: false, message: "이미 신고하신 내용입니다." });
    }

    const writeReportUrl = `${FIRESTORE_BASE_URL}/reports`;
    const reportFields = {
      fields: {
        postId: { stringValue: postId },
        commentId: { stringValue: commentId || "" },
        reason: { stringValue: reason },
        reporterId: { stringValue: finalReporterId },
        timestamp: { stringValue: new Date().toISOString() }
      }
    };
    await axios.post(writeReportUrl, reportFields);

    const countPayload = {
      structuredQuery: {
        from: [{ collectionId: "reports" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "postId" }, op: "EQUAL", value: { stringValue: postId } } },
              { fieldFilter: { field: { fieldPath: "commentId" }, op: "EQUAL", value: { stringValue: commentId || "" } } }
            ]
          }
        }
      }
    };
    const countRes = await axios.post(reportQueryUrl, countPayload);
    const totalReportsCount = (Array.isArray(countRes.data) && countRes.data[0].document) ? countRes.data.filter(d => d.document).length : 0;

    if (totalReportsCount >= 5) {
      console.log(`[Auto-Mod Action] Hiding post/comment due to accumulated reports: ${postId}`);
      const patchFields = {
        fields: {
          hidden: { booleanValue: true }
        }
      };
      
      try {
        await axios.patch(`${FIRESTORE_BASE_URL}/posts/${postId}?updateMask.fieldPaths=hidden`, patchFields);
      } catch(e) {}
      
      try {
        await axios.patch(`${FIRESTORE_BASE_URL}/community_posts/${postId}?updateMask.fieldPaths=hidden`, patchFields);
      } catch(e) {}
    }

    return res.json({ success: true, message: "신고가 정상 접수되었습니다." });
  } catch (err) {
    console.error("[Report API] Error handling report:", err.message);
    return res.status(500).json({ success: false, message: "신고 처리 중 내부 오류가 발생했습니다." });
  }
});

module.exports = router;
