require("dotenv").config(); // 환경변수 로드
const express = require("express");
const session = require("express-session");
const qs = require("qs");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const app = express();
const port = process.env.PORT || 4000;

// Render.com 등 리버스 프록시 환경에서 HTTPS 인식을 위한 설정
app.set('trust proxy', 1);

// 정적 파일 서빙 설정 (www 폴더만 서빙 - 보안을 위해 루트 전체 노출 방지)
app.use(express.static(path.join(__dirname, "www")));
app.use(express.json()); // JSON 파싱을 위해 추가
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // 로컬 업로드 서빙

const isProd = process.env.NODE_ENV === "production" || process.env.PORT !== undefined;

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

const client_id = process.env.KAKAO_CLIENT_ID || "3c6b9b1d740c3c2cb76369773ea57471"; 
const client_secret = process.env.KAKAO_CLIENT_SECRET || "";
const domain = "https://myplating.kr";
const redirect_uri = `${domain}/redirect`;
const kauth_host = "https://kauth.kakao.com";
const kapi_host = "https://kapi.kakao.com";

// Multer 메모리 스토리지 및 R2 설정 확인
const upload = multer({ storage: multer.memoryStorage() });
const r2AccessKey = process.env.R2_ACCESS_KEY_ID && process.env.R2_ACCESS_KEY_ID !== "your_access_key_id"
  ? process.env.R2_ACCESS_KEY_ID
  : "c65e4f5b673b8c078bb45580a7048345";

const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY && process.env.R2_SECRET_ACCESS_KEY !== "your_secret_access_key"
  ? process.env.R2_SECRET_ACCESS_KEY
  : "b9d98a5f5140d5e906fa1d4adc6c683fbc8fe806df5f066d63cbdf5388696ce0";

const r2Endpoint = process.env.R2_ENDPOINT && process.env.R2_ENDPOINT !== "your_endpoint"
  ? process.env.R2_ENDPOINT
  : "https://c71e0a51308ce79fa0dd89bb9d56876d.r2.cloudflarestorage.com";

const r2Bucket = process.env.R2_BUCKET_NAME && process.env.R2_BUCKET_NAME !== "your_bucket_name"
  ? process.env.R2_BUCKET_NAME
  : "food-images";

const r2PublicPrefix = process.env.R2_PUBLIC_URL_PREFIX && process.env.R2_PUBLIC_URL_PREFIX !== "your_public_url_prefix"
  ? process.env.R2_PUBLIC_URL_PREFIX
  : "https://pub-0452a32d8622413c88efc3f7d673805d.r2.dev";

// 로컬 DB 파일 경로 정의
const USERS_DB_PATH = path.join(__dirname, "users.json");
const REPORTS_DB_PATH = path.join(__dirname, "reports.json");
const MODERATION_RULES_PATH = path.join(__dirname, "moderation_rules.json");
const ADMIN_LOGS_PATH = path.join(__dirname, "admin_logs.json");
const ADMIN_CONFIG_PATH = path.join(__dirname, "admin_config.json");
const RECIPE_POSTS_DB_PATH = path.join(__dirname, "recipe_posts.json");
const COMMUNITY_POSTS_DB_PATH = path.join(__dirname, "community_posts.json");

const hasR2Config = r2AccessKey && r2SecretKey && r2Endpoint && r2Bucket;

let s3;
if (hasR2Config) {
  s3 = new S3Client({
    endpoint: r2Endpoint,
    credentials: {
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
    },
    region: "auto",
  });
  console.log("☁️ Cloudflare R2 클라이언트 초기화 완료!");
} else {
  console.log("⚠️ R2 정보가 설정되지 않았습니다. 파일은 로컬 Fallback 스토리지(/uploads)에 저장됩니다.");
}

// R2 백업 및 복원 헬퍼 함수 정의
async function uploadToR2(fileName, content, contentType = "application/json") {
  if (!hasR2Config) return;
  try {
    const command = new PutObjectCommand({
      Bucket: r2Bucket,
      Key: fileName,
      Body: typeof content === "string" ? Buffer.from(content, "utf-8") : content,
      ContentType: contentType,
    });
    await s3.send(command);
    console.log(`[R2 백업 성공] ${fileName}`);
  } catch (err) {
    console.error(`[R2 백업 실패] ${fileName}:`, err.message);
  }
}

async function downloadFromR2(fileName, localPath) {
  if (!hasR2Config) return;
  try {
    const command = new GetObjectCommand({
      Bucket: r2Bucket,
      Key: fileName,
    });
    const response = await s3.send(command);
    
    // Node.js 스트림을 문자열로 변환하는 호환성 헬퍼
    const bodyToString = async (stream) => {
      if (stream.transformToString) {
        return await stream.transformToString("utf-8");
      }
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    };

    const bodyContents = await bodyToString(response.Body);
    fs.writeFileSync(localPath, bodyContents, "utf-8");
    console.log(`[R2 복원 성공] ${fileName} -> ${localPath}`);
  } catch (err) {
    if (err.name !== "NoSuchKey" && err.code !== "NoSuchKey") {
      console.error(`[R2 복원 에러] ${fileName}:`, err.message);
    }
  }
}

async function syncDbsFromR2() {
  if (!hasR2Config) return;
  console.log("🔄 R2에서 로컬 데이터베이스 복원을 시작합니다...");
  try {
    await downloadFromR2("users.json", USERS_DB_PATH);
    await downloadFromR2("reports.json", REPORTS_DB_PATH);
    await downloadFromR2("moderation_rules.json", MODERATION_RULES_PATH);
    await downloadFromR2("admin_logs.json", ADMIN_LOGS_PATH);
    await downloadFromR2("admin_config.json", ADMIN_CONFIG_PATH);
    await downloadFromR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    await downloadFromR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    console.log("✅ 로컬 데이터베이스 복원 완료!");
  } catch (err) {
    console.error("로컬 데이터베이스 복원 실패:", err.message);
  }
}

if (hasR2Config) {
  syncDbsFromR2().catch(err => console.error("R2 복원 실행 실패:", err));
}

