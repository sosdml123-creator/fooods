require("dotenv").config(); // 환경변수 로드
const express = require("express");
const session = require("express-session");
const qs = require("qs");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");

const app = express();
const port = process.env.PORT || 4000;

// Render.com 등 리버스 프록시 환경에서 HTTPS 인식을 위한 설정
app.set('trust proxy', 1);

// 정적 파일 서빙 설정 (www 폴더만 서빙 - 보안을 위해 루트 전체 노출 방지)
app.use(express.static(path.join(__dirname, "www")));
app.use(express.json()); // JSON 파싱을 위해 추가
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // 로컬 업로드 서빙

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your session secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: true,       // HTTPS 환경에서만 쿠키 전송
      sameSite: "lax",    // CSRF 보호
      httpOnly: true,     // JS에서 쿠키 접근 차단
      maxAge: 24 * 60 * 60 * 1000 // 24시간
    },
  })
);

const client_id = process.env.KAKAO_CLIENT_ID || "3c6b9b1d740c3c2cb76369773ea57471"; 
const client_secret = process.env.KAKAO_CLIENT_SECRET || "4iVOg0kSdyclGvYfPAJnql8T29w7ECjy";
const domain = "https://myplating.kr";
const redirect_uri = `${domain}/redirect`;
const kauth_host = "https://kauth.kakao.com";
const kapi_host = "https://kapi.kakao.com";

// Multer 메모리 스토리지 및 R2 설정 확인
const upload = multer({ storage: multer.memoryStorage() });
const hasR2Config = process.env.R2_ACCESS_KEY_ID && 
                    process.env.R2_ACCESS_KEY_ID !== "your_access_key_id" &&
                    process.env.R2_SECRET_ACCESS_KEY && 
                    process.env.R2_ENDPOINT && 
                    process.env.R2_BUCKET_NAME;

let s3;
if (hasR2Config) {
  s3 = new S3Client({
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    region: "auto",
  });
  console.log("☁️ Cloudflare R2 클라이언트 초기화 완료!");
} else {
  console.log("⚠️ R2 정보가 설정되지 않았습니다. 파일은 로컬 Fallback 스토리지(/uploads)에 저장됩니다.");
}

