const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const { communityWriteLimiter, likeLimiter, commentLimiter } = require("../middlewares");
const {
  readJsonFile,
  writeJsonFile,
  RECIPE_POSTS_DB_PATH,
  COMMUNITY_POSTS_DB_PATH,
  MODERATION_RULES_PATH,
  hasR2Config,
  uploadToR2
} = require("../firebase");

const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1/projects/plating-app-db29f/databases/(default)/documents";

// 임시 요리 게시글 목록 (폴백용)
const DEFAULT_RECIPE_POSTS = [];
const DEFAULT_COMMUNITY_POSTS = [];

// 1. 레시피 포스트 조회
router.get("/posts", (req, res) => {
  const posts = readJsonFile(RECIPE_POSTS_DB_PATH, DEFAULT_RECIPE_POSTS);
  const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
  
  const filtered = posts.filter(p => 
    !rules.deletedPosts.includes(p.id) && 
    !rules.hiddenPosts.includes(p.id) && 
    !rules.blockedUsers.some(b => typeof b === "string" ? b === p.author : b.nickname === p.author)
  ).map(p => ({
    ...p,
    comments: (p.comments || []).filter(c => 
      !rules.deletedComments.includes(c.id) && 
      !rules.blockedUsers.some(b => typeof b === "string" ? b === c.author : b.nickname === c.author)
    )
  }));
  
  res.json({ success: true, posts: filtered });
});

// 2. 레시피 포스트 작성
router.post("/posts", async (req, res) => {
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
    res.json({ success: true, post: newPost });
  } catch (err) {
    console.error("포스트 추가 에러:", err);
    res.status(500).json({ success: false, message: "포스트 추가 중 오류가 발생했습니다." });
  }
});

// 3. 레시피 포스트 좋아요 토글
router.post("/posts/like", likeLimiter, async (req, res) => {
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
    res.json({ success: true, post });
  } catch (err) {
    console.error("좋아요 오류:", err);
    res.status(500).json({ success: false, message: "좋아요 처리 중 오류가 발생했습니다." });
  }
});

// 4. 레시피 포스트 스크랩 토글
router.post("/posts/scrap", async (req, res) => {
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
    res.json({ success: true, post });
  } catch (err) {
    console.error("스크랩 오류:", err);
    res.status(500).json({ success: false, message: "스크랩 처리 중 오류가 발생했습니다." });
  }
});

// 5. 레시피 포스트 댓글 작성
router.post("/posts/comment", commentLimiter, async (req, res) => {
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
    res.json({ success: true, post });
  } catch (err) {
    console.error("댓글 오류:", err);
    res.status(500).json({ success: false, message: "댓글 등록 중 오류가 발생했습니다." });
  }
});

// 6. 레시피 포스트 댓글 수정
router.post("/posts/comment/edit", async (req, res) => {
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
    res.json({ success: true, post });
  } catch (err) {
    console.error("댓글 수정 오류:", err);
    res.status(500).json({ success: false, message: "댓글 수정 중 오류가 발생했습니다." });
  }
});

// 7. 레시피 포스트 댓글 삭제
router.post("/posts/comment/delete", async (req, res) => {
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
    res.json({ success: true, post });
  } catch (err) {
    console.error("댓글 삭제 오류:", err);
    res.status(500).json({ success: false, message: "댓글 삭제 중 오류가 발생했습니다." });
  }
});

// 8. 레시피 포스트 수정
router.post("/posts/edit", async (req, res) => {
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
    res.json({ success: true, post });
  } catch (err) {
    console.error("수정 오류:", err);
    res.status(500).json({ success: false, message: "수정 중 오류가 발생했습니다." });
  }
});

// 9. 레시피 포스트 삭제
router.post("/posts/delete", async (req, res) => {
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
    res.json({ success: true });
  } catch (err) {
    console.error("삭제 오류:", err);
    res.status(500).json({ success: false, message: "삭제 중 오류가 발생했습니다." });
  }
});