// 파일 업로드 API (R2 업로드, R2가 없는 경우 로컬 업로드 폴더에 fallback 저장)
// 파일 업로드 API (Firebase Storage 업로드)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "업로드할 파일이 없습니다." });
    }

    const fileExtension = path.extname(req.file.originalname) || ".jpg";
    const uniqueName = `uploads/${crypto.randomUUID()}${fileExtension}`;

    // === 1순위: Cloudflare R2 직접 업로드 (영구 CDN URL) ===
    if (hasR2Config && s3) {
      try {
        console.log(`[R2 Upload] Uploading ${uniqueName} to R2...`);
        const command = new PutObjectCommand({
          Bucket: r2Bucket,
          Key: uniqueName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
          CacheControl: "public, max-age=31536000",
        });
        await s3.send(command);
        const publicUrl = `${r2PublicPrefix}/${uniqueName}`;
        console.log("[R2 Upload] Success! URL:", publicUrl);
        return res.json({ success: true, url: publicUrl });
      } catch (r2Err) {
        console.error("[R2 Upload] Failed:", r2Err.message);
        // R2 실패 시 Firebase Storage로 폴백
      }
    }

    // === 2순위: Firebase Storage REST API (폴백) ===
    const fbFileName = `uploads/${crypto.randomUUID()}${fileExtension}`;
    let bucket = "plating-app-db29f.firebasestorage.app";
    let uploadSuccess = false;
    let downloadUrl = "";

    async function attemptStorageUpload(targetBucket) {
      const url = `https://firebasestorage.googleapis.com/v0/b/${targetBucket}/o?name=${encodeURIComponent(fbFileName)}`;
      const response = await axios.post(url, req.file.buffer, {
        headers: { "Content-Type": req.file.mimetype }
      });
      if (response.data && response.data.name) {
        const downloadToken = response.data.downloadTokens || "";
        return `https://firebasestorage.googleapis.com/v0/b/${targetBucket}/o/${encodeURIComponent(response.data.name)}?alt=media&token=${downloadToken}`;
      }
      throw new Error("Invalid storage response");
    }

    try {
      console.log(`[Firebase Storage] Uploading to bucket: ${bucket}...`);
      downloadUrl = await attemptStorageUpload(bucket);
      uploadSuccess = true;
    } catch (err) {
      console.warn(`[Firebase Storage] Upload to ${bucket} failed: ${err.message}. Trying appspot.com fallback...`);
      try {
        bucket = "plating-app-db29f.appspot.com";
        downloadUrl = await attemptStorageUpload(bucket);
        uploadSuccess = true;
      } catch (err2) {
        console.error("[Firebase Storage] Fallback upload also failed:", err2.message);
      }
    }

    if (uploadSuccess) {
      console.log("[Firebase Storage] Upload success! URL:", downloadUrl);
      return res.json({ success: true, url: downloadUrl });
    }

    // === 3순위: 로컬 임시 저장 (최후 수단) ===
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const localFileName = `${crypto.randomUUID()}${fileExtension}`;
    const localFilePath = path.join(uploadDir, localFileName);
    fs.writeFileSync(localFilePath, req.file.buffer);
    const localUrl = `${domain}/uploads/${localFileName}`;
    console.log("[Fallback] Local storage saved:", localUrl);
    return res.json({ success: true, url: localUrl });

  } catch (error) {
    console.error("파일 업로드 오류:", error);
    return res.status(500).json({ success: false, message: "파일 업로드 중 오류가 발생했습니다: " + error.message });
  }
});

// --- 3.0. 레시피 및 커뮤니티 포스트 연동 API ---

// 3.0.1. 레시피 포스트 조회
app.get("/api/posts", (req, res) => {
  const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
  const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
  
  // 차단되거나 삭제/숨김 처리된 포스트 및 해당 댓글 필터링
  const filtered = posts.filter(p => 
    !rules.deletedPosts.includes(p.id) && 
    !rules.hiddenPosts.includes(p.id) && 
    !rules.blockedUsers.some(b => b.nickname === p.author)
  ).map(p => ({
    ...p,
    comments: (p.comments || []).filter(c => 
      !rules.deletedComments.includes(c.id) && 
      !rules.blockedUsers.some(b => b.nickname === c.author)
    )
  }));
  
  res.json({ success: true, posts: filtered });
});

// 3.0.2. 레시피 포스트 작성
app.post("/api/posts", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { title, body, category, image, productLinks, mediaType } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    
    const newPost = {
      id: crypto.randomUUID(),
      author: req.session.user.nickname,
      avatarImg: req.session.user.profile_image || "",
      title,
      body,
      category,
      mediaType: mediaType || "image",
      image: image || [],
      productLinks: productLinks || [],
      likeCount: 0,
      likedBy: [],
      scrappedBy: [],
      comments: [],
      createdAt: new Date().toLocaleDateString(),
      timestamp: new Date().toISOString()
    };
    
    posts.unshift(newPost);
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true, post: newPost });
  } catch (err) {
    console.error("포스트 추가 에러:", err);
    res.status(500).json({ success: false, message: "포스트 추가 중 오류가 발생했습니다." });
  }
});

// 3.0.3. 레시피 포스트 좋아요 토글
app.post("/api/posts/like", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.likedBy = post.likedBy || [];
    const nickname = req.session.user.nickname;
    const isLiked = post.likedBy.includes(nickname);
    
    if (isLiked) {
      post.likedBy = post.likedBy.filter(n => n !== nickname);
      post.likeCount = Math.max(0, (post.likeCount || 1) - 1);
    } else {
      post.likedBy.push(nickname);
      post.likeCount = (post.likeCount || 0) + 1;
    }
    
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true, post });
  } catch (err) {
    console.error("좋아요 오류:", err);
    res.status(500).json({ success: false, message: "좋아요 처리 중 오류가 발생했습니다." });
  }
});

// 3.0.4. 레시피 포스트 스크랩 토글
app.post("/api/posts/scrap", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.scrappedBy = post.scrappedBy || [];
    const nickname = req.session.user.nickname;
    const isScrapped = post.scrappedBy.includes(nickname);
    
    if (isScrapped) {
      post.scrappedBy = post.scrappedBy.filter(n => n !== nickname);
    } else {
      post.scrappedBy.push(nickname);
    }
    
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true, post });
  } catch (err) {
    console.error("스크랩 오류:", err);
    res.status(500).json({ success: false, message: "스크랩 처리 중 오류가 발생했습니다." });
  }
});

// 3.0.5. 레시피 포스트 댓글 작성
app.post("/api/posts/comment", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, text } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.comments = post.comments || [];
    const newComment = {
      id: crypto.randomUUID(),
      author: req.session.user.nickname,
      text: text
    };
    post.comments.push(newComment);
    
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true, post });
  } catch (err) {
    console.error("댓글 오류:", err);
    res.status(500).json({ success: false, message: "댓글 등록 중 오류가 발생했습니다." });
  }
});

// 3.0.6. 레시피 포스트 댓글 수정
app.post("/api/posts/comment/edit", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, commentId, text } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.comments = post.comments || [];
    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
    }
    if (comment.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "수정 권한이 없습니다." });
    }
    
    comment.text = text;
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true, post });
  } catch (err) {
    console.error("댓글 수정 오류:", err);
    res.status(500).json({ success: false, message: "댓글 수정 중 오류가 발생했습니다." });
  }
});

// 3.0.7. 레시피 포스트 댓글 삭제
app.post("/api/posts/comment/delete", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, commentId } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.comments = post.comments || [];
    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
    }
    if (comment.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "삭제 권한이 없습니다." });
    }
    
    post.comments = post.comments.filter(c => c.id !== commentId);
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true, post });
  } catch (err) {
    console.error("댓글 삭제 오류:", err);
    res.status(500).json({ success: false, message: "댓글 삭제 중 오류가 발생했습니다." });
  }
});

// 3.0.8. 레시피 포스트 수정
app.post("/api/posts/edit", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, title, body } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    if (post.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "수정 권한이 없습니다." });
    }
    
    post.title = title;
    post.body = body;
    
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true, post });
  } catch (err) {
    console.error("수정 오류:", err);
    res.status(500).json({ success: false, message: "수정 중 오류가 발생했습니다." });
  }
});

// 3.0.9. 레시피 포스트 삭제
app.post("/api/posts/delete", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId } = req.body;
    const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
    const postIdx = posts.findIndex(p => p.id === postId);
    if (postIdx === -1) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    const post = posts[postIdx];
    if (post.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "삭제 권한이 없습니다." });
    }
    
    posts.splice(postIdx, 1);
    writeJsonFile(RECIPE_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("recipe_posts.json", RECIPE_POSTS_DB_PATH);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("삭제 오류:", err);
    res.status(500).json({ success: false, message: "삭제 중 오류가 발생했습니다." });
  }
});

