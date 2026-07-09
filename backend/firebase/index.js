const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const axios = require("axios");

// 파일 데이터베이스 경로 정의
const USERS_DB_PATH = path.join(__dirname, "../users.json");
const REPORTS_DB_PATH = path.join(__dirname, "../reports.json");
const MODERATION_RULES_PATH = path.join(__dirname, "../moderation_rules.json");
const ADMIN_LOGS_PATH = path.join(__dirname, "../admin_logs.json");
const ADMIN_CONFIG_PATH = path.join(__dirname, "../admin_config.json");
const RECIPE_POSTS_DB_PATH = path.join(__dirname, "../recipe_posts.json");
const COMMUNITY_POSTS_DB_PATH = path.join(__dirname, "../community_posts.json");

// R2 설정 로드
const r2AccessKey = process.env.R2_ACCESS_KEY_ID !== "your_access_key_id" ? process.env.R2_ACCESS_KEY_ID : "c65e4f5b673b8c078bb45580a7048345";
const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY !== "your_secret_access_key" ? process.env.R2_SECRET_ACCESS_KEY : "b9d98a5f5140d5e906fa1d4adc6c683fbc8fe806df5f066d63cbdf5388696ce0";
const r2Endpoint = process.env.R2_ENDPOINT !== "your_endpoint" ? process.env.R2_ENDPOINT : "https://c71e0a51308ce79fa0dd89bb9d56876d.r2.cloudflarestorage.com";
const r2Bucket = process.env.R2_BUCKET_NAME !== "your_bucket_name" ? process.env.R2_BUCKET_NAME : "food-images";
const r2PublicPrefix = process.env.R2_PUBLIC_URL_PREFIX !== "your_public_url_prefix" ? process.env.R2_PUBLIC_URL_PREFIX : "https://pub-0452a32d8622413c88efc3f7d673805d.r2.dev";

const hasR2Config = r2AccessKey && r2SecretKey && r2Endpoint && r2Bucket;

let s3 = null;
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
}

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

// R2 백업 및 복원 헬퍼
async function uploadToR2(fileName, content, contentType = "application/json") {
  if (!hasR2Config || !s3) return;
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
  if (!hasR2Config || !s3) return;
  try {
    const command = new GetObjectCommand({
      Bucket: r2Bucket,
      Key: fileName,
    });
    const response = await s3.send(command);
    
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

async function getR2PresignedUrl(key, contentType) {
  if (!hasR2Config || !s3) {
    throw new Error("R2 config is missing or invalid");
  }
  const command = new PutObjectCommand({
    Bucket: r2Bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000",
  });
  // 5분 유효시간 (300초)
  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return url;
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

// --- Firestore REST API 헬퍼 함수 ---
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

function readUsers() {
  return readJsonFile(USERS_DB_PATH, []);
}

function writeUsers(users) {
  writeJsonFile(USERS_DB_PATH, users);
}

// FCM 알림 검증 API 용
async function verifyFirebaseIdToken(token) {
  try {
    const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyBKat-tCeDuoRr-uzdOeoQXT6PpXHBWJno";
    const res = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      idToken: token
    });
    if (res.data && res.data.users && res.data.users[0]) {
      return res.data.users[0];
    }
  } catch (err) {
    console.error("[verifyFirebaseIdToken] Error:", err.response ? err.response.data : err.message);
  }
  return null;
}

module.exports = {
  USERS_DB_PATH,
  REPORTS_DB_PATH,
  MODERATION_RULES_PATH,
  ADMIN_LOGS_PATH,
  ADMIN_CONFIG_PATH,
  RECIPE_POSTS_DB_PATH,
  COMMUNITY_POSTS_DB_PATH,
  hasR2Config,
  s3,
  r2Bucket,
  r2PublicPrefix,
  readJsonFile,
  writeJsonFile,
  uploadToR2,
  downloadFromR2,
  syncDbsFromR2,
  getR2PresignedUrl,
  findFirestoreUserByField,
  writeFirestoreUser,
  readUsers,
  writeUsers,
  verifyFirebaseIdToken
};
