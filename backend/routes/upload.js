const express = require("express");
const router = express.Router();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const axios = require("axios");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { 
  hasR2Config, 
  s3, 
  r2Bucket, 
  r2PublicPrefix,
  getR2PresignedUrl
} = require("../firebase");

const upload = multer({ storage: multer.memoryStorage() });
const domain = process.env.BACKEND_URL || "http://localhost:4000";

// Cloudflare R2 Presigned URL 발급 API
router.post("/presigned", async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ success: false, message: "filename 및 contentType이 필요합니다." });
    }

    const fileExtension = path.extname(filename) || ".jpg";
    const uniqueKey = `uploads/${crypto.randomUUID()}${fileExtension}`;

    if (!hasR2Config) {
      return res.status(400).json({ success: false, message: "R2 스토리지가 설정되지 않았습니다." });
    }

    const uploadUrl = await getR2PresignedUrl(uniqueKey, contentType);
    const downloadUrl = `${r2PublicPrefix}/${uniqueKey}`;

    return res.json({
      success: true,
      uploadUrl,
      downloadUrl,
      key: uniqueKey
    });
  } catch (error) {
    console.error("Presigned URL 생성 에러:", error);
    return res.status(500).json({ success: false, message: "Presigned URL 발급 실패: " + error.message });
  }
});

// 이미지 업로드 API
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "업로드할 파일이 없습니다." });
    }

    const fileExtension = path.extname(req.file.originalname) || ".jpg";
    const uniqueName = `uploads/${crypto.randomUUID()}${fileExtension}`;

    // === 1순위: Cloudflare R2 직접 업로드 ===
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
      }
    }

    // === 2순위: Firebase Storage REST API (폴백) ===
    let bucket = "plating-app-db29f.firebasestorage.app";
    const fbFileName = `uploads/${crypto.randomUUID()}${fileExtension}`;
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
    const uploadDir = path.join(__dirname, "../uploads");
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

module.exports = router;