// --- 3.0.10. 커뮤니티 포스트 조회
app.get("/api/community-posts", (req, res) => {
  const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
  const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
  
  // 차단되거나 삭제 처리된 포스트 및 해당 댓글 필터링
  const filtered = posts.filter(p => 
    !rules.deletedPosts.includes(p.id) && 
    !rules.blockedUsers.some(b => b.nickname === p.author)
  ).map(p => ({
    ...p,
    comments: (p.comments || []).filter(c => 
      !rules.deletedComments.includes(c.id) && 
      !rules.blockedUsers.some(b => b.nickname === c.author)
    )
  }));
  
  res.json({ success: true, communityPosts: filtered });
});

// --- 3.0.11. 커뮤니티 포스트 작성
app.post("/api/community-posts", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { title, body, category, image } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    
    const newPost = {
      id: crypto.randomUUID(),
      author: req.session.user.nickname,
      avatarImg: req.session.user.profile_image || "",
      title,
      body,
      category,
      image: image || [],
      likeCount: 0,
      likedBy: [],
      scrappedBy: [],
      comments: [],
      createdAt: "방금 전",
      timestamp: new Date().toISOString()
    };
    
    posts.unshift(newPost);
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true, communityPost: newPost });
  } catch (err) {
    console.error("커뮤니티 포스트 추가 에러:", err);
    res.status(500).json({ success: false, message: "포스트 추가 중 오류가 발생했습니다." });
  }
});

// --- 3.0.12. 커뮤니티 포스트 좋아요 토글
app.post("/api/community-posts/like", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.likedBy = post.likedBy || [];
    const nickname = req.session.user.nickname;
    const isLiked = post.likedBy.includes(nickname);
    
    if (isLiked) {
      post.likedBy = post.likedBy.filter(n => n !== nickname);
      post.likeCount = Math.max(0, (post.likeCount || 1) - 1);
    } else {
      post.likedBy.push(nickname);
      post.likeCount = (post.likeCount || 0) + 1;
    }
    
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("좋아요 오류:", err);
    res.status(500).json({ success: false, message: "좋아요 처리 중 오류가 발생했습니다." });
  }
});

// --- 3.0.13. 커뮤니티 포스트 스크랩 토글
app.post("/api/community-posts/scrap", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.scrappedBy = post.scrappedBy || [];
    const nickname = req.session.user.nickname;
    const isScrapped = post.scrappedBy.includes(nickname);
    
    if (isScrapped) {
      post.scrappedBy = post.scrappedBy.filter(n => n !== nickname);
    } else {
      post.scrappedBy.push(nickname);
    }
    
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("스크랩 오류:", err);
    res.status(500).json({ success: false, message: "스크랩 처리 중 오류가 발생했습니다." });
  }
});

// --- 3.0.14. 커뮤니티 포스트 댓글 작성
app.post("/api/community-posts/comment", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, text } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.comments = post.comments || [];
    const newComment = {
      id: crypto.randomUUID(),
      author: req.session.user.nickname,
      text: text
    };
    post.comments.push(newComment);
    
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("댓글 오류:", err);
    res.status(500).json({ success: false, message: "댓글 등록 중 오류가 발생했습니다." });
  }
});

// --- 3.0.15. 커뮤니티 포스트 댓글 수정
app.post("/api/community-posts/comment/edit", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, commentId, text } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.comments = post.comments || [];
    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
    }
    if (comment.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "수정 권한이 없습니다." });
    }
    
    comment.text = text;
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("댓글 수정 오류:", err);
    res.status(500).json({ success: false, message: "댓글 수정 중 오류가 발생했습니다." });
  }
});

// --- 3.0.16. 커뮤니티 포스트 댓글 삭제
app.post("/api/community-posts/comment/delete", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, commentId } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    
    post.comments = post.comments || [];
    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "댓글을 찾을 수 없습니다." });
    }
    if (comment.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "삭제 권한이 없습니다." });
    }
    
    post.comments = post.comments.filter(c => c.id !== commentId);
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("댓글 삭제 오류:", err);
    res.status(500).json({ success: false, message: "댓글 삭제 중 오류가 발생했습니다." });
  }
});

// --- 3.0.17. 커뮤니티 포스트 수정
app.post("/api/community-posts/edit", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId, title, body } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    if (post.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "수정 권한이 없습니다." });
    }
    
    post.title = title;
    post.body = body;
    
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("수정 오류:", err);
    res.status(500).json({ success: false, message: "수정 중 오류가 발생했습니다." });
  }
});