// 파일 업로드 API (R2 업로드, R2가 없는 경우 로컬 업로드 폴더에 fallback 저장)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "업로드할 파일이 없습니다." });
    }

    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${crypto.randomUUID()}${fileExtension}`;

    if (hasR2Config) {
      // Cloudflare R2 버킷에 업로드
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      });

      await s3.send(command);
      const publicUrl = `${process.env.R2_PUBLIC_URL_PREFIX}/${fileName}`;
      return res.json({ success: true, url: publicUrl });
    } else {
      // 로컬 Fallback 저장소에 업로드
      const uploadDir = path.join(__dirname, "uploads");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }
      const localFilePath = path.join(uploadDir, fileName);
      fs.writeFileSync(localFilePath, req.file.buffer);
      
      const localUrl = `${domain}/uploads/${fileName}`;
      console.log("[R2 임시 업로드] 설정이 누락되어 로컬에 저장되었습니다:", localUrl);
      return res.json({ success: true, url: localUrl });
    }
  } catch (error) {
    console.error("파일 업로드 오류:", error);
    return res.status(500).json({ success: false, message: "파일 업로드 중 오류가 발생했습니다: " + error.message });
  }
});

const message_template = {
  object_type: "text",
  text: "Hello, world!",
  link: {
    web_url: "https://developers.kakao.com",
    mobile_web_url: "https://developers.kakao.com",
  },
};

// 로컬 회원 DB 파일 경로
const USERS_DB_PATH = path.join(__dirname, "users.json");

// 로컬 DB 헬퍼 함수
function readUsers() {
  try {
    if (!fs.existsSync(USERS_DB_PATH)) {
      fs.writeFileSync(USERS_DB_PATH, JSON.stringify([]));
      return [];
    }
    const data = fs.readFileSync(USERS_DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("회원 DB 읽기 실패:", err);
    return [];
  }
}

function writeUsers(users) {
  try {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2), "utf-8");
  } catch (err) {
    console.error("회원 DB 쓰기 실패:", err);
  }
}

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
app.get("/authorize", function (req, res) {
  let { scope } = req.query;
  var scopeParam = "";
  if (scope) {
    scopeParam = "&scope=" + scope;
  }
  
  // 카카오 로그인 시 필수 동의항목 및 선택항목(이메일 등) 요청을 위한 파라미터 구성
  res
    .status(302)
    .redirect(
      `${kauth_host}/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code${scopeParam}`
    );
});

// 2. 카카오 로그인 콜백 핸들러 (인증코드 -> 토큰 교환 -> 회원가입/로그인 처리)
app.get("/redirect", async function (req, res) {
  if (!req.query.code) {
    return res.status(400).send("인증 코드가 누락되었습니다.");
  }

  const tokenParams = {
    grant_type: "authorization_code",
    client_id: client_id,
    redirect_uri: redirect_uri,
    code: req.query.code,
  };

  // client_secret이 비어있지 않은 경우에만 전송합니다. (활성화되지 않았을 때 빈 값을 전송하면 카카오에서 에러가 납니다)
  if (client_secret && client_secret.trim() !== "") {
    tokenParams.client_secret = client_secret;
  }

  const param = qs.stringify(tokenParams);
  const header = { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" };
  
  console.log("[토큰 요청] 전송 파라미터:", { ...tokenParams, client_id: "3c6b...7471" });
  var rtn = await call("POST", kauth_host + "/oauth/token", param, header);

  if (rtn.access_token) {
    req.session.key = rtn.access_token;
    
    // 카카오 프로필 조회
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
        // [회원가입] 신규 회원이므로 로컬 DB에 등록
        isNewUser = true;
        const newUser = {
          kakao_id: kakaoProfile.id,
          nickname: userNickname,
          profile_image: userProfileImg,
          email: userEmail,
          registered_at: new Date().toISOString(),
          last_login_at: new Date().toISOString()
        };
        users.push(newUser);
        writeUsers(users);
        console.log(`[회원가입 완료] 카카오 ID: ${kakaoProfile.id}, 닉네임: ${userNickname}`);
      } else {
        // [로그인] 기존 회원이므로 최종 로그인 시간 업데이트
        isNewUser = false;
        users[existingUserIdx].last_login_at = new Date().toISOString();
        // 최신 프로필 정보 업데이트 반영
        users[existingUserIdx].nickname = userNickname;
        users[existingUserIdx].profile_image = userProfileImg;
        users[existingUserIdx].email = userEmail;
        writeUsers(users);
        console.log(`[로그인 완료] 카카오 ID: ${kakaoProfile.id}, 닉네임: ${userNickname}`);
      }

      // 세션에 유저 세부 정보 저장
      req.session.user = {
        kakao_id: kakaoProfile.id,
        nickname: userNickname,
        profile_image: userProfileImg,
        email: userEmail
      };
      req.session.isNewUser = isNewUser;

      // 로그인 성공 상태로 프론트엔드로 리다이렉트
      res.status(302).redirect(`${domain}/index.html?login=success`);
    } else {
      res.status(500).send("카카오 프로필 정보를 가져오지 못했습니다.");
    }
  } else {
    res.status(400).send("카카오 토큰 발급에 실패했습니다: " + JSON.stringify(rtn));
  }
});

// 3. 현재 로그인된 유저 프로필 조회 API
app.get("/profile", async function (req, res) {
  if (!req.session.key || !req.session.user) {
    return res.json({ isLoggedIn: false });
  }

  // 신규 가입 팝업 노출을 위해 세션에서 가져오고, 1회 확인 후 false로 초기화
  const isNewUser = req.session.isNewUser || false;
  req.session.isNewUser = false; 

  res.json({
    isLoggedIn: true,
    isNewUser: isNewUser,
    user: req.session.user
  });
});

// 친구 목록 조회
app.get("/friends", async function (req, res) {
  if (!req.session.key) return res.status(401).send("Unauthorized");
  
  const uri = kapi_host + "/v1/api/talk/friends";
  const param = null;
  const header = {
    Authorization: "Bearer " + req.session.key,
  };
  var rtn = await call("GET", uri, param, header);
  res.send(rtn);
});

// 나에게 카카오톡 메시지 보내기
app.get("/message", async function (req, res) {
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

// 친구에게 메시지 보내기
app.get("/friend-message", async function (req, res) {
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

// 4. 로그아웃 API (토큰 만료 및 세션 제거)
app.get("/logout", async function (req, res) {
  if (!req.session.key) {
    req.session.destroy();
    return res.json({ success: true });
  }

  const uri = kapi_host + "/v1/user/logout";
  const header = {
    Authorization: "Bearer " + req.session.key,
  };
  var rtn = await call("POST", uri, null, header);
  
  req.session.destroy();
  res.json({ success: true, detail: rtn });
});

// 5. 회원 탈퇴 (카카오 연동 해제 & 로컬 DB 삭제 & 세션 제거)
app.get("/unlink", async function (req, res) {
  if (!req.session.key) {
    return res.status(401).json({ success: false, message: "로그인 상태가 아닙니다." });
  }

  const kakaoId = req.session.user ? req.session.user.kakao_id : null;

  // 카카오 계정 앱 연동 해제 요청
  const uri = kapi_host + "/v1/user/unlink";
  const header = {
    Authorization: "Bearer " + req.session.key,
  };
  var rtn = await call("POST", uri, null, header);

  // 로컬 DB에서 해당 카카오 ID를 삭제 (회원 탈퇴 완료)
  if (kakaoId) {
    const users = readUsers();
    const filteredUsers = users.filter(u => u.kakao_id !== kakaoId);
    writeUsers(filteredUsers);
    console.log(`[회원탈퇴 완료] 로컬 DB에서 카카오 ID ${kakaoId} 정보 삭제`);
  }

  req.session.destroy();
  res.json({ success: true, detail: rtn });
});

// 실시간 링크 메타데이터 파싱 API (Naver Map 리다이렉트 및 플레이트 API 자동 추적 연동)
app.get("/api/link-meta", async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ success: false, message: "올바르지 않은 URL입니다." });
  }

  const lowerUrl = url.toLowerCase();
  let host = "";
  try {
    host = new URL(url).hostname.replace("www.", "");
  } catch (e) {}

  // 1. 네이버 지도 단축 링크/상세 주소 판별 및 네이버 내부 플레이스 summary API 호출
  if (lowerUrl.includes("naver.me") || lowerUrl.includes("map.naver")) {
    try {
      const redirectRes = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        },
        maxRedirects: 5
      });
      const finalUrl = redirectRes.request.res.responseUrl || url;
      
      let placeId = null;
      const placeMatch = finalUrl.match(/place\/(\d+)/);
      if (placeMatch) {
        placeId = placeMatch[1];
      } else {
        const pinIdMatch = finalUrl.match(/pinId=(\d+)/);
        if (pinIdMatch) {
          placeId = pinIdMatch[1];
        }
      }

      if (placeId) {
        const summaryUrl = `https://map.naver.com/p/api/place/summary/${placeId}?lang=ko`;
        const summaryRes = await axios.get(summaryUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            "Referer": "https://map.naver.com/"
          }
        });
        if (summaryRes.status === 200 && summaryRes.data && summaryRes.data.data) {
          const detail = summaryRes.data.data.placeDetail;
          if (detail) {
            let imgUrl = "https://ssl.pstatic.net/static/maps/m/navermap_80_80.png";
            if (detail.images && detail.images.images && detail.images.images.length > 0) {
              imgUrl = detail.images.images[0].origin;
            }
            return res.json({
              success: true,
              title: detail.name || "네이버 지도 장소",
              image: imgUrl,
              host: "naver.map"
            });
          }
        }
      }
    } catch (err) {
      console.error("네이버 지도 파싱 에러:", err.message);
    }
  }

  // 2. 일반 사이트 크롤링 (Axios로 HTML 받아서 og 태그 파싱)
  try {
    const htmlRes = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      timeout: 5000
    });
    
    if (htmlRes.status === 200) {
      const html = htmlRes.data;
      
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                           html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                           html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
                           
      let title = ogTitleMatch ? ogTitleMatch[1] : "";
      let image = ogImageMatch ? ogImageMatch[1] : "";
      
      if (!title) {
        const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleTagMatch) title = titleTagMatch[1];
      }
      
      if (!image) {
        const imgTagMatch = html.match(/<img[^>]*src=["']([^"']+)["']/i);
        if (imgTagMatch) image = imgTagMatch[1];
      }
      
      if (image && !image.startsWith("http")) {
        try {
          image = new URL(image, url).href;
        } catch (e) {}
      }

      return res.json({
        success: true,
        title: title ? title.trim() : "상세 링크",
        image: image || "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
        host: host
      });
    }
  } catch (err) {
    console.error("일반 링크 크롤링 에러:", err.message);
  }

  // Fallback
  return res.json({
    success: true,
    title: "상세 링크",
    image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
    host: host
  });
});

app.listen(port, () => {
  console.log(`Server is running at ${domain}`);
});
