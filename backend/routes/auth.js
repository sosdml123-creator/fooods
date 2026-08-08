const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const axios = require("axios");
const qs = require("qs");
const crypto = require("crypto");
const { signupLimiter, loginLimiter } = require("../middlewares");
const { 
  findFirestoreUserByField, 
  writeFirestoreUser, 
  deleteFirestoreUser,
  readUsers, 
  writeUsers,
  readJsonFile,
  writeJsonFile,
  MODERATION_RULES_PATH,
  RECIPE_POSTS_DB_PATH,
  COMMUNITY_POSTS_DB_PATH
} = require("../firebase");

const client_id = process.env.KAKAO_CLIENT_ID || "3c6b9b1d740c3c2cb76369773ea57471"; 
const client_secret = process.env.KAKAO_CLIENT_SECRET || "W4bIVwKsOMri6cIZJaBZuxVFwSR1hMHt";

function getRedirectUri(req) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return "https://myplating.kr/api/v1/auth/redirect";
  }
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL}/api/v1/auth/redirect`;
  }
  const host = req.headers.host || "localhost:4000";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${host}/api/v1/auth/redirect`;
}

function getFrontendUrl(req) {
  if (process.env.NODE_ENV === "production") {
    return "https://myplating.kr";
  }
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }
  const host = req.headers.host || "localhost:3000";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${host}`;
}

const kauth_host = "https://kauth.kakao.com";
const kapi_host = "https://kapi.kakao.com";

// axios 호출 헬퍼
async function call(method, uri, param, header) {
  let rtn;
  try {
    rtn = await axios({
      method: method,
      url: uri,
      headers: header,
      data: param,
    });
  } catch (err) {
    rtn = err.response || { data: { error: "Network Error", error_description: err.message } };
    console.error(`[API 요청 에러] URL: ${uri}, 상태코드: ${err.response ? err.response.status : 'N/A'}, 에러내용:`, rtn.data, "Stack:", err.stack || err);
  }
  return rtn.data;
}

// 1. 카카오 로그인 창으로 리다이렉트
router.get("/authorize", function (req, res) {
  try {
    if (!client_id) {
      console.error("[Kakao Authorize Error] KAKAO_CLIENT_ID is undefined!");
      return res.status(500).json({ success: false, message: "카카오 KAKAO_CLIENT_ID 환경변수가 설정되지 않았습니다." });
    }
    let { scope } = req.query;
    var scopeParam = "";
    if (scope) {
      scopeParam = "&scope=" + scope;
    }
    const active_redirect_uri = getRedirectUri(req);
    console.log("[Kakao Authorize] Redirect URI :", active_redirect_uri);
    const kakaoAuthUrl = `${kauth_host}/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(active_redirect_uri)}&response_type=code${scopeParam}`;
    return res.redirect(kakaoAuthUrl);
  } catch (err) {
    console.error("[Kakao Authorize Error]", err.stack || err);
    return res.status(500).json({ success: false, message: "카카오 인증 이동 중 오류가 발생했습니다: " + err.message });
  }
});

// 2. 카카오 로그인 콜백 핸들러
router.get("/redirect", async function (req, res) {
  try {
    if (!req.query.code) {
      return res.status(400).send("인증 코드가 누락되었습니다.");
    }
    if (!client_id) {
      console.error("[Kakao Redirect Error] KAKAO_CLIENT_ID is undefined!");
      return res.status(500).send("카카오 KAKAO_CLIENT_ID 환경변수가 설정되지 않았습니다.");
    }

  const active_redirect_uri = getRedirectUri(req);
  const active_frontend = getFrontendUrl(req);
  console.log("Redirect URI :", active_redirect_uri);
  console.log("Frontend URI :", active_frontend);

  const tokenParams = {
    grant_type: "authorization_code",
    client_id: client_id,
    redirect_uri: active_redirect_uri,
    code: req.query.code,
  };

  if (client_secret && client_secret.trim() !== "") {
    tokenParams.client_secret = client_secret.trim();
  }

  console.log("Token Params :", tokenParams);

  const param = qs.stringify(tokenParams);
  const header = { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" };
  
  console.log("[토큰 요청] 전송 파라미터:", { ...tokenParams, client_id: client_id ? `${client_id.slice(0, 4)}...` : "UNDEFINED", client_secret: tokenParams.client_secret ? "PRESENT" : "ABSENT" });
  var rtn = await call("POST", kauth_host + "/oauth/token", param, header);

  if (rtn && rtn.access_token) {
    req.session.key = rtn.access_token;
    
    const profileUri = kapi_host + "/v2/user/me";
    const profileHeader = {
      "content-Type": "application/x-www-form-urlencoded",
      Authorization: "Bearer " + rtn.access_token,
    };
    const kakaoProfile = await call("POST", profileUri, {}, profileHeader);

    if (kakaoProfile && kakaoProfile.id) {
      const users = readUsers() || [];
      const userList = Array.isArray(users) ? users : [];
      const existingUserIdx = userList.findIndex(u => u && u.kakao_id === kakaoProfile.id);
      
      let isNewUser = false;
      let userNickname = kakaoProfile.properties && kakaoProfile.properties.nickname 
        ? kakaoProfile.properties.nickname 
        : `플레이터_${kakaoProfile.id.toString().slice(-4)}`;
      let userProfileImg = kakaoProfile.properties && kakaoProfile.properties.profile_image 
        ? kakaoProfile.properties.profile_image 
        : "";
      let userEmail = kakaoProfile.kakao_account && kakaoProfile.kakao_account.email 
        ? kakaoProfile.kakao_account.email 
        : "";

      if (existingUserIdx === -1) {
        isNewUser = true;
        let uniqueNickname = userNickname;
        while (userList.some(u => u && u.nickname && typeof u.nickname === "string" && u.nickname.toLowerCase() === uniqueNickname.toLowerCase())) {
          uniqueNickname = `${userNickname}_${Math.floor(100 + Math.random() * 900)}`;
        }

        const newUser = {
          kakao_id: kakaoProfile.id,
          nickname: uniqueNickname,
          profile_image: userProfileImg,
          email: userEmail,
          registered_at: new Date().toISOString(),
          last_login_at: new Date().toISOString()
        };
        userList.push(newUser);
        writeUsers(userList);
        userNickname = uniqueNickname;
        console.log(`[회원가입 완료] 카카오 ID: ${kakaoProfile.id}, 닉네임: ${uniqueNickname}`);
      } else {
        isNewUser = false;
        userList[existingUserIdx].last_login_at = new Date().toISOString();
        userNickname = userList[existingUserIdx].nickname || userNickname;
        userList[existingUserIdx].profile_image = userProfileImg;
        userList[existingUserIdx].email = userEmail;
        writeUsers(userList);
        console.log(`[로그인 완료] 카카오 ID: ${kakaoProfile.id}, 닉네임: ${userNickname}`);
      }

      req.session.user = {
        kakao_id: kakaoProfile.id,
        nickname: userNickname,
        profile_image: userProfileImg,
        email: userEmail
      };
      req.session.isNewUser = isNewUser;
 
      // Vercel 프론트엔드로 최종 302 리다이렉트
      const active_frontend = getFrontendUrl(req);
      return res.redirect(`${active_frontend}/index.html?login=success&token=${rtn.access_token}`);
    } else {
      res.status(500).send("카카오 프로필 정보를 가져오지 못했습니다.");
    }
  } else {
    res.status(400).send("카카오 토큰 발급에 실패했습니다: " + JSON.stringify(rtn));
  }
  } catch (err) {
    console.error("[Kakao Redirect Error]", err.stack || err);
    return res.status(500).send("카카오 로그인 도중 오류가 발생했습니다: " + err.message);
  }
});

// 3. 일반 로그인 API
router.post("/login", loginLimiter, async function (req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "아이디와 비밀번호를 입력해주세요." });
  }

  try {
    const user = await findFirestoreUserByField("username", username);
    if (user) {
      let isPasswordValid = false;
      let needsMigration = false;

      const isHashed = typeof user.password === "string" && (user.password.startsWith("$2a$") || user.password.startsWith("$2b$"));

      if (isHashed) {
        isPasswordValid = bcrypt.compareSync(password, user.password);
      } else {
        if (user.password === password) {
          isPasswordValid = true;
          needsMigration = true;
        }
      }

      if (isPasswordValid) {
        const moderationRules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
        
        // blockedUsers가 객체 배열 형태이므로 닉네임 필터 처리
        const isBlocked = moderationRules.blockedUsers && moderationRules.blockedUsers.some(u => {
          return typeof u === "string" ? u === user.nickname : u.nickname === user.nickname;
        });

        if (isBlocked) {
          return res.status(403).json({ success: false, message: "차단된 사용자입니다. 이용이 정지되었습니다." });
        }

        let sessionToken = user.session_token;
        if (!sessionToken) {
          sessionToken = "local_token_" + crypto.randomBytes(16).toString("hex") + "_" + Date.now();
        }

        const updatePayload = {
          sessionToken: sessionToken,
          lastLoginAt: new Date().toISOString()
        };
        if (needsMigration) {
          console.log(`[Bcrypt Migration] Migrating plain password to hash in Firestore for user: ${username}`);
          updatePayload.password = bcrypt.hashSync(password, 10);
        }
        await writeFirestoreUser(user.uid, updatePayload);

        req.session.key = sessionToken;
        req.session.user = {
          username: user.username,
          nickname: user.nickname,
          profile_image: user.profile_image || "",
          email: user.email || "",
          role: user.role || "user"
        };

        return res.json({ success: true, token: sessionToken, nickname: user.nickname, role: user.role || "user" });
      }
    }
  } catch (err) {
    console.error("[Login API] Firestore authentication error:", err.message);
  }

  return res.status(401).json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." });
});

// 4. 일반 회원가입 중복 체크
router.post("/signup/check", async function (req, res) {
  const { username, nickname } = req.body;
  if (!username || !nickname) {
    return res.status(400).json({ success: false, message: "필수 입력 항목이 누락되었습니다." });
  }

  try {
    const idExists = await findFirestoreUserByField("username", username);
    if (idExists) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 아이디입니다." });
    }

    const nicknameExists = await findFirestoreUserByField("nickname", nickname);
    if (nicknameExists) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 닉네임입니다." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[Signup Check API] Firestore query error:", err.message);
    return res.status(500).json({ success: false, message: "중복 확인 중 오류가 발생했습니다." });
  }
});

// 5. 일반 회원가입 API
router.post("/signup", signupLimiter, async function (req, res) {
  const { username, password, nickname, deviceId, uid, email } = req.body;
  if (!username || !password || !nickname || !uid) {
    return res.status(400).json({ success: false, message: "필수 입력 항목(아이디, 비번, 닉네임, UID)이 누락되었습니다." });
  }

  try {
    const idExists = await findFirestoreUserByField("username", username);
    if (idExists) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 아이디입니다." });
    }

    const nicknameExists = await findFirestoreUserByField("nickname", nickname);
    if (nicknameExists) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 닉네임입니다." });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const sessionToken = "local_token_" + crypto.randomBytes(16).toString("hex") + "_" + Date.now();

    const userData = {
      username,
      password: hashedPassword,
      nickname,
      deviceId: deviceId || "",
      email: email || "",
      role: "user",
      sessionToken,
      registeredAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    const success = await writeFirestoreUser(uid, userData);
    if (success) {
      // 로컬 DB 동기화
      const users = readUsers();
      users.push({
        uid,
        username,
        nickname,
        email: email || "",
        role: "user",
        session_token: sessionToken,
        registered_at: userData.registeredAt,
        last_login_at: userData.lastLoginAt
      });
      writeUsers(users);

      req.session.key = sessionToken;
      req.session.user = {
        username,
        nickname,
        email: email || "",
        role: "user"
      };

      console.log(`[일반 회원가입 성공] 아이디: ${username}, 닉네임: ${nickname}`);
      return res.json({ success: true, token: sessionToken, nickname, role: "user" });
    }
  } catch (err) {
    console.error("[Signup API] Error:", err.message);
  }

  return res.status(500).json({ success: false, message: "회원가입 처리 중 오류가 발생했습니다." });
});

// 6. 로그아웃 API (GET, POST 등 모든 HTTP 메서드 호환)
router.all("/logout", async function (req, res) {
  if (req.session && req.session.user) {
    console.log(`[로그아웃] 사용자: ${req.session.user.nickname}`);
  }
  if (req.session && typeof req.session.destroy === "function") {
    req.session.destroy(function (err) {
      if (err) {
        console.error("세션 삭제 오류:", err);
      }
      res.clearCookie("connect.sid");
      return res.json({ success: true, message: "로그아웃 되었습니다." });
    });
  } else {
    res.clearCookie("connect.sid");
    return res.json({ success: true, message: "로그아웃 되었습니다." });
  }
});

// 8. 회원 탈퇴 및 사용자 Firestore/로컬 데이터 완전 삭제 API
router.post("/withdraw", async function (req, res) {
  const { uid, nickname } = req.body || {};
  console.log(`[회원 탈퇴 요청] UID: ${uid}, 닉네임: ${nickname}`);

  try {
    let targetUid = uid;
    let targetNickname = nickname;

    if (req.session.user) {
      targetUid = targetUid || req.session.user.uid;
      targetNickname = targetNickname || req.session.user.nickname;
    }

    // 1. Firestore에서 유저 문서 삭제
    if (targetUid) {
      await deleteFirestoreUser(targetUid);
    }

    // 2. 로컬 DB(users.json)에서 유저 삭제
    const users = readUsers();
    const updatedUsers = users.filter(u => {
      if (targetUid && u.uid === targetUid) return false;
      if (targetNickname && u.nickname === targetNickname) return false;
      return true;
    });
    writeUsers(updatedUsers);

    // 3. 유저가 작성한 게시글 정리 (community_posts.json, recipe_posts.json)
    if (targetNickname) {
      const commPosts = readJsonFile(COMMUNITY_POSTS_DB_PATH, []);
      const filteredComm = commPosts.filter(p => p.author !== targetNickname);
      writeJsonFile(COMMUNITY_POSTS_DB_PATH, filteredComm);

      const recipePosts = readJsonFile(RECIPE_POSTS_DB_PATH, []);
      const filteredRecipe = recipePosts.filter(p => p.author !== targetNickname);
      writeJsonFile(RECIPE_POSTS_DB_PATH, filteredRecipe);
    }

    // 4. 세션 삭제
    req.session.destroy(function (err) {
      if (err) console.error("세션 파기 오류:", err);
    });
    res.clearCookie("connect.sid");

    return res.json({ success: true, message: "회원 탈퇴 및 모든 개인 데이터가 영구 삭제되었습니다." });
  } catch (err) {
    console.error("[Withdraw API] Error:", err.message);
    return res.status(500).json({ success: false, message: "회원 탈퇴 처리 중 오류가 발생했습니다." });
  }
});

module.exports = router;