// --- 3.0.18. 커뮤니티 포스트 삭제
app.post("/api/community-posts/delete", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const { postId } = req.body;
    const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
    const postIdx = posts.findIndex(p => p.id === postId);
    if (postIdx === -1) {
      return res.status(404).json({ success: false, message: "포스트를 찾을 수 없습니다." });
    }
    const post = posts[postIdx];
    if (post.author !== req.session.user.nickname && req.session.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "삭제 권한이 없습니다." });
    }
    
    posts.splice(postIdx, 1);
    writeJsonFile(COMMUNITY_POSTS_DB_PATH, posts);
    if (hasR2Config) {
      await uploadToR2("community_posts.json", COMMUNITY_POSTS_DB_PATH);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("삭제 오류:", err);
    res.status(500).json({ success: false, message: "삭제 중 오류가 발생했습니다." });
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


const DEFAULT_RECIPE_POSTS = [
  {
    id: "1",
    author: "푸드스타일리스트",
    title: "미니멀 주방에서 만드는 감성 바질 파스타",
    body: "오늘 아침에는 직접 기른 #바질 로 #페스토 를 만들고, 엑스트라 버진 #올리브유 를 듬뿍 둘러 파스타를 요리해봤습니다. 무채색으로 정돈된 주방에서 만드는 요리는 늘 마음을 차분하게 해주네요. 제가 쓴 올리브유와 팬 정보는 하단에 달아둘게요!",
    category: "레시피",
    mediaType: "image",
    image: [
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&q=80&w=800"
    ],
    likeCount: 42,
    likedBy: [],
    scrappedBy: [],
    comments: [
      { id: "c1", author: "요린이", text: "식기류 너무 예쁘네요. 팬 정보 링크 타고 구매했어요!" },
      { id: "c2", author: "홈카페", text: "바질 페스토 레시피도 알려주실 수 있나요?" }
    ],
    productLinks: [
      {
        id: "l1",
        title: "유기농 압착 올리브유 500ml (엑스트라 버진)",
        image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=200",
        url: "https://www.coupang.com/vp/products/12345",
        host: "coupang.com"
      }
    ],
    createdAt: "2026-06-01T00:00:00.000Z"
  },
  {
    id: "2",
    author: "카페투어러",
    title: "성수동 핫플 감성 에스프레소 바 방문 후기",
    body: "성수동 골목길에 새로 오픈한 모노톤의 에스프레소 바입니다. 화이트와 블랙 마블 테이블이 인상적이고 #크로플 이 아주 쫀득합니다! 매장 장소 정보와 함께 할인 쿠폰 링크를 걸어둘게요. #성수카페 #에스프레소",
    category: "맛집",
    mediaType: "image",
    image: [
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800"
    ],
    likeCount: 88,
    likedBy: [],
    scrappedBy: [],
    comments: [
      { id: "c3", author: "빵돌이", text: "여기 크로플 진짜 맛나요. 쿠폰 바로 구매했습니다!" }
    ],
    productLinks: [],
    createdAt: "2026-06-02T00:00:00.000Z"
  },
  {
    id: "3",
    author: "푸드스타일리스트",
    title: "모던 쿡웨어 세트로 에그 베네딕트 레시피 🍳",
    body: "#에그베네딕트 브런치 홈카페용 레시피입니다. 사진을 보시면서 주방 연출 꿀팁도 얻어 가세요! 노른자를 톡 터뜨리는 게 포인트입니다. #브런치 #홈카페",
    category: "레시피",
    mediaType: "image",
    image: [
      "https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&q=80&w=800"
    ],
    likeCount: 125,
    likedBy: [],
    scrappedBy: [],
    comments: [],
    productLinks: [
      {
        id: "l4",
        title: "무항생제 신선란 10구 (1등급)",
        image: "https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?auto=format&fit=crop&q=80&w=200",
        url: "https://kurly.com/goods/5678",
        host: "kurly.com"
      }
    ],
    createdAt: "2026-06-03T00:00:00.000Z"
  }
];

const DEFAULT_COMMUNITY_POSTS = [
  {
    id: "cp1",
    title: "집에서 스테이크 맛있게 굽는 팁 알려드려요!",
    body: "고기 온도, 팬 온도, 굽는 순서만 지켜도 맛이 달라져요. 굽기 1시간 전에 고기를 실온에 꺼내두는 것이 핵심입니다. 팬에 연기가 살짝 날 정도로 강하게 달군 뒤...",
    category: "자유",
    author: "요리하는곰",
    createdAt: "3시간 전",
    likeCount: 112,
    likedBy: [],
    scrappedBy: [],
    viewCount: 3245,
    comments: [
      { id: "cc1", author: "스테이크러버", text: "꿀팁 감사합니다! 오늘 저녁에 바로 해볼게요." },
      { id: "cc2", author: "고기대장", text: "로즈마리랑 마늘도 같이 넣어서 시어링해주면 향이 더 대박입니다." }
    ],
    image: [
      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=400"
    ]
  },
  {
    id: "cp2",
    title: "에어프라이어로 군고구마 만들기",
    body: "진짜 달달하고 맛있어요! 시간도 별로 안걸려요 🥲 에어프라이어 200도에서 30분 정도 돌려주면 촉촉하고 달콤한 군고구마 완성!",
    category: "자유",
    author: "푸드로버",
    createdAt: "5시간 전",
    likeCount: 98,
    likedBy: [],
    scrappedBy: [],
    viewCount: 2107,
    comments: [
      { id: "cc3", author: "고구마귀신", text: "와 온도 진짜 딱 맞네요! 감사합니다." }
    ],
    image: [
      "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&q=80&w=400"
    ]
  },
  {
    id: "cp3",
    title: "파스타 면 삶을 때 소금은 얼마나 넣어야 하나요?",
    body: "항상 싱거워져서 고민이에요... 😭 물 1L 기준으로 소금 몇 그램 정도 넣는 게 가장 적절한가요? 파스타면 100g 1인분 삶을 때 팁 부탁드려요.",
    category: "질문",
    author: "요리초보",
    createdAt: "7시간 전",
    likeCount: 23,
    likedBy: [],
    scrappedBy: [],
    viewCount: 1872,
    comments: [
      { id: "cc4", author: "파스타마스터", text: "물 1L에 소금 10g(대략 밥숟가락 깎아서 1스푼)이 국룰입니다. 면수 간이 짭짤해야 면에 간이 뱁니다!" }
    ],
    image: []
  },
  {
    id: "cp4",
    title: "강남역 근처 점심 맛집 추천해주세요!",
    body: "1만원 이하 가성비 좋은 곳이면 더 좋을 것 같아요! 직장인들 매일 먹기 좋은 백반집이나 순대국밥 맛집 알고 계시면 정보 공유 부탁드려요.",
    category: "맛집추천",
    author: "맛집탐방러",
    createdAt: "9시간 전",
    likeCount: 31,
    likedBy: [],
    scrappedBy: [],
    viewCount: 2356,
    comments: [],
    image: []
  },
  {
    id: "cp5",
    title: "[공동구매] 제주 감귤 10kg 오픈!",
    body: "이번 제주 감귤 정말 맛있어요 🍊 마감 임박! 서귀포 산지 직송이라 싱싱하고 당도가 13브릭스 이상 나옵니다. 조기 품절될 수 있으니 서두르세요!",
    category: "공동구매",
    author: "공동구매알리미",
    createdAt: "1일 전",
    likeCount: 76,
    likedBy: [],
    scrappedBy: [],
    viewCount: 1043,
    comments: [],
    image: [],
    isAnnouncement: true
  }
];

// 공통 JSON 파일 헬퍼 함수
function readJsonFile(filePath, defaultVal = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), "utf-8");
      return defaultVal;
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`파일 읽기 실패 (${filePath}):`, err);
    return defaultVal;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    const fileName = path.basename(filePath);
    uploadToR2(fileName, JSON.stringify(data, null, 2)).catch(e => console.error("R2 upload error:", e));
  } catch (err) {
    console.error(`파일 쓰기 실패 (${filePath}):`, err);
  }
}

// 동적 관리자 ID 로드
function getAdminIds() {
  const defaultAdminConfig = { admins: [4933844865] };
  const config = readJsonFile(ADMIN_CONFIG_PATH, defaultAdminConfig);
  if (!Array.isArray(config.admins)) {
    return [4933844865];
  }
  return config.admins;
}

// --- Firestore REST API 헬퍼 함수 (users.json 종속성 제거) ---
const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1/projects/plating-app-db29f/databases/(default)/documents";

async function findFirestoreUserByField(fieldName, fieldValue) {
  try {
    const url = `${FIRESTORE_BASE_URL}:runQuery`;
    const payload = {
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: {
          fieldFilter: {
            field: { fieldPath: fieldName },
            op: "EQUAL",
            value: { stringValue: String(fieldValue) }
          }
        },
        limit: 1
      }
    };
    const response = await axios.post(url, payload);
    if (!response.data || !Array.isArray(response.data) || response.data.length === 0 || !response.data[0].document) {
      return null;
    }
    const doc = response.data[0].document;
    const fields = doc.fields || {};
    return {
      uid: doc.name.split("/").pop(),
      username: fields.username?.stringValue || "",
      password: fields.password?.stringValue || "",
      nickname: fields.nickname?.stringValue || "",
      device_id: fields.deviceId?.stringValue || "",
      role: fields.role?.stringValue || "user",
      email: fields.email?.stringValue || "",
      session_token: fields.sessionToken?.stringValue || ""
    };
  } catch (err) {
    console.error(`[Firestore REST] Error finding user by ${fieldName}:`, err.message);
    return null;
  }
}

async function writeFirestoreUser(uid, userData) {
  try {
    const url = `${FIRESTORE_BASE_URL}/users/${uid}`;
    const fields = {};
    for (const [key, val] of Object.entries(userData)) {
      if (val === undefined || val === null) continue;
      fields[key] = { stringValue: String(val) };
    }
    await axios.patch(url, { fields });
    return true;
  } catch (err) {
    console.error("[Firestore REST] Error writing user:", err.message);
    return false;
  }
}

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
    uploadToR2("users.json", JSON.stringify(users, null, 2)).catch(e => console.error("R2 upload error:", e));
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
        
        // 닉네임 중복 방지 (회원가입 시)
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
        userNickname = uniqueNickname; // 세션에 저장할 용도
        console.log(`[회원가입 완료] 카카오 ID: ${kakaoProfile.id}, 닉네임: ${uniqueNickname}`);
      } else {
        // [로그인] 기존 회원이므로 최종 로그인 시간 업데이트
        isNewUser = false;
        users[existingUserIdx].last_login_at = new Date().toISOString();
        // 최신 프로필 이미지와 이메일만 동기화하고, 닉네임은 기존 가입 시점의 커스텀 값을 유지
        userNickname = users[existingUserIdx].nickname;
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
 
       // 로그인 성공 상태로 프론트엔드로 리다이렉트 (토큰 전달)
       res.status(302).redirect(`${domain}/index.html?login=success&token=${rtn.access_token}`);
     } else {
       res.status(500).send("카카오 프로필 정보를 가져오지 못했습니다.");
     }
  } else {
    res.status(400).send("카카오 토큰 발급에 실패했습니다: " + JSON.stringify(rtn));
  }
});

