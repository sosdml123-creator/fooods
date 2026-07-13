const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const axios = require("axios");
const qs = require("qs");
const { signupLimiter, loginLimiter } = require("../middlewares");
const { 
  findFirestoreUserByField, 
  writeFirestoreUser, 
  readUsers, 
  writeUsers,
  readJsonFile,
  MODERATION_RULES_PATH
} = require("../firebase");

const client_id = process.env.KAKAO_CLIENT_ID || "3c6b9b1d740c3c2cb76369773ea57471"; 
const client_secret = process.env.KAKAO_CLIENT_SECRET || "";

function getRedirectUri(req) {
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL}/api/v1/auth/redirect`;
  }
  const host = req.headers.host || "localhost:4000";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${host}/api/v1/auth/redirect`;
}

function getFrontendUrl(req) {
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
    console.error(`[API 요청 에러] URL: ${uri}, 상태코드: ${err.response ? err.response.status : 'N/A'}, 에러내용:`, rtn.data);
  }
  return rtn.data;
}

// 1. 카카오 로그인 창으로 리다이렉트
router.get("/authorize", function (req, res) {
  let { scope } = req.query;
  var scopeParam = "";
  if (scope) {
    scopeParam = "&scope=" + scope;
  }
  const active_redirect_uri = getRedirectUri(req);
  res.status(302).redirect(
    `${kauth_host}/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(active_redirect_uri)}&response_type=code${scopeParam}`
  );
});

// 2. 카카오 로그인 콜백 핸들러
router.get("/redirect", async function (req, res) {
  if (!req.query.code) {
    return res.status(400).send("인증 코드가 누락되었습니다.");
  }

  const active_redirect_uri = getRedirectUri(req);
  const tokenParams = {
    grant_type: "authorization_code",
    client_id: client_id,
    redirect_uri: active_redirect_uri,
    code: req.query.code,
  };

  const param = qs.stringify(tokenParams);
  const header = { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" };
  
  console.log("[토큰 요청] 전송 파라미터 (시크릿 미사용):", { ...tokenParams, client_id: "3c6b...7471" });
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
      const users = readUsers();
      const existingUserIdx = users.findIndex(u => u.kakao_id === kakaoProfile.id);
      
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
        while (users.some(u => u.nickname.toLowerCase() === uniqueNickname.toLowerCase())) {
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
        users.push(newUser);
        writeUsers(users);
        userNickname = uniqueNickname;
        console.log(`[회원가입 완료] 카카오 ID: ${kakaoProfile.id}, 닉네임: ${uniqueNickname}`);
      } else {
        isNewUser = false;
        users[existingUserIdx].last_login_at = new Date().toISOString();
        userNickname = users[existingUserIdx].nickname;
        users[existingUserIdx].profile_image = userProfileImg;
        users[existingUserIdx].email = userEmail;
        writeUsers(users);
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
      res.status(302).redirect(`${active_frontend}/index.html?login=success&token=${rtn.access_token}`);
    } else {
      res.status(500).send("카카오 프로필 정보를 가져오지 못했습니다.");
    }
  } else {
    res.status(400).send("카카오 토큰 발급에 실패했습니다: " + JSON.stringify(rtn));
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

// 6. 로그아웃 API
router.get("/logout", async function (req, res) {
  if (req.session.user) {
    console.log(`[로그아웃] 사용자: ${req.session.user.nickname}`);
  }
  req.session.destroy(function (err) {
    if (err) {
      console.error("세션 삭제 오류:", err);
      return res.status(500).json({ success: false, message: "로그아웃 중 세션 오류가 발생했습니다." });
    }
    res.clearCookie("connect.sid");
    return res.json({ success: true, message: "로그아웃 되었습니다." });
  });
});

// 7. 카카오 연결 끊기 (회원 탈퇴 등)
router.get("/unlink", async function (req, res) {
  if (!req.session.key) {
    return res.status(401).send("로그인이 필요합니다.");
  }
  const uri = kapi_host + "/v1/user/unlink";
  const header = { Authorization: "Bearer " + req.session.key };
  await call("POST", uri, {}, header);
  
  req.session.destroy();
  const active_frontend = getFrontendUrl(req);
  res.status(302).redirect(`${active_frontend}/index.html`);
});

module.exports = router;
