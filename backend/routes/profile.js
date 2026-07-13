const express = require("express");
const router = express.Router();
const axios = require("axios");
const qs = require("qs");
const { 
  readUsers, 
  writeUsers, 
  verifyFirebaseIdToken,
  findFirestoreUserByField,
  writeFirestoreUser
} = require("../firebase");

const kapi_host = "https://kapi.kakao.com";

const message_template = {
  object_type: "text",
  text: "Hello, world!",
  link: {
    web_url: "https://developers.kakao.com",
    mobile_web_url: "https://developers.kakao.com",
  },
};

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

// 1. 프로필 조회 및 세션 복원 API
router.get("/profile", async function (req, res) {
  const queryToken = req.query.token;
  if (queryToken && queryToken.trim() !== "" && (!req.session.key || !req.session.user)) {
    console.log("[세션 복원 시도] 토큰 감지:", queryToken.substring(0, 10) + "...");
    const users = readUsers();
    
    // Firebase ID Token 검증 (JWT 토큰)
    if (queryToken.startsWith("eyJ")) {
      const fbUser = await verifyFirebaseIdToken(queryToken);
      if (fbUser) {
        let user = users.find(u => u.uid === fbUser.localId || u.email === fbUser.email);
        if (!user) {
          user = {
            uid: fbUser.localId,
            nickname: fbUser.displayName || fbUser.email.split("@")[0],
            email: fbUser.email,
            profile_image: fbUser.photoUrl || "",
            role: "user",
            session_token: queryToken
          };
          users.push(user);
          writeUsers(users);
        } else {
          user.session_token = queryToken;
          writeUsers(users);
        }
        
        req.session.key = queryToken;
        req.session.user = {
          uid: fbUser.localId,
          nickname: user.nickname,
          profile_image: user.profile_image || "",
          email: user.email || "",
          role: user.role || "user"
        };
        console.log(`[세션 복원 성공 - Firebase Auth] 닉네임: ${user.nickname}`);
        return res.json({ isLoggedIn: true, user: req.session.user });
      }
    }

    // 로컬 DB session_token 검색
    const localUser = users.find(u => u.session_token === queryToken);
    if (localUser) {
      req.session.key = queryToken;
      req.session.user = {
        kakao_id: localUser.kakao_id || null,
        username: localUser.username || null,
        nickname: localUser.nickname,
        profile_image: localUser.profile_image || "",
        email: localUser.email || "",
        role: localUser.role || "user"
      };
      console.log(`[세션 복원 성공 - 로컬 DB 매칭] 닉네임: ${localUser.nickname}`);
    } else {
      // 카카오 API로 검증
      try {
        const profileUri = kapi_host + "/v2/user/me";
        const profileHeader = {
          "content-Type": "application/x-www-form-urlencoded",
          Authorization: "Bearer " + queryToken,
        };
        const kakaoProfile = await call("POST", profileUri, {}, profileHeader);

        if (kakaoProfile && kakaoProfile.id) {
          const existingUser = users.find(u => u.kakao_id === kakaoProfile.id);
          let nickname = kakaoProfile.properties?.nickname || `플레이터_${kakaoProfile.id.toString().slice(-4)}`;
          let profileImg = kakaoProfile.properties?.profile_image || "";
          
          if (existingUser) {
            nickname = existingUser.nickname;
            existingUser.session_token = queryToken;
            writeUsers(users);
          } else {
            users.push({
              kakao_id: kakaoProfile.id,
              nickname,
              profile_image: profileImg,
              email: kakaoProfile.kakao_account?.email || "",
              session_token: queryToken,
              registered_at: new Date().toISOString(),
              last_login_at: new Date().toISOString()
            });
            writeUsers(users);
          }

          req.session.key = queryToken;
          req.session.user = {
            kakao_id: kakaoProfile.id,
            nickname,
            profile_image: profileImg,
            email: kakaoProfile.kakao_account?.email || "",
            role: "user"
          };
          console.log(`[세션 복원 성공 - 카카오 API 동기화] 닉네임: ${nickname}`);
        }
      } catch (e) {
        console.error("[Kakao Session Restore Failed] Error:", e.message);
      }
    }
  }

  if (req.session.user) {
    return res.json({ isLoggedIn: true, user: req.session.user });
  } else {
    return res.json({ isLoggedIn: false });
  }
});