// 2.5. 개인정보처리방침 서빙 API (구글 플레이 및 카카오 연동 대응)
app.get("/privacy", function (req, res) {
  res.sendFile(path.join(__dirname, "www", "privacy.html"));
});

// 2.6. 서비스 이용약관 서빙 API (구글 플레이 연동 대응)
app.get("/terms", function (req, res) {
  res.sendFile(path.join(__dirname, "www", "terms.html"));
});

// 2.7. 일반 로그인 API (데모 로그인 통합 지원 및 bcrypt 해싱 적용)
app.post("/api/login", async function (req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "아이디와 비밀번호를 입력해주세요." });
  }

  try {
    // 1. Firestore에서 유저 아이디 검색
    const user = await findFirestoreUserByField("username", username);
    if (user) {
      let isPasswordValid = false;
      let needsMigration = false;

      // 패스워드가 bcrypt 해시된 형태인지 체크
      const isHashed = typeof user.password === "string" && (user.password.startsWith("$2a$") || user.password.startsWith("$2b$"));

      if (isHashed) {
        isPasswordValid = bcrypt.compareSync(password, user.password);
      } else {
        // 평문 비밀번호 시절 가입 유저 대조
        if (user.password === password) {
          isPasswordValid = true;
          needsMigration = true; // 해싱 마이그레이션 필요 대상 표시
        }
      }

      if (isPasswordValid) {
        // 차단 검사
        const moderationRules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
        if (moderationRules.blockedUsers && moderationRules.blockedUsers.includes(user.nickname)) {
          return res.status(403).json({ success: false, message: "차단된 사용자입니다. 이용이 정지되었습니다." });
        }

        let sessionToken = user.session_token;
        if (!sessionToken) {
          sessionToken = "local_token_" + Math.random().toString(36).substring(2) + "_" + Date.now();
        }

        // 평문 비밀번호 마이그레이션 및 로그인 갱신 데이터 Firestore 저장
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

// 2.8. 일반 회원가입 중복 및 제약 조건 선행 검증 API
app.post("/api/signup/check", async function (req, res) {
  const { username, nickname } = req.body;
  if (!username || !nickname) {
    return res.status(400).json({ success: false, message: "필수 입력 항목이 누락되었습니다." });
  }

  try {
    // 1. 아이디 중복 검증
    const idExists = await findFirestoreUserByField("username", username);
    if (idExists) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 아이디입니다." });
    }

    // 2. 닉네임 중복 검증
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

// --- 스팸 방지용 Rate Limiter 정의 ---
const communityWriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 5, // 최대 5회
  message: { success: false, message: "스팸 방지를 위해 1분에 최대 5개까지만 글을 쓸 수 있습니다. 잠시 후 다시 시도해주세요." },
  standardHeaders: true,
  legacyHeaders: false
});

const signupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 5, // 최대 5회
  message: { success: false, message: "단시간 내 너무 많은 가입 시도가 감지되었습니다. 잠시 후 다시 시도해주세요." },
  standardHeaders: true,
  legacyHeaders: false
});

// 2.8. 일반 회원가입 API (bcrypt 해싱 및 1분 5회 제한 적용)
app.post("/api/signup", signupLimiter, async function (req, res) {
  const { username, password, nickname, deviceId, uid, email } = req.body;
  if (!username || !password || !nickname || !uid) {
    return res.status(400).json({ success: false, message: "필수 입력 항목(아이디, 비번, 닉네임, UID)이 누락되었습니다." });
  }

  try {
    // 1. 아이디 중복 검증
    const idExists = await findFirestoreUserByField("username", username);
    if (idExists) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 아이디입니다." });
    }

    // 2. 닉네임 중복 검증
    const nicknameExists = await findFirestoreUserByField("nickname", nickname);
    if (nicknameExists) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 닉네임입니다." });
    }

    // 비밀번호 Bcrypt 해싱 처리
    const hashedPassword = bcrypt.hashSync(password, 10);
    const sessionToken = "local_token_" + Math.random().toString(36).substring(2) + "_" + Date.now();

    // 3. Firestore의 users 컬렉션에 회원 등록 저장
    const newUserData = {
      uid: uid,
      username: username,
      password: hashedPassword,
      nickname: nickname,
      deviceId: deviceId || "",
      sessionToken: sessionToken,
      profileImage: "",
      email: email || `${username}@myplating.kr`,
      role: "user",
      registeredAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    await writeFirestoreUser(uid, newUserData);

    req.session.key = sessionToken;
    req.session.user = {
      uid: uid,
      username: username,
      nickname: nickname,
      profile_image: "",
      email: email || `${username}@myplating.kr`,
      role: "user"
    };

    return res.json({ success: true, token: sessionToken, user: { username, nickname } });
  } catch (err) {
    console.error("[Signup API] Firestore write error:", err.message);
    return res.status(500).json({ success: false, message: "회원가입 처리 중 오류가 발생했습니다." });
  }
});

// 2.9. 익명 커뮤니티 글쓰기 대리 API (1분 5회 Rate Limiting 적용)
app.post("/api/community/posts", communityWriteLimiter, async function (req, res) {
  const { title, body, category, author, avatarImg, userId, image } = req.body;
  if (!title || !body || !category) {
    return res.status(400).json({ success: false, message: "제목, 본문, 카테고리는 필수 입력 사항입니다." });
  }

  try {
    const url = `${FIRESTORE_BASE_URL}/community_posts`;
    const payload = {
      fields: {
        title: { stringValue: title },
        body: { stringValue: body },
        category: { stringValue: category },
        author: { stringValue: author || "익명 플레이터" },
        avatarImg: { stringValue: avatarImg || "" },
        userId: { stringValue: userId || "anonymous" },
        likeCount: { integerValue: 0 },
        likedBy: { arrayValue: { values: [] } },
        scrappedBy: { arrayValue: { values: [] } },
        comments: { arrayValue: { values: [] } },
        createdAt: { stringValue: "방금 전" },
        timestamp: { stringValue: new Date().toISOString() },
        image: {
          arrayValue: {
            values: (image || []).map(url => ({ stringValue: url }))
          }
        }
      }
    };

    const response = await axios.post(url, payload);
    return res.json({ success: true, id: response.data.name.split("/").pop() });
  } catch (err) {
    console.error("[Community API] Firestore write error:", err.message);
    return res.status(500).json({ success: false, message: "글 등록 중 오류가 발생했습니다." });
  }
});