// 10. 커뮤니티 포스트 조회
router.get("/community", (req, res) => {
  const posts = readJsonFile(COMMUNITY_POSTS_DB_PATH, DEFAULT_COMMUNITY_POSTS);
  const rules = readJsonFile(MODERATION_RULES_PATH, { deletedPosts: [], deletedComments: [], blockedUsers: [], hiddenPosts: [] });
  
  const filtered = posts.filter(p => 
    !rules.deletedPosts.includes(p.id) && 
    !rules.blockedUsers.some(b => typeof b === "string" ? b === p.author : b.nickname === p.author)
  ).map(p => ({
    ...p,
    comments: (p.comments || []).filter(c => 
      !rules.deletedComments.includes(c.id) && 
      !rules.blockedUsers.some(b => typeof b === "string" ? b === c.author : b.nickname === c.author)
    )
  }));
  
  res.json({ success: true, communityPosts: filtered });
});

// 11. 커뮤니티 포스트 작성
router.post("/community", async (req, res) => {
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
    res.json({ success: true, communityPost: newPost });
  } catch (err) {
    console.error("커뮤니티 포스트 추가 에러:", err);
    res.status(500).json({ success: false, message: "포스트 추가 중 오류가 발생했습니다." });
  }
});

// 12. 커뮤니티 포스트 좋아요 토글
router.post("/community/like", likeLimiter, async (req, res) => {
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
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("좋아요 오류:", err);
    res.status(500).json({ success: false, message: "좋아요 처리 중 오류가 발생했습니다." });
  }
});

// 13. 커뮤니티 포스트 스크랩 토글
router.post("/community/scrap", async (req, res) => {
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
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("스크랩 오류:", err);
    res.status(500).json({ success: false, message: "스크랩 처리 중 오류가 발생했습니다." });
  }
});

// 14. 커뮤니티 포스트 댓글 작성
router.post("/community/comment", commentLimiter, async (req, res) => {
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
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("댓글 오류:", err);
    res.status(500).json({ success: false, message: "댓글 등록 중 오류가 발생했습니다." });
  }
});

// 15. 커뮤니티 포스트 댓글 수정
router.post("/community/comment/edit", async (req, res) => {
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
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("댓글 수정 오류:", err);
    res.status(500).json({ success: false, message: "댓글 수정 중 오류가 발생했습니다." });
  }
});

// 16. 커뮤니티 포스트 댓글 삭제
router.post("/community/comment/delete", async (req, res) => {
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
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("댓글 삭제 오류:", err);
    res.status(500).json({ success: false, message: "댓글 삭제 중 오류가 발생했습니다." });
  }
});

// 17. 커뮤니티 포스트 수정
router.post("/community/edit", async (req, res) => {
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
    res.json({ success: true, communityPost: post });
  } catch (err) {
    console.error("수정 오류:", err);
    res.status(500).json({ success: false, message: "수정 중 오류가 발생했습니다." });
  }
});

// 18. 커뮤니티 포스트 삭제
router.post("/community/delete", async (req, res) => {
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
    res.json({ success: true });
  } catch (err) {
    console.error("삭제 오류:", err);
    res.status(500).json({ success: false, message: "삭제 중 오류가 발생했습니다." });
  }
});

// 19. 익명 커뮤니티 글쓰기 대리 API (구버전 호환)
router.post("/community/posts", communityWriteLimiter, async function (req, res) {
  const { token, title, body, category, author, avatarImg, userId, image } = req.body;
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

    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await axios.post(url, payload, { headers });
    return res.json({ success: true, id: response.data.name.split("/").pop() });
  } catch (err) {
    if (err.response) {
      console.error("[Community API] Firestore write error detail:", JSON.stringify(err.response.data));
    } else {
      console.error("[Community API] Firestore write error:", err.message);
    }
    return res.status(500).json({ success: false, message: "글 등록 중 오류가 발생했습니다." });
  }
});

// 20. 게시물 키워드 검색 API
router.get("/search/posts", async function (req, res) {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.json({ success: true, posts: [] });
  }

  try {
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

      if (hidden) continue;

      if (title.includes(query) || body.includes(query) || category.includes(query) || author.includes(query)) {
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

// 21. 사용자 닉네임 키워드 검색 API
router.get("/search/users", async function (req, res) {
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
    console.error("[Search Users API] Error performing search:", err.message);
    return res.status(500).json({ success: false, message: "검색 중 내부 오류가 발생했습니다." });
  }
});

module.exports = router;