// 2. 프로필 정보 수정 API
router.post("/profile/update", async function (req, res) {
  const { token, nickname: targetNickname, bio, avatarImg } = req.body;

  let currentUser = req.session.user;

  if (token) {
    const users = readUsers();
    // Firebase ID Token 검증 (JWT 토큰)
    if (token.startsWith("eyJ")) {
      const fbUser = await verifyFirebaseIdToken(token);
      if (fbUser) {
        let user = users.find(u => u.uid === fbUser.localId || u.email === fbUser.email);
        if (!user) {
          user = {
            uid: fbUser.localId,
            nickname: fbUser.displayName || fbUser.email.split("@")[0],
            email: fbUser.email,
            profile_image: fbUser.photoUrl || "",
            role: "user",
            session_token: token
          };
          users.push(user);
          writeUsers(users);
        }
        currentUser = {
          uid: fbUser.localId,
          nickname: user.nickname,
          profile_image: user.profile_image || "",
          email: user.email || "",
          role: user.role || "user"
        };
      }
    } else {
      // 로컬 DB session_token 검색
      const localUser = users.find(u => u.session_token === token);
      if (localUser) {
        currentUser = {
          kakao_id: localUser.kakao_id || null,
          username: localUser.username || null,
          nickname: localUser.nickname,
          profile_image: localUser.profile_image || "",
          email: localUser.email || "",
          role: localUser.role || "user"
        };
      }
    }
  }

  if (!currentUser) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  if (!targetNickname || targetNickname.trim() === "") {
    return res.status(400).json({ success: false, message: "닉네임은 필수입니다." });
  }

  const users = readUsers();
  
  // 닉네임 중복 체크 (본인 제외)
  const isDuplicate = users.some(u => {
    const isSelf = u.kakao_id && currentUser.kakao_id 
      ? u.kakao_id === currentUser.kakao_id 
      : (u.username && currentUser.username ? u.username === currentUser.username : u.uid === currentUser.uid);
    return !isSelf && u.nickname.toLowerCase() === targetNickname.toLowerCase();
  });

  if (isDuplicate) {
    return res.status(400).json({ success: false, message: "이미 사용 중인 닉네임입니다." });
  }

  // 1. Firestore 정보 업데이트 (일반 회원인 경우)
  if (currentUser.uid) {
    try {
      const updatePayload = {
        nickname: targetNickname,
        bio: bio || ""
      };
      if (avatarImg) {
        updatePayload.profileImage = avatarImg;
      }
      await writeFirestoreUser(currentUser.uid, updatePayload);
    } catch (err) {
      console.error("[Profile Update Firestore Failed] Error:", err.message);
    }
  }

  // 2. 로컬 DB 정보 업데이트
  const userIdx = users.findIndex(u => {
    return u.kakao_id && currentUser.kakao_id 
      ? u.kakao_id === currentUser.kakao_id 
      : (u.username && currentUser.username ? u.username === currentUser.username : u.uid === currentUser.uid);
  });

  if (userIdx !== -1) {
    users[userIdx].nickname = targetNickname;
    users[userIdx].bio = bio || "";
    if (avatarImg) {
      users[userIdx].profile_image = avatarImg;
    }
    writeUsers(users);
  }

  // 세션 정보 갱신
  req.session.user.nickname = targetNickname;
  if (avatarImg) {
    req.session.user.profile_image = avatarImg;
  }

  res.json({ success: true });
});

// 3. 카카오 친구 목록 조회
router.get("/friends", async function (req, res) {
  if (!req.session.key) return res.status(401).send("Unauthorized");
  
  const uri = kapi_host + "/v1/api/talk/friends";
  const param = null;
  const header = {
    Authorization: "Bearer " + req.session.key,
  };
  var rtn = await call("GET", uri, param, header);
  res.send(rtn);
});

// 4. 나에게 카카오톡 메시지 보내기
router.get("/message", async function (req, res) {
  if (!req.session.key) return res.status(401).send("Unauthorized");

  const uri = kapi_host + "/v2/api/talk/memo/default/send";
  const param = qs.stringify({
    template_object: JSON.stringify(message_template),
  });
  const header = {
    "content-Type": "application/x-www-form-urlencoded",
    Authorization: "Bearer " + req.session.key,
  };
  var rtn = await call("POST", uri, param, header);
  res.send(rtn);
});

// 5. 친구에게 메시지 보내기
router.get("/friend-message", async function (req, res) {
  if (!req.session.key) return res.status(401).send("Unauthorized");

  const uri = kapi_host + "/v1/api/talk/friends/message/default/send";
  const { uuid } = req.query;

  const param = qs.stringify({
    receiver_uuids: `[${uuid}]`,
    template_object: JSON.stringify(message_template),
  });

  const header = {
    "content-Type": "application/x-www-form-urlencoded",
    Authorization: "Bearer " + req.session.key,
  };
  var rtn = await call("POST", uri, param, header);
  res.send(rtn);
});

module.exports = router;