// 2.10. 신고 등록 및 자동 차단 API (누적 5회 시 숨김 처리)
app.post("/api/report", async function (req, res) {
  const { postId, commentId, reason, reporterId } = req.body;
  if (!postId || !reason) {
    return res.status(400).json({ success: false, message: "신고 대상 ID와 사유는 필수입니다." });
  }

  const finalReporterId = reporterId || req.ip;

  try {
    // 1. 중복 신고 검증
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

    // 2. 새 신고 저장
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

    // 3. 누적 신고 건수 집계
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

    console.log(`[Auto-Mod] Target: ${postId}, Comment: ${commentId || "None"}, Count: ${totalReportsCount}`);

    // 4. 누적 5회 이상 자동 차단 처리
    if (totalReportsCount >= 5) {
      console.log(`[Auto-Mod Action] Hiding post/comment due to accumulated reports: ${postId}`);
      const patchFields = {
        fields: {
          hidden: { booleanValue: true }
        }
      };
      
      // posts 컬렉션 hidden 업데이트 시도
      try {
        await axios.patch(`${FIRESTORE_BASE_URL}/posts/${postId}?updateMask.fieldPaths=hidden`, patchFields);
      } catch(e) {}
      
      // community_posts 컬렉션 hidden 업데이트 시도
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

// 2.11. 게시물 키워드 검색 API (제목/카테고리/본문 부분 일치 한글 매칭 지원)
app.get("/api/search/posts", async function (req, res) {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.json({ success: true, posts: [] });
  }

  try {
    // 1. Firestore에서 전체 posts 문서를 가져옴
    // (대량 문서 시 Algolia 등의 전문 검색 엔진이 유용하나, 현재 중소규모 서비스에서는 메모리 내 부분일치 매칭이 가장 유연하고 완전한 한글 검색을 지원합니다)
    const url = `${FIRESTORE_BASE_URL}/posts`;
    const response = await axios.get(url);
    const documents = response.data.documents || [];

    const matchedPosts = [];
    for (const doc of documents) {
      const fields = doc.fields || {};
      const title = (fields.title?.stringValue || "").toLowerCase();
      const body = (fields.body?.stringValue || "").toLowerCase();
      const category = (fields.category?.stringValue || "").toLowerCase();
      const author = (fields.author?.stringValue || "").toLowerCase();
      const hidden = fields.hidden?.booleanValue || false;

      if (hidden) continue; // 신고 숨김 글 배제

      // 부분 일치 매칭 판정
      if (title.includes(query) || body.includes(query) || category.includes(query) || author.includes(query)) {
        // Firestore Document 구조에서 일반 JavaScript 객체로 디코딩
        const productLinks = [];
        if (fields.productLinks?.arrayValue?.values) {
          fields.productLinks.arrayValue.values.forEach(v => {
            const f = v.mapValue?.fields || {};
            productLinks.push({
              id: f.id?.stringValue || "",
              url: f.url?.stringValue || "",
              title: f.title?.stringValue || "",
              image: f.image?.stringValue || "",
              host: f.host?.stringValue || ""
            });
          });
        }

        const likedBy = [];
        if (fields.likedBy?.arrayValue?.values) {
          fields.likedBy.arrayValue.values.forEach(v => {
            likedBy.push(v.stringValue);
          });
        }

        const scrappedBy = [];
        if (fields.scrappedBy?.arrayValue?.values) {
          fields.scrappedBy.arrayValue.values.forEach(v => {
            scrappedBy.push(v.stringValue);
          });
        }

        const imageList = [];
        if (fields.image?.arrayValue?.values) {
          fields.image.arrayValue.values.forEach(v => {
            imageList.push(v.stringValue);
          });
        } else if (fields.image?.stringValue) {
          imageList.push(fields.image.stringValue);
        }

        matchedPosts.push({
          id: doc.name.split("/").pop(),
          title: fields.title?.stringValue || "",
          body: fields.body?.stringValue || "",
          category: fields.category?.stringValue || "레시피",
          author: fields.author?.stringValue || "",
          avatarImg: fields.avatarImg?.stringValue || "",
          userId: fields.userId?.stringValue || "",
          image: imageList,
          likeCount: parseInt(fields.likeCount?.integerValue || "0", 10),
          likedBy: likedBy,
          scrappedBy: scrappedBy,
          productLinks: productLinks,
          createdAt: fields.createdAt?.stringValue || "방금 전",
          timestamp: fields.timestamp?.stringValue || ""
        });
      }
    }

    return res.json({ success: true, posts: matchedPosts });
  } catch (err) {
    console.error("[Search Posts API] Error performing search:", err.message);
    return res.status(500).json({ success: false, message: "검색 중 내부 오류가 발생했습니다." });
  }
});

// 2.12. 사용자 닉네임 키워드 검색 API
app.get("/api/search/users", async function (req, res) {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.json({ success: true, users: [] });
  }

  try {
    const url = `${FIRESTORE_BASE_URL}/users`;
    const response = await axios.get(url);
    const documents = response.data.documents || [];

    const matchedUsers = [];
    for (const doc of documents) {
      const fields = doc.fields || {};
      const nickname = (fields.nickname?.stringValue || "").toLowerCase();
      const username = (fields.username?.stringValue || "").toLowerCase();

      if (nickname.includes(query) || username.includes(query)) {
        matchedUsers.push({
          uid: doc.name.split("/").pop(),
          username: fields.username?.stringValue || "",
          nickname: fields.nickname?.stringValue || "",
          profileImage: fields.profileImage?.stringValue || "",
          bio: fields.bio?.stringValue || "플레이팅 크리에이터입니다.",
          role: fields.role?.stringValue || "user"
        });
      }
    }

    return res.json({ success: true, users: matchedUsers });
  } catch (err) {
    console.error("[Search Users API] Error performing user search:", err.message);
    return res.status(500).json({ success: false, message: "사용자 검색 중 오류가 발생했습니다." });
  }
});

// Firebase ID Token 검증 헬퍼 함수
async function verifyFirebaseIdToken(token) {
  try {
    const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyBKat-tCeDuoRr-uzdOeoQXT6PpXHBWJno";
    const res = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      idToken: token
    });
    if (res.data && res.data.users && res.data.users[0]) {
      return res.data.users[0]; // { localId, email, displayName, photoUrl, ... }
    }
  } catch (err) {
    console.error("[verifyFirebaseIdToken] Error:", err.response ? err.response.data : err.message);
  }
  return null;
}

// 3. 현재 로그인된 유저 프로필 조회 API (세션 복원 완전 대응)
app.get("/profile", async function (req, res) {
  const queryToken = req.query.token;
  if (queryToken && queryToken.trim() !== "" && (!req.session.key || !req.session.user)) {
    console.log("[세션 복원 시도] 토큰 감지:", queryToken.substring(0, 10) + "...");
    const users = readUsers();
    
    // 1. Firebase ID Token 검증 처리 (JWT 토큰은 보통 eyJ로 시작함)
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

    // 3.1. 로컬 DB의 session_token에서 우선 조회 (초고속 오프라인 매칭)
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
      // 3.2. 없으면 카카오 API로 유효성 확인 및 동기화 (최초 로그인 콜백 등)
      try {
        const profileUri = kapi_host + "/v2/user/me";
        const profileHeader = {
          "content-Type": "application/x-www-form-urlencoded",
          Authorization: "Bearer " + queryToken,
        };
        const kakaoProfile = await call("POST", profileUri, {}, profileHeader);
        
        if (kakaoProfile && kakaoProfile.id) {
          const existingUserIdx = users.findIndex(u => u.kakao_id === kakaoProfile.id);
          let userNickname = kakaoProfile.properties && kakaoProfile.properties.nickname 
            ? kakaoProfile.properties.nickname 
            : `플레이터_${kakaoProfile.id.toString().slice(-4)}`;
          let userProfileImg = kakaoProfile.properties && kakaoProfile.properties.profile_image 
            ? kakaoProfile.properties.profile_image 
            : "";
          let userEmail = kakaoProfile.kakao_account && kakaoProfile.kakao_account.email 
            ? kakaoProfile.kakao_account.email 
            : "";

          if (existingUserIdx !== -1) {
            userNickname = users[existingUserIdx].nickname;
            userProfileImg = users[existingUserIdx].profile_image || userProfileImg;
            userEmail = users[existingUserIdx].email || userEmail;
            // session_token 동기화
            users[existingUserIdx].session_token = queryToken;
            users[existingUserIdx].last_login_at = new Date().toISOString();
            writeUsers(users);
          } else {
            // 카카오 최초 로그인 시 회원 가입 처리
            let uniqueNickname = userNickname;
            while (users.some(u => u.nickname.toLowerCase() === uniqueNickname.toLowerCase())) {
              uniqueNickname = `${userNickname}_${Math.floor(100 + Math.random() * 900)}`;
            }
            users.push({
              kakao_id: kakaoProfile.id,
              nickname: uniqueNickname,
              profile_image: userProfileImg,
              email: userEmail,
              session_token: queryToken,
              registered_at: new Date().toISOString(),
              last_login_at: new Date().toISOString(),
              role: "user"
            });
            writeUsers(users);
            userNickname = uniqueNickname;
          }

          req.session.key = queryToken;
          req.session.user = {
            kakao_id: kakaoProfile.id,
            nickname: userNickname,
            profile_image: userProfileImg,
            email: userEmail,
            role: (existingUserIdx !== -1 ? users[existingUserIdx].role : "user") || "user"
          };
          console.log(`[세션 복원 성공 - 카카오 API] 카카오 ID: ${kakaoProfile.id}, 닉네임: ${userNickname}`);
        }
      } catch (restoreErr) {
        console.error("[세션 복원 실패] 에러:", restoreErr.message);
      }
    }
  }

  if (!req.session.key || !req.session.user) {
    return res.json({ isLoggedIn: false });
  }

  // 차단 여부 검사
  const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
  const isBlocked = rules.blockedUsers.includes(req.session.user.nickname);
  if (isBlocked) {
    req.session.destroy();
    return res.json({ isLoggedIn: false, isBlocked: true, message: "차단된 사용자입니다." });
  }

  // 신규 가입 팝업 노출을 위해 세션에서 가져오고, 1회 확인 후 false로 초기화
  const isNewUser = req.session.isNewUser || false;
  req.session.isNewUser = false; 

  const admins = getAdminIds();
  const isAdmin = req.session.user.kakao_id ? admins.includes(req.session.user.kakao_id) : (req.session.user.username === "google-tester" || req.session.user.role === "admin");

  res.json({
    isLoggedIn: true,
    isNewUser: isNewUser,
    user: {
      ...req.session.user,
      role: isAdmin ? "admin" : "user"
    }
  });
});

// 프로필 편집 & 중복 닉네임 검증 API
app.post("/profile/update", async function (req, res) {
  if (!req.session.key || !req.session.user) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  const { nickname, bio, avatarImg } = req.body;
  const targetNickname = (nickname || "").trim();

  if (!targetNickname) {
    return res.status(400).json({ success: false, message: "닉네임을 입력해 주세요." });
  }

  const users = readUsers();
  const currentKakaoId = req.session.user.kakao_id;
  const currentUsername = req.session.user.username;

  // 본인을 제외한 다른 가입 유저 중 닉네임 중복 체크
  const isDuplicate = users.some(u => {
    if (currentKakaoId && u.kakao_id === currentKakaoId) return false;
    if (currentUsername && u.username === currentUsername) return false;
    return u.nickname.toLowerCase() === targetNickname.toLowerCase();
  });

  // 기본 시스템 mock 크리에이터명과 겹치는지 체크
  const systemCreators = ["푸드스타일리스트", "카페투어러"];
  const isSystemDuplicate = systemCreators.some(
    name => name.toLowerCase() === targetNickname.toLowerCase()
  );

  if (isDuplicate || isSystemDuplicate) {
    return res.json({ success: false, message: "이미 사용 중인 닉네임입니다. 다른 닉네임을 사용해 주세요." });
  }

  // users.json 업데이트
  const userIdx = users.findIndex(u => {
    if (currentKakaoId && u.kakao_id === currentKakaoId) return true;
    if (currentUsername && u.username === currentUsername) return true;
    return false;
  });

  if (userIdx !== -1) {
    users[userIdx].nickname = targetNickname;
    users[userIdx].bio = bio || "";
    if (avatarImg) {
      users[userIdx].profile_image = avatarImg;
    }
    writeUsers(users);
  }

  // 세션 정보 업데이트
  req.session.user.nickname = targetNickname;
  if (avatarImg) {
    req.session.user.profile_image = avatarImg;
  }

  res.json({ success: true });
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

// 쇼핑몰/사이트별 전용 고해상도 Fallback 데이터 맵 (매칭을 위해 단순 키 사용)
const fallbackMappers = {
  "coupang": {
    title: "쿠팡 추천 상품",
    image: "/assets/logos/coupang.svg"
  },
  "smartstore.naver": {
    title: "네이버 스마트스토어 상품",
    image: "/assets/logos/naver.svg"
  },
  "shopping.naver": {
    title: "네이버 쇼핑 상품",
    image: "/assets/logos/naver.svg"
  },
  "naver": {
    title: "네이버 추천 상품",
    image: "/assets/logos/naver.svg"
  },
  "11st": {
    title: "11번가 추천 상품",
    image: "/assets/logos/11st.svg"
  },
  "gmarket": {
    title: "G마켓 추천 상품",
    image: "/assets/logos/gmarket.svg"
  },
  "auction": {
    title: "옥션 추천 상품",
    image: "/assets/logos/auction.svg"
  },
  "ssg": {
    title: "SSG.COM 추천 상품",
    image: "/assets/logos/ssg.svg"
  },
  "oliveyoung": {
    title: "올리브영 추천 상품",
    image: "/assets/logos/oliveyoung.svg"
  },
  "musinsa": {
    title: "무신사 추천 상품",
    image: "/assets/logos/musinsa.svg"
  }
};

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

  // --- 특정 호스트별 Fallback 맵 매핑 확인 (도메인 포함 관계 확인) ---
  let matchedFallback = null;
  for (const domainKey of Object.keys(fallbackMappers)) {
    if (lowerUrl.includes(domainKey)) {
      matchedFallback = fallbackMappers[domainKey];
      break;
    }
  }

  // 상대 경로 이미지를 백엔드 절대 경로 URL로 바꾸는 헬퍼
  const makeImageAbsolute = (img) => {
    if (!img) return "";
    if (img.startsWith("/")) {
      return `${domain}${img}`;
    }
    return img;
  };

  // --- 공통 헤더 ---
  const pcHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8"
  };
  const mobileHeaders = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9"
  };

  // --- OG 태그 파싱 헬퍼 ---
  function parseOgTags(html) {
    if (!html || typeof html !== "string") return { title: "", image: "" };
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
                 || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                 || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = (ogTitle ? ogTitle[1] : "") || (titleTag ? titleTag[1] : "");
    const image = ogImage ? ogImage[1] : "";
    return { title: title.trim(), image: image.trim() };
  }

  // 1. 네이버 지도 단축 링크/상세 주소 판별 및 네이버 내부 플레이스 summary API 호출
  if (lowerUrl.includes("naver.me") || lowerUrl.includes("map.naver") || lowerUrl.includes("naver.com/p/")) {
    try {
      const redirectRes = await axios.get(url, {
        headers: pcHeaders,
        maxRedirects: 10,
        timeout: 8000
      });
      const finalUrl = redirectRes.request.res?.responseUrl || url;
      
      let placeId = null;
      const placeMatch = finalUrl.match(/place\/(\d+)/);
      if (placeMatch) {
        placeId = placeMatch[1];
      } else {
        const pinIdMatch = finalUrl.match(/pinId=(\d+)/);
        if (pinIdMatch) placeId = pinIdMatch[1];
      }

      if (placeId) {
        try {
          const summaryUrl = `https://map.naver.com/p/api/place/summary/${placeId}?lang=ko`;
          const summaryRes = await axios.get(summaryUrl, {
            headers: { ...pcHeaders, "Referer": "https://map.naver.com/" },
            timeout: 5000
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
                image: makeImageAbsolute(imgUrl),
                host: "naver.map"
              });
            }
          }
        } catch (sumErr) {
          console.error("네이버 Summary API 실패, OG fallback:", sumErr.message);
        }
      }

      // Summary API 실패 시 HTML OG 태그로 fallback
      const ogData = parseOgTags(typeof redirectRes.data === "string" ? redirectRes.data : "");
      if (ogData.title) {
        return res.json({
          success: true,
          title: ogData.title,
          image: makeImageAbsolute(ogData.image || "https://ssl.pstatic.net/static/maps/m/navermap_80_80.png"),
          host: "naver.map"
        });
      }
    } catch (err) {
      console.error("네이버 지도 파싱 에러:", err.message);
    }
  }

  // 1.5. 쿠팡 링크 파싱 (다중 전략: OG tags → JS redirect → URL 상품명)
  if (lowerUrl.includes("coupang") || lowerUrl.includes("coupa.ng")) {
    let coupangTitle = "";
    let coupangImage = matchedFallback ? matchedFallback.image : "/assets/logos/coupang.svg";

    try {
      const coupangRes = await axios.get(url, {
        headers: { ...mobileHeaders, "Cache-Control": "no-cache", "Pragma": "no-cache" },
        maxRedirects: 10,
        timeout: 8000
      });

      if (coupangRes.status === 200) {
        const html = typeof coupangRes.data === "string" ? coupangRes.data : "";
        
        // 전략 1a: OG 태그에서 제목/이미지 추출
        const ogData = parseOgTags(html);
        if (ogData.title && ogData.title !== "쿠팡 | 쿠팡" && ogData.title !== "Coupang") {
          coupangTitle = ogData.title;
          if (ogData.image && ogData.image.startsWith("http")) {
            coupangImage = ogData.image;
          }
        }
        
        // 전략 1b: JS 내부 title= 파라미터 추출
        if (!coupangTitle) {
          const decodedHtml = html.replace(/\\x([0-9A-Fa-f]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16))
          );
          const titleMatch = decodedHtml.match(/title=([^&'"\s]+)/);
          if (titleMatch) {
            try { coupangTitle = decodeURIComponent(titleMatch[1]); } catch(e) {}
          }
        }

        // 전략 1c: 리다이렉트 최종 URL에서 상품명 추출
        if (!coupangTitle) {
          const finalUrl = coupangRes.request?.res?.responseUrl || url;
          const productNameMatch = finalUrl.match(/\/([^/?#]{8,})\?/);
          if (productNameMatch) {
            try {
              const rawName = decodeURIComponent(productNameMatch[1]).replace(/-/g, " ");
              if (rawName.length > 4) coupangTitle = rawName;
            } catch(e) {}
          }
        }
      }
    } catch (err) {
      console.error("쿠팡 링크 파싱 에러:", err.message);
    }

    return res.json({
      success: true,
      title: coupangTitle || (matchedFallback ? matchedFallback.title : "쿠팡 추천 상품"),
      image: makeImageAbsolute(coupangImage),
      host: "coupang.com"
    });
  }

  // 2. 일반 사이트 크롤링 (Axios로 HTML 받아서 og 태그 파싱)
  try {
    const htmlRes = await axios.get(url, {
      headers: pcHeaders,
      maxRedirects: 10,
      timeout: 7000,
      responseType: "text"
    });
    
    if (htmlRes.status === 200) {
      const html = typeof htmlRes.data === "string" ? htmlRes.data : "";
      const ogData = parseOgTags(html);
      
      let title = ogData.title;
      let image = ogData.image;
      
      if (!title) {
        const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleTagMatch) title = titleTagMatch[1].trim();
      }
      if (!image) {
        const imgTagMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgTagMatch) image = imgTagMatch[1];
      }
      
      if (image && !image.startsWith("http")) {
        try { image = new URL(image, url).href; } catch (e) {}
      }

      // 파싱 실패 시 Fallback 병합
      if (!title && matchedFallback) title = matchedFallback.title;
      if (!image && matchedFallback) image = matchedFallback.image;

      // 이미지 최종 검증 (비어있거나 상대 경로인 경우 강제 처리)
      if (!image || (!image.startsWith("http") && !image.startsWith("/"))) {
        image = matchedFallback ? matchedFallback.image : "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400";
      }

      return res.json({
        success: true,
        title: title ? title.substring(0, 100) : (matchedFallback ? matchedFallback.title : "상세 링크"),
        image: makeImageAbsolute(image),
        host: host
      });
    }
  } catch (err) {
    console.error("일반 링크 크롤링 에러:", err.message);
  }

  // Fallback (에러가 나도 지정된 Fallback 쇼핑몰 데이터는 정상 제공)
  const finalFallbackImage = matchedFallback ? matchedFallback.image : "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400";
  return res.json({
    success: true,
    title: matchedFallback ? matchedFallback.title : "상세 링크",
    image: makeImageAbsolute(finalFallbackImage),
    host: host
  });
});

// --- 3. 신고 및 관리자 기능 API ---

// 3.1. 신고 제출 API
app.post("/api/reports", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

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
      reporterKakaoId: req.session.user.kakao_id,
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

// 3.2. 관리자 권한 확인 미들웨어
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

// 3.3. 신고 목록 조회 API (관리자 전용)
app.get("/api/reports", requireAdmin, (req, res) => {
  const reports = readJsonFile(REPORTS_DB_PATH, []);
  res.json({ success: true, reports });
});

// 3.4. 신고 처리 API (관리자 전용)
app.post("/api/reports/handle", requireAdmin, (req, res) => {
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
      // 사용자 차단 (작성자 닉네임을 blockedUsers에 추가)
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
      adminKakaoId: req.session.user.kakao_id,
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

// 3.5. 수동 콘텐츠 중재 API (글쓰기/댓글 삭제 시 호출 가능 - 관리자 전용)
app.post("/api/moderate/delete", requireAdmin, (req, res) => {
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
      adminKakaoId: req.session.user.kakao_id,
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

// 3.6. 수동 콘텐츠 숨김/노출 API (관리자 전용)
app.post("/api/moderate/hide", requireAdmin, (req, res) => {
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
      adminKakaoId: req.session.user.kakao_id,
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

// 3.7. 수동 사용자 차단 API (관리자 전용)
app.post("/api/moderate/block-user", requireAdmin, (req, res) => {
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
        adminKakaoId: req.session.user.kakao_id,
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

// 3.8. 중재 규칙(필터링용 데이터) 조회 API (모든 사용자 접근 가능)
app.get("/api/moderation-rules", (req, res) => {
  const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
  res.json({ success: true, rules });
});

// 3.9. 관리자 로그 조회 API (관리자 전용)
app.get("/api/admin/logs", requireAdmin, (req, res) => {
  const logs = readJsonFile(ADMIN_LOGS_PATH, []);
  res.json({ success: true, logs });
});

app.listen(port, () => {
  console.log(`Server is running at ${domain}`);
});