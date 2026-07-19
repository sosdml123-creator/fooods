import AdBanner from './components/AdBanner';
import BottomNav from './components/BottomNav';
import Header from './components/Header';
import PostCard from './components/PostCard';
import Home from './pages/Home';
import MyPage from './pages/Mypage';
import { CommunityView, CommunityDetailView } from './pages/Community';
import AdminReportsView from './pages/Admin';
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import { getDeviceFingerprint } from './utils/fingerprint';

// API URL 설정 (개발/배포 환경변수 연동)
const API_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "");




    // --- Firebase 초기화 ---
    const firebaseConfig = {
      apiKey: "AIzaSyBKat-tCeDuoRr-uzdOeoQXT6PpXHBWJno",
      authDomain: "plating-app-db29f.firebaseapp.com",
      projectId: "plating-app-db29f",
      storageBucket: "plating-app-db29f.firebasestorage.app",
      messagingSenderId: "455835477529"
    };

    let db, storage, auth;
    let resolveAuthReady;
    const authReadyPromise = new Promise((resolve) => {
      resolveAuthReady = resolve;
    });

    let resolveSessionSyncReady;
    const sessionSyncReadyPromise = new Promise((resolve) => {
      resolveSessionSyncReady = resolve;
    });

    if (typeof firebase !== "undefined") {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();
      storage = firebase.storage();
      auth = firebase.auth();

      // Firebase Auth Persistence LOCAL
      auth.setPersistence('local')
        .then(() => console.log("[Firebase Auth] Persistence set to LOCAL"))
        .catch(err => console.error("[Firebase Auth] Persistence error:", err));
    } else {
      console.error("Firebase SDK is not loaded. Please check your internet connection.");
      // Resolve immediately to prevent lockups when offline
      if (resolveAuthReady) resolveAuthReady();
      if (resolveSessionSyncReady) resolveSessionSyncReady();
      
      db = {
        collection: () => ({
          doc: () => ({
            get: () => Promise.resolve({ exists: false }),
            set: () => Promise.resolve(),
            add: () => Promise.resolve({ id: "mock" }),
            onSnapshot: () => (() => {})
          }),
          orderBy: () => ({
            limit: () => ({
              onSnapshot: () => (() => {})
            })
          })
        })
      };
      auth = {
        currentUser: null,
        onAuthStateChanged: () => (() => {}),
        signOut: () => Promise.resolve()
      };
    }

    // --- 1. IndexedDB Helper 및 LocalStorage Fallback 구현 ---
    const DB_NAME = "FoodHouseDatabase";
    const DB_VERSION = 1;
    const STORE_NAME = "AppDataStore";

    function isIndexedDBSupported() {
      try {
        return 'indexedDB' in window && window.indexedDB !== null;
      } catch (e) {
        return false;
      }
    }

    function initDB() {
      if (!isIndexedDBSupported()) {
        return Promise.reject("IndexedDB not supported");
      }
      return new Promise((resolve, reject) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onerror = (e) => reject(e);
          request.onsuccess = (e) => resolve(request.result);
          request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
        } catch (err) {
          reject(err);
        }
      });
    }

    function getDBData(key) {
      return initDB()
        .then((db) => {
          return new Promise((resolve, reject) => {
            try {
              const transaction = db.transaction([STORE_NAME], "readonly");
              const store = transaction.objectStore(STORE_NAME);
              const request = store.get(key);
              request.onerror = (e) => reject(e);
              request.onsuccess = (e) => resolve(request.result);
            } catch (err) {
              reject(err);
            }
          });
        })
        .catch((err) => {
          console.warn("IndexedDB 사용 불가, LocalStorage로 Fallback합니다: ", err);
          try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : undefined;
          } catch (e) {
            return undefined;
          }
        });
    }

    function setDBData(key, value) {
      return initDB()
        .then((db) => {
          return new Promise((resolve, reject) => {
            try {
              const transaction = db.transaction([STORE_NAME], "readwrite");
              const store = transaction.objectStore(STORE_NAME);
              const request = store.put(value, key);
              request.onerror = (e) => reject(e);
              request.onsuccess = (e) => resolve(e.target.result);
            } catch (err) {
              reject(err);
            }
          });
        })
        .catch((err) => {
          console.warn("IndexedDB 사용 불가, LocalStorage에 저장합니다: ", err);
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (e) {
            console.error("LocalStorage 저장 실패 (용량 초과 가능성): ", e);
          }
        });
    }

    // 실시간 인앱 알림 발송 헬퍼 (댓글/좋아요/팔로우 연동)
    async function sendInAppNotification(targetUid, type, postId, title, body) {
      const user = auth.currentUser;
      if (!targetUid || targetUid === user?.uid) return; // 본인 제외
      
      try {
        await db.collection("notifications").add({
          targetUid: targetUid,
          senderUid: user ? user.uid : "anonymous",
          senderName: (profile && profile.name && profile.name !== "나의 플레이팅") ? profile.name : "익명 플레이터",
          type: type, // "like" | "comment" | "follow"
          postId: postId || "",
          title: title,
          body: body,
          read: false,
          timestamp: new Date().toISOString()
        });
        console.log("[Notification] Notification successfully created in Firestore.");
      } catch (err) {
        console.error("[Notification] Error creating in-app notification:", err);
      }
    }

    // --- 2. 클라이언트 사이드 이미지 압축 유틸리티 ---
    function compressImage(file, maxWidth = 1200, maxHeight = 1500, quality = 0.75) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              resolve(blob);
            }, "image/jpeg", quality);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    // --- 2.1 클라이언트 사이드 링크 메타 데이터 비동기 파싱 및 템플릿 Fallback ---
    async function fetchLinkMeta(url) {
      if (!url || !url.startsWith("http")) {
        return null;
      }
      try {
        const response = await fetch(`/api/link-meta?url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const res = await response.json();
          if (res.success) {
            return {
              title: res.title,
              image: res.image,
              host: res.host
            };
          }
        }
      } catch (e) {
        console.error("Backend fetchLinkMeta error:", e);
      }

      let host = "shopping";
      try {
        host = new URL(url).hostname.replace("www.", "");
      } catch (e) {}

      return {
        title: `상세 링크 (${host})`,
        image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
        host: host
      };
    }


    // --- 3. 기본 유틸리티 및 데이터 선언 ---
    function generateId() {
      return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    }

    function renderParsedBody(text, onTagClick) {
      if (!text) return "";
      const tokens = text.split(/(\s+)/);
      return tokens.map((token, idx) => {
        if (token.startsWith("#") && token.length > 1) {
          const cleanTag = token.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
          return (
            <span 
              key={idx} 
              className="hashtag-link" 
              onClick={(e) => {
                e.stopPropagation();
                if (onTagClick) onTagClick(cleanTag);
              }}
            >
              {token}
            </span>
          );
        }
        return token;
      });
    }

    const fallbackImages = [
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&q=80&w=800"
    ];

    const categories = ["팔로잉", "전체", "레시피", "배달", "주방리뷰", "맛집", "카페"];

    const mockProductDatabase = [
      {
        domain: "coupang.com",
        title: "유기농 압착 올리브유 500ml (엑스트라 버진)",
        image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=200",
        host: "coupang.com"
      }
    ];

    const initialCreatorsData = {};
    const defaultPosts = [];
    const initialCommunityPosts = [];

    // --- 3. 하위 컴포넌트 선언 ---

    function LegacyAdBanner() {
      return (
        <div className="ad-banner cursor-pointer" onClick={() => alert("구글 애드센스 광고가 송출되는 구역입니다.")}>
          <div className="text-xs font-semibold text-zinc-950">🍳 요리할 때 필수! 감성 타이머 특가 할인 중</div>
          <div className="text-[10px] text-zinc-400">sponsored by Plating Partner</div>
        </div>
      );
    }

    function ProductPreview({ link, creator }) {
      return (
        <a className="product-preview" href={link.url} target="_blank" rel="noopener noreferrer">
          <img src={link.image} alt="" />
          <div>
            <strong>{link.title}</strong>
            <small>{link.host}</small>
          </div>
        </a>
      );
    }

    // 가로 슬라이더 이미지 캐러셀 컴포넌트 (오른쪽으로 넘겨보는 스와이프 기능 포함)
    function ImageCarousel({ images }) {
      const [currentIdx, setCurrentIdx] = useState(0);
      const containerRef = useRef(null);

      if (!Array.isArray(images) || images.length === 0) return null;

      // 화살표 버튼 클릭 시 슬라이드 이동 처리
      function handlePrev(e) {
        e.stopPropagation();
        const nextIdx = Math.max(0, currentIdx - 1);
        setCurrentIdx(nextIdx);
        if (containerRef.current) {
          containerRef.current.scrollTo({
            left: containerRef.current.clientWidth * nextIdx,
            behavior: "smooth"
          });
        }
      }

      function handleNext(e) {
        e.stopPropagation();
        const nextIdx = Math.min(images.length - 1, currentIdx + 1);
        setCurrentIdx(nextIdx);
        if (containerRef.current) {
          containerRef.current.scrollTo({
            left: containerRef.current.clientWidth * nextIdx,
            behavior: "smooth"
          });
        }
      }

      // 모바일 스와이프 감지 시 인디케이터 동기화
      function handleScroll() {
        if (containerRef.current) {
          const scrollLeft = containerRef.current.scrollLeft;
          const width = containerRef.current.clientWidth;
          const activeIdx = Math.round(scrollLeft / width);
          if (activeIdx !== currentIdx) {
            setCurrentIdx(activeIdx);
          }
        }
      }

      return (
        <div className="relative w-full h-full group">
          <div 
            ref={containerRef}
            className="carousel-container no-scrollbar"
            onScroll={handleScroll}
          >
            {images.map((img, idx) => (
              <div key={idx} className="carousel-slide">
                <img className="post-image" src={img} alt="" />
              </div>
            ))}
          </div>
          
          {/* 가로 슬라이드 넘김 화살표 */}
          {currentIdx > 0 && (
            <button className="carousel-btn prev" onClick={handlePrev}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
          )}
          {currentIdx < images.length - 1 && (
            <button className="carousel-btn next" onClick={handleNext}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          )}

          {/* 인디케이터 점 표시 */}
          {images.length > 1 && (
            <div className="carousel-dots">
              {images.map((_, idx) => (
                <div key={idx} className={`carousel-dot ${idx === currentIdx ? 'active' : ''}`}></div>
              ))}
            </div>
          )}
        </div>
      );
    }

    

    // 내가 쓴 글 수정/삭제 옵션 및 이미지 카레셀 상세 렌더링을 내장한 디테일 시트 모달 (댓글 수정/삭제 지원)
    function DetailModal({ postId, posts, onClose, onLike, onScrap, onComment, onEditComment, onDeleteComment, onTagClick, onAuthorClick, onDeletePost, onEditPost, currentUserName, currentUserRole }) {
      const post = posts.find(p => p.id === postId);
      if (!post) return null;

      const [commentText, setCommentText] = useState("");
      const [isEditingMode, setIsEditingMode] = useState(false);
      const [editTitle, setEditTitle] = useState(post.title);
      const [editBody, setEditBody] = useState(post.body);
      const [showKebabMenu, setShowKebabMenu] = useState(false);

      // 댓글 수정용 인라인 로컬 상태
      const [editingCommentId, setEditingCommentId] = useState(null);
      const [editingCommentText, setEditingCommentText] = useState("");

      const isVideo = post.mediaType === "video";
      const isMyPost = post.author === "나" || post.author === currentUserName;
      const isAdmin = currentUserRole === "admin";

      useEffect(() => {
        setEditTitle(post.title);
        setEditBody(post.body);
      }, [post.id]);

      function submitComment(e) {
        e.preventDefault();
        if (!commentText.trim()) return;
        onComment(post.id, commentText.trim());
        setCommentText("");
      }

      function handleSave() {
        if (!editTitle.trim() || !editBody.trim()) return;
        onEditPost(post.id, editTitle.trim(), editBody.trim());
        setIsEditingMode(false);
      }

      async function handleDelete() {
        // 확인창은 onDeletePost(handleDeletePost) 내부에서 1회만 띄움
        const confirmed = await onDeletePost(post.id);
        if (confirmed !== false) onClose();
      }

      function startEditComment(comment) {
        setEditingCommentId(comment.id);
        setEditingCommentText(comment.text);
      }

      function saveEditComment(commentId) {
        if (!editingCommentText.trim()) return;
        onEditComment(post.id, commentId, editingCommentText.trim());
        setEditingCommentId(null);
        setEditingCommentText("");
      }

      return (
        <div className="sheet-backdrop" onClick={onClose}>
          <section className="sheet text-left" onClick={(e) => e.stopPropagation()} style={{ height: "90vh", display: "flex", flexDirection: "column", padding: "18px 20px" }}>
            <header className="sheet-head flex-shrink-0">
              <div className="flex items-center gap-2 cursor-pointer" onClick={onAuthorClick}>
                <span className="w-6 h-6 rounded-full bg-zinc-200 text-zinc-700 font-bold text-[10px] flex items-center justify-center overflow-hidden">
                  {post.avatarImg ? <img src={post.avatarImg} alt="" className="w-full h-full object-cover" /> : post.author.slice(0, 1)}
                </span>
                <span className="text-xs font-bold text-zinc-800 hover:underline">{post.author}</span>
              </div>
              
              <div className="flex items-center gap-3">
                {/* 햄버거/케밥 드롭다운 메뉴 */}
                {!isEditingMode && (
                  <div className="kebab-dropdown-wrapper">
                    <button className="kebab-menu-btn" onClick={() => setShowKebabMenu(!showKebabMenu)} aria-label="메뉴">
                      <i className="fa-solid fa-ellipsis-vertical text-zinc-500"></i>
                    </button>
                    {showKebabMenu && (
                      <div className="kebab-dropdown">
                        {isMyPost && <button onClick={() => { setIsEditingMode(true); setShowKebabMenu(false); }}>수정</button>}
                        {(isMyPost || isAdmin) && <button className="delete-btn" onClick={() => { handleDelete(); setShowKebabMenu(false); }}>삭제</button>}
                        {!isMyPost && (
                          <button 
                            type="button"
                            className="text-red-500 font-bold" 
                            onClick={() => {
                              setShowKebabMenu(false);
                              if (window.openReportModal) {
                                window.openReportModal("post", post.id, post.author, post.title + "\n" + post.body);
                              }
                            }}
                          >
                            신고하기
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <button type="button" onClick={onClose} className="text-zinc-400 text-xl font-normal">×</button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
              {isVideo ? (
                <div className="rounded-lg overflow-hidden aspect-[9/16] bg-black mb-4 max-h-[400px] flex justify-center">
                  <video src={post.image} loop muted autoPlay playsInline controls className="h-full object-contain" />
                </div>
              ) : (
                <div className="rounded-lg overflow-hidden aspect-[4/5] bg-zinc-100 mb-4">
                  {Array.isArray(post.image) ? (
                    <ImageCarousel images={post.image} />
                  ) : (
                    <img src={post.image} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              )}

              {isEditingMode ? (
                <div className="flex flex-col gap-3 bg-zinc-50 p-3 rounded-lg border border-zinc-200 mb-4">
                  <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1">
                    포스팅 제목 수정
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="border p-2 rounded text-xs" />
                  </label>
                  <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1">
                    포스팅 본문 수정
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="border p-2 rounded text-xs h-24 resize-none" />
                  </label>
                  <div className="flex gap-2">
                    <button className="primary flex-1 py-1.5 rounded text-xs font-bold" onClick={handleSave}>저장</button>
                    <button className="secondary flex-1 py-1.5 rounded text-xs font-bold" onClick={() => setIsEditingMode(false)}>취소</button>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-base font-bold text-zinc-950 mb-2">{post.title}</h2>
                  <div className="text-xs text-zinc-700 leading-relaxed mb-4 whitespace-pre-wrap">
                    {renderParsedBody(post.body, onTagClick)}
                  </div>
                </div>
              )}

              {post.productLinks && post.productLinks.length > 0 && (
                <div className="mb-5 bg-zinc-50 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-zinc-400 mb-2">소개된 아이템 정보 전체 ({post.productLinks.length})</div>
                  <div className="flex flex-col gap-2">
                    {post.productLinks.map((link, idx) => (
                      <a key={idx} className="product-preview bg-white" href={link.url} target="_blank" rel="noopener noreferrer">
                        <img src={link.image} alt="" />
                        <div>
                          <strong>{link.title}</strong>
                          <span className="text-[9px] text-zinc-400 block truncate">{link.url}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}



              <div className="flex justify-between items-center border-y border-zinc-100 py-3 my-4">
                <button className={`text-sm font-bold flex items-center gap-2 px-1 active:scale-95 transition-transform ${post.liked ? 'text-red-500' : 'text-zinc-400'}`} onClick={onLike}>
                  <i className={post.liked ? "fa-solid fa-heart text-red-500" : "fa-regular fa-heart"} style={{fontSize:'18px'}}></i>
                  <span style={{fontSize:'14px'}}>좋아요 {post.likeCount}</span>
                </button>
                <button className={`text-sm font-bold flex items-center gap-2 px-1 active:scale-95 transition-transform ${post.scrapped ? 'text-zinc-950' : 'text-zinc-400'}`} onClick={onScrap}>
                  <i className={post.scrapped ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"} style={{fontSize:'16px'}}></i>
                  <span style={{fontSize:'14px'}}>{post.scrapped ? "스크랩됨" : "스크랩"}</span>
                </button>
              </div>

              <section className="comment-area m-0">
                <div className="text-[10px] font-bold text-zinc-400 mb-2">댓글 ({post.comments.length})</div>
                <div className="flex flex-col gap-1 mb-4">
                  {post.comments.map(c => {
                    const isMyComment = c.author === "나" || c.author === currentUserName;
                    return (
                      <div className="comment-item" key={c.id}>
                        <div className="comment-header">
                          <span className="comment-author">{c.author}</span>
                          <div className="comment-actions">
                            {isMyComment ? (
                              editingCommentId === c.id ? (
                                <>
                                  <button className="comment-action-btn" onClick={() => saveEditComment(c.id)}>완료</button>
                                  <button className="comment-action-btn" onClick={() => setEditingCommentId(null)}>취소</button>
                                </>
                              ) : (
                                <>
                                  <button className="comment-action-btn" onClick={() => startEditComment(c)}><i className="fa-solid fa-pen"></i></button>
                                  <button className="comment-action-btn delete" onClick={() => onDeleteComment(post.id, c.id)}><i className="fa-solid fa-trash"></i></button>
                                </>
                              )
                            ) : (
                              <button 
                                type="button"
                                className="comment-action-btn text-rose-500 font-semibold"
                                onClick={() => {
                                  if (window.openReportModal) {
                                    window.openReportModal("comment", c.id, c.author, c.text);
                                  }
                                }}
                                title="신고"
                              >
                                <i className="fa-regular fa-bell text-[10px] text-rose-500 mr-0.5"></i>신고
                              </button>
                            )}
                          </div>
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="comment-inline-edit">
                            <input value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} />
                          </div>
                        ) : (
                          <p className="comment-text">{c.text}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <form className="comment-form" onSubmit={submitComment}>
                  <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="댓글을 입력해 보세요..." />
                  <button type="submit">등록</button>
                </form>
              </section>
            </div>
          </section>
        </div>
      );
    }

    function UserProfileView({ userName, posts, creatorInfo, isFollowing, onFollowToggle, onBack, onCardClick }) {
      const userPosts = posts.filter(post => post.author === userName);

      return (
        <section className="my-page">
          <div className="pt-3"></div>

          <div className="my-card">
            <div className="flex items-center justify-between gap-4">
              <div className="my-profile flex-1 min-w-0 mb-0">
                <span className="avatar overflow-hidden flex-shrink-0">
                  {creatorInfo.avatarImg ? <img src={creatorInfo.avatarImg} alt="" className="w-full h-full object-cover" /> : userName.slice(0, 1)}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="flex items-center gap-1.5 font-bold text-sm truncate">
                    {userName}
                    {isFollowing && <span className="text-[9px] bg-zinc-100 text-zinc-500 border border-zinc-300 font-normal px-1.5 py-0.5 rounded flex-shrink-0">팔로잉 중</span>}
                  </h2>
                  <p className="text-zinc-500 text-xs mt-1 break-all whitespace-normal">{creatorInfo.bio || "소개글이 없습니다."}</p>
                </div>
              </div>
              
              <button 
                className={`text-[11px] font-bold px-4 py-1.5 rounded-full transition-colors flex-shrink-0 ${isFollowing ? 'secondary' : 'primary'}`}
                onClick={onFollowToggle}
              >
                {isFollowing ? "팔로잉" : "팔로우"}
              </button>
            </div>

            <div className="stats mt-4 border-t border-zinc-100 pt-3 text-center">
              <div className="stat">
                <strong>{userPosts.length}</strong>
                <span>게시글</span>
              </div>
              <div className="stat">
                <strong>{(creatorInfo.followersCount || 0).toLocaleString()}</strong>
                <span>팔로워</span>
              </div>
              <div className="stat">
                <strong>{(creatorInfo.followingCount || 0).toLocaleString()}</strong>
                <span>팔로잉</span>
              </div>
            </div>
          </div>

          <div className="my-card">
            <h2 className="mb-3 font-bold">{userName} 님의 요리 이야기</h2>
            <div className="grid grid-cols-2 gap-3">
              {userPosts.length > 0 ? (
                userPosts.map(post => (
                  <div 
                    key={post.id} 
                    className="bg-white border border-zinc-200 rounded-lg overflow-hidden cursor-pointer"
                    onClick={() => onCardClick(post)}
                  >
                    <div className="aspect-[4/5] bg-zinc-100 overflow-hidden">
                      <img src={Array.isArray(post.image) ? post.image[0] : post.image} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2">
                      <strong className="text-xs text-zinc-950 block truncate">{post.title}</strong>
                      <span className="text-[9px] text-zinc-400">{post.category}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="col-span-2 text-xs text-zinc-400 text-center py-8">아직 등록된 게시물이 없습니다.</p>
              )}
            </div>
          </div>
        </section>
      );
    }

    // 커뮤니티 이용 규칙 모달
    function CommunityRulesModal({ isOpen, onClose }) {
      if (!isOpen) return null;
      return (
        <div className="sheet-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
          <div className="sheet text-left" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", overflowY: "auto", padding: "20px" }}>
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3 mb-4">
              <h3 className="text-sm font-bold text-zinc-950 flex items-center gap-1.5">
                🛡️ 플레이팅 커뮤니티 이용 규칙
              </h3>
              <button onClick={onClose} className="text-zinc-400 text-xl font-normal">×</button>
            </div>
            
            <div className="flex flex-col gap-4 text-xs text-zinc-700 leading-relaxed">
              <div>
                <strong className="text-zinc-950 block mb-1">1. 음란 및 음란물 금지</strong>
                <p>성적 수치심을 유발하거나 음란한 표현, 이미지, 음란 웹사이트 링크를 게시하는 행위는 엄격히 금지됩니다. 위반 시 계정이 즉시 영구 정지될 수 있습니다.</p>
              </div>
              
              <div>
                <strong className="text-zinc-950 block mb-1">2. 욕설 및 인신공격, 명예훼손 금지</strong>
                <p>특정 유저나 타인을 지칭하여 비방하거나, 욕설을 사용해 인격을 모독하거나, 사실 유무와 관계없이 명예를 훼손하는 부정적 게시글은 사전 조치 없이 삭제됩니다.</p>
              </div>

              <div>
                <strong className="text-zinc-950 block mb-1">3. 상업적 홍보 및 스팸 금지</strong>
                <p>맛집 할인쿠폰을 포함하여 앱 내부 기능을 사칭한 부적절한 광고 홍보, 무차별적인 도배성 게시글, 상업성 거래 글은 절대 업로드할 수 없습니다.</p>
              </div>

              <div>
                <strong className="text-zinc-950 block mb-1">4. 타인의 권리 및 저작권 침해 금지</strong>
                <p>인터넷 블로그나 타인의 SNS 사진 및 레시피를 무단 복제하여 마치 본인의 게시글인 것처럼 게시하는 도용 행위를 금지하며, 초상권 및 저작권을 존중해 주세요.</p>
              </div>

              <div>
                <strong className="text-zinc-950 block mb-1">5. 깨끗하고 안전한 커뮤니티 문화 조성</strong>
                <p>위 위반 사항에 해당하는 게시글은 관리자(Admin) 권한으로 상시 모니터링을 통해 **즉시 삭제** 조치되며, 누적 신고 시 서비스 이용이 영구 정지될 수 있습니다.</p>
              </div>
            </div>
            
            <button className="primary w-full py-2.5 rounded-lg text-xs font-bold mt-6" onClick={onClose}>
              확인했습니다
            </button>
          </div>
        </div>
      );
    }


    // 에타 스타일 커뮤니티 컴포넌트 (익명 제거, 오른쪽 아래 연필 모양 플로팅 글쓰기 버튼 탑재, 상세 페이지 이동 방식)
    function LegacyCommunityView({ communityPosts, onPostClick, onOpenCommunityWrite, onLikePost, onScrapPost, onAuthorClick }) {
      const [comCategory, setComCategory] = useState("🔥 인기");
      const [showSearch, setShowSearch] = useState(false);
      const [comSearchQuery, setComSearchQuery] = useState("");

      const [showRulesModal, setShowRulesModal] = useState(false);

      const comCategories = ["🔥 인기", "💬 자유", "❓ 질문", "🛒 공동구매", "📍 맛집추천"];
      
      const filteredComPosts = communityPosts.filter(p => {
        const matchesCategory = comCategory === "🔥 인기" || p.category === comCategory.substring(2);
        const matchesSearch = !comSearchQuery.trim() || 
          p.title.toLowerCase().includes(comSearchQuery.toLowerCase()) || 
          p.body.toLowerCase().includes(comSearchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      });

      return (
        <div className="p-4 pb-24 relative min-h-[80vh]">
          {/* 커뮤니티 전용 모바일 헤더 */}
          <div className="flex justify-between items-center py-2 px-1 mb-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">커뮤니티</h1>
            <div className="flex items-center gap-4 text-zinc-800">
              <button 
                className={`text-lg p-1 hover:text-zinc-950 active:scale-95 transition-transform ${showSearch ? 'text-zinc-950 font-bold' : ''}`}
                onClick={() => {
                  setShowSearch(!showSearch);
                  if (showSearch) setComSearchQuery("");
                }}
                title="검색"
              >
                <i className="fa-solid fa-magnifying-glass"></i>
              </button>
              <button 
                className="text-lg p-1 hover:text-zinc-950 active:scale-95 transition-transform"
                onClick={() => alert("새로운 알림이 없습니다.")}
                title="알림"
              >
                <i className="fa-regular fa-bell"></i>
              </button>
            </div>
          </div>

          {/* 커뮤니티 규칙 안내 배너 */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 mb-4 flex items-start gap-2.5 justify-between shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-zinc-950 flex items-center gap-1">
                🛡️ 커뮤니티 이용 규칙 안내
              </div>
              <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                성적인 표현이나 음란물, 욕설, 타인 비방, 광고 도배글 등은 사전 예고 없이 즉시 삭제 조치됩니다.
              </p>
            </div>
            <button 
              type="button"
              className="text-[10px] bg-zinc-900 text-white px-2.5 py-1.5 rounded-lg font-bold hover:bg-black flex-shrink-0 active:scale-95 transition-transform"
              onClick={() => setShowRulesModal(true)}
            >
              규칙 보기
            </button>
          </div>

          <CommunityRulesModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />

          {showSearch && (
            <div className="relative mb-4">
              <input 
                type="text" 
                value={comSearchQuery}
                onChange={(e) => setComSearchQuery(e.target.value)}
                placeholder="글 제목이나 내용 검색..."
                className="w-full bg-zinc-100 border border-zinc-200 rounded-lg px-9 py-2.5 text-xs outline-none focus:border-zinc-950 focus:bg-white"
                autoFocus
              />
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-zinc-400 text-xs"></i>
              {comSearchQuery && (
                <button onClick={() => setComSearchQuery("")} className="absolute right-3 top-1.5 text-zinc-400 text-sm">×</button>
              )}
            </div>
          )}
          
          {/* 카테고리 탭 바 (Underline 스타일) */}
          <div className="community-tab-bar no-scrollbar">
            {comCategories.map(cat => (
              <button 
                key={cat} 
                className={`community-tab-item ${comCategory === cat ? 'active' : ''}`}
                onClick={() => setComCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 게시글 리스트 */}
          <div className="divide-y divide-zinc-100">
            {filteredComPosts.length > 0 ? (
              filteredComPosts.map(post => {
                const badge = post.isAnnouncement 
                  ? { text: "공지", type: "notice" } 
                  : (post.likeCount >= 30 ? { text: "인기", type: "popular" } : null);

                return (
                  <div 
                    key={post.id} 
                    className="everytime-post cursor-pointer"
                    onClick={() => onPostClick(post.id)}
                  >
                    {/* 상단 작성자 정보 + 조회수 + 뱃지 */}
                    <div className="everytime-user-row">
                      <div 
                        className="everytime-user-info cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAuthorClick(post.author);
                        }}
                      >
                        <span className="everytime-avatar">
                          {post.avatarImg ? (
                            <img src={post.avatarImg} alt="" className="w-full h-full object-cover" />
                          ) : (
                            post.author.slice(0, 1)
                          )}
                        </span>
                        <span className="everytime-author hover:underline font-bold">{post.author}</span>
                        <span className="text-[10px] text-zinc-350 ml-1 flex items-center gap-0.5">
                          <i className="fa-regular fa-eye" style={{fontSize:'10px'}}></i>
                          {(post.viewCount || 0).toLocaleString()}
                        </span>
                      </div>
                      {badge && (
                        <span className={`everytime-badge ${badge.type}`}>{badge.text}</span>
                      )}
                    </div>

                    {/* 본문 글 & 오른쪽 섬네일 */}
                    <div className="everytime-body-wrapper">
                      <div className="everytime-text-area">
                        <h3 style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{post.title}</h3>
                        <p className="line-clamp-2" style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{post.body}</p>
                      </div>
                      {post.image && post.image.length > 0 && (
                        <img 
                          className="everytime-thumbnail" 
                          src={post.image[0]} 
                          alt="" 
                          loading="lazy"
                        />
                      )}
                    </div>

                    {/* 하단 액션바: 좋아요·댓글·스크랩 */}
                    <div className="everytime-meta" onClick={(e) => e.stopPropagation()}>
                      <div className="everytime-actions">
                        <span 
                          className={`cursor-pointer flex items-center gap-1 font-bold active:scale-90 transition-transform ${post.liked ? 'text-red-500' : 'text-zinc-400'}`}
                          style={{fontSize:'13px'}}
                          onClick={() => onLikePost(post.id)}
                        >
                          <i className={post.liked ? "fa-solid fa-heart text-red-500" : "fa-regular fa-heart"} style={{fontSize:'14px'}}></i>
                          좋아요 {post.likeCount}
                        </span>
                        <span className="flex items-center gap-1 text-zinc-400" style={{fontSize:'13px'}}>
                          <i className="fa-regular fa-comment" style={{fontSize:'13px'}}></i>
                          {post.comments.length}
                        </span>
                        <span 
                          className={`cursor-pointer flex items-center gap-1 font-bold active:scale-90 transition-transform ${post.scrapped ? 'text-zinc-950' : 'text-zinc-400'}`}
                          style={{fontSize:'13px'}}
                          onClick={() => onScrapPost(post.id)}
                        >
                          <i className={post.scrapped ? "fa-solid fa-bookmark text-zinc-950" : "fa-regular fa-bookmark"} style={{fontSize:'13px'}}></i>
                          스크랩
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-zinc-400 text-center py-12">등록된 커뮤니티 글이 없습니다.</p>
            )}
          </div>

          {/* 플로팅 글쓰기 버튼 */}
          <button 
            className="community-fab"
            style={{ position: "fixed", bottom: "80px", right: "20px", zIndex: 50 }}
            onClick={onOpenCommunityWrite}
            aria-label="커뮤니티 글쓰기"
          >
            <i className="fa-solid fa-pen text-sm"></i>
          </button>
        </div>
      );
    }

    // 에타 스타일 커뮤니티 상세 페이지 (댓글 수정/삭제 CRUD, 공감 토글)
    function LegacyCommunityDetailView({ activeComPostId, communityPosts, onBack, onLikePost, onDeletePost, onEditPost, onAddComment, onEditComment, onDeleteComment, onScrapPost, currentUserName, currentUserRole, onAuthorClick }) {
      const post = communityPosts.find(p => p.id === activeComPostId);
      if (!post) return (
        <div className="p-4 text-center">
          <p className="text-xs text-zinc-400">존재하지 않는 게시글입니다.</p>
          <button className="secondary mt-4 py-1.5 px-4 rounded text-xs" onClick={onBack}>뒤로가기</button>
        </div>
      );

      const [commText, setCommText] = useState("");
      const [isEditingCom, setIsEditingCom] = useState(false);
      const [editComTitle, setEditComTitle] = useState(post.title);
      const [editComBody, setEditComBody] = useState(post.body);
      const [showKebabMenu, setShowKebabMenu] = useState(false);

      // 댓글 수정용 로컬 상태
      const [editingCommentId, setEditingCommentId] = useState(null);
      const [editingCommentText, setEditingCommentText] = useState("");
      const [openCommentKebabId, setOpenCommentKebabId] = useState(null);

      const isMyPost = post.author === "나" || post.author === currentUserName;
      const isAdmin = currentUserRole === "admin";

      useEffect(() => {
        setEditComTitle(post.title);
        setEditComBody(post.body);
      }, [post.id]);

      function handleCommentSubmit(e) {
        e.preventDefault();
        if (!commText.trim()) return;
        onAddComment(post.id, commText.trim());
        setCommText("");
      }

      function startEdit() {
        setEditComTitle(post.title);
        setEditComBody(post.body);
        setIsEditingCom(true);
      }

      function saveEdit() {
        if (!editComTitle.trim() || !editComBody.trim()) return;
        onEditPost(post.id, editComTitle.trim(), editComBody.trim());
        setIsEditingCom(false);
      }

      async function deletePost() {
        // 확인창은 onDeletePost(handleDeleteCommunityPost) 내부에서 1회만 띄움
        const confirmed = await onDeletePost(post.id);
        if (confirmed !== false) onBack();
      }

      function startEditComment(comment) {
        setEditingCommentId(comment.id);
        setEditingCommentText(comment.text);
      }

      function saveEditComment(commentId) {
        if (!editingCommentText.trim()) return;
        onEditComment(post.id, commentId, editingCommentText.trim());
        setEditingCommentId(null);
        setEditingCommentText("");
      }

      // 대댓글 상태
      const [replyingToId, setReplyingToId] = useState(null);
      const [replyText, setReplyText] = useState("");

      function handleReplySubmit(commentId) {
        if (!replyText.trim()) return;
        const authorName = currentUserName || "익명 플레이터";
        const postRef = db.collection("community_posts").doc(post.id);
        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const comments = doc.data().comments || [];
          const idx = comments.findIndex(c => c.id === commentId);
          if (idx === -1) return;
          if (!comments[idx].replies) comments[idx].replies = [];
          comments[idx].replies.push({
            id: generateId(),
            author: authorName,
            text: replyText.trim(),
            createdAt: new Date().toISOString()
          });
          transaction.update(postRef, { comments });
        }).catch(err => console.error("[Reply Error]", err));
        setReplyText("");
        setReplyingToId(null);
      }

      return (
        <div className="community-detail-page text-left">
          <div className="mb-4">
            <button className="text-zinc-500 text-xs py-1.5 active:scale-95 transition-transform" onClick={onBack}>
              <i className="fa-solid fa-chevron-left mr-1"></i> 커뮤니티 목록
            </button>
          </div>

          <div className="community-detail-card">
            <div className="community-detail-header">
              <div className="community-detail-meta">
                <span className="font-bold text-zinc-800">{post.category}</span>
                <span className="mx-1.5">·</span>
                <span className="cursor-pointer hover:underline font-semibold text-zinc-950" onClick={() => onAuthorClick(post.author)}>{post.author}</span>
              </div>
              <div>
                {!isEditingCom && (
                  <div className="kebab-dropdown-wrapper">
                    <button className="kebab-menu-btn" onClick={() => setShowKebabMenu(!showKebabMenu)} aria-label="메뉴">
                      <i className="fa-solid fa-ellipsis-vertical text-zinc-500"></i>
                    </button>
                    {showKebabMenu && (
                      <div className="kebab-dropdown">
                        {!isAdmin && isMyPost && (
                          <>
                            <button onClick={() => { startEdit(); setShowKebabMenu(false); }}>수정</button>
                            <button className="delete-btn" onClick={() => { deletePost(); setShowKebabMenu(false); }}>삭제</button>
                          </>
                        )}
                        {!isAdmin && !isMyPost && (
                          <button 
                            type="button"
                            className="text-red-500 font-bold"
                            onClick={() => {
                              setShowKebabMenu(false);
                              if (window.openReportModal) {
                                window.openReportModal("post", post.id, post.author, post.title + "\n" + post.body);
                              }
                            }}
                          >
                            🚩 신고하기
                          </button>
                        )}
                        {isAdmin && (
                          <>
                            <button className="delete-btn font-bold text-red-650" onClick={() => { deletePost(); setShowKebabMenu(false); }}>삭제</button>
                            <button onClick={() => { 
                              setShowKebabMenu(false); 
                              onBack();
                              if (window.openAdminCenter) window.openAdminCenter();
                            }}>신고내역 보기</button>
                            <button onClick={() => {
                              setShowKebabMenu(false);
                              onAuthorClick(post.author);
                            }}>작성자 정보 보기</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 사진 갤러리 렌더링 지원 */}
            {post.image && post.image.length > 0 && !isEditingCom && (
              <div className="rounded-lg overflow-hidden aspect-[4/5] bg-zinc-100 mb-4 max-h-[400px]">
                {post.image.length > 1 ? (
                  <ImageCarousel images={post.image} />
                ) : (
                  <img src={post.image[0]} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            )}

            {isEditingCom ? (
              <div className="flex flex-col gap-3 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1">
                  제목 수정
                  <input value={editComTitle} onChange={(e) => setEditComTitle(e.target.value)} className="border p-2 rounded text-xs" />
                </label>
                <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1">
                  내용 수정
                  <textarea value={editComBody} onChange={(e) => setEditComBody(e.target.value)} className="border p-2 rounded text-xs h-24 resize-none" />
                </label>
                <div className="flex gap-2">
                  <button className="primary flex-1 py-1.5 rounded text-xs font-bold" onClick={saveEdit}>저장</button>
                  <button className="secondary flex-1 py-1.5 rounded text-xs font-bold" onClick={() => setIsEditingCom(false)}>취소</button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="community-detail-title" style={{ wordBreak: "break-all", whiteSpace: "normal" }}>{post.title}</h3>
                <p className="community-detail-body" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>{post.body}</p>
              </div>
            )}

            {/* 하단: 날짜+조회수 / 좋아요+스크랩 */}
            <div className="flex justify-between items-center border-t border-zinc-100 pt-3 mt-3">
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <i className="fa-regular fa-eye"></i>
                  조회 {(post.viewCount || 0).toLocaleString()}
                </span>
                <span>·</span>
                <span>{post.createdAt ? post.createdAt.slice(0,10) : ""}</span>
              </div>
              <div className="flex gap-2">
                <button 
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border active:scale-95 transition-transform ${
                    post.liked
                      ? 'bg-red-50 border-red-300 text-red-500'
                      : 'bg-white border-zinc-200 text-zinc-500'
                  }`}
                  onClick={() => onLikePost(post.id)}
                >
                  <i className={post.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"} style={{fontSize:'15px'}}></i>
                  <span>좋아요 {post.likeCount}</span>
                </button>
                <button 
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold border active:scale-95 transition-transform ${
                    post.scrapped
                      ? 'bg-zinc-900 border-zinc-900 text-white'
                      : 'bg-white border-zinc-200 text-zinc-500'
                  }`}
                  onClick={() => onScrapPost(post.id)}
                >
                  <i className={post.scrapped ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"} style={{fontSize:'14px'}}></i>
                  <span>스크랩</span>
                </button>
              </div>
            </div>
          </div>

          <div className="community-detail-card">
            <span className="text-xs font-bold text-zinc-800 block mb-2">댓글 ({post.comments.length})</span>
            <div className="flex flex-col gap-1 mb-4 divide-y divide-zinc-50">
              {post.comments.map(c => {
                const isMyComment = c.author === "나" || c.author === currentUserName;
                return (
                  <div className="comment-item" key={c.id}>
                    <div className="comment-header">
                      <span className="comment-author cursor-pointer hover:underline" onClick={() => onAuthorClick(c.author)}>{c.author}</span>
                      <div className="comment-actions">
                        {editingCommentId === c.id ? (
                          <>
                            <button className="comment-action-btn" onClick={() => saveEditComment(c.id)}>완료</button>
                            <button className="comment-action-btn" onClick={() => setEditingCommentId(null)}>취소</button>
                          </>
                        ) : (
                          <div className="kebab-dropdown-wrapper">
                            <button 
                              className="kebab-menu-btn" 
                              onClick={() => setOpenCommentKebabId(openCommentKebabId === c.id ? null : c.id)}
                              aria-label="댓글 메뉴"
                            >
                              <i className="fa-solid fa-ellipsis-vertical text-zinc-400 hover:text-zinc-600 text-xs"></i>
                            </button>
                            {openCommentKebabId === c.id && (
                              <div className="kebab-dropdown right-0">
                                <button onClick={() => { setReplyingToId(c.id); setOpenCommentKebabId(null); }}>
                                  답글 달기
                                </button>
                                {!isAdmin && isMyComment && (
                                  <>
                                    <button onClick={() => { startEditComment(c); setOpenCommentKebabId(null); }}>수정</button>
                                    <button className="delete-btn" onClick={() => { onDeleteComment(post.id, c.id); setOpenCommentKebabId(null); }}>삭제</button>
                                  </>
                                )}
                                {!isAdmin && !isMyComment && (
                                  <button 
                                    className="text-red-500 font-bold"
                                    onClick={() => {
                                      setOpenCommentKebabId(null);
                                      if (window.openReportModal) {
                                        window.openReportModal("comment", c.id, c.author, c.text, post.id);
                                      }
                                    }}
                                  >
                                    🚩 신고하기
                                  </button>
                                )}
                                {isAdmin && (
                                  <button 
                                    className="delete-btn font-bold text-red-650"
                                    onClick={() => { 
                                      onDeleteComment(post.id, c.id); 
                                      setOpenCommentKebabId(null); 
                                    }}
                                  >
                                    삭제 (관리자)
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="comment-inline-edit">
                        <input value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} />
                      </div>
                    ) : (
                      <p className="comment-text">{c.text}</p>
                    )}

                    {/* 대댓글 목록 */}
                    {c.replies && c.replies.length > 0 && (
                      <div style={{marginLeft:'14px', borderLeft:'2px solid #f1f1f1', paddingLeft:'10px', marginTop:'6px'}} className="flex flex-col gap-2">
                        {c.replies.map(r => (
                          <div key={r.id} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <i className="fa-solid fa-turn-up fa-flip-horizontal text-zinc-300" style={{fontSize:'9px'}}></i>
                              <span className="text-[11px] font-bold text-zinc-700 cursor-pointer hover:underline" onClick={() => onAuthorClick(r.author)}>{r.author}</span>
                            </div>
                            <p className="text-xs text-zinc-600" style={{marginLeft:'14px'}}>{r.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 대댓글 입력창 */}
                    {replyingToId === c.id && (
                      <div style={{marginLeft:'14px', marginTop:'6px'}} className="flex gap-2 items-center">
                        <i className="fa-solid fa-turn-up fa-flip-horizontal text-zinc-300" style={{fontSize:'10px'}}></i>
                        <input
                          className="flex-1 border border-zinc-200 rounded-full px-3 py-1 text-xs focus:outline-none focus:border-zinc-400"
                          placeholder={`${c.author}님에게 답글...`}
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleReplySubmit(c.id); }}
                          autoFocus
                        />
                        <button
                          className="text-xs font-bold text-zinc-600 px-2 py-1 rounded-full border border-zinc-200 active:bg-zinc-100"
                          onClick={() => handleReplySubmit(c.id)}
                        >등록</button>
                        <button
                          className="text-xs text-zinc-400"
                          onClick={() => { setReplyingToId(null); setReplyText(""); }}
                        >취소</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <form className="comment-form" onSubmit={handleCommentSubmit}>
              <input 
                value={commText} 
                onChange={(e) => setCommText(e.target.value)} 
                placeholder="댓글을 작성해 보세요..." 
              />
              <button type="submit">등록</button>
            </form>
          </div>
        </div>
      );
    }

    function LegacyMyPage({ posts, profile, setProfile, categories, onCardClick, followingList = [], creatorsData = {}, onFollowToggle, onAuthorClick, onAdminCenterClick, onSettingsClick, communityPosts = [], onCommunityCardClick, onLikeCommunityPost, onScrapCommunityPost }) {
      const [isEditing, setIsEditing] = useState(false);
      const [editName, setEditName] = useState(profile.name);
      const [editBio, setEditBio] = useState(profile.bio);
      const [editPhoto, setEditPhoto] = useState(profile.avatarImg || "");
      const fileInputRef = useRef(null);
      
      const [myTab, setMyTab] = useState("posts");
      const [myCategory, setMyCategory] = useState("전체");
      const [scrapSubTab, setScrapSubTab] = useState("recipe"); // "recipe" or "community"
      const [followModal, setFollowModal] = useState(null); // null, "followers", or "following"
      const [followersList, setFollowersList] = useState([]); // Firestore 기반 실제 팔로워 목록
      const [removingFollower, setRemovingFollower] = useState(null); // 삭제 진행 중인 팔로워

      // 내 팔로워 목록 실시간 로드
      React.useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;
        // users 컬렉션에서 followingList에 내 닉네임이 포함된 유저를 팔로워로 판별
        const unsub = db.collection("users")
          .where("followingList", "array-contains", profile.name)
          .onSnapshot(snap => {
            const list = [];
            snap.forEach(doc => {
              const data = doc.data();
              list.push({
                uid: doc.id,
                nickname: data.nickname || data.name || "알 수 없음",
                bio: data.bio || "소개글이 없습니다.",
                avatarImg: data.avatarImg || ""
              });
            });
            setFollowersList(list);
          }, err => console.error("[Followers] 로드 실패:", err));
        return () => unsub();
      }, [profile.name]);

      // 팔로워 삭제 (내 팔로워 목록에서 제거)
      async function handleRemoveFollower(followerUid, followerNickname) {
        if (!await window.showConfirm(`"${followerNickname}"님을 팔로워 목록에서 삭제하시겠습니까?`)) return;
        setRemovingFollower(followerUid);
        try {
          // 해당 유저의 followingList에서 내 닉네임 제거
          await db.collection("users").doc(followerUid).update({
            followingList: firebase.firestore.FieldValue.arrayRemove(profile.name)
          });
          showToast(`${followerNickname}님을 팔로워에서 삭제했습니다.`, "success");
        } catch (err) {
          console.error("[RemoveFollower] 실패:", err);
          showToast("삭제에 실패했습니다. 다시 시도해 주세요.", "error");
        } finally {
          setRemovingFollower(null);
        }
      }

      const myPosts = posts.filter(post => post.author === "나" || post.author === profile.name);
      const scrappedPosts = posts.filter(post => post.scrapped);
      const scrappedCommunityPosts = communityPosts.filter(post => post.scrapped);
      const totalScrappedCount = scrappedPosts.length + scrappedCommunityPosts.length;
      
      const filteredMyPosts = myCategory === "전체" 
        ? myPosts 
        : myPosts.filter(post => post.category === myCategory);

      function handlePhotoChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setEditPhoto(reader.result);
        reader.readAsDataURL(file);
      }

      function startEditing() {
        setEditName(profile.name);
        setEditBio(profile.bio);
        setEditPhoto(profile.avatarImg || "");
        setIsEditing(true);
      }

      function handleSave() {
        const targetName = editName.trim();
        if (!targetName) return;

        // 1. 클라이언트단에서 mock 크리에이터 이름과 중복 확인
        const isMockCreatorDuplicate = Object.keys(initialCreatorsData).some(
          (name) => name !== profile.name && name.toLowerCase() === targetName.toLowerCase()
        );
        if (isMockCreatorDuplicate) {
          alert("이미 사용 중인 닉네임입니다. 다른 닉네임을 사용해 주세요.");
          return;
        }

        // 2. 백엔드와 연동하여 세션/DB 중복체크 진행 후 최종 저장
        fetch("/api/v1/users/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nickname: targetName,
            bio: editBio.trim(),
            avatarImg: editPhoto
          })
        })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            // Firestore 사용자 정보 업데이트 추가
            if (auth.currentUser) {
              db.collection("users").doc(auth.currentUser.uid).update({
                nickname: targetName,
                bio: editBio.trim(),
                intro: editBio.trim(),
                avatarImg: editPhoto,
                profileImage: editPhoto,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              }).catch(e => console.error("Firestore user profile update failed:", e));
            }

            setProfile({
              name: targetName,
              bio: editBio.trim(),
              avatar: targetName.slice(0, 1),
              avatarImg: editPhoto,
              role: profile.role || "user"
            });
            setIsEditing(false);
            alert("프로필이 저장되었습니다.");
          } else {
            alert(res.message || "프로필 저장 중 오류가 발생했습니다.");
          }
        })
        .catch(err => {
          console.error("프로필 저장 실패:", err);
          // 오프라인 혹은 개발 환경 폴백
          if (auth.currentUser) {
            db.collection("users").doc(auth.currentUser.uid).update({
              nickname: targetName,
              bio: editBio.trim(),
              intro: editBio.trim(),
              avatarImg: editPhoto,
              profileImage: editPhoto,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(e => console.error("Firestore user profile update failed (fallback):", e));
          }

          setProfile({
            name: targetName,
            bio: editBio.trim(),
            avatar: targetName.slice(0, 1),
            avatarImg: editPhoto,
            role: profile.role || "user"
          });
          setIsEditing(false);
        });
      }

      return (
        <section className="my-page">
          <div className="bg-zinc-50/50 pt-5 pb-4 border-b border-zinc-200">
            {isEditing ? (
              <div className="px-4 flex flex-col gap-3">
                {/* 앱 스타일 프로필 이미지 에디터 */}
                <div className="flex flex-col items-center gap-2 mb-2 mt-1">
                  <div 
                    className="relative w-16 h-16 rounded-full border border-zinc-200 shadow-sm overflow-hidden bg-zinc-100 cursor-pointer active:scale-95 transition-transform"
                    onClick={() => fileInputRef.current.click()}
                  >
                    {editPhoto ? (
                      <img src={editPhoto} alt="프로필 사진" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xl font-bold bg-zinc-200">
                        {editName.slice(0, 1)}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-35 flex items-center justify-center">
                      <i className="fa-solid fa-camera text-white text-[10px]"></i>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    className="text-[10px] text-zinc-500 font-semibold cursor-pointer"
                    onClick={() => fileInputRef.current.click()}
                  >
                    사진 변경
                  </button>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    accept="image/*" 
                    onChange={handlePhotoChange} 
                    style={{ display: "none" }} 
                  />
                </div>

                <label className="text-[10px] font-bold text-zinc-400 flex flex-col gap-1 uppercase">
                  닉네임
                  <input value={editName} maxLength={12} onChange={(e) => setEditName(e.target.value)} className="border border-zinc-200 p-2 rounded-xl text-xs bg-white text-zinc-950 focus:outline-none focus:border-zinc-950" />
                </label>
                <label className="text-[10px] font-bold text-zinc-400 flex flex-col gap-1 uppercase">
                  한 줄 소개
                  <textarea value={editBio} maxLength={40} onChange={(e) => setEditBio(e.target.value)} className="border border-zinc-200 p-2 rounded-xl text-xs h-16 resize-none bg-white text-zinc-950 focus:outline-none focus:border-zinc-950" placeholder="자기소개를 입력해주세요" />
                </label>
                <div className="flex gap-2 mt-2">
                  <button className="primary flex-1 py-2 rounded-xl text-xs font-bold" onClick={handleSave}>저장</button>
                  <button className="secondary flex-1 py-2 rounded-xl text-xs font-bold" onClick={() => setIsEditing(false)}>취소</button>
                </div>
              </div>
            ) : (
              <div className="px-4">
                <div className="flex items-center gap-4">
                  {/* Large Premium Avatar */}
                  <span className="w-16 h-16 rounded-full border-2 border-white shadow-md overflow-hidden bg-zinc-200 flex-shrink-0 flex items-center justify-center text-zinc-800 text-xl font-bold">
                    {profile.avatarImg ? <img src={profile.avatarImg} alt="" className="w-full h-full object-cover" /> : profile.avatar}
                  </span>
                  
                  {/* Nickname & Bio & Small Action Buttons */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-extrabold text-zinc-950 text-base truncate m-0">{profile.name}</h2>
                      <button 
                        className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold px-2.5 py-0.5 rounded-md transition-all active:scale-95 flex-shrink-0"
                        onClick={startEditing}
                      >
                        수정
                      </button>
                      {profile.role === "admin" && (
                        <button 
                          className="bg-red-50 hover:bg-red-100 text-red-650 border border-red-100 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all active:scale-95 flex-shrink-0"
                          onClick={() => onAdminCenterClick()}
                          title="신고 접수 (관리자 센터)"
                        >
                          관리자
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{profile.bio || "자기소개가 등록되지 않았습니다."}</p>
                  </div>
                </div>

                {/* Clean, borderless large stats (Instagram/TikTok style) */}
                <div className="flex justify-around items-center mt-5 mb-1 px-2">
                  <div className="flex flex-col items-center">
                    <span className="text-lg font-black text-zinc-950 leading-none">{myPosts.length}</span>
                    <span className="text-[10px] text-zinc-450 font-bold mt-2">게시물</span>
                  </div>
                  <div className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform" onClick={() => setFollowModal("followers")}>
                    <span className="text-lg font-black text-zinc-950 leading-none">{followersList.length}</span>
                    <span className="text-[10px] text-zinc-450 font-bold mt-2 hover:text-zinc-800">팔로워</span>
                  </div>
                  <div className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform" onClick={() => setFollowModal("following")}>
                    <span className="text-lg font-black text-zinc-950 leading-none">{followingList.length}</span>
                    <span className="text-[10px] text-zinc-450 font-bold mt-2 hover:text-zinc-800">팔로잉</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex border-b border-zinc-200">
            <button 
              className={`flex-1 py-3 text-xs font-bold text-center border-b-2 ${myTab === 'posts' ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-400'}`}
              onClick={() => setMyTab("posts")}
            >
              내 게시글 ({myPosts.length})
            </button>
            <button 
              className={`flex-1 py-3 text-xs font-bold text-center border-b-2 ${myTab === 'scraps' ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-400'}`}
              onClick={() => setMyTab("scraps")}
            >
              스크랩북 ({totalScrappedCount})
            </button>
          </div>

          {myTab === "posts" ? (
            <div className="my-card">
              <h2 className="mb-2">카테고리별 글 보기</h2>
              <div className="category-tabs no-scrollbar mb-4">
                {categories.filter(c => c !== "팔로잉").map(cat => (
                  <button 
                    key={cat} 
                    className={`category-tab ${myCategory === cat ? 'active' : ''}`}
                    onClick={() => setMyCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="my-list">
                {filteredMyPosts.length > 0 ? (
                  filteredMyPosts.map(post => (
                    <div 
                      className="my-item cursor-pointer p-1.5 hover:bg-zinc-50 rounded-lg" 
                      key={post.id}
                      onClick={() => onCardClick(post)}
                    >
                      <img src={Array.isArray(post.image) ? post.image[0] : post.image} alt="" />
                      <div className="min-w-0 flex-1">
                        <strong className="truncate block">{post.title}</strong>
                        <span>{post.category} · 링크 {post.productLinks.length}개</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 text-center py-6">해당 카테고리로 쓴 글이 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="my-card">
              <div className="flex gap-2 border-b border-zinc-100 pb-2 mb-4">
                <button 
                  className={`px-3 py-1.5 text-xs font-bold rounded-full ${scrapSubTab === 'recipe' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-500'}`}
                  onClick={() => setScrapSubTab("recipe")}
                >
                  요리 포스트 ({scrappedPosts.length})
                </button>
                <button 
                  className={`px-3 py-1.5 text-xs font-bold rounded-full ${scrapSubTab === 'community' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-500'}`}
                  onClick={() => setScrapSubTab("community")}
                >
                  커뮤니티 글 ({scrappedCommunityPosts.length})
                </button>
              </div>

              {scrapSubTab === "recipe" ? (
                <div className="grid grid-cols-2 gap-3">
                  {scrappedPosts.length > 0 ? (
                    scrappedPosts.map(post => (
                      <div 
                        key={post.id} 
                        className="bg-white border border-zinc-200 rounded-lg overflow-hidden cursor-pointer"
                        onClick={() => onCardClick(post)}
                      >
                        <div className="aspect-[4/5] bg-zinc-100 overflow-hidden">
                          <img src={Array.isArray(post.image) ? post.image[0] : post.image} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-2">
                          <strong className="text-xs text-zinc-950 block truncate">{post.title}</strong>
                          <span className="text-[10px] text-zinc-400 block truncate">{post.author}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 text-xs text-zinc-400 text-center py-12">스크랩된 요리글이 없습니다.</div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {scrappedCommunityPosts.length > 0 ? (
                    scrappedCommunityPosts.map(post => {
                      const badge = post.isAnnouncement 
                        ? { text: "공지", type: "notice" } 
                        : (post.likeCount >= 30 ? { text: "인기", type: "popular" } : null);
                      return (
                        <div 
                          key={post.id} 
                          className="everytime-post cursor-pointer"
                          onClick={() => onCommunityCardClick(post.id)}
                        >
                          <div className="everytime-user-row">
                            <div className="everytime-user-info">
                              <span className="everytime-avatar">
                                {post.avatarImg ? (
                                  <img src={post.avatarImg} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  post.author.slice(0, 1)
                                )}
                              </span>
                              <span className="everytime-author">{post.author}</span>
                              <span className="everytime-time">{post.createdAt}</span>
                            </div>
                            {badge && (
                              <span className={`everytime-badge ${badge.type}`}>{badge.text}</span>
                            )}
                          </div>

                          <div className="everytime-body-wrapper">
                            <div className="everytime-text-area">
                              <h3>{post.title}</h3>
                              <p className="line-clamp-2">{post.body}</p>
                            </div>
                            {post.image && post.image.length > 0 && (
                              <img 
                                className="everytime-thumbnail" 
                                src={post.image[0]} 
                                alt="" 
                                loading="lazy"
                              />
                            )}
                          </div>

                          <div className="everytime-meta" onClick={(e) => e.stopPropagation()}>
                            <div className="everytime-actions">
                              <span 
                                className="cursor-pointer"
                                onClick={() => onLikeCommunityPost(post.id)}
                              >
                                <i className={post.liked ? "fa-solid fa-heart text-red-500" : "fa-regular fa-heart"}></i>
                                {post.likeCount}
                              </span>
                              <span>
                                <i className="fa-regular fa-comment"></i>
                                {post.comments.length}
                              </span>
                              <span>
                                <i className="fa-regular fa-eye"></i>
                                {(post.viewCount || 0).toLocaleString()}
                              </span>
                              <span 
                                className="cursor-pointer text-zinc-950 font-bold"
                                onClick={() => onScrapCommunityPost(post.id)}
                              >
                                <i className="fa-solid fa-bookmark text-zinc-950"></i>
                                스크랩됨
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-zinc-400 text-center py-12">스크랩된 커뮤니티 글이 없습니다.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {followModal && (
            <div className="sheet-backdrop animate-fade-in" onClick={() => setFollowModal(null)} style={{ zIndex: 1200 }}>
              <section className="sheet animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <header className="sheet-head">
                  <h2>{followModal === "followers" ? `팔로워 (${followersList.length})` : `팔로잉 (${followingList.length})`}</h2>
                  <button type="button" onClick={() => setFollowModal(null)}>×</button>
                </header>
                <div className="py-2 max-h-[350px] overflow-y-auto no-scrollbar">
                  {(() => {
                    if (followModal === "followers") {
                      // ── 팔로워 목록 (삭제 기능 포함)
                      if (followersList.length === 0) {
                        return (
                          <div className="text-center py-12 text-zinc-400 text-xs">
                            팔로워가 없습니다.
                          </div>
                        );
                      }
                      return followersList.map(follower => (
                        <div key={follower.uid} className="flex items-center justify-between py-2.5 px-4 border-b border-zinc-100 last:border-none">
                          <div
                            className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                            onClick={() => { setFollowModal(null); onAuthorClick(follower.nickname); }}
                          >
                            <span className="w-9 h-9 rounded-full border border-zinc-200 overflow-hidden bg-zinc-100 flex items-center justify-center text-zinc-700 text-xs font-bold flex-shrink-0">
                              {follower.avatarImg ? (
                                <img src={follower.avatarImg} alt="" className="w-full h-full object-cover" />
                              ) : (
                                follower.nickname.slice(0, 1)
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <strong className="text-xs text-zinc-900 block truncate">{follower.nickname}</strong>
                              <span className="text-[10px] text-zinc-400 block truncate mt-0.5">{follower.bio}</span>
                            </div>
                          </div>
                          <button
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all bg-red-50 text-red-500 hover:bg-red-100 border border-red-100 disabled:opacity-40"
                            onClick={() => handleRemoveFollower(follower.uid, follower.nickname)}
                            disabled={removingFollower === follower.uid}
                          >
                            {removingFollower === follower.uid ? "삭제 중..." : "삭제"}
                          </button>
                        </div>
                      ));
                    } else {
                      // ── 팔로잉 목록
                      const list = followingList;
                      if (!list || list.length === 0) {
                        return (
                          <div className="text-center py-12 text-zinc-400 text-xs">
                            팔로잉하는 사용자가 없습니다.
                          </div>
                        );
                      }
                      return list.map(username => {
                        const userData = creatorsData[username] || { bio: "플레이팅 크리에이터입니다.", avatarImg: "" };
                        const isFollowing = followingList.includes(username);
                        return (
                          <div key={username} className="flex items-center justify-between py-2.5 px-4 border-b border-zinc-100 last:border-none">
                            <div
                              className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                              onClick={() => { setFollowModal(null); onAuthorClick(username); }}
                            >
                              <span className="w-9 h-9 rounded-full border border-zinc-200 overflow-hidden bg-zinc-100 flex items-center justify-center text-zinc-700 text-xs font-bold flex-shrink-0">
                                {userData.avatarImg ? (
                                  <img src={userData.avatarImg} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  username.slice(0, 1)
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <strong className="text-xs text-zinc-900 block truncate">{username}</strong>
                                <span className="text-[10px] text-zinc-400 block truncate mt-0.5">{userData.bio}</span>
                              </div>
                            </div>
                            <button
                              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all ${
                                isFollowing
                                  ? "bg-zinc-100 text-zinc-650 hover:bg-zinc-200"
                                  : "bg-zinc-950 text-white hover:bg-zinc-800"
                              }`}
                              onClick={() => onFollowToggle(username)}
                            >
                              {isFollowing ? "팔로잉" : "팔로우"}
                            </button>
                          </div>
                        );
                      });
                    }
                  })()}
                </div>
              </section>
            </div>
          )}
        </section>
      );
    }

    // 부적절글 신고 모달 컴포넌트
    function ReportModal({ onClose, onSubmit }) {
      const [reason, setReason] = useState("욕설");
      const [description, setDescription] = useState("");
      const reasons = [
        "욕설",
        "음란물",
        "광고",
        "스팸",
        "개인정보",
        "기타"
      ];

      return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-fade-in text-left">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="text-sm font-bold text-zinc-950 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-exclamation text-rose-500"></i> 신고 접수하기
              </h3>
              <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            <p className="text-xs text-zinc-500 mb-4">
              건전하고 깨끗한 플레이팅 커뮤니티 문화를 위해 부적절한 게시글 및 댓글을 신고해 주세요.
            </p>

            <div className="flex flex-col gap-2 mb-4">
              {reasons.map((r) => (
                <label key={r} className="flex items-center gap-2.5 text-xs text-zinc-800 cursor-pointer hover:bg-zinc-50 p-2 rounded-lg transition-colors border border-zinc-100 active:scale-98">
                  <input 
                    type="radio" 
                    name="report_reason" 
                    value={r} 
                    checked={reason === r} 
                    onChange={(e) => setReason(e.target.value)} 
                    className="accent-zinc-900 w-4 h-4 cursor-pointer"
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>

            {reason === "기타" && (
              <div className="mb-4">
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="신고 사유를 직접 입력해 주세요 (최대 100자)"
                  className="w-full border border-zinc-200 p-2.5 rounded-xl text-xs bg-white text-zinc-950 focus:outline-none focus:border-zinc-950 h-20 resize-none"
                  maxLength={100}
                  required
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button 
                onClick={onClose} 
                className="flex-1 py-2 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors active:scale-95"
              >
                취소
              </button>
              <button 
                onClick={() => onSubmit(reason, description)} 
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors active:scale-95"
                disabled={reason === "기타" && !description.trim()}
              >
                신고 제출
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 최대 10개 및 총 용량 20MB 제한 (초과 시 자동 압축 지원) 글쓰기 시트
    function WriteSheet({ onClose, onCreate, initialImages = [] }) {
      const [title, setTitle] = useState("");
      const [body, setBody] = useState("");
      const [images, setImages] = useState(initialImages); // 이미지 주소 배열 관리
      const [category, setCategory] = useState("레시피");
      const [links, setLinks] = useState([{ id: generateId(), url: "" }]);
      const [loading, setLoading] = useState(false);



      const fileInputRef = useRef(null);

      const [linkPreviews, setLinkPreviews] = useState({}); // key: link.id, value: { url, title, image, host, loading }

      function parsePastedMapText(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let parsed = { url: "", name: "", address: "" };
        
        const urlMatch = text.match(/(https?:\/\/[^\s\n\r]+)/);
        if (urlMatch) {
          parsed.url = urlMatch[0];
        }
        
        const mapIdx = lines.findIndex(l => l.includes("[네이버지도]"));
        if (mapIdx !== -1) {
          if (lines[mapIdx + 1] && !lines[mapIdx + 1].startsWith("http") && !lines[mapIdx + 1].includes("[네이버지도]")) {
            parsed.name = lines[mapIdx + 1];
          }
          if (lines[mapIdx + 2] && !lines[mapIdx + 2].startsWith("http")) {
            parsed.address = lines[mapIdx + 2];
          }
        }
        return parsed;
      }

      function handleUrlChange(id, value) {
        const parsed = parsePastedMapText(value);
        if (parsed.url) {
          setLinks(links.map(item => item.id === id ? { 
            ...item, 
            url: parsed.url, 
            parsedName: parsed.name, 
            parsedAddress: parsed.address 
          } : item));
          
          if (parsed.name) {
            setCategory("맛집");
          }
        } else {
          setLinks(links.map(item => item.id === id ? { ...item, url: value } : item));
        }
      }

      useEffect(() => {
        links.forEach(async (link) => {
          if (!link.url || !link.url.startsWith("http")) {
            if (linkPreviews[link.id]) {
              setLinkPreviews(prev => {
                const copy = { ...prev };
                delete copy[link.id];
                return copy;
              });
            }
            return;
          }
          
          const existing = linkPreviews[link.id];
          if (existing && existing.url === link.url) {
            return;
          }
          
          setLinkPreviews(prev => ({
            ...prev,
            [link.id]: { loading: true, url: link.url }
          }));
          
          try {
            const meta = await fetchLinkMeta(link.url);
            setLinkPreviews(prev => ({
              ...prev,
              [link.id]: {
                loading: false,
                url: link.url,
                title: meta && meta.title && meta.title !== "상세 링크" ? meta.title : (link.parsedName || "상세 링크"),
                image: meta ? meta.image : "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
                host: meta ? meta.host : new URL(link.url).hostname.replace("www.", "")
              }
            }));
          } catch (e) {
            setLinkPreviews(prev => ({
              ...prev,
              [link.id]: {
                loading: false,
                url: link.url,
                title: link.parsedName || "상세 링크",
                image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
                host: new URL(link.url).hostname.replace("www.", "")
              }
            }));
          }
        });
      }, [links]);
      // Cloudflare R2 업로드 (압축 및 백엔드 프록시 처리)
      async function handlePhoto(e) {
        console.log("[UPLOAD STEP 1] handlePhoto started. Target files:", e.target.files);
        let files = [];
        try {
          files = Array.from(e.target.files).slice(0, 10);
        } catch (filesErr) {
          console.error("[UPLOAD STEP 1.1] Error parsing files array:", filesErr);
          alert("파일 목록을 가져오는 중 오류가 발생했습니다.");
          return;
        }
        
        if (files.length === 0) {
          console.log("[UPLOAD STEP 1.2] No files selected.");
          return;
        }
        
        setLoading(true);
        console.log("[UPLOAD STEP 2] Parsing complete. Files count:", files.length);

        const uploadedUrls = [];
        const options = {
          maxSizeMB: 1, // 최대 용량 제한 1MB
          maxWidthOrHeight: 1200, // 최대 해상도 1200px
          useWebWorker: false, // Android WebView WebWorker crash 방지
          initialQuality: 0.8 // 품질 80%
        };

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          console.log(`[UPLOAD STEP 3] Processing file [${i + 1}/${files.length}]: ${file.name}, Size: ${file.size} bytes`);
          
          let fileToUpload = file;
          try {
            console.log(`[UPLOAD STEP 4] Compressing file: ${file.name}`);
            const compressedBlob = await imageCompression(file, options);
            fileToUpload = compressedBlob;
            console.log(`[UPLOAD STEP 4.1] Compression successful. New size: ${compressedBlob.size} bytes`);
          } catch (compressErr) {
            console.error(`[UPLOAD STEP 4.2] Compression failed for ${file.name}. Uploading original file. Error:`, compressErr);
            fileToUpload = file; // 압축 실패 시 원본 파일 그대로 업로드하여 앱 크래시 방지
          }

          try {
            console.log(`[UPLOAD STEP 5] Creating FormData for ${file.name}`);
            const formData = new FormData();
            // new File() 생성자를 사용하지 않고, blob 객체 그대로 append하며 파일명을 세 번째 인자로 추가하여 Android 호환성 극대화
            formData.append("file", fileToUpload, file.name);

            console.log(`[UPLOAD STEP 6] Sending POST request to /api/v1/upload for ${file.name}`);
            const response = await fetch("/api/v1/upload", {
              method: "POST",
              body: formData
            });

            console.log(`[UPLOAD STEP 7] Received response for ${file.name}. Status: ${response.status}`);
            const res = await response.json();
            console.log(`[UPLOAD STEP 8] Parsed JSON response for ${file.name}:`, res);
            
            if (res.success && res.url) {
              uploadedUrls.push(res.url);
              console.log(`[UPLOAD STEP 9] Upload success:`, res.url);
            } else {
              throw new Error(res.message || "서버 응답 실패");
            }
          } catch (uploadErr) {
            console.error(`[UPLOAD STEP 10] Upload API request failed for ${file.name}:`, uploadErr);
            alert(`사진 업로드 중 오류가 발생했습니다: ${uploadErr.message || uploadErr}`);
          }
        }

        console.log("[UPLOAD STEP 11] All files processed. Uploaded URLs:", uploadedUrls);
        if (uploadedUrls.length > 0) {
          setImages(prev => [...prev, ...uploadedUrls]);
        }
        setLoading(false);
        console.log("[UPLOAD STEP 12] handlePhoto finished.");
      }

      function extractHashtags(text) {
        const matches = text.match(/#\S+/g);
        if (!matches) return [];
        return matches.map(tag => tag.trim());
      }

      async function submit(e) {
        e.preventDefault();
        if (!title.trim() || !body.trim()) return;
        setLoading(true);

        const productLinks = links.map(l => {
          const preview = linkPreviews[l.id];
          if (preview && !preview.loading) {
            return {
              id: generateId(),
              url: l.url.trim(),
              title: preview.title || l.parsedName || "상세 링크",
              image: preview.image || "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
              host: preview.host || new URL(l.url.trim()).hostname.replace("www.", "")
            };
          } else {
            let host = "link";
            try { host = new URL(l.url.trim()).hostname.replace("www.", ""); } catch(e) {}
            return {
              id: generateId(),
              url: l.url.trim(),
              title: l.parsedName || "상세 링크",
              image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=400",
              host
            };
          }
        }).filter(l => l.url !== "");

        const detectedTags = extractHashtags(body);

        let placeInfo = null;

        setLoading(false);
        
        let finalImage = images;
        if (images.length === 0) {
          finalImage = [fallbackImages[Math.floor(Math.random() * fallbackImages.length)]];
        }

        onCreate({
          title: title.trim(),
          body: body.trim(),
          category,
          mediaType: "image",
          image: finalImage,
          tags: detectedTags,
          productLinks,
          placeInfo
        });
      }

      return (
        <div className="sheet-backdrop" onClick={onClose}>
          <section className="sheet" onClick={(e) => e.stopPropagation()}>
            <header className="sheet-head">
              <h2>새 포스팅 등록</h2>
              <button type="button" onClick={onClose} aria-label="닫기">×</button>
            </header>
            <form onSubmit={submit}>
              <div className="flex gap-2 overflow-x-auto mb-4 py-1.5 border-b border-zinc-100 items-center">
                {images.map((img, idx) => (
                  <div key={idx} className="relative w-16 h-16 flex-shrink-0">
                    <img className="w-full h-full object-cover rounded border border-zinc-200" src={img} alt="" />
                    <button 
                      type="button" 
                      onClick={() => setImages(images.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 bg-black/80 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] border-none font-bold"
                      style={{ cursor: "pointer", padding: 0 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {images.length < 10 && (
                  <button
                    type="button"
                    onClick={() => {
                      console.log("[UI] Photo add button clicked");
                      fileInputRef.current.click();
                    }}
                    className="w-16 h-16 flex flex-col items-center justify-center border border-dashed border-zinc-300 rounded text-zinc-400 bg-zinc-50 flex-shrink-0"
                    style={{ cursor: "pointer", fontSize: "20px" }}
                  >
                    +
                    <span className="text-[9px] mt-0.5 font-normal">사진 추가</span>
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhoto} className="hidden" />

              <label>
                카테고리 선택
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.filter(c => c !== "전체" && c !== "팔로잉").map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                포스팅 제목 <span className="text-[10px] text-zinc-400 font-normal">({title.length}/40자)</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력해 주세요" maxLength={40} required />
              </label>
              <label>
                이야기 / 레시피 내용 <span className="text-[10px] text-zinc-400 font-normal">({body.length}/1000자)</span>
                <textarea 
                  value={body} 
                  onChange={(e) => setBody(e.target.value)} 
                  placeholder="이야기나 레시피를 적어보세요. 내용 내의 #해시태그는 자동으로 하이라이트됩니다." 
                  maxLength={1000}
                  required 
                />
              </label>



              <div className="link-editor-list">
                <div className="text-xs font-bold text-zinc-500 mb-2">
                  <i className="fa-solid fa-cart-shopping mr-1"></i> 소개된 재료/도구/지도 링크 추가 (네이버지도, 쇼핑몰 등)
                </div>
                {links.map((link, idx) => (
                  <div className="link-editor" key={link.id}>
                    <label className="mb-1.5">
                      링크 URL #{idx + 1}
                      <input 
                        type="text" 
                        value={link.url} 
                        onChange={(e) => handleUrlChange(link.id, e.target.value)} 
                        placeholder="https://... 링크 주소 입력 (네이버지도 복사글 전체 붙여넣기 가능)" 
                      />
                    </label>
                    {link.url && (
                      <div className="mt-2 p-2 bg-zinc-50 border border-zinc-150 rounded-lg flex items-center gap-3">
                        {linkPreviews[link.id]?.loading ? (
                          <div className="text-zinc-400 text-[10px] py-1 px-2 flex items-center gap-2">
                            <i className="fa-solid fa-spinner fa-spin"></i> 링크 정보를 불러오는 중...
                          </div>
                        ) : linkPreviews[link.id] ? (
                          <>
                            <img 
                              src={linkPreviews[link.id].image} 
                              alt="" 
                              className="w-12 h-12 object-cover rounded-md border border-zinc-200"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-zinc-900 truncate">
                                {linkPreviews[link.id].title}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate">
                                {linkPreviews[link.id].host} · {link.url}
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[10px] text-zinc-400">네이버 지도 등 장소명과 매칭되어 자동 노출됩니다.</span>
                      <button className="secondary px-2 py-1 text-[11px] rounded" type="button" onClick={() => setLinks(links.filter(item => item.id !== link.id))}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>

              <button className="secondary full border border-dashed text-xs" type="button" onClick={() => setLinks([...links, { id: generateId(), url: "" }])}>
                + 구매 상품 / 지도 장소 링크 추가
              </button>
              <button className="primary full mt-4 text-xs font-bold" type="submit" disabled={loading}>
                {loading ? "사진 최적화 및 등록 중..." : "글 등록 및 수익 모델 연동"}
              </button>
            </form>
          </section>
        </div>
      );
    }
    function LoginModal({ onClose, onLogin, onRegister }) {
      const [tab, setTab] = React.useState("login"); // "login" | "register"
      const [loginId, setLoginId] = React.useState("");
      const [password, setPassword] = React.useState("");
      const [confirmPassword, setConfirmPassword] = React.useState("");
      const [nickname, setNickname] = React.useState("");
      const [showPassword, setShowPassword] = React.useState(false);
      const [error, setError] = React.useState("");
      const [loading, setLoading] = React.useState(false);

      async function handleSubmitLogin(e) {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
          await onLogin("local", loginId, password);
        } catch (err) {
          setError(err.message || "로그인에 실패했습니다.");
        } finally {
          setLoading(false);
        }
      }

      async function handleSubmitRegister(e) {
        e.preventDefault();
        setError("");
        if (password !== confirmPassword) {
          setError("비밀번호가 일치하지 않습니다.");
          return;
        }
        setLoading(true);
        try {
          await onRegister(loginId, password, nickname, confirmPassword);
        } catch (err) {
          setError(err.message || "회원가입에 실패했습니다.");
        } finally {
          setLoading(false);
        }
      }

      const inputCls = "w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 mb-3";
      const btnCls = "w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-50";

      return (
        <div className="sheet-backdrop" onClick={onClose}>
          <section className="sheet" onClick={(e) => e.stopPropagation()}>
            <header className="sheet-head">
              <h2>{tab === "login" ? "로그인" : "회원가입"}</h2>
              <button type="button" onClick={() => onClose()}>×</button>
            </header>
            <div className="py-4 px-4">
              {/* 탭 전환 */}
              <div className="flex rounded-xl overflow-hidden border border-zinc-200 mb-5">
                <button
                  className={`flex-1 py-2 text-sm font-bold transition-colors ${tab === "login" ? "bg-orange-500 text-white" : "bg-white text-zinc-500"}`}
                  onClick={() => { setTab("login"); setError(""); }}
                >로그인</button>
                <button
                  className={`flex-1 py-2 text-sm font-bold transition-colors ${tab === "register" ? "bg-orange-500 text-white" : "bg-white text-zinc-500"}`}
                  onClick={() => { setTab("register"); setError(""); }}
                >회원가입</button>
              </div>

              {tab === "login" ? (
                <form onSubmit={handleSubmitLogin}>
                  <input className={inputCls} type="text" placeholder="아이디" value={loginId}
                    onChange={e => setLoginId(e.target.value)} autoComplete="username" />
                  <div className="relative mb-3">
                    <input className="w-full border border-zinc-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" 
                      type={showPassword ? "text" : "password"} 
                      placeholder="비밀번호" 
                      value={password}
                      onChange={e => setPassword(e.target.value)} 
                      autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600 text-sm">
                      <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}></i>
                    </button>
                  </div>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-xs font-bold flex items-center gap-2">
                      <i className="fa-solid fa-circle-exclamation text-red-500 text-sm flex-shrink-0"></i>
                      <span>{error}</span>
                    </div>
                  )}
                  <button type="submit" className={btnCls} disabled={loading}>
                    {loading ? "로그인 중..." : "로그인"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmitRegister}>
                  <input className={inputCls} type="text" placeholder="아이디 (영문·숫자)" value={loginId}
                    onChange={e => setLoginId(e.target.value)} autoComplete="username" />
                  <div className="relative mb-3">
                    <input className="w-full border border-zinc-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" 
                      type={showPassword ? "text" : "password"} 
                      placeholder="비밀번호 (6자 이상)" 
                      value={password}
                      onChange={e => setPassword(e.target.value)} 
                      autoComplete="new-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600 text-sm">
                      <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}></i>
                    </button>
                  </div>
                  <input className={inputCls} type={showPassword ? "text" : "password"} placeholder="비밀번호 확인" value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                  <input className={inputCls} type="text" placeholder="닉네임" value={nickname}
                    onChange={e => setNickname(e.target.value)} />
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-xs font-bold flex items-center gap-2">
                      <i className="fa-solid fa-circle-exclamation text-red-500 text-sm flex-shrink-0"></i>
                      <span>{error}</span>
                    </div>
                  )}
                  <button type="submit" className={btnCls} disabled={loading}>
                    {loading ? "가입 중..." : "회원가입"}
                  </button>
                </form>
              )}

              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-zinc-200"></div>
                  <span className="text-xs text-zinc-400">또는</span>
                  <div className="flex-1 h-px bg-zinc-200"></div>
                </div>
                <button
                  className="w-full kakao-btn py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-[#FEE500] text-[#191919] hover:bg-[#FDD835] transition-colors"
                  onClick={() => onLogin("kakao")}
                >
                  <i className="fa-solid fa-comment text-zinc-950 text-base"></i> 카카오톡 간편 시작하기
                </button>
              </div>
            </div>
          </section>
        </div>
      );
    }

    // --- 3.2. 관리자 신고 관리 센터 화면 ---
    function LegacyAdminReportsView({ onBack }) {
      const [adminTab, setAdminTab] = useState("dashboard"); // dashboard, reports, users, posts, comments, stats
      const [reports, setReports] = useState([]);
      const [users, setUsers] = useState([]);
      const [posts, setPosts] = useState([]);
      const [comPosts, setComPosts] = useState([]);
      
      const [loading, setLoading] = useState(true);
      const [reportSubTab, setReportSubTab] = useState("waiting"); // waiting, completed
      const [viewingPost, setViewingPost] = useState(null); // Post details modal
      
      // 통계 상태
      const [stats, setStats] = useState({
        todayReports: 0,
        totalPosts: 0,
        totalMembers: 0,
        todayRegistrations: 0,
        todayPosts: 0,
        todayComments: 0
      });

      useEffect(() => {
        // Realtime sync collections
        const unsubReports = db.collection("reports").onSnapshot(snap => {
          const list = [];
          snap.forEach(d => list.push(d.data()));
          setReports(list);
        });

        const unsubUsers = db.collection("users").onSnapshot(snap => {
          const list = [];
          snap.forEach(d => list.push({ uid: d.id, ...d.data() }));
          setUsers(list);
        });

        const unsubPosts = db.collection("posts").onSnapshot(snap => {
          const list = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          setPosts(list);
        });

        const unsubComPosts = db.collection("community_posts").onSnapshot(snap => {
          const list = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          setComPosts(list);
        });

        setLoading(false);

        return () => {
          unsubReports();
          unsubUsers();
          unsubPosts();
          unsubComPosts();
        };
      }, []);

      // Compute statistics based on snapshot data
      useEffect(() => {
        const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        
        // 1. 오늘 접수된 신고
        const todayReps = reports.filter(r => r.createdAt && r.createdAt.startsWith(todayStr)).length;

        // 2. 가입 유저 통계
        const totalMems = users.length;
        const todayRegs = users.filter(u => u.registeredAt && u.registeredAt.startsWith(todayStr)).length;

        // 3. 전체 및 오늘 작성글
        const totalP = posts.length + comPosts.length;
        const todayP = posts.filter(p => p.createdAt && p.createdAt.startsWith(todayStr)).length + 
                       comPosts.filter(p => p.createdAt && p.createdAt.startsWith(todayStr)).length;

        // 4. 오늘 작성된 댓글
        let todayComms = 0;
        comPosts.forEach(p => {
          const comments = p.comments || [];
          comments.forEach(c => {
            if (c.createdAt && c.createdAt.startsWith(todayStr)) todayComms++;
          });
        });

        setStats({
          todayReports: todayReps,
          totalPosts: totalP,
          totalMembers: totalMems,
          todayRegistrations: todayRegs,
          todayPosts: todayP,
          todayComments: todayComms
        });
      }, [reports, users, posts, comPosts]);

      // Helper: Resolve nickname by UID
      function getUserNickname(uid) {
        const u = users.find(user => user.uid === uid);
        return u ? u.nickname : (uid ? uid.substring(0, 8) : "알 수 없음");
      }

      function getReportedContentPreview(targetId, targetType, targetParentId) {
        if (targetType === "post") {
          const p = comPosts.find(x => x.id === targetId) || posts.find(x => x.id === targetId);
          return p ? `[글 제목] ${p.title}\n[내용] ${p.body || p.description}` : "(삭제된 게시글)";
        } else {
          const parentId = targetParentId || comPosts.find(p => p.comments.some(c => c.id === targetId))?.id;
          if (parentId) {
            const p = comPosts.find(x => x.id === parentId);
            const c = p?.comments.find(comm => comm.id === targetId);
            return c ? `[댓글] ${c.text}` : "(삭제된 댓글)";
          }
          return "(부모 글을 찾을 수 없는 댓글)";
        }
      }

      // Firestore 초기화: 관리자 role 설정 + 모든 글/가짜 회원 삭제
      async function handleFirestoreSetup() {
        if (!confirm("⚠️ 주의!\n\n아래 작업이 실행됩니다:\n1. 관리자 role 설정\n2. Firestore의 모든 게시글 삭제\n3. 가짜 회원 삭제\n\n계속 진행하시겠습니까?")) return;
        
        try {
          const user = auth.currentUser;
          if (!user) { alert("Firebase 로그인이 필요합니다."); return; }
          
          const idToken = await user.getIdToken(true);
          const res = await fetch("/api/v1/admin/setup-firestore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ firebaseIdToken: idToken, adminUid: user.uid })
          });
          const data = await res.json();
          
          if (data.success) {
            const r = data.results;
            alert(`✅ 초기화 완료!\n- 관리자 role 설정: ${r.setAdmin ? "성공" : "실패"}\n- 레시피 게시글 삭제: ${r.deletedPosts}개\n- 커뮤니티 게시글 삭제: ${r.deletedCommunityPosts}개\n- 가짜 회원 삭제: ${r.deletedUsers}개`);
          } else {
            alert("❌ 초기화 실패: " + data.message);
          }
        } catch (err) {
          alert("❌ 오류: " + err.message);
        }
      }

      // Actions for Reports
      async function handleDismissReports(targetId) {
        if (!confirm("정말 이 콘텐츠에 대한 모든 신고를 기각하시겠습니까?")) return;
        const batch = db.batch();
        const targetReps = reports.filter(r => r.targetId === targetId && r.status === "waiting");
        targetReps.forEach(r => {
          const ref = db.collection("reports").doc(r.reportId);
          batch.update(ref, { status: "completed" });
        });
        try {
          await batch.commit();
          alert("신고가 기각 처리되었습니다.");
        } catch (err) {
          alert("기각 처리 중 오류 발생: " + err.message);
        }
      }

      async function handleDeleteContent(targetId, targetType, targetParentId) {
        if (!confirm("정말 이 콘텐츠를 삭제하시겠습니까?\n삭제 시 관련된 모든 이미지와 댓글, 신고 내역이 정리됩니다.")) return;
        
        try {
          if (targetType === "post") {
            let isRecipe = false;
            let postDoc = await db.collection("community_posts").doc(targetId).get();
            if (!postDoc.exists) {
              postDoc = await db.collection("posts").doc(targetId).get();
              isRecipe = true;
            }

            if (postDoc.exists) {
              const data = postDoc.data();
              const imageUrls = data.image || [];
              for (const url of imageUrls) {
                try {
                  await firebase.storage().refFromURL(url).delete();
                } catch (se) {
                  console.warn("Storage image delete warning:", se.message);
                }
              }
              if (isRecipe) {
                await db.collection("posts").doc(targetId).delete();
              } else {
                await db.collection("community_posts").doc(targetId).delete();
              }
            }
          } else if (targetType === "comment") {
            const parentId = targetParentId || comPosts.find(p => p.comments.some(c => c.id === targetId))?.id;
            if (parentId) {
              const postRef = db.collection("community_posts").doc(parentId);
              await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(postRef);
                if (doc.exists) {
                  const comments = doc.data().comments || [];
                  const filtered = comments.filter(c => c.id !== targetId);
                  transaction.update(postRef, { comments: filtered });
                }
              });
            }
          }

          const batch = db.batch();
          const targetReps = reports.filter(r => r.targetId === targetId && r.status === "waiting");
          targetReps.forEach(r => {
            const ref = db.collection("reports").doc(r.reportId);
            batch.update(ref, { status: "completed" });
          });
          await batch.commit();

          alert("콘텐츠가 삭제되었으며 신고 처리가 완료되었습니다.");
        } catch (err) {
          alert("삭제 처리 중 오류 발생: " + err.message);
        }
      }

      // Actions for Members
      async function handleToggleMemberRole(uid, currentRole) {
        const targetRole = currentRole === "admin" ? "user" : "admin";
        if (!confirm(`이 회원의 권한을 [${targetRole === 'admin' ? '관리자' : '일반회원'}]로 변경하시겠습니까?`)) return;
        try {
          await db.collection("users").doc(uid).update({ role: targetRole });
          alert("권한이 정상적으로 수정되었습니다.");
        } catch (err) {
          alert("권한 변경 실패: " + err.message);
        }
      }

      async function handleDeleteMember(uid) {
        if (!confirm("정말 이 회원을 탈퇴 처리하시겠습니까?\nFirestore 회원 데이터가 영구적으로 삭제됩니다.")) return;
        try {
          await db.collection("users").doc(uid).delete();
          alert("회원이 정상적으로 삭제되었습니다.");
        } catch (err) {
          alert("회원 삭제 실패: " + err.message);
        }
      }

      // Group reports by targetId
      const grouped = {};
      reports.filter(r => r.status === (reportSubTab === "waiting" ? "waiting" : "completed")).forEach(r => {
        if (!grouped[r.targetId]) {
          grouped[r.targetId] = {
            targetId: r.targetId,
            targetType: r.targetType,
            targetParentId: r.targetParentId || "",
            reports: [],
            reason: r.reason,
            description: r.description,
            createdAt: r.createdAt,
            targetUserUid: r.targetUserUid
          };
        }
        grouped[r.targetId].reports.push(r);
        if (new Date(r.createdAt) > new Date(grouped[r.targetId].createdAt)) {
          grouped[r.targetId].reason = r.reason;
          grouped[r.targetId].description = r.description;
          grouped[r.targetId].createdAt = r.createdAt;
        }
      });
      const sortedReports = Object.values(grouped).sort((a, b) => b.reports.length - a.reports.length);

      return (
        <section className="admin-container text-left">
          {/* iOS 스타일 헤더 */}
          <div className="admin-header">
            <button className="text-zinc-500 text-xs py-1.5 active:scale-95 transition-transform" onClick={onBack}>
              <i className="fa-solid fa-chevron-left mr-1"></i> 마이페이지
            </button>
            <h1 className="text-sm font-bold text-zinc-950 flex items-center gap-1.5">
              🛡️ 플레이터 관리자 센터
            </h1>
          </div>

          {/* 탭 네비게이션 */}
          <div className="admin-tab-nav no-scrollbar">
            <button className={`admin-tab-btn ${adminTab === "dashboard" ? "active" : ""}`} onClick={() => setAdminTab("dashboard")}>대시보드</button>
            <button className={`admin-tab-btn ${adminTab === "reports" ? "active" : ""}`} onClick={() => setAdminTab("reports")}>신고관리</button>
            <button className={`admin-tab-btn ${adminTab === "users" ? "active" : ""}`} onClick={() => setAdminTab("users")}>회원관리</button>
            <button className={`admin-tab-btn ${adminTab === "posts" ? "active" : ""}`} onClick={() => setAdminTab("posts")}>게시글관리</button>
            <button className={`admin-tab-btn ${adminTab === "comments" ? "active" : ""}`} onClick={() => setAdminTab("comments")}>댓글관리</button>
            <button className={`admin-tab-btn ${adminTab === "stats" ? "active" : ""}`} onClick={() => setAdminTab("stats")}>통계</button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-xs text-zinc-400">데이터 동기화 진행 중...</div>
          ) : (
            <div className="admin-view-content">
              
              {/* 1. 대시보드 화면 */}
              {adminTab === "dashboard" && (
                <div className="animate-fade-in">
                  <div className="admin-stats-grid">
                    <div className="admin-stat-card">
                      <span className="admin-stat-label">오늘 신고 수</span>
                      <div className="admin-stat-value text-red-500">{stats.todayReports}</div>
                    </div>
                    <div className="admin-stat-card">
                      <span className="admin-stat-label">전체 회원</span>
                      <div className="admin-stat-value">{stats.totalMembers}</div>
                    </div>
                    <div className="admin-stat-card">
                      <span className="admin-stat-label">전체 게시글</span>
                      <div className="admin-stat-value">{stats.totalPosts}</div>
                    </div>
                    <div className="admin-stat-card">
                      <span className="admin-stat-label">오늘 가입자</span>
                      <div className="admin-stat-value text-green-600">{stats.todayRegistrations}</div>
                    </div>
                    <div className="admin-stat-card">
                      <span className="admin-stat-label">오늘 작성글</span>
                      <div className="admin-stat-value text-zinc-800">{stats.todayPosts}</div>
                    </div>
                    <div className="admin-stat-card">
                      <span className="admin-stat-label">오늘 댓글 수</span>
                      <div className="admin-stat-value text-zinc-600">{stats.todayComments}</div>
                    </div>
                  </div>

                  <div className="admin-glass-card">
                    <h3 className="text-xs font-bold text-zinc-900 mb-2">⚡ 신속한 신고 검토 필요</h3>
                    <p className="text-[10px] text-zinc-450 leading-relaxed mb-3">
                      신고 누적이 3회 이상인 항목은 안전한 커뮤니티 정화를 위해 우선적으로 모니터링해 주세요.
                    </p>
                    <button className="admin-btn primary w-full text-center" onClick={() => setAdminTab("reports")}>
                      신고 관리로 이동하기
                    </button>
                  </div>

                  <div className="admin-glass-card" style={{borderColor: "#fca5a5", background: "#fff5f5"}}>
                    <h3 className="text-xs font-bold text-red-700 mb-1">🔧 Firestore 초기화 (최초 1회)</h3>
                    <p className="text-[10px] text-zinc-500 leading-relaxed mb-3">
                      관리자 role 설정, 모든 테스트 게시글 삭제, 가짜 회원 삭제를 한번에 실행합니다.<br/>
                      <strong>앱 최초 오픈 시 1회만 실행하세요.</strong>
                    </p>
                    <button
                      className="admin-btn w-full text-center text-white"
                      style={{background: "#dc2626"}}
                      onClick={handleFirestoreSetup}
                    >
                      🚀 초기화 실행
                    </button>
                  </div>
                </div>
              )}

              {/* 2. 신고 관리 화면 */}
              {adminTab === "reports" && (
                <div className="animate-fade-in">
                  <div className="flex gap-2 mb-4">
                    <button className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all border ${reportSubTab === "waiting" ? "bg-zinc-950 text-white border-zinc-950" : "bg-white text-zinc-500 border-zinc-200"}`} onClick={() => setReportSubTab("waiting")}>신고 대기</button>
                    <button className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all border ${reportSubTab === "completed" ? "bg-zinc-950 text-white border-zinc-950" : "bg-white text-zinc-500 border-zinc-200"}`} onClick={() => setReportSubTab("completed")}>처리 완료</button>
                  </div>

                  {sortedReports.length === 0 ? (
                    <div className="py-20 text-center text-xs text-zinc-400 bg-white border rounded-2xl">접수된 신고 건이 없습니다.</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {sortedReports.map(g => {
                        const contentPreview = getReportedContentPreview(g.targetId, g.targetType, g.targetParentId);
                        return (
                          <div key={g.targetId} className="admin-glass-card">
                            <div className="flex justify-between items-center mb-3">
                              <span className="report-badge">
                                <i className="fa-solid fa-fire text-red-500"></i> 신고 {g.reports.length}회
                              </span>
                              <span className="text-[10px] text-zinc-400">{new Date(g.createdAt).toLocaleDateString()}</span>
                            </div>

                            <div className="text-xs flex flex-col gap-1.5 mb-3 text-zinc-800">
                              <div>
                                <strong className="text-[10px] text-zinc-400 mr-2">유형:</strong>
                                <span className="font-bold text-zinc-900">{g.targetType === "post" ? "게시글" : "댓글"}</span>
                              </div>
                              <div>
                                <strong className="text-[10px] text-zinc-400 mr-2">작성자:</strong>
                                <span className="font-semibold">{getUserNickname(g.targetUserUid)}</span>
                              </div>
                              <div>
                                <strong className="text-[10px] text-zinc-400 mr-2">신고사유:</strong>
                                <span className="font-bold text-red-600">{g.reason}</span>
                              </div>
                              {g.description && (
                                <div className="bg-zinc-50 p-2 rounded-xl text-[10px] text-zinc-650 border border-zinc-100">
                                  <strong>상세내용:</strong> {g.description}
                                </div>
                              )}
                              <div className="mt-1 bg-zinc-50 p-2.5 rounded-xl text-[11px] font-mono leading-relaxed border border-zinc-150 whitespace-pre-wrap">
                                <strong className="text-[9px] text-zinc-450 block mb-1">신고 대상 본문</strong>
                                {contentPreview}
                              </div>
                            </div>

                            {reportSubTab === "waiting" && (
                              <div className="flex gap-2 border-t border-zinc-100 pt-3 mt-1">
                                <button className="admin-btn secondary flex-1" onClick={() => {
                                  const p = comPosts.find(x => x.id === g.targetId) || posts.find(x => x.id === g.targetId);
                                  if (p) {
                                    setViewingPost(p);
                                  } else {
                                    alert("이미 삭제되었거나 볼 수 없는 게시글입니다.");
                                  }
                                }}>내용 보기</button>
                                <button className="admin-btn danger flex-1" onClick={() => handleDeleteContent(g.targetId, g.targetType, g.targetParentId)}>콘텐츠 삭제</button>
                                <button className="admin-btn secondary flex-1 text-zinc-500" onClick={() => handleDismissReports(g.targetId)}>신고 기각</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. 회원 관리 화면 */}
              {adminTab === "users" && (
                <div className="animate-fade-in flex flex-col gap-3">
                  <div className="text-[10px] text-zinc-400 font-bold mb-1">총 회원 수: {users.length}명</div>
                  {users.map(u => (
                    <div key={u.uid} className="admin-glass-card flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-xs text-zinc-950 font-bold truncate">{u.nickname || "이름없음"}</strong>
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-red-50 text-red-600 border border-red-100" : "bg-zinc-100 text-zinc-500 border border-zinc-200"}`}>{u.role === "admin" ? "관리자" : "일반"}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 block mt-0.5 truncate">{u.email || "(이메일 없음)"}</span>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button className="admin-btn secondary py-1.5" onClick={() => handleToggleMemberRole(u.uid, u.role)}>권한변경</button>
                        <button className="admin-btn danger py-1.5" onClick={() => handleDeleteMember(u.uid)}>탈퇴</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 4. 게시글 관리 화면 */}
              {adminTab === "posts" && (
                <div className="animate-fade-in flex flex-col gap-3">
                  <div className="text-[10px] text-zinc-400 font-bold mb-1">전체 글: {posts.length + comPosts.length}개</div>
                  
                  {/* 커뮤니티 글 목록 */}
                  <div>
                    <h3 className="text-xs font-bold text-zinc-950 mb-2">💬 커뮤니티 게시글</h3>
                    <div className="flex flex-col gap-2.5">
                      {comPosts.map(p => (
                        <div key={p.id} className="admin-glass-card flex justify-between items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded font-bold">{p.category}</span>
                            <h4 className="text-xs font-bold text-zinc-950 truncate mt-1">{p.title}</h4>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{p.body}</p>
                          </div>
                          <button className="admin-btn danger py-1.5 flex-shrink-0" onClick={() => handleDeleteContent(p.id, "post", "")}>삭제</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 레시피 피드 목록 */}
                  <div className="mt-4">
                    <h3 className="text-xs font-bold text-zinc-950 mb-2">🍳 레시피 피드 게시글</h3>
                    <div className="flex flex-col gap-2.5">
                      {posts.map(p => (
                        <div key={p.id} className="admin-glass-card flex justify-between items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold border border-amber-100">레시피</span>
                            <h4 className="text-xs font-bold text-zinc-950 truncate mt-1">{p.title}</h4>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{p.description}</p>
                          </div>
                          <button className="admin-btn danger py-1.5 flex-shrink-0" onClick={() => handleDeleteContent(p.id, "post", "")}>삭제</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. 댓글 관리 화면 */}
              {adminTab === "comments" && (
                <div className="animate-fade-in flex flex-col gap-3">
                  <h3 className="text-xs font-bold text-zinc-950 mb-2">💬 전체 댓글</h3>
                  {comPosts.flatMap(p => (p.comments || []).map(c => ({ ...c, postId: p.id }))).length === 0 ? (
                    <div className="py-20 text-center text-xs text-zinc-400 bg-white border rounded-2xl">등록된 댓글이 없습니다.</div>
                  ) : (
                    comPosts.flatMap(p => (p.comments || []).map(c => ({ ...c, postId: p.id }))).map(c => (
                      <div key={c.id} className="admin-glass-card flex justify-between items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-zinc-900">{c.author}</span>
                            <span className="text-[9px] text-zinc-400">{new Date(c.createdAt || "").toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-zinc-700 mt-1 leading-relaxed">{c.text}</p>
                        </div>
                        <button className="admin-btn danger py-1.5 flex-shrink-0" onClick={() => handleDeleteContent(c.id, "comment", c.postId)}>삭제</button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 6. 통계 화면 */}
              {adminTab === "stats" && (
                <div className="animate-fade-in flex flex-col gap-3">
                  <div className="admin-glass-card">
                    <h3 className="text-xs font-bold text-zinc-950 mb-3">🍳 콘텐츠 카테고리 구성</h3>
                    <div className="flex flex-col gap-2">
                      <div className="text-[11px] text-zinc-650 flex justify-between">
                        <span>레시피 피드</span>
                        <strong>{posts.length}건 ({Math.round((posts.length / (posts.length + comPosts.length || 1)) * 100)}%)</strong>
                      </div>
                      <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full" style={{ width: `${(posts.length / (posts.length + comPosts.length || 1)) * 100}%` }}></div>
                      </div>

                      <div className="text-[11px] text-zinc-650 flex justify-between mt-2">
                        <span>커뮤니티 자유글</span>
                        <strong>{comPosts.length}건 ({Math.round((comPosts.length / (posts.length + comPosts.length || 1)) * 100)}%)</strong>
                      </div>
                      <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-zinc-800 h-full" style={{ width: `${(comPosts.length / (posts.length + comPosts.length || 1)) * 100}%` }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="admin-glass-card">
                    <h3 className="text-xs font-bold text-zinc-950 mb-3">🚨 신고 접수 사유 통계</h3>
                    <div className="flex flex-col gap-3">
                      {["욕설", "음란물", "광고", "스팸", "개인정보", "기타"].map(reason => {
                        const count = reports.filter(r => r.reason === reason).length;
                        const pct = Math.round((count / (reports.length || 1)) * 100);
                        return (
                          <div key={reason}>
                            <div className="text-[10px] text-zinc-600 flex justify-between mb-1">
                              <span>{reason}</span>
                              <strong>{count}건 ({pct}%)</strong>
                            </div>
                            <div className="w-full bg-zinc-50 h-1.5 rounded-full overflow-hidden border border-zinc-100">
                              <div className="bg-red-500 h-full" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* 게시글 상세보기 모달 */}
          {viewingPost && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
              <div className="bg-white border border-zinc-200 w-full max-w-md rounded-2xl p-5 shadow-2xl animate-fade-in text-left flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-sm font-bold text-zinc-950">🔍 상세 글 검토</h3>
                  <button onClick={() => setViewingPost(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
                
                {viewingPost.image && viewingPost.image.length > 0 && (
                  <div className="rounded-lg overflow-hidden aspect-[4/5] bg-zinc-100 max-h-[260px]">
                    <img src={viewingPost.image[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                <div>
                  <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded font-bold">{viewingPost.category || "레시피"}</span>
                  <h4 className="text-sm font-bold text-zinc-950 mt-1.5">{viewingPost.title}</h4>
                  <p className="text-xs text-zinc-600 mt-2 whitespace-pre-wrap leading-relaxed">{viewingPost.body || viewingPost.description}</p>
                </div>

                <div className="flex gap-2 mt-2">
                  <button className="admin-btn danger flex-1" onClick={() => {
                    handleDeleteContent(viewingPost.id, "post", "");
                    setViewingPost(null);
                  }}>이 글 삭제</button>
                  <button className="admin-btn secondary flex-1" onClick={() => setViewingPost(null)}>닫기</button>
                </div>
              </div>
            </div>
          )}
        </section>
      );
    }

    function CustomConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
      if (!isOpen) return null;
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-2xl w-full max-w-[280px] overflow-hidden shadow-2xl border border-zinc-100 transform scale-100 transition-transform duration-300">
            <div className="p-6 text-center">
              <div className="mx-auto flex items-center justify-center h-10 w-10 rounded-full bg-zinc-50 border border-zinc-100 mb-3 text-zinc-950">
                <i className="fa-solid fa-circle-info text-sm"></i>
              </div>
              <h3 className="text-xs font-bold text-zinc-950 mb-1">{title || "알림"}</h3>
              <p className="text-[11px] text-zinc-500 whitespace-pre-line leading-relaxed px-1">{message}</p>
            </div>
            <div className="border-t border-zinc-100 grid grid-cols-2">
              <button 
                type="button" 
                onClick={onCancel}
                className="py-3 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-50 active:bg-zinc-100 border-r border-zinc-100 transition-colors focus:outline-none"
              >
                취소
              </button>
              <button 
                type="button" 
                onClick={onConfirm}
                className="py-3 text-[11px] font-bold text-red-500 hover:bg-zinc-50 active:bg-zinc-100 transition-colors focus:outline-none"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      );
    }

    // --- 3.1 설정 화면 및 커뮤니티 전용 글쓰기 화면 컴포넌트 선언 ---
    function SettingsView({ onBack, onLogout, onDeleteAccount }) {
      const [pushEnabled, setPushEnabled] = useState(() => {
        const val = localStorage.getItem("push_enabled");
        return val === null ? true : val === "true";
      });
      const [marketingEnabled, setMarketingEnabled] = useState(() => {
        const val = localStorage.getItem("marketing_enabled");
        return val === null ? false : val === "true";
      });

      function handlePushToggle(checked) {
        setPushEnabled(checked);
        localStorage.setItem("push_enabled", checked ? "true" : "false");
        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
          window.flutter_inappwebview.callHandler('togglePushNotification', { enabled: checked });
        }
        if (checked) {
          alert("새로운 댓글 알림이 활성화되었습니다.");
        } else {
          alert("새로운 댓글 알림이 비활성화되었습니다.");
        }
      }

      function handleMarketingToggle(checked) {
        setMarketingEnabled(checked);
        localStorage.setItem("marketing_enabled", checked ? "true" : "false");
        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
          window.flutter_inappwebview.callHandler('toggleMarketingNotification', { enabled: checked });
        }
        if (checked) {
          alert("마케팅 정보 수신 동의 처리가 완료되었습니다.");
        } else {
          alert("마케팅 정보 수신 동의가 철회되었습니다.");
        }
      }

      async function handleClearCache() {
        if (await window.showConfirm("앱의 캐시 및 저장 데이터를 모두 초기화하시겠습니까?\n이 작업은 복구할 수 없습니다.")) {
          localStorage.clear();
          const req = indexedDB.deleteDatabase(DB_NAME);
          req.onsuccess = () => {
            alert("데이터 초기화가 완료되었습니다. 앱을 새로고침합니다.");
            window.location.reload();
          };
          req.onerror = () => {
            alert("초기화 실패");
          };
        }
      }

      return (
        <section className="p-4 pb-20 text-left">
          <div className="mb-4 flex items-center justify-between">
            <button className="text-zinc-500 text-xs py-1.5 active:scale-95 transition-transform" onClick={onBack}>
              <i className="fa-solid fa-chevron-left mr-1"></i> 마이페이지
            </button>
            <h2 className="text-xs font-bold text-zinc-950">설정</h2>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm mb-4">
            <h3 className="text-xs font-bold text-zinc-400 mb-3 uppercase tracking-wider">알림 설정</h3>
            <div className="flex justify-between items-center py-2.5 border-b border-zinc-100">
              <span className="text-xs font-medium text-zinc-800">새로운 댓글 알림</span>
              <input type="checkbox" checked={pushEnabled} onChange={(e) => handlePushToggle(e.target.checked)} className="w-4 h-4 accent-black" />
            </div>
            <div className="flex justify-between items-center py-2.5">
              <span className="text-xs font-medium text-zinc-800">마케팅 정보 수신 동의</span>
              <input type="checkbox" checked={marketingEnabled} onChange={(e) => handleMarketingToggle(e.target.checked)} className="w-4 h-4 accent-black" />
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm mb-4">
            <h3 className="text-xs font-bold text-zinc-400 mb-3 uppercase tracking-wider">시스템 설정</h3>
            <button 
              className="w-full text-left py-2.5 text-xs font-medium text-zinc-800 flex justify-between items-center border-b border-zinc-100"
              onClick={handleClearCache}
            >
              <span>앱 데이터 및 캐시 비우기</span>
              <i className="fa-solid fa-trash text-zinc-400 text-[10px]"></i>
            </button>
            <div className="flex justify-between items-center py-2.5 text-xs text-zinc-800">
              <span>앱 버전</span>
              <span className="text-zinc-400 font-mono">v1.2.0 (Premium)</span>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm mb-4">
            <h3 className="text-xs font-bold text-zinc-400 mb-3 uppercase tracking-wider">법적 고지</h3>
            <button 
              className="w-full text-left py-2.5 text-xs font-medium text-zinc-800 flex justify-between items-center border-b border-zinc-100"
              onClick={() => window.open('/privacy', '_blank')}
            >
              <span>개인정보 처리방침</span>
              <i className="fa-solid fa-chevron-right text-zinc-400 text-[10px]"></i>
            </button>
            <button 
              className="w-full text-left py-2.5 text-xs font-medium text-zinc-800 flex justify-between items-center"
              onClick={() => window.open('/terms', '_blank')}
            >
              <span>서비스 이용약관</span>
              <i className="fa-solid fa-chevron-right text-zinc-400 text-[10px]"></i>
            </button>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-zinc-400 mb-3 uppercase tracking-wider">계정 관리</h3>
            <button 
              className="w-full text-left py-2.5 text-xs font-medium text-zinc-600 flex justify-between items-center border-b border-zinc-100 hover:text-zinc-950"
              onClick={onLogout}
            >
              <span>로그아웃</span>
              <i className="fa-solid fa-arrow-right-from-bracket text-zinc-400 text-[10px]"></i>
            </button>
            <button 
              className="w-full text-left py-2.5 text-xs font-medium text-red-500 flex justify-between items-center hover:text-red-700"
              onClick={onDeleteAccount}
            >
              <span>회원 탈퇴</span>
              <i className="fa-solid fa-user-xmark text-red-400 text-[10px]"></i>
            </button>
          </div>
        </section>
      );
    }

    function CommunityWriteView({ onBack, onAddPost, currentUserName, initialImages = [] }) {
      const [newTitle, setNewTitle] = useState("");
      const [newBody, setNewBody] = useState("");
      const [writeCat, setWriteCat] = useState("자유");
      const [images, setImages] = useState(initialImages); // 이미지 주소 배열 관리
      const [loading, setLoading] = useState(false);
      const comCategories = ["자유", "질문", "공동구매", "맛집추천"];

      const fileInputRef = useRef(null);

      // Cloudflare R2 업로드 (압축 및 백엔드 프록시 처리)
      async function handlePhoto(e) {
        console.log("[COMMUNITY UPLOAD STEP 1] handlePhoto started. Target files:", e.target.files);
        let files = [];
        try {
          files = Array.from(e.target.files).slice(0, 10);
        } catch (filesErr) {
          console.error("[COMMUNITY UPLOAD STEP 1.1] Error parsing files array:", filesErr);
          alert("파일 목록을 가져오는 중 오류가 발생했습니다.");
          return;
        }
        
        if (files.length === 0) {
          console.log("[COMMUNITY UPLOAD STEP 1.2] No files selected.");
          return;
        }
        
        setLoading(true);
        console.log("[COMMUNITY UPLOAD STEP 2] Parsing complete. Files count:", files.length);

        const uploadedUrls = [];
        const options = {
          maxSizeMB: 1, // 최대 용량 제한 1MB
          maxWidthOrHeight: 1200, // 최대 해상도 1200px
          useWebWorker: false, // Android WebView WebWorker crash 방지
          initialQuality: 0.8 // 품질 80%
        };

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          console.log(`[COMMUNITY UPLOAD STEP 3] Processing file [${i + 1}/${files.length}]: ${file.name}, Size: ${file.size} bytes`);
          
          let fileToUpload = file;
          try {
            console.log(`[COMMUNITY UPLOAD STEP 4] Compressing file: ${file.name}`);
            const compressedBlob = await imageCompression(file, options);
            fileToUpload = compressedBlob;
            console.log(`[COMMUNITY UPLOAD STEP 4.1] Compression successful. New size: ${compressedBlob.size} bytes`);
          } catch (compressErr) {
            console.error(`[COMMUNITY UPLOAD STEP 4.2] Compression failed for ${file.name}. Uploading original file. Error:`, compressErr);
            fileToUpload = file; // 압축 실패 시 원본 파일 그대로 업로드하여 앱 크래시 방지
          }

          try {
            console.log(`[COMMUNITY UPLOAD STEP 5] Creating FormData for ${file.name}`);
            const formData = new FormData();
            // new File() 생성자를 사용하지 않고, blob 객체 그대로 append하며 파일명을 세 번째 인자로 추가하여 Android 호환성 극대화
            formData.append("file", fileToUpload, file.name);

            console.log(`[COMMUNITY UPLOAD STEP 6] Sending POST request to /api/v1/upload for ${file.name}`);
            const response = await fetch("/api/v1/upload", {
              method: "POST",
              body: formData
            });

            console.log(`[COMMUNITY UPLOAD STEP 7] Received response for ${file.name}. Status: ${response.status}`);
            const res = await response.json();
            console.log(`[COMMUNITY UPLOAD STEP 8] Parsed JSON response for ${file.name}:`, res);
            
            if (res.success && res.url) {
              uploadedUrls.push(res.url);
              console.log(`[COMMUNITY UPLOAD STEP 9] Upload success:`, res.url);
            } else {
              throw new Error(res.message || "서버 응답 실패");
            }
          } catch (uploadErr) {
            console.error(`[COMMUNITY UPLOAD STEP 10] Upload API request failed for ${file.name}:`, uploadErr);
            alert(`사진 업로드 중 오류가 발생했습니다: ${uploadErr.message || uploadErr}`);
          }
        }

        console.log("[COMMUNITY UPLOAD STEP 11] All files processed. Uploaded URLs:", uploadedUrls);
        if (uploadedUrls.length > 0) {
          setImages(prev => [...prev, ...uploadedUrls]);
        }
        setLoading(false);
        console.log("[COMMUNITY UPLOAD STEP 12] handlePhoto finished.");
      }

      function handleSubmitPost(e) {
        e.preventDefault();
        if (!newTitle.trim() || !newBody.trim()) return;

        onAddPost({
          title: newTitle.trim(),
          body: newBody.trim(),
          category: writeCat,
          author: currentUserName,
          createdAt: "방금 전",
          likeCount: 0,
          liked: false,
          viewCount: 1,
          scrapped: false,
          comments: [],
          image: images
        });
      }

      return (
        <section className="p-4 pb-20 text-left">
          <div className="mb-4">
            <button className="text-zinc-500 text-xs py-1.5 active:scale-95 transition-transform" onClick={onBack}>
              <i className="fa-solid fa-chevron-left mr-1"></i> 커뮤니티 목록으로 가기
            </button>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-zinc-950 mb-4 flex items-center gap-1.5">
              <i className="fa-solid fa-pen text-zinc-500"></i> 커뮤니티 새 글 등록
            </h2>
            <form onSubmit={handleSubmitPost} className="flex flex-col gap-4">
              <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1.5">
                게시판 카테고리
                <select value={writeCat} onChange={(e) => setWriteCat(e.target.value)} className="border p-2 rounded text-xs select-none">
                  {comCategories.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1.5">
                제목 <span className="font-normal">({newTitle.length}/40자)</span>
                <input 
                  value={newTitle} 
                  onChange={(e) => setNewTitle(e.target.value)} 
                  placeholder="글 제목을 입력해 주세요" 
                  className="border p-2 rounded text-xs"
                  maxLength={40}
                  required 
                />
              </label>
              <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1.5">
                내용 <span className="font-normal">({newBody.length}/1000자)</span>
                <textarea 
                  value={newBody} 
                  onChange={(e) => setNewBody(e.target.value)} 
                  placeholder="자유롭게 이야기를 나눠보세요." 
                  className="border p-2 rounded text-xs h-36 resize-none"
                  maxLength={1000}
                  required 
                />
              </label>
              <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1.5">
                사진 첨부 (최대 10장)
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhoto} className="hidden" />
                <div className="flex gap-2 overflow-x-auto mt-2 py-1 items-center">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 flex-shrink-0">
                      <img className="w-full h-full object-cover rounded border border-zinc-200" src={img} alt="" />
                      <button 
                        type="button" 
                        onClick={() => setImages(images.filter((_, i) => i !== idx))}
                        className="absolute -top-1.5 -right-1.5 bg-black/80 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] border-none font-bold"
                        style={{ cursor: "pointer", padding: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {images.length < 10 && (
                    <button
                      type="button"
                      onClick={() => {
                        console.log("[UI] Community Photo add button clicked");
                        fileInputRef.current.click();
                      }}
                      className="w-16 h-16 flex flex-col items-center justify-center border border-dashed border-zinc-300 rounded text-zinc-400 bg-zinc-50 flex-shrink-0"
                      style={{ cursor: "pointer", fontSize: "20px" }}
                    >
                      +
                      <span className="text-[9px] mt-0.5 font-normal">사진 추가</span>
                    </button>
                  )}
                </div>
              </label>
              <button type="submit" className="primary full py-3 rounded-lg text-xs font-bold" disabled={loading}>
                {loading ? "사진 최적화 및 등록 중..." : "등록하기"}
              </button>
            </form>
          </div>
        </section>
      );
    }

    function NotificationCenterView({ onBack, onPostClick, onAuthorClick }) {
      const [notifications, setNotifications] = useState([]);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
          setLoading(false);
          return;
        }

        // 실시간 내 알림 50개 리스닝
        const unsubscribe = db.collection("notifications")
          .where("targetUid", "==", user.uid)
          .orderBy("timestamp", "desc")
          .limit(50)
          .onSnapshot((snapshot) => {
            const list = [];
            snapshot.forEach(doc => {
              list.push({ id: doc.id, ...doc.data() });
            });
            setNotifications(list);
            setLoading(false);
          }, (err) => {
            console.error("[Notifications Listener] Sync error:", err);
            setLoading(false);
          });

        return () => unsubscribe();
      }, []);

      // 알림 클릭 시 읽음 처리 및 딥링크 활성화
      async function handleNotificationClick(n) {
        // 1. Firestore 읽음(read: true) 처리 업데이트
        try {
          await db.collection("notifications").doc(n.id).update({ read: true });
        } catch (err) {
          console.warn("[Notifications] Mark read status failed:", err.message);
        }

        // 2. 알림 메타데이터 분석 후 해당 화면으로 딥링크 이동
        if (n.type === "like" || n.type === "comment") {
          if (n.postId) {
            onPostClick(n.postId); // 게시물 상세 모달 띄우기
          }
        } else if (n.type === "follow") {
          if (n.senderName) {
            onAuthorClick(n.senderName); // 크리에이터 상세 페이지 이동
          }
        }
      }

      function formatTime(isoString) {
        if (!isoString) return "";
        const diff = Date.now() - new Date(isoString).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "방금 전";
        if (mins < 60) return `${mins}분 전`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}시간 전`;
        const days = Math.floor(hrs / 24);
        return `${days}일 전`;
      }

      return (
        <section className="p-4 pb-20 text-left">
          <div className="mb-4">
            <button className="text-zinc-500 text-xs py-1.5 active:scale-95 transition-transform" onClick={onBack}>
              <i className="fa-solid fa-chevron-left mr-1"></i> 홈 피드로 가기
            </button>
          </div>
          
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-zinc-950 mb-4 flex items-center gap-1.5 border-b pb-3">
              <i className="fa-solid fa-bell text-zinc-500"></i> 알림 센터 ({notifications.filter(n => !n.read).length})
            </h2>
            
            {loading ? (
              <div className="text-center py-10 text-xs text-zinc-400">
                <i className="fa-solid fa-spinner animate-spin mr-1.5"></i> 알림을 불러오는 중...
              </div>
            ) : notifications.length > 0 ? (
              <div className="flex flex-col gap-3">
                {notifications.map(n => (
                  <div 
                    key={n.id} 
                    onClick={() => handleNotificationClick(n)}
                    className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors cursor-pointer border ${n.read ? "bg-white border-transparent hover:bg-zinc-50" : "bg-zinc-50 border-zinc-100 font-medium active:bg-zinc-100"}`}
                  >
                    {/* 미독(Unread) 인디케이터 점 */}
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 mt-1.5 flex-shrink-0"></span>
                    )}

                    {/* 유형별 무채색 라운드 아이콘 */}
                    <div className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center flex-shrink-0 text-xs border border-zinc-200">
                      {n.type === "like" && <i className="fa-solid fa-heart text-zinc-800"></i>}
                      {n.type === "comment" && <i className="fa-solid fa-comment text-zinc-800"></i>}
                      {n.type === "follow" && <i className="fa-solid fa-user-plus text-zinc-800"></i>}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[11px] font-bold text-zinc-900 truncate">{n.title}</span>
                        <span className="text-[9px] text-zinc-400 flex-shrink-0">{formatTime(n.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-relaxed truncate">{n.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-zinc-400 text-xs flex flex-col items-center gap-2">
                <i className="fa-regular fa-bell-slash text-zinc-200 text-3xl"></i>
                새로운 소식이 없습니다.
              </div>
            )}
          </div>
        </section>
      );
    }


    // --- 4. 메인 App 컴포넌트 선언 ---

    function App() {
      // 닉네임 중복 체크 후 플레이터_랜덤6자리 생성하는 함수
      async function generateUniqueNickname() {
        let attempts = 0;
        while (attempts < 100) {
          const randNum = Math.floor(100000 + Math.random() * 900000); // 6자리 랜덤 숫자
          const candidate = `플레이터_${randNum}`;
          
          // Firestore에서 해당 닉네물 조회
          const snapshot = await db.collection("users").where("nickname", "==", candidate).get();
          if (snapshot.empty) {
            return candidate;
          }
          attempts++;
        }
        return `플레이터_${Math.floor(100000 + Math.random() * 900000)}`;
      }

      // 1. 상태 선언
      const [posts, setPosts] = useState(defaultPosts);
      const [lastVisibleDoc, setLastVisibleDoc] = useState(null);
      const [hasMore, setHasMore] = useState(true);
      const [isFetchingMore, setIsFetchingMore] = useState(false);
      
      const [reportModalOpen, setReportModalOpen] = useState(false);
      const [reportTarget, setReportTarget] = useState({ postId: "", commentId: "" });

      const getInitialTab = () => {
        const path = window.location.pathname;
        if (path.includes("privacy")) return "privacy";
        if (path.includes("terms")) return "terms";
        if (path.includes("delete-account")) return "delete-account";
        if (path.includes("landing")) return "landing";
        return "home";
      };
      const [activeTab, setActiveTab] = useState(getInitialTab);

      useEffect(() => {
        const handleLocationChange = () => setActiveTab(getInitialTab());
        window.addEventListener("popstate", handleLocationChange);
        return () => window.removeEventListener("popstate", handleLocationChange);
      }, []);

      const [selectedCategory, setSelectedCategory] = useState("전체");
      const [searchQuery, setSearchQuery] = useState("");
      const [searchPostsResult, setSearchPostsResult] = useState([]);
      const [searchUsersResult, setSearchUsersResult] = useState([]);
      const [searchMode, setSearchMode] = useState("posts"); // "posts" | "users"
      const [isSearching, setIsSearching] = useState(false);
      const [writeOpen, setWriteOpen] = useState(false);
      const [loginOpen, setLoginOpen] = useState(false);
      const [isLoggedIn, setIsLoggedIn] = useState(false);
      const [writeInitialImages, setWriteInitialImages] = useState([]);
      const [communityInitialImages, setCommunityInitialImages] = useState([]);

      const [confirmState, setConfirmState] = useState({
        isOpen: false,
        title: "",
        message: "",
        resolve: null
      });

      // 운영 전환을 위한 1회성 로컬 캐시(IndexedDB 및 localStorage) 강제 클렌징
      useEffect(() => {
        const hasCleaned = localStorage.getItem("prod_cleansing_done_v2");
        if (!hasCleaned) {
          console.log("[Cleansing] Invalidation of IndexedDB and localStorage caching...");
          try {
            const DB_NAME = "foodhouse_db";
            const req = window.indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => {
              console.log("[Cleansing] Local IndexedDB successfully deleted.");
            };
          } catch (e) {
            console.error("[Cleansing] Error deleting IndexedDB:", e);
          }
          localStorage.removeItem("foodhouse_posts");
          localStorage.removeItem("foodhouse_community_posts");
          localStorage.setItem("prod_cleansing_done_v2", "true");
          
          // 강제 클렌징 후 리부트하여 동기화
          window.location.reload();
        }
      }, []);

      // 실시간 키워드 검색 API 연동 훅
      useEffect(() => {
        const query = searchQuery.trim();
        if (!query) {
          setSearchPostsResult([]);
          setSearchUsersResult([]);
          return;
        }

        setIsSearching(true);
        // 1. 게시글 검색
        fetch(`/api/search/posts?q=${encodeURIComponent(query)}`)
          .then(r => r.json())
          .then(data => {
            if (data.success) setSearchPostsResult(data.posts || []);
          })
          .catch(e => console.error("Search posts error:", e));

        // 2. 사용자 검색
        fetch(`/api/search/users?q=${encodeURIComponent(query)}`)
          .then(r => r.json())
          .then(data => {
            if (data.success) setSearchUsersResult(data.users || []);
          })
          .catch(e => console.error("Search users error:", e))
          .finally(() => setIsSearching(false));
      }, [searchQuery]);

      useEffect(() => {
        window.openWriteSheetWithPhotos = (urls) => {
          console.log("[Native Callback] openWriteSheetWithPhotos received urls:", urls);
          isSelectingPhotos.current = false;
          let parsed = urls;
          if (typeof urls === "string") {
            try {
              parsed = JSON.parse(urls);
            } catch (e) {
              parsed = [urls];
            }
          }
          const imagesArr = Array.isArray(parsed) ? parsed : [];
          
          setTimeout(() => {
            setWriteInitialImages(imagesArr);
            setWriteOpen(true);
          }, 100);
        };
        window.openCommunityWriteWithPhotos = (urls) => {
          console.log("[Native Callback] openCommunityWriteWithPhotos received urls:", urls);
          isSelectingPhotos.current = false;
          let parsed = urls;
          if (typeof urls === "string") {
            try {
              parsed = JSON.parse(urls);
            } catch (e) {
              parsed = [urls];
            }
          }
          const imagesArr = Array.isArray(parsed) ? parsed : [];

          setTimeout(() => {
            setCommunityInitialImages(imagesArr);
            setActiveTab("community_write");
          }, 100);
        };
        window.showConfirm = (message, title = "확인") => {
          return new Promise((resolve) => {
            setConfirmState({
              isOpen: true,
              title,
              message,
              resolve
            });
          });
        };
      }, []);

      const handleConfirmClose = (confirmed) => {
        if (confirmState.resolve) {
          confirmState.resolve(confirmed);
        }
        setConfirmState({ isOpen: false, title: "", message: "", resolve: null });
      };

      const [activePostId, setActivePostId] = useState(null); // ID 기반 조회로 변경
      const [activeUser, setActiveUser] = useState(null);
      const [activeComPostId, setActiveComPostId] = useState(null); // 커뮤니티 글 ID 기반 상세 뷰용
      const [deviceId, setDeviceId] = useState("");
      const [reportModalData, setReportModalData] = useState({ isOpen: false, targetType: "post", targetId: "", author: "", text: "", targetParentId: "" });

      const [profile, setProfile] = useState({
        name: "나의 플레이팅",
        bio: "내가 올린 레시피와 구매 링크를 관리합니다.",
        avatar: "나",
        avatarImg: "",
        role: "user"
      });

      const [followingList, setFollowingList] = useState([]);
      const [creatorsData, setCreatorsData] = useState(initialCreatorsData);
      const [communityPosts, setCommunityPosts] = useState(initialCommunityPosts);

      const kakaoSyncInProgressRef = useRef(new URLSearchParams(window.location.search).has("token"));

      const [dbLoaded, setDbLoaded] = useState(false); // IndexedDB 로드 완료 플래그

      function loadBackendPosts() {
        fetch("/api/v1/posts")
          .then(r => r.json())
          .then(data => {
            if (data.success && data.posts) {
              const mapped = data.posts.map(p => ({
                ...p,
                liked: p.likedBy?.includes(profile.name) || false,
                scrapped: p.scrappedBy?.includes(profile.name) || false
              }));
              setPosts(mapped);
            }
          })
          .catch(e => console.error("Error loading posts:", e));
      }

      function loadBackendCommunityPosts() {
        fetch("/api/v1/community")
          .then(r => r.json())
          .then(data => {
            if (data.success && data.communityPosts) {
              const mapped = data.communityPosts.map(p => ({
                ...p,
                liked: p.likedBy?.includes(profile.name) || false,
                scrapped: p.scrappedBy?.includes(profile.name) || false
              }));
              setCommunityPosts(mapped);
            }
          })
          .catch(e => console.error("Error loading community posts:", e));
      }



      // 뒤로가기 브라우저 역사 연동 (HTML5 History API)
      const isInitialMount = useRef(true);
      const isPoppingState = useRef(false);
      const isSelectingPhotos = useRef(false);

      useEffect(() => {
        window.openReportModal = (targetType, targetId, author, text, targetParentId = "") => {
          setReportModalData({
            isOpen: true,
            targetType,
            targetId,
            author,
            text,
            targetParentId
          });
        };
        window.openAdminCenter = () => {
          setActiveTab("admin_reports");
        };
        return () => {
          delete window.openReportModal;
          delete window.openAdminCenter;
        };
      }, []);

      useEffect(() => {
        if (dbLoaded) {
          if (isInitialMount.current) {
            isInitialMount.current = false;
            // 최초 상태 저장
            window.history.replaceState({
              activeTab,
              activePostId,
              activeComPostId,
              activeUser,
              writeOpen
            }, "");
            return;
          }

          if (isPoppingState.current) {
            // popstate 이벤트로 인한 상태 변화인 경우 pushState를 생략
            isPoppingState.current = false;
            return;
          }

          // 상태가 변경되었을 때 pushState 실행
          window.history.pushState({
            activeTab,
            activePostId,
            activeComPostId,
            activeUser,
            writeOpen
          }, "");
        }
      }, [activeTab, activePostId, activeComPostId, activeUser, writeOpen, dbLoaded]);

      useEffect(() => {
        const handlePopState = (event) => {
          if (isSelectingPhotos.current) {
            console.log("[Navigation] popstate ignored because app is currently returning from native gallery.");
            isSelectingPhotos.current = false;
            return;
          }
          if (event.state) {
            isPoppingState.current = true;
            const state = event.state;
            if (state.activeTab !== undefined) setActiveTab(state.activeTab);
            if (state.activePostId !== undefined) setActivePostId(state.activePostId);
            if (state.activeComPostId !== undefined) setActiveComPostId(state.activeComPostId);
            if (state.activeUser !== undefined) setActiveUser(state.activeUser);
            if (state.writeOpen !== undefined) setWriteOpen(state.writeOpen);
          }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
      }, []);

      // Firebase Auth 상태 리스너 등록 (단 한 번 등록되어 생명주기 관리)
      useEffect(() => {
        console.log("[Firebase Auth] Registering onAuthStateChanged listener...");
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
          console.log("[Firebase Auth] onAuthStateChanged active. User object:", user);
          if (resolveAuthReady) {
            resolveAuthReady();
          }
          if (user) {
            console.log("[Firebase Auth] Auto-login successful. User email:", user.email);
            
            // 1. 로그인 완료 판정을 즉시 수행하여 글쓰기 권한이 딜레이 없이 활성화되도록 보장
            setIsLoggedIn(true);
            setDBData("foodhouse_logged_in", "true").catch(e => console.error(e));
            
            // 2. 기본 임시 프로필 즉시 반영 (개인정보가 노출될 수 있으므로, 이메일 대신 고정 닉네임 사용)
            let role = "user";
            let bio = "";
            let avatarImg = user.photoURL || "";

            const initialProfile = {
              name: "플레이터",
              bio: "",
              avatar: "플",
              avatarImg,
              role
            };
            setProfile(initialProfile);
            setDBData("foodhouse_profile", initialProfile).catch(e => console.error(e));

            // 3. 비동기 Firestore 정보 및 백엔드 세션 동기화는 백그라운드 처리하여 UI 블로킹 방지
            (async () => {
              try {
                const userDocRef = db.collection("users").doc(user.uid);
                const doc = await userDocRef.get();
                let userData;

                if (doc.exists) {
                  // 기존 회원의 데이터는 절대 초기화하거나 덮어쓰지 않습니다.
                  userData = doc.data();
                } else {
                  // 신규 회원 최초 가입 시에만 기본 프로필을 생성합니다.
                  console.log("[Firebase Auth] User doc not found. Creating default profile...");
                  const uniqueNickname = await generateUniqueNickname();
                  const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                  let kakaoId = null;
                  if (user.email && user.email.startsWith("kakao_")) {
                    const match = user.email.match(/^kakao_(\d+)@/);
                    if (match) kakaoId = parseInt(match[1], 10);
                  }

                  userData = {
                    nickname: uniqueNickname,
                    role: "user",
                    avatarImg: user.photoURL || "",
                    profileImage: user.photoURL || "",
                    bio: "",
                    intro: "",
                    location: "",
                    website: "",
                    followers: 0,
                    following: 0,
                    posts: 0,
                    likes: 0,
                    kakaoId: kakaoId,
                    createdAt: serverTimestamp,
                    updatedAt: serverTimestamp
                  };
                  // 최초 생성 시 set(..., { merge: false }) 즉 기본 set() 동작을 수행
                  await userDocRef.set(userData);
                  console.log("[Firebase Auth] Created initial user doc successfully:", uniqueNickname);
                }

                // 기존/신규 유저 데이터를 최종 React state에 반영하여 데이터 불일치 방지
                const updatedNickname = userData.nickname || userData.name || userData.username || "플레이터";
                const updatedProfile = {
                  name: updatedNickname,
                  bio: userData.bio || "",
                  avatar: updatedNickname.slice(0, 1),
                  avatarImg: userData.avatarImg || "",
                  role: userData.role || "user"
                };
                setProfile(updatedProfile);
                setDBData("foodhouse_profile", updatedProfile).catch(e => console.error(e));

                // --- FCM 디바이스 토큰 획득 및 Firestore users 컬렉션 동기화 ---
                if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                  try {
                    const fcmToken = await window.flutter_inappwebview.callHandler("getFCMToken");
                    if (fcmToken) {
                      console.log("[FCM] Native Device Token sync success:", fcmToken);
                      await db.collection("users").doc(user.uid).update({ fcmToken });
                    }
                  } catch (fcmErr) {
                    console.log("[FCM] Native Device Token read failed or skipped:", fcmErr.message);
                  }
                }
                
                if (window.location.pathname === "/admin") {
                  if (userData.role === "admin") {
                    setActiveTab("admin_reports");
                  } else {
                    alert("관리자 권한이 없습니다.");
                    setActiveTab("home");
                    window.history.replaceState({}, document.title, "/");
                  }
                }
              } catch (err) {
                console.error("[Firebase Auth] Firestore user doc read/create error:", err);
              }

              try {
                const token = await user.getIdToken();
                console.log("[Firebase Auth] Synchronizing profile with Express session via ID token...");
                const r = await fetch(`/api/profile?token=${encodeURIComponent(token)}`);
                const res = await r.json();
                console.log("[Express Session Sync] Sync response:", res);
              } catch (syncErr) {
                console.error("[Express Session Sync] Sync error:", syncErr);
              } finally {
                if (resolveSessionSyncReady) resolveSessionSyncReady();
              }
            })();

          } else {
            if (kakaoSyncInProgressRef.current) {
              console.log("[Firebase Auth] Ignoring temporary signed-out state during Kakao callback sync.");
              return;
            }
            console.log("[Firebase Auth] No active session found or logged out.");
            setIsLoggedIn(false);
            setDBData("foodhouse_logged_in", "false").catch(e => console.error(e));
            const guestProfile = {
              name: "나의 플레이팅",
              bio: "",
              avatar: "나",
              avatarImg: "",
              role: "user"
            };
            setProfile(guestProfile);
            setDBData("foodhouse_profile", guestProfile).catch(e => console.error(e));
            
            // Clear express session
            fetch("/api/profile/logout", { method: "POST" }).catch(e => console.error(e));

            if (window.location.pathname === "/admin") {
              alert("로그인이 필요합니다.");
              setActiveTab("home");
              window.history.replaceState({}, document.title, "/");
            }
          }
        });

        return () => unsubscribe();
      }, []);

      // 2. 마운트 시 디바이스 정보 조회, IndexedDB 및 네이티브 복원 (Hydration)
      useEffect(() => {
        // 2.1. 네이티브 웹뷰 플랫폼 연동 및 디바이스 ID 획득
        const handleReady = async () => {
          if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
            window.flutter_inappwebview.callHandler('webAppReady').catch(e => console.error(e));
            window.flutter_inappwebview.callHandler('getDeviceId')
              .then(id => { if (id) setDeviceId(id); })
              .catch(e => console.error(e));

            // 네이티브에서 크레덴셜 자동 복구 시도 (브릿지가 늦게 준비되었을 때 대응)
            try {
              await authReadyPromise;
              const user = auth.currentUser;
              if (!user) {
                const nativeToken = await window.flutter_inappwebview.callHandler('readToken');
                if (nativeToken) {
                  console.log("[handleReady Recovery] Recovering session from native token:", nativeToken);
                  const credential = JSON.parse(nativeToken);
                  if (credential && credential.type === "local") {
                    await auth.signInWithEmailAndPassword(credential.username + "@myplating.kr", credential.password);
                  } else if (credential && credential.type === "kakao") {
                    await auth.signInWithEmailAndPassword(`kakao_${credential.kakaoId}@myplating.kr`, `kakao_${credential.kakaoId}_plating`);
                  }
                }
              }
            } catch (e) {
              console.error("[handleReady Recovery] Error:", e);
            }
          }
        };

        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
          handleReady();
        } else {
          window.addEventListener("flutterInAppWebViewPlatformReady", handleReady);
        }

        // 2.2. 세션 복원 및 토큰 동기화
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get("token");

        async function initSession() {
          // IndexedDB 로컬 기본 설정 로딩 (로컬 캐시 꼬임 방지를 위해 posts 목록 캐싱은 제거)
          const loadPromises = [
            getDBData("foodhouse_profile").then(saved => { if (saved) setProfile(saved); }),
            getDBData("foodhouse_following").then(saved => { if (saved) setFollowingList(saved); }),
            getDBData("foodhouse_creators_data").then(saved => { if (saved) setCreatorsData(saved); }),
            getDBData("foodhouse_logged_in").then(saved => { if (saved === "true") setIsLoggedIn(true); })
          ];

          try {
            await Promise.all(loadPromises);
          } catch (e) {
            console.error("IndexedDB load error:", e);
          }
          setDbLoaded(true);

          // URL에 카카오 토큰 파라미터가 들어온 경우 (카카오 로그인 성공 후 리다이렉트 콜백)
          if (urlToken) {
            kakaoSyncInProgressRef.current = true;
            console.log("[Kakao Callback] Detected URL token. Initiating backend sync...");
            
            try {
              await authReadyPromise;
              // 1. 카카오 유저 정보 조회
              const response = await fetch(`/api/profile?token=${encodeURIComponent(urlToken)}`);
              const res = await response.json();
              if (res.isLoggedIn && res.user) {
                console.log("[Kakao Callback] Successfully fetched Kakao user info. Linking to Firebase Auth...");
                // 2. Firebase Auth 연동 및 로그인 처리
                const email = `kakao_${res.user.kakao_id}@myplating.kr`;
                const password = `kakao_${res.user.kakao_id}_plating`;
                
                let user;
                try {
                  const userCredential = await auth.signInWithEmailAndPassword(email, password);
                  user = userCredential.user;
                  console.log("[Firebase Auth] Signed in linked Kakao user:", email);
                } catch (err) {
                  if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
                    console.log("[Firebase Auth] Linked Kakao user not found. Creating user account...");
                    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                    user = userCredential.user;
                    console.log("[Firebase Auth] Created linked Kakao user account successfully");
                  } else {
                    throw err;
                  }
                }

                // 로그인 판정 활성화 및 모달 닫기
                setIsLoggedIn(true);
                setLoginOpen(false);
                setDBData("foodhouse_logged_in", "true").catch(e => console.error(e));

                // 3. 네이티브 영구 저장소에 자동 로그인 크레덴셜 백업
                const credential = { type: "kakao", kakaoId: res.user.kakao_id };
                if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                  await window.flutter_inappwebview.callHandler('saveToken', { token: JSON.stringify(credential) });
                }
              }
            } catch (err) {
              console.error("[Kakao Callback] Linking process failed:", err);
            } finally {
              // 모든 로그인 동기화 처리가 완료된 뒤에야 주소창 토큰 파라미터를 제거함
              window.history.replaceState({}, document.title, window.location.pathname);
              kakaoSyncInProgressRef.current = false;
              if (resolveSessionSyncReady) resolveSessionSyncReady();
            }
          } else if (!kakaoSyncInProgressRef.current) {
            // URL Token이 없고 카카오 연동 중이 아닐 때만, SharedPreferences 백업 크레덴셜 복구 시도
            if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
              try {
                await authReadyPromise;
                if (auth.currentUser) {
                  console.log("[App Recovery] Firebase session already restored. Skipping native token re-login.");
                } else {
                  console.log("[App Recovery] Reading native recovery credential...");
                  const nativeToken = await window.flutter_inappwebview.callHandler('readToken');
                  if (nativeToken) {
                    console.log("[App Recovery] Native token read success:", nativeToken);
                    try {
                      const credential = JSON.parse(nativeToken);
                      if (credential && credential.type === "local") {
                        console.log("[App Recovery] Performing automatic local login for:", credential.username);
                        await auth.signInWithEmailAndPassword(credential.username + "@myplating.kr", credential.password);
                        setIsLoggedIn(true);
                        setDBData("foodhouse_logged_in", "true").catch(e => console.error(e));
                      } else if (credential && credential.type === "kakao") {
                        console.log("[App Recovery] Performing automatic Kakao login for ID:", credential.kakaoId);
                        await auth.signInWithEmailAndPassword(`kakao_${credential.kakaoId}@myplating.kr`, `kakao_${credential.kakaoId}_plating`);
                        setIsLoggedIn(true);
                        setDBData("foodhouse_logged_in", "true").catch(e => console.error(e));
                      }
                    } catch (jsonErr) {
                      console.warn("[App Recovery] Token is not JSON format. Clearing invalid native token.", jsonErr);
                      await window.flutter_inappwebview.callHandler('saveToken', { token: "" });
                    }
                  }
                }
              } catch (e) {
                console.error("[App Recovery] Error reading native token:", e);
              }
            }
            if (resolveSessionSyncReady) resolveSessionSyncReady();
          } else {
            if (resolveSessionSyncReady) resolveSessionSyncReady();
          }
        }

        initSession();

        return () => {
          window.removeEventListener("flutterInAppWebViewPlatformReady", handleReady);
        };
      }, []);


      // 3. 상태 변경 시 IndexedDB 비동기 백업
      useEffect(() => {
        if (dbLoaded) setDBData("foodhouse_posts", posts).catch(e => console.error(e));
      }, [posts, dbLoaded]);

      useEffect(() => {
        if (dbLoaded) setDBData("foodhouse_profile", profile).catch(e => console.error(e));
      }, [profile, dbLoaded]);

      useEffect(() => {
        if (dbLoaded) setDBData("foodhouse_following", followingList).catch(e => console.error(e));
      }, [followingList, dbLoaded]);

      useEffect(() => {
        if (dbLoaded) setDBData("foodhouse_creators_data", creatorsData).catch(e => console.error(e));
      }, [creatorsData, dbLoaded]);

      useEffect(() => {
        if (dbLoaded) setDBData("foodhouse_com_posts", communityPosts).catch(e => console.error(e));
      }, [communityPosts, dbLoaded]);

      // --- 피드 페이지네이션 (무한 스크롤) 추가 데이터 패치 헬퍼 ---
      const fetchMorePosts = async () => {
        if (isFetchingMore || !hasMore || !lastVisibleDoc) return;
        setIsFetchingMore(true);
        try {
          const snapshot = await db.collection("posts")
            .orderBy("timestamp", "desc")
            .startAfter(lastVisibleDoc)
            .limit(20)
            .get();

          if (snapshot.empty) {
            setHasMore(false);
          } else {
            const nextList = [];
            snapshot.forEach(doc => {
              const data = doc.data();
              const currentUser = auth.currentUser;
              if (data.hidden === true) return; // 신고 5회 이상 차단(숨김) 글 제외
              nextList.push({
                id: doc.id,
                ...data,
                liked: (currentUser && (data.likedBy?.includes(currentUser.uid) || data.likedBy?.includes(profile.name))) || false,
                scrapped: (currentUser && (data.scrappedBy?.includes(currentUser.uid) || data.scrappedBy?.includes(profile.name))) || false
              });
            });

            setPosts(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const uniqueNext = nextList.filter(n => !existingIds.has(n.id));
              return [...prev, ...uniqueNext];
            });
            setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
          }
        } catch (err) {
          console.error("[Pagination] Error fetching more posts:", err);
        } finally {
          setIsFetchingMore(false);
        }
      };

      // 스크롤 이벤트 바인딩 (피드 하단 감지)
      useEffect(() => {
        const handleScroll = () => {
          if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120) {
            fetchMorePosts();
          }
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
      }, [lastVisibleDoc, hasMore, isFetchingMore]);

      // --- 4.2. Firestore 실시간 동기화 리스너 (최신 20개 limit(20) 및 Seeding) ---
      useEffect(() => {
        if (!dbLoaded) return;

        console.log("[Firestore Sync] Initializing Firestore onSnapshot listeners...");

        // 최신 20개 글만 실시간 동기화 (onSnapshot 리스너 최적화)
        const unsubscribePosts = db.collection("posts")
          .orderBy("timestamp", "desc")
          .limit(20)
          .onSnapshot((snapshot) => {
            const list = [];
            snapshot.forEach(doc => {
              const data = doc.data();
              const currentUser = auth.currentUser;
              if (data.hidden === true) return; // 숨김 글 필터링
              list.push({
                id: doc.id,
                ...data,
                liked: (currentUser && (data.likedBy?.includes(currentUser.uid) || data.likedBy?.includes(profile.name))) || false,
                scrapped: (currentUser && (data.scrappedBy?.includes(currentUser.uid) || data.scrappedBy?.includes(profile.name))) || false
              });
            });
            console.log("[Firestore Sync] posts updated:", list.length);
            if (list.length === 0) {
              setPosts(defaultPosts);
            } else {
              setPosts(list);
            }

            if (snapshot.docs.length > 0 && !lastVisibleDoc) {
              setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
            }
          }, (err) => {
            console.error("[Firestore Sync] posts onSnapshot error:", err);
          });

        const unsubscribeCommunity = db.collection("community_posts")
          .orderBy("timestamp", "desc")
          .onSnapshot((snapshot) => {
            const list = [];
            snapshot.forEach(doc => {
              const data = doc.data();
              const currentUser = auth.currentUser;
              list.push({
                id: doc.id,
                ...data,
                liked: (currentUser && (data.likedBy?.includes(currentUser.uid) || data.likedBy?.includes(profile.name))) || false,
                scrapped: (currentUser && (data.scrappedBy?.includes(currentUser.uid) || data.scrappedBy?.includes(profile.name))) || false
              });
            });
            console.log("[Firestore Sync] communityPosts updated:", list.length);
            if (list.length === 0) {
              setCommunityPosts(initialCommunityPosts);
            } else {
              setCommunityPosts(list);
            }
          }, (err) => {
            console.error("[Firestore Sync] community onSnapshot error:", err);
          });

        // 시드 코드는 별도 useEffect로 이동됨 (인증 완료 후에만 실행 보장)

        return () => {
          unsubscribePosts();
          unsubscribeCommunity();
        };
      }, [dbLoaded]);


      // 4. 이벤트 핸들러
      async function handleWriteClick() {
        await authReadyPromise;
        await sessionSyncReadyPromise;
        const user = auth.currentUser;
        if (!user) {
          setLoginOpen(true);
        } else if (window.flutter_inappwebview) {
          isSelectingPhotos.current = true;
          window.flutter_inappwebview.callHandler('openCustomGallery', { type: 'recipe' });
        } else {
          setWriteOpen(true);
        }
      }

      function formatAuthError(err) {
        if (!err) return "인증 처리에 실패했습니다.";
        const code = err.code || "";
        const msg = err.message || "";
        if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
          return "아이디 또는 비밀번호가 올바르지 않습니다.";
        }
        if (code === "auth/email-already-in-use") {
          return "이미 등록된 아이디입니다.";
        }
        if (code === "auth/weak-password") {
          return "비밀번호는 6자 이상이어야 합니다.";
        }
        if (code === "auth/invalid-email") {
          return "아이디 형식이 올바르지 않습니다.";
        }
        if (code === "auth/too-many-requests") {
          return "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
        }
        return msg;
      }

      const showToast = (msg, type = "info") => {
        console.log(`[Toast ${type}]`, msg);
      };

      async function handleLogin(type, loginId, password) {
        if (type === "kakao") {
          window.location.href = "/api/v1/auth/authorize";
        } else {
          // 일반 로그인 (이메일/비밀번호)
          loginId = (loginId || "").trim().toLowerCase();
          password = (password || "").trim();
          if (!loginId || !password) throw new Error("아이디와 비밀번호를 모두 입력해 주세요.");

          const safeId = loginId.replace(/[^a-z0-9_-]/g, "");
          if (!safeId) throw new Error("아이디는 영문과 숫자만 가능합니다.");
          const email = `${safeId}@plating.app`;

          // 📌 [DEBUG LOG] 로그인 직전 요구사항 2, 3번 출력
          console.log("==================== [DEBUG: LOGIN ATTEMPT] ====================");
          console.log("[DEBUG Firebase Auth Config]", {
            projectId: auth?.app?.options?.projectId,
            apiKey: auth?.app?.options?.apiKey,
            authDomain: auth?.app?.options?.authDomain
          });
          console.log("[DEBUG Login Params]", {
            loginId: loginId,
            safeId: safeId,
            email: email,
            passwordLength: password ? password.length : 0
          });
          console.log("================================================================");

          try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            console.log("[DEBUG Login Success]", {
              currentUserEmail: auth.currentUser?.email,
              currentUserUid: auth.currentUser?.uid
            });

            // Firestore에서 프로필 정보 로드
            const userSnap = await db.collection("users").doc(user.uid).get();
            if (userSnap.exists) {
              const userData = userSnap.data();
              if (userData.status === "suspended" || userData.status === "permanent_suspended") {
                await auth.signOut();
                throw new Error("정지된 계정입니다. 관리자에게 문의하세요.");
              }
              const updatedProfile = {
                name: userData.nickname || userData.name || "플레이터",
                bio: userData.bio || "소개글이 없습니다.",
                avatar: (userData.nickname || userData.name || "플").slice(0, 1),
                avatarImg: userData.avatarImg || "",
                role: userData.role || "user"
              };
              setProfile(updatedProfile);
              setDBData("foodhouse_profile", updatedProfile).catch(e => console.error(e));
            }

            // lastLoginAt 업데이트
            await db.collection("users").doc(user.uid).update({
              lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(err => console.warn("lastLoginAt 업데이트 실패:", err));

            // 네이티브 자동 로그인 토큰 저장
            if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
              const credential = { type: "local", username: loginId, password };
              await window.flutter_inappwebview.callHandler('saveToken', { token: JSON.stringify(credential) }).catch(e => console.error(e));
            }

            setIsLoggedIn(true);
            setDBData("foodhouse_logged_in", "true").catch(e => console.error(e));
            setLoginOpen(false);
            showToast("로그인 성공!", "success");
          } catch (err) {
            // 📌 [DEBUG LOG] 로그인 실패 시 요구사항 4번 전체 정보 로깅
            console.error("==================== [DEBUG: LOGIN FAIL] ====================");
            console.error("[DEBUG Login Error Details]", {
              errorCode: err?.code,
              errorMessage: err?.message,
              errorCustomData: err?.customData,
              attemptedEmail: email,
              passwordLength: password ? password.length : 0
            });
            console.error("=============================================================");
            throw new Error(formatAuthError(err));
          }
        }
      }

      async function handleRegister(loginId, password, nickname, confirmPassword) {
        let authUserCreated = null;
        let isFirestoreSaved = false;

        // 1. 입력값 정리 및 유효성 검사
        loginId = (loginId || "").trim().toLowerCase();
        password = (password || "").trim();
        confirmPassword = (confirmPassword || "").trim();
        nickname = (nickname || "").trim();

        if (!loginId || !password || !nickname) throw new Error("아이디, 비밀번호, 닉네임을 모두 입력해 주세요.");
        if (confirmPassword && password !== confirmPassword) throw new Error("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");

        const safeId = loginId.replace(/[^a-z0-9_-]/g, "");
        if (!safeId) throw new Error("아이디는 영문소문자와 숫자만 사용 가능합니다.");

        const email = `${safeId}@plating.app`;

        // 📌 [DEBUG LOG] 요구사항 1, 3번: 회원가입 직전 및 Firebase Config 로깅
        console.log("==================== [DEBUG: REGISTER ATTEMPT] ====================");
        console.log("[DEBUG Firebase Auth Config]", {
          projectId: auth?.app?.options?.projectId,
          apiKey: auth?.app?.options?.apiKey,
          authDomain: auth?.app?.options?.authDomain
        });
        console.log("[DEBUG Register Params]", {
          loginId: loginId,
          safeId: safeId,
          email: email,
          passwordLength: password ? password.length : 0,
          isPasswordMatch: password === confirmPassword
        });
        console.log("===================================================================");

        // ① 사전 중복 체크
        const fingerprint = typeof getDeviceFingerprint === "function" ? await getDeviceFingerprint() : "web_" + Date.now();
        let bypassLimit = false;

        try {
          // 1. 아이디 중복 체크
          const idQuery = await db.collection("users").where("loginId", "==", safeId).get();
          if (!idQuery.empty) {
            const docSnap = idQuery.docs[0];
            console.warn("[Registration] 기존 동일 아이디 문서 발견:", docSnap.id);
          }

          // 2. 닉네임 중복 체크
          const nicknameQuery = await db.collection("users").where("nickname", "==", nickname).get();
          if (!nicknameQuery.empty) {
            throw new Error("이미 존재하는 닉네임입니다.");
          }
        } catch (checkErr) {
          if (checkErr.message && checkErr.message.includes("이미")) {
            throw checkErr;
          }
        }

        // ② Firebase Auth 계정 생성 및 Firestore 문서 저장 (핵심 데이터 저장 영역)
        try {
          const userCredential = await auth.createUserWithEmailAndPassword(email, password);
          authUserCreated = userCredential.user;
          const uid = authUserCreated.uid;

          // 📌 [DEBUG LOG] 요구사항 5번: 회원가입 성공 직후 Firebase currentUser 정보 출력
          console.log("==================== [DEBUG: REGISTER SUCCESS] ====================");
          console.log("[DEBUG Register CurrentUser]", {
            currentUserEmail: auth?.currentUser?.email,
            currentUserUid: auth?.currentUser?.uid
          });
          console.log("===================================================================");

          // ③ Firestore 유저 문서 작성 (Atomic)
          await db.collection("users").doc(uid).set({
            loginId: safeId,
            nickname,
            provider: "local",
            deviceFingerprint: fingerprint,
            bypassLimit,
            role: "user",
            status: "active",
            photoURL: "",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          isFirestoreSaved = true;

        } catch (dataErr) {
          console.error("[Registration Data Failed]", dataErr);
          // 📌 치명적인 Firestore 저장 실패에서만 Auth 계정 롤백 삭제 진행
          if (authUserCreated && !isFirestoreSaved) {
            try { 
              await authUserCreated.delete(); 
              console.log("[Rollback] 치명적 DB 저장 실패로 Auth 계정 롤백 삭제 완료"); 
            } catch (de) { 
              console.error("[Rollback Failed]", de); 
            }
          }
          throw new Error(formatAuthError(dataErr));
        }

        // ④ 프로필 상태 반영 및 자동 로그인 (독립된 try-catch: UI 예외가 Auth 계정을 지우지 않음)
        try {
          const updatedProfile = {
            name: nickname,
            bio: "소개글이 없습니다.",
            avatar: nickname.slice(0, 1),
            avatarImg: "",
            role: "user"
          };
          setProfile(updatedProfile);
          setDBData("foodhouse_profile", updatedProfile).catch(e => console.error(e));
          setIsLoggedIn(true);
          setLoginOpen(false);
          showToast("회원가입이 완료되었습니다!", "success");
        } catch (uiErr) {
          console.warn("[Registration UI Warning] UI 반영 중 경고 (회원가입 자체는 성공함):", uiErr);
        }
      }

      function handleLogout() {
        // 📌 [DEBUG LOG] 요구사항 6번: 로그아웃 직전 currentUser.email 출력
        console.log("==================== [DEBUG: LOGOUT ATTEMPT] ====================");
        console.log("[DEBUG Logout CurrentUser]", {
          currentUserEmail: auth?.currentUser?.email
        });
        console.log("=================================================================");

        auth.signOut().catch(e => console.error("Firebase SignOut Error:", e));
        setIsLoggedIn(false);
        setDBData("foodhouse_logged_in", "false").catch(e => console.error(e));
        setDBData("foodhouse_kakao_token", "").catch(e => console.error(e));
        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
          window.flutter_inappwebview.callHandler('saveToken', { token: "" }).catch(e => console.error(e));
        }
        fetch("/api/v1/auth/logout").catch(e => console.error("Logout request error:", e));
        alert("로그아웃되었습니다.");
        setActiveTab("home");
      }

      async function handleDeleteAccount() {
        if (await window.showConfirm("정말로 회원 탈퇴를 진행하시겠습니까?\n작성하신 게시물과 댓글, 저장된 모든 정보가 영구 삭제됩니다.")) {
          try {
            if (auth.currentUser) {
              await auth.currentUser.delete();
            }
          } catch (e) {
            console.error("Firebase user delete error:", e);
          }
          auth.signOut().catch(e => console.error("Firebase SignOut Error:", e));
          localStorage.clear();
          if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
            window.flutter_inappwebview.callHandler('saveToken', { token: "" }).catch(e => console.error(e));
          }
          const req = indexedDB.deleteDatabase(DB_NAME);
          req.onsuccess = () => {
            alert("회원 탈퇴 및 계정 정보 삭제가 완료되었습니다.");
            window.location.reload();
          };
          req.onerror = () => {
            alert("로컬 정보가 삭제되었습니다.");
            window.location.reload();
          };
        }
      }

      async function handleCreatePost(newPostData) {
        await authReadyPromise;
        await sessionSyncReadyPromise;
        const user = auth.currentUser;
        if (!user) {
          alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
          setLoginOpen(true);
          return;
        }

        const newPost = {
          author: profile.name,
          avatarImg: profile.avatarImg || "",
          title: newPostData.title,
          body: newPostData.body,
          category: newPostData.category,
          mediaType: newPostData.mediaType || "image",
          image: newPostData.image || [],
          productLinks: newPostData.productLinks || [],
          likeCount: 0,
          likedBy: [],
          scrappedBy: [],
          comments: [],
          createdAt: new Date().toLocaleDateString(),
          timestamp: new Date().toISOString(),
          userId: user.uid
        };

        db.collection("posts").add(newPost)
          .then((docRef) => {
            console.log("[Firestore] Post added with ID:", docRef.id);
            setWriteOpen(false);
            setActiveTab("home");
          })
          .catch((err) => {
            alert("포스트 추가 중 오류가 발생했습니다: " + err.message);
          });
      }

      function handleLike(id) {
        if (!isLoggedIn) {
          setLoginOpen(true);
          return;
        }
        const user = auth.currentUser;
        if (!user) return;

        // ① 즉시 UI 반영 (낙관적 업데이트)
        let isAddLike = false;
        setPosts(prev => prev.map(p => {
          if (p.id !== id) return p;
          const likedBy = p.likedBy || [];
          const hasLiked = likedBy.includes(user.uid) || likedBy.includes(profile.name);
          isAddLike = !hasLiked;
          return {
            ...p,
            liked: !hasLiked,
            likeCount: hasLiked ? Math.max(0, (p.likeCount || 0) - 1) : (p.likeCount || 0) + 1,
            likedBy: hasLiked
              ? likedBy.filter(uid => uid !== user.uid && uid !== profile.name)
              : [...likedBy, user.uid]
          };
        }));

        // ② Firestore 비동기 동기화
        const postRef = db.collection("posts").doc(id);
        let targetUserId = "";
        let postTitle = "";

        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const data = doc.data();
          targetUserId = data.userId || "";
          postTitle = data.title || "";
          const likedBy = data.likedBy || [];
          let likeCount = data.likeCount || 0;
          
          const hasLikedUid = likedBy.includes(user.uid);
          const hasLikedName = likedBy.includes(profile.name);

          if (hasLikedUid || hasLikedName) {
            if (hasLikedUid) likedBy.splice(likedBy.indexOf(user.uid), 1);
            if (hasLikedName) likedBy.splice(likedBy.indexOf(profile.name), 1);
            likeCount = Math.max(0, likeCount - 1);
            isAddLike = false;
          } else {
            likedBy.push(user.uid);
            likeCount += 1;
            isAddLike = true;
          }
          transaction.update(postRef, { likedBy, likeCount });
        }).then(() => {
          if (isAddLike && targetUserId) {
            sendInAppNotification(
              targetUserId,
              "like",
              id,
              "새로운 좋아요",
              `${profile.name || "이웃"}님이 회원님의 요리 "${postTitle}"에 좋아요를 눌렀습니다.`
            );
          }
        }).catch(err => console.error("[Firestore Transaction] Like error:", err));
      }

      function handleScrap(id) {
        if (!isLoggedIn) {
          setLoginOpen(true);
          return;
        }
        const user = auth.currentUser;
        if (!user) return;

        const postRef = db.collection("posts").doc(id);
        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const data = doc.data();
          const scrappedBy = data.scrappedBy || [];
          
          const hasScrappedUid = scrappedBy.includes(user.uid);
          const hasScrappedName = scrappedBy.includes(profile.name);

          if (hasScrappedUid || hasScrappedName) {
            if (hasScrappedUid) scrappedBy.splice(scrappedBy.indexOf(user.uid), 1);
            if (hasScrappedName) scrappedBy.splice(scrappedBy.indexOf(profile.name), 1);
          } else {
            scrappedBy.push(user.uid);
          }
          transaction.update(postRef, { scrappedBy });
        }).catch(err => console.error("[Firestore Transaction] Scrap error:", err));
      }

      function handleComment(postId, text) {
        if (!isLoggedIn) {
          setLoginOpen(true);
          return;
        }
        const postRef = db.collection("posts").doc(postId);
        let targetUserId = "";
        let postTitle = "";

        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const data = doc.data();
          targetUserId = data.userId || "";
          postTitle = data.title || "";
          const comments = data.comments || [];
          comments.push({
            id: generateId(),
            author: profile.name,
            text: text
          });
          transaction.update(postRef, { comments });
        }).then(() => {
          if (targetUserId) {
            sendInAppNotification(
              targetUserId,
              "comment",
              postId,
              "새로운 댓글",
              `${profile.name || "이웃"}님이 회원님의 요리 "${postTitle}"에 댓글을 달았습니다: "${text.length > 15 ? text.slice(0, 15) + '...' : text}"`
            );
          }
        }).catch(err => console.error("[Firestore Transaction] Comment error:", err));
      }

      // 댓글 수정/삭제
      function handleEditComment(postId, commentId, text) {
        if (!isLoggedIn) return;
        const postRef = db.collection("posts").doc(postId);
        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const comments = doc.data().comments || [];
          const updated = comments.map(c => c.id === commentId ? { ...c, text } : c);
          transaction.update(postRef, { comments: updated });
        }).catch(err => console.error("[Firestore Transaction] Edit comment error:", err));
      }

      async function handleDeleteComment(postId, commentId) {
        if (!isLoggedIn) return;
        if (await window.showConfirm("댓글을 삭제하시겠습니까?")) {
          const postRef = db.collection("posts").doc(postId);
          db.runTransaction(async (transaction) => {
            const doc = await transaction.get(postRef);
            if (!doc.exists) return;
            const comments = doc.data().comments || [];
            const filtered = comments.filter(c => c.id !== commentId);
            transaction.update(postRef, { comments: filtered });
          }).catch(err => console.error("[Firestore Transaction] Delete comment error:", err));
        }
      }

      function handleTagClick(tag) {
        setSearchQuery(tag);
        setActiveTab("search");
      }

      function handleAuthorClick(authorName) {
        setActivePostId(null);
        setActiveComPostId(null);
        if (authorName === "나" || authorName === profile.name) {
          setActiveTab("mypage");
        } else {
          setActiveUser(authorName);
          setActiveTab("userprofile");
        }
      }

      function handleFollowToggle(userName) {
        const currentFollowing = Array.isArray(followingList) ? followingList : [];
        const user = auth.currentUser;

        if (currentFollowing.includes(userName)) {
          // 언팔로우
          setFollowingList(currentFollowing.filter(name => name !== userName));
          setCreatorsData(prev => {
            const userData = prev[userName] || { bio: "플레이팅 크리에이터입니다.", followersCount: 15, followingCount: 8, avatarImg: "" };
            return {
              ...prev,
              [userName]: {
                ...userData,
                followersCount: Math.max(0, (userData.followersCount || 0) - 1)
              }
            };
          });
          // Firestore에 내 followingList 업데이트
          if (user) {
            db.collection("users").doc(user.uid).update({
              followingList: firebase.firestore.FieldValue.arrayRemove(userName)
            }).catch(err => console.error("[Follow] Firestore 언팔 업데이트 실패:", err));
          }
        } else {
          // 팔로우
          setFollowingList([...currentFollowing, userName]);
          setCreatorsData(prev => {
            const userData = prev[userName] || { bio: "플레이팅 크리에이터입니다.", followersCount: 15, followingCount: 8, avatarImg: "" };
            return {
              ...prev,
              [userName]: {
                ...userData,
                followersCount: (userData.followersCount || 0) + 1
              }
            };
          });
          // Firestore에 내 followingList 업데이트
          if (user) {
            db.collection("users").doc(user.uid).update({
              followingList: firebase.firestore.FieldValue.arrayUnion(userName)
            }).catch(err => console.error("[Follow] Firestore 팔로우 업데이트 실패:", err));
          }

          // 팔로우 대상 유저의 nickname으로 Firestore users 컬렉션에서 UID 조회 후 알림 생성
          db.collection("users").where("nickname", "==", userName).limit(1).get()
            .then(snapshot => {
              if (!snapshot.empty) {
                const targetUid = snapshot.docs[0].id;
                sendInAppNotification(
                  targetUid, 
                  "follow", 
                  "", 
                  "새로운 팔로워", 
                  `${profile.name || "이웃"}님이 회원님을 팔로우하기 시작했습니다!`
                );
              }
            })
            .catch(err => console.error("[Follow Notification] Resolving target UID failed:", err));
        }
      }

      async function deleteStorageImages(imageUrls) {
        if (!imageUrls || imageUrls.length === 0) return;
        for (const url of imageUrls) {
          if (url.includes("firebasestorage.googleapis.com")) {
            try {
              const ref = storage.refFromURL(url);
              await ref.delete();
              console.log("[Firebase Storage] Image deleted successfully:", url);
            } catch (err) {
              console.error("[Firebase Storage] Error deleting image:", url, err);
            }
          }
        }
      }

      async function handleReport(targetType, targetId, reason, description, targetParentId = "") {
        const user = auth.currentUser;
        if (!user) {
          alert("로그인이 필요합니다.");
          return;
        }
        try {
          let targetUserUid = "";
          if (targetType === "post") {
            const postDoc = await db.collection("community_posts").doc(targetId).get();
            if (postDoc.exists) {
              targetUserUid = postDoc.data().userId || "";
            } else {
              const rDoc = await db.collection("posts").doc(targetId).get();
              if (rDoc.exists) {
                targetUserUid = rDoc.data().userId || "";
              }
            }
          } else if (targetType === "comment") {
            const parentId = targetParentId || communityPosts.find(p => (p.comments || []).some(c => c.id === targetId))?.id;
            if (parentId) {
              const parentPost = communityPosts.find(p => p.id === parentId);
              if (parentPost) {
                const commentObj = (parentPost.comments || []).find(c => c.id === targetId);
                if (commentObj) {
                  targetUserUid = commentObj.userId || "";
                }
              }
            }
          }

          const newReportRef = db.collection("reports").doc();
          await newReportRef.set({
            reportId: newReportRef.id,
            targetType,
            targetId,
            targetParentId: targetParentId || "",
            reportUserUid: user.uid,
            targetUserUid,
            reason,
            description: description || "",
            createdAt: new Date().toISOString(),
            status: "waiting"
          });
          alert("신고가 정상 접수되었습니다. 깨끗한 플레이팅 환경을 위해 힘써주셔서 감사합니다.");
        } catch (err) {
          console.error("Report error:", err);
          alert("신고 처리 중 오류가 발생했습니다: " + err.message);
        }
      }

      async function handleDeletePost(id) {
        if (!isLoggedIn) return false;
        const post = posts.find(p => p.id === id);
        if (!post) return false;

        const user = auth.currentUser;
        const isMyPost = post.userId === user?.uid || post.author === profile.name;
        const isAdmin = profile.role === "admin";
        if (!isMyPost && !isAdmin) {
          alert("삭제 권한이 없습니다.");
          return false;
        }

        if (await window.showConfirm("정말로 이 포스팅을 삭제하시겠습니까?")) {
          await deleteStorageImages(post.image);
          db.collection("posts").doc(id).delete()
            .then(() => console.log("[Firestore] Post deleted successfully"))
            .catch(err => console.error("[Firestore] Delete post error:", err));
          return true;
        }
        return false;
      }

      function handleEditPost(id, newTitle, newBody) {
        if (!isLoggedIn) return;
        db.collection("posts").doc(id).update({ title: newTitle, body: newBody })
          .then(() => console.log("[Firestore] Post updated successfully"))
          .catch(err => console.error("[Firestore] Update post error:", err));
      }

      // 커뮤니티 CRUD 핸들러
      async function handleAddCommunityPost(newComPost) {
        await authReadyPromise;
        await sessionSyncReadyPromise;
        const user = auth.currentUser;
        if (!user) {
          alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
          setLoginOpen(true);
          return;
        }
        const authorName = profile.name && profile.name !== "나의 플레이팅" 
          ? profile.name 
          : "익명 플레이터";

        let token = "";
        try {
          token = await user.getIdToken();
        } catch (tokenErr) {
          console.error("Failed to retrieve Firebase ID Token for community post:", tokenErr);
        }

        fetch("/api/v1/community/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            title: newComPost.title,
            body: newComPost.body,
            category: newComPost.category,
            author: authorName,
            avatarImg: profile.avatarImg || "",
            userId: user.uid,
            image: newComPost.image || []
          })
        })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            console.log("[Firestore] Community post added via API");
          } else {
            alert(res.message || "글 등록에 실패했습니다.");
          }
        })
        .catch(err => {
          console.error("Add community post error:", err);
          alert("글 등록 중 오류가 발생했습니다.");
        });
      }

      function handleAddCommunityComment(postId, commentText) {
        const authorName = isLoggedIn && profile.name && profile.name !== "나의 플레이팅" 
          ? profile.name 
          : "익명 플레이터";

        const postRef = db.collection("community_posts").doc(postId);
        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const comments = doc.data().comments || [];
          comments.push({
            id: generateId(),
            author: authorName,
            text: commentText
          });
          transaction.update(postRef, { comments });
        }).catch(err => console.error("[Firestore Transaction] Community comment error:", err));
      }

      // 좋아요 토글 (낙관적 업데이트: 클릭 즉시 UI 반영 후 Firestore 동기화)
      function handleLikeCommunityPost(postId) {
        if (!isLoggedIn) {
          setLoginOpen(true);
          return;
        }
        const user = auth.currentUser;
        if (!user) return;

        // ① 즉시 UI 반영 (낙관적 업데이트)
        setCommunityPosts(prev => prev.map(p => {
          if (p.id !== postId) return p;
          const likedBy = p.likedBy || [];
          const hasLiked = likedBy.includes(user.uid) || likedBy.includes(profile.name);
          return {
            ...p,
            liked: !hasLiked,
            likeCount: hasLiked ? Math.max(0, (p.likeCount || 0) - 1) : (p.likeCount || 0) + 1,
            likedBy: hasLiked
              ? likedBy.filter(id => id !== user.uid && id !== profile.name)
              : [...likedBy, user.uid]
          };
        }));

        // ② Firestore 비동기 동기화
        const postRef = db.collection("community_posts").doc(postId);
        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const data = doc.data();
          const likedBy = data.likedBy || [];
          let likeCount = data.likeCount || 0;

          const hasLikedUid = likedBy.includes(user.uid);
          const hasLikedName = likedBy.includes(profile.name);

          if (hasLikedUid || hasLikedName) {
            if (hasLikedUid) likedBy.splice(likedBy.indexOf(user.uid), 1);
            if (hasLikedName) likedBy.splice(likedBy.indexOf(profile.name), 1);
            likeCount = Math.max(0, likeCount - 1);
          } else {
            likedBy.push(user.uid);
            likeCount += 1;
          }
          transaction.update(postRef, { likedBy, likeCount });
        }).catch(err => console.error("[Firestore Transaction] Like community post error:", err));
      }

      async function handleDeleteCommunityPost(postId) {
        if (!isLoggedIn) return false;
        const post = communityPosts.find(p => p.id === postId);
        if (!post) return false;

        const user = auth.currentUser;
        const isMyPost = post.userId === user?.uid || post.author === profile.name;
        const isAdmin = profile.role === "admin";
        if (!isMyPost && !isAdmin) {
          alert("삭제 권한이 없습니다.");
          return false;
        }

        if (await window.showConfirm("정말로 이 게시글을 삭제하시겠습니까?")) {
          await deleteStorageImages(post.image);
          db.collection("community_posts").doc(postId).delete()
            .then(() => console.log("[Firestore] Community post deleted"))
            .catch(err => console.error("[Firestore] Delete community post error:", err));
          return true;
        }
        return false;
      }

      function handleEditCommunityPost(postId, editTitle, editBody) {
        if (!isLoggedIn) return;
        db.collection("community_posts").doc(postId).update({ title: editTitle, body: editBody })
          .then(() => console.log("[Firestore] Community post updated"))
          .catch(err => console.error("[Firestore] Edit community post error:", err));
      }

      function handleEditCommunityComment(postId, commentId, text) {
        if (!isLoggedIn) return;
        const postRef = db.collection("community_posts").doc(postId);
        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const comments = doc.data().comments || [];
          const updated = comments.map(c => c.id === commentId ? { ...c, text } : c);
          transaction.update(postRef, { comments: updated });
        }).catch(err => console.error("[Firestore Transaction] Edit community comment error:", err));
      }

      async function handleDeleteCommunityComment(postId, commentId) {
        if (!isLoggedIn) return;
        if (await window.showConfirm("댓글을 삭제하시겠습니까?")) {
          const postRef = db.collection("community_posts").doc(postId);
          db.runTransaction(async (transaction) => {
            const doc = await transaction.get(postRef);
            if (!doc.exists) return;
            const comments = doc.data().comments || [];
            const filtered = comments.filter(c => c.id !== commentId);
            transaction.update(postRef, { comments: filtered });
          }).catch(err => console.error("[Firestore Transaction] Delete community comment error:", err));
        }
      }

      function handleCommunityPostClick(id) {
        db.collection("community_posts").doc(id).update({
          viewCount: firebase.firestore.FieldValue.increment(1)
        }).catch(e => console.error("Increment viewCount error:", e));
        setActiveComPostId(id);
        setActiveTab("community_detail");
      }

      function handleRecipePostClick(id) {
        db.collection("posts").doc(id).update({
          viewCount: firebase.firestore.FieldValue.increment(1)
        }).catch(e => console.error("Increment recipe viewCount error:", e));
        setActivePostId(id);
      }

      function handleScrapCommunityPost(postId) {
        if (!isLoggedIn) {
          setLoginOpen(true);
          return;
        }
        const user = auth.currentUser;
        if (!user) return;

        const postRef = db.collection("community_posts").doc(postId);
        db.runTransaction(async (transaction) => {
          const doc = await transaction.get(postRef);
          if (!doc.exists) return;
          const data = doc.data();
          const scrappedBy = data.scrappedBy || [];
          
          const hasScrappedUid = scrappedBy.includes(user.uid);
          const hasScrappedName = scrappedBy.includes(profile.name);

          if (hasScrappedUid || hasScrappedName) {
            if (hasScrappedUid) scrappedBy.splice(scrappedBy.indexOf(user.uid), 1);
            if (hasScrappedName) scrappedBy.splice(scrappedBy.indexOf(profile.name), 1);
          } else {
            scrappedBy.push(user.uid);
          }
          transaction.update(postRef, { scrappedBy });
        }).catch(err => console.error("[Firestore Transaction] Scrap community post error:", err));
      }

      const currentFollowing = Array.isArray(followingList) ? followingList : [];
      let filteredPosts = posts;
      if (activeTab === "home") {
        if (selectedCategory === "팔로잉") {
          filteredPosts = posts.filter(post => currentFollowing.includes(post.author));
        } else if (selectedCategory !== "전체") {
          filteredPosts = posts.filter(post => post.category === selectedCategory);
        }
      }

      const searchedPosts = posts.filter(post => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return (
          post.title.toLowerCase().includes(query) ||
          post.body.toLowerCase().includes(query) ||
          post.author.toLowerCase().includes(query)
        );
      });

      if (["privacy", "terms", "delete-account", "landing"].includes(activeTab)) {
        const renderStaticContent = () => {
          switch (activeTab) {
            case "privacy":
              return (
                <div style={{ padding: "20px 0" }}>
                  <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", borderBottom: "2px solid #e2e8f0", paddingBottom: "16px", marginBottom: "24px" }}>개인정보처리방침</h1>
                  <p style={{ fontSize: "14px", color: "#475569", marginBottom: "16px" }}>
                    플레이팅(이하 "서비스")은 이용자의 개인정보를 소중하게 보호하며, "개인정보 보호법", "정보통신망 이용촉진 및 정보보호 등에 관한 법률" 등 대한민국의 관련 법령과 구글 플레이 개발자 정책, 카카오 개발자 정책을 준수합니다.
                  </p>
                  <p style={{ fontSize: "14px", color: "#475569", marginBottom: "24px" }}>
                    본 개인정보처리방침은 이용자의 개인정보가 어떠한 용도와 방식으로 수집, 이용, 보호되는지 상세히 알려드리기 위해 작성되었습니다.
                  </p>
                  
                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>1. 개인정보의 수집 항목 및 방법</h2>
                  <p style={{ fontSize: "14px", color: "#475569" }}>회사는 이용자가 서비스에 가입하고 이용하는 과정에서 아래와 같은 최소한의 개인정보를 수집합니다.</p>
                  <ul style={{ paddingLeft: "20px", fontSize: "14px", color: "#475569", lineHeight: "1.8", marginBottom: "20px" }}>
                    <li><strong>소셜 로그인 연동 시 (카카오 로그인):</strong> 카카오 회원 고유번호(ID), 프로필 닉네임, 프로필 이미지 URL, 이메일 주소(선택 수집)</li>
                    <li><strong>회원 프로필 설정 시:</strong> 사용자가 업로드한 프로필 사진, 한 줄 소개글, 사용자가 설정한 닉네임</li>
                    <li><strong>서비스 이용 및 커뮤니티 글쓰기 시:</strong> 작성한 게시물 본문 내용, 첨부한 사진 파일(스토리지 저장), 네이버 지도 및 쇼핑몰 관련 링크 정보, 댓글 내용</li>
                    <li><strong>자동 수집 정보:</strong> 단말기 정보(기기 유형, OS 버전), 서비스 이용 기록, 접속 로그, 로컬 세션 유지용 토큰 정보</li>
                  </ul>

                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>2. 개인정보의 수집 및 이용 목적</h2>
                  <ul style={{ paddingLeft: "20px", fontSize: "14px", color: "#475569", lineHeight: "1.8", marginBottom: "20px" }}>
                    <li><strong>서비스 제공 및 계약 이행:</strong> 콘텐츠 제공, 특정 맞춤 서비스 제공, 회원 간 소통 지원</li>
                    <li><strong>회원 관리:</strong> 가입 의사 확인, 본인 식별, 불량 회원의 부정 이용 방지, 고지사항 전달, 민원 및 불만 처리</li>
                    <li><strong>서비스 개발 및 통계:</strong> 신규 서비스 개발 및 통계학적 특성에 따른 맞춤형 서비스 제공</li>
                  </ul>

                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>3. 개인정보의 보유 및 이용 기간</h2>
                  <p style={{ fontSize: "14px", color: "#475569" }}>
                    이용자의 개인정보는 원칙적으로 회원 탈퇴 시 혹은 개인정보 수집 및 이용목적이 달성되면 지체 없이 파기합니다. 다만, 부정 가입 방지를 위한 내부 방침(탈퇴 후 3개월 보존) 및 관련 법령(소비자 불만 처리 기록 3년, 웹사이트 방문 기록 3개월)에 따라 보존 사유가 있는 경우 명시된 기간 동안 안전하게 보존합니다.
                  </p>

                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>4. 이용자의 권리 및 의무 (회원 탈퇴 및 데이터 삭제)</h2>
                  <p style={{ fontSize: "14px", color: "#475569" }}>
                    이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며, 서비스 탈퇴(계정 삭제)를 요청할 수 있습니다. 앱 내 설정의 <strong>'회원 탈퇴'</strong> 메뉴를 이용하면 즉시 본인 데이터가 영구 파기되며, 직접 탈퇴가 불가능한 경우 고객지원 이메일(<a href="mailto:sosdml123@naver.com" style={{ color: "#e11d48", fontWeight: "600", textDecoration: "none" }}>sosdml123@naver.com</a>)로 삭제를 요청하실 수 있습니다.
                  </p>
                  
                  <div style={{ marginTop: "40px", borderTop: "1px solid #e2e8f0", paddingTop: "20px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
                    시행일자: 2026년 7월 12일<br/>
                    © 2026 PLAYTING. All rights reserved.
                  </div>
                </div>
              );
            case "terms":
              return (
                <div style={{ padding: "20px 0" }}>
                  <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", borderBottom: "2px solid #e2e8f0", paddingBottom: "16px", marginBottom: "24px" }}>서비스 이용약관</h1>
                  <p style={{ fontSize: "14px", color: "#475569", marginBottom: "16px" }}>
                    본 약관은 플레이팅(이하 "서비스")이 제공하는 모바일 애플리케이션 및 관련 서비스의 이용과 관련하여, 회사와 이용자 간의 권리, 의무, 책임사항 및 기타 필요한 사항을 규정함을 목적으로 합니다.
                  </p>
                  
                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>제 1 조 (약관의 명시와 개정)</h2>
                  <p style={{ fontSize: "14px", color: "#475569" }}>
                    본 서비스는 본 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 화면 내에 게시합니다. 관련 법령을 위배하지 않는 범위 내에서 본 약관을 개정할 수 있으며, 약관 개정 시 적용일자 및 개정 사유를 사전에 공지합니다.
                  </p>

                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>제 2 조 (용어의 정의)</h2>
                  <ul style={{ paddingLeft: "20px", fontSize: "14px", color: "#475569", lineHeight: "1.8", marginBottom: "20px" }}>
                    <li><strong>회원:</strong> 서비스에 접속하여 본 약관에 동의하고 소셜 로그인을 통해 계정을 생성한 자를 뜻합니다.</li>
                    <li><strong>콘텐츠:</strong> 회원이 서비스 내에 게시한 사진, 게시글, 댓글, 지도 정보 등 모든 데이터를 뜻합니다.</li>
                  </ul>

                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>제 3 조 (회원의 게시글 및 책임)</h2>
                  <p style={{ fontSize: "14px", color: "#475569" }}>
                    회원은 서비스의 정상적인 운영을 방해하거나 타인의 권리를 침해하는 유해 게시글을 업로드해서는 안 됩니다. 음란성 또는 비방 목적의 게시물은 경고 없이 삭제 조치되며 회원 제한을 받을 수 있습니다.
                  </p>
                  
                  <div style={{ marginTop: "40px", borderTop: "1px solid #e2e8f0", paddingTop: "20px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
                    시행일자: 2026년 7월 12일<br/>
                    © 2026 PLAYTING. All rights reserved.
                  </div>
                </div>
              );
            case "delete-account":
              return (
                <div style={{ padding: "20px 0" }}>
                  <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", borderBottom: "2px solid #e2e8f0", paddingBottom: "16px", marginBottom: "24px" }}>계정 및 데이터 삭제 신청</h1>
                  <p style={{ fontSize: "14px", color: "#475569", marginBottom: "16px" }}>
                    플레이팅(PLAYTING) 서비스를 이용해 주셔서 감사합니다. 더 이상 서비스를 이용하지 않으시고 탈퇴 및 개인정보 파기를 원하실 경우, 아래의 절차를 통해 손쉽게 삭제를 처리하실 수 있습니다.
                  </p>

                  <div style={{ backgroundColor: "#fff1f2", borderLeft: "4px solid #f43f5e", padding: "16px", borderRadius: "4px", margin: "20px 0", fontSize: "14px", color: "#e11d48" }}>
                    <strong>⚠️ 데이터 삭제 시 유의사항:</strong><br/>
                    계정 삭제 신청 즉시 이용자님의 가입 정보(이메일, 소셜 연동 토큰, 닉네임, 프로필 사진)와 업로드한 모든 게시글, 댓글, 좋아요 내역이 데이터베이스에서 즉각적이고 영구적으로 파기됩니다. 복구는 불가합니다.
                  </div>

                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>방법 1. 앱 내부에서 즉시 삭제하기 (가장 빠른 방법)</h2>
                  <ol style={{ paddingLeft: "20px", fontSize: "14px", color: "#475569", lineHeight: "1.8", marginBottom: "20px" }}>
                    <li>플레이팅 앱을 실행합니다.</li>
                    <li>우측 하단의 <strong>마이페이지(사람 모양 아이콘)</strong> 탭을 선택합니다.</li>
                    <li>우측 상단의 <strong>설정(톱니바퀴 모양 아이콘)</strong> 버튼을 탭합니다.</li>
                    <li>화면 가장 하단에 있는 <strong>회원 탈퇴</strong> 메뉴를 탭합니다.</li>
                    <li>안내를 읽어보신 후 최종 확인을 누르시면, 즉시 모든 회원 데이터가 영구 파기되고 자동 로그아웃됩니다.</li>
                  </ol>

                  <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", borderLeft: "4px solid #0f172a", paddingLeft: "10px", marginTop: "32px", marginBottom: "12px" }}>방법 2. 웹에서 삭제 신청하기 (앱 삭제 또는 미로그인 시)</h2>
                  <p style={{ fontSize: "14px", color: "#475569" }}>
                    앱을 이미 기기에서 지우셨거나 로그인이 불가능한 상태라면, 아래의 지원 접수 이메일로 요청을 접수해 주시면 담당자가 확인 후 48시간 이내에 개인정보 및 계정 데이터를 완전히 삭제해 드립니다.
                  </p>
                  
                  <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", padding: "20px", borderRadius: "8px", margin: "20px 0", fontSize: "14px", color: "#475569" }}>
                    <p style={{ margin: "0 0 10px 0" }}><strong>📨 온라인 삭제 신청 접수 이메일:</strong> <a href="mailto:sosdml123@naver.com" style={{ color: "#e11d48", fontWeight: "600", textDecoration: "none" }}>sosdml123@naver.com</a></p>
                    <p style={{ margin: 0 }}><strong>📋 메일 작성 정보:</strong></p>
                    <ul style={{ margin: "10px 0 0 0", paddingLeft: "20px" }}>
                      <li>신청자 가입 이메일 주소 (또는 카카오 로그인 계정 정보)</li>
                      <li>서비스 내 가입 닉네임</li>
                      <li>제목: [플레이팅 데이터 삭제 요청]</li>
                    </ul>
                  </div>
                  
                  <div style={{ marginTop: "40px", borderTop: "1px solid #e2e8f0", paddingTop: "20px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
                    © 2026 PLAYTING. All rights reserved.
                  </div>
                </div>
              );
            case "landing":
              return (
                <div style={{ padding: "20px 0", textAlign: "center" }}>
                  <h1 style={{ fontSize: "36px", fontWeight: "900", color: "#0f172a", marginBottom: "16px" }}>🍽️ PLAYTING</h1>
                  <p style={{ fontSize: "18px", color: "#64748b", marginBottom: "40px" }}>나만의 요리와 맛집을 자랑하고 소통하는 SNS, 플레이팅</p>
                  
                  <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap", margin: "40px 0" }}>
                    <div style={{ width: "240px", padding: "24px", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#ffffff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)" }}>
                      <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", margin: "0 0 10px 0" }}>📸 요리 자랑 피드</h3>
                      <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>나만의 정성스러운 식판과 홈쿡 요리를 이웃들에게 뽐내보세요.</p>
                    </div>
                    <div style={{ width: "240px", padding: "24px", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#ffffff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)" }}>
                      <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", margin: "0 0 10px 0" }}>📍 네이버 지도 연동</h3>
                      <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>지도를 연결하여 내가 방문했던 찐맛집 정보를 공유할 수 있습니다.</p>
                    </div>
                    <div style={{ width: "240px", padding: "24px", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#ffffff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)" }}>
                      <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", margin: "0 0 10px 0" }}>💬 푸드 커뮤니티</h3>
                      <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>자유로운 게시판에서 음식 꿀팁과 고민을 부담 없이 나눕니다.</p>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: "60px", borderTop: "1px solid #e2e8f0", paddingTop: "20px", fontSize: "12px", color: "#94a3b8" }}>
                    © 2026 PLAYTING. All rights reserved.
                  </div>
                </div>
              );
            default:
              return null;
          }
        };

        return (
          <div style={{ width: "100%", minHeight: "100vh", backgroundColor: "#ffffff", color: "#333333", padding: "30px 24px", boxSizing: "border-box", overflowY: "auto" }}>
            <div style={{ maxWidth: "800px", margin: "0 auto", lineHeight: "1.6" }}>
              <button 
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    window.location.href = "/";
                  }
                }} 
                style={{ padding: "8px 16px", backgroundColor: "#0f172a", color: "#ffffff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer", marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                ← 메인 화면으로 돌아가기
              </button>
              {renderStaticContent()}
            </div>
          </div>
        );
      }

      return (
        <div className="app-container">
          <AdBanner />

          {activeTab !== "community" && activeTab !== "community_detail" && activeTab !== "community_write" && activeTab !== "notifications" && (
            <header className="app-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h1 className="cursor-pointer" onClick={() => { setActiveTab("home"); setSelectedCategory("전체"); }}>PLAYTING</h1>
              <div className="flex items-center gap-1.5" style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                {activeTab === "home" && (
                  <button 
                    className="text-zinc-600 hover:text-zinc-950 p-2 border-none bg-transparent active:scale-95 transition-transform" 
                    onClick={() => setActiveTab("notifications")} 
                    title="알림"
                    style={{ cursor: "pointer" }}
                  >
                    <i className="fa-regular fa-bell text-lg"></i>
                  </button>
                )}
                {activeTab === "mypage" && (
                  <button 
                    className="text-zinc-600 hover:text-zinc-950 p-2 border-none bg-transparent active:scale-95 transition-transform" 
                    onClick={() => setActiveTab("settings")} 
                    title="설정"
                    style={{ cursor: "pointer" }}
                  >
                    <i className="fa-solid fa-gear text-base"></i>
                  </button>
                )}
              </div>
            </header>
          )}

          {activeTab === "home" && (
            <div className="px-4 pt-4">
              <div className="category-tabs no-scrollbar">
                {categories.map(cat => (
                  <button 
                    key={cat} 
                    className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto no-scrollbar">
            {activeTab === "home" && (
              <div className="masonry-feed">
                {selectedCategory === "팔로잉" && filteredPosts.length === 0 ? (
                  <div className="text-center py-24 px-6" style={{ columnSpan: "all" }}>
                    <i className="fa-solid fa-user-plus text-zinc-300 text-3xl mb-4 block"></i>
                    <p className="text-xs font-bold text-zinc-950 mb-1">팔로우한 유저가 없습니다</p>
                    <p className="text-[11px] text-zinc-400 mb-6">관심 있는 크리에이터의 프로필에서 팔로우를 맺어보세요.</p>
                    <button className="secondary px-4 py-2 text-xs rounded-full font-bold" onClick={() => setSelectedCategory("전체")}>추천 피드 보러가기</button>
                  </div>
                ) : filteredPosts.length > 0 ? (
                  filteredPosts.map(post => (
                    <PostCard 
                      key={post.id} 
                      post={post} 
                      onLike={() => handleLike(post.id)}
                      onCardClick={() => handleRecipePostClick(post.id)}
                      onAuthorClick={() => handleAuthorClick(post.author)}
                    />
                  ))
                ) : (
                  <div className="text-center py-20 text-zinc-400 text-sm" style={{ columnSpan: "all" }}>등록된 글이 없습니다.</div>
                )}
              </div>
            )}
            {activeTab === "notifications" && (
              <NotificationCenterView 
                onBack={() => setActiveTab("home")} 
                onPostClick={(postId) => handleRecipePostClick(postId)}
                onAuthorClick={handleAuthorClick}
              />
            )}

            {activeTab === "search" && (
              <div className="p-4 pb-20">
                <div className="relative mb-6">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="해시태그, 음식 제목, 닉네임을 입력해 보세요 (예: #올리브유)"
                    className="w-full bg-zinc-100 border border-zinc-200 rounded-lg px-10 py-3 text-xs outline-none focus:border-zinc-950 focus:bg-white"
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-3.5 text-zinc-400 text-xs"></i>
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-3 top-3 text-zinc-400 text-sm">×</button>
                  )}
                </div>

                <div className="mb-6">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">추천 해시태그</div>
                  <div className="flex flex-wrap gap-2">
                    {["#바질", "#레시피", "#올리브유", "#크로플", "#성수카페", "#감성요리"].map(tag => (
                      <button 
                        key={tag}
                        onClick={() => setSearchQuery(tag)}
                        className="bg-white border border-zinc-200 text-zinc-800 text-[11px] font-medium px-3 py-1.5 rounded-full active:bg-zinc-100"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {searchQuery.trim() && (
                  <div className="flex border-b border-zinc-200 mb-5">
                    <button 
                      onClick={() => setSearchMode("posts")} 
                      className={`flex-1 pb-2.5 text-xs font-bold transition-colors ${searchMode === "posts" ? "border-b-2 border-zinc-950 text-zinc-950" : "text-zinc-400"}`}
                    >
                      게시글 ({searchPostsResult.length})
                    </button>
                    <button 
                      onClick={() => setSearchMode("users")} 
                      className={`flex-1 pb-2.5 text-xs font-bold transition-colors ${searchMode === "users" ? "border-b-2 border-zinc-950 text-zinc-950" : "text-zinc-400"}`}
                    >
                      플레이터 ({searchUsersResult.length})
                    </button>
                  </div>
                )}

                <div>
                  {isSearching ? (
                    <div className="text-center py-10 text-xs text-zinc-400 flex items-center justify-center gap-1.5">
                      <i className="fa-solid fa-spinner animate-spin"></i> 검색 결과를 찾는 중...
                    </div>
                  ) : searchQuery.trim() ? (
                    searchMode === "posts" ? (
                      searchPostsResult.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {searchPostsResult.map(post => (
                            <div 
                              key={post.id} 
                              className="bg-white border border-zinc-200 rounded-lg overflow-hidden cursor-pointer active:scale-98 transition-transform"
                              onClick={() => handleRecipePostClick(post.id)}
                            >
                              <div className="aspect-[4/5] bg-zinc-100 overflow-hidden">
                                <img src={Array.isArray(post.image) ? post.image[0] : post.image} alt="" className="w-full h-full object-cover" />
                              </div>
                              <div className="p-2">
                                <strong className="text-xs text-zinc-950 block truncate">{post.title}</strong>
                                <span className="text-[10px] text-zinc-400 block truncate">{post.author}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-20 text-zinc-400 text-xs">검색 조건에 맞는 게시글이 없습니다.</div>
                      )
                    ) : (
                      searchUsersResult.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {searchUsersResult.map(user => (
                            <div 
                              key={user.uid} 
                              className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl cursor-pointer active:bg-zinc-50"
                              onClick={() => {
                                setActiveTab("userprofile");
                                setActiveUser(user.nickname);
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden border border-zinc-200 font-bold text-zinc-700 text-xs">
                                  {user.profileImage ? <img src={user.profileImage} alt="" className="w-full h-full object-cover" /> : user.nickname.slice(0, 1)}
                                </span>
                                <div>
                                  <strong className="text-xs text-zinc-950 block font-bold">{user.nickname}</strong>
                                  <span className="text-[10px] text-zinc-400 block mt-0.5">{user.bio}</span>
                                </div>
                              </div>
                              <i className="fa-solid fa-chevron-right text-zinc-300 text-xs mr-1"></i>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-20 text-zinc-400 text-xs">검색 조건에 맞는 플레이터가 없습니다.</div>
                      )
                    )
                  ) : (
                    <div className="text-center py-16 text-zinc-400 text-xs flex flex-col items-center gap-2">
                      <i className="fa-solid fa-magnifying-glass text-zinc-200 text-2xl block"></i>
                      음식 키워드나 궁금한 이웃 닉네임을 입력해 보세요.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 에타 스타일 익명 제거 커뮤니티 탭 */}
            {activeTab === "community" && (
              <CommunityView 
                communityPosts={communityPosts}
                onPostClick={handleCommunityPostClick}
                onOpenCommunityWrite={async () => {
                  await authReadyPromise;
                  await sessionSyncReadyPromise;
                  const user = auth.currentUser;
                  if (!user) {
                    setLoginOpen(true);
                    return;
                  }
                  if (window.flutter_inappwebview) {
                    isSelectingPhotos.current = true;
                    window.flutter_inappwebview.callHandler('openCustomGallery', { type: 'community' });
                  } else {
                    setActiveTab("community_write");
                  }
                }}
                onLikePost={handleLikeCommunityPost}
                onScrapPost={handleScrapCommunityPost}
                onAuthorClick={handleAuthorClick}
              />
            )}

            {activeTab === "community_detail" && activeComPostId && (
              <CommunityDetailView 
                activeComPostId={activeComPostId}
                communityPosts={communityPosts}
                onBack={() => {
                  setActiveTab("community");
                  setActiveComPostId(null);
                }}
                onLikePost={handleLikeCommunityPost}
                onDeletePost={handleDeleteCommunityPost}
                onEditPost={handleEditCommunityPost}
                onAddComment={handleAddCommunityComment}
                onEditComment={handleEditCommunityComment}
                onDeleteComment={handleDeleteCommunityComment}
                onScrapPost={handleScrapCommunityPost}
                currentUserName={profile.name}
                currentUserRole={profile.role || "user"}
                onAuthorClick={handleAuthorClick}
              />
            )}

            {activeTab === "community_write" && (
              <CommunityWriteView
                onBack={() => { setActiveTab("community"); setCommunityInitialImages([]); }}
                onAddPost={(newPost) => {
                  handleAddCommunityPost(newPost);
                  setActiveTab("community"); // 작성 성공 시 커뮤니티 피드로 이동
                  setCommunityInitialImages([]);
                }}
                currentUserName={profile.name}
                initialImages={communityInitialImages}
              />
            )}

            {activeTab === "mypage" && (
              <MyPage 
                posts={posts} 
                profile={profile} 
                setProfile={setProfile} 
                categories={categories}
                onCardClick={(post) => handleRecipePostClick(post.id)}
                followingList={followingList}
                creatorsData={creatorsData}
                onFollowToggle={handleFollowToggle}
                onAuthorClick={handleAuthorClick}
                onAdminCenterClick={() => window.open("/admin", "_blank")}
                onSettingsClick={() => setActiveTab("settings")}
                communityPosts={communityPosts}
                onCommunityCardClick={handleCommunityPostClick}
                onLikeCommunityPost={handleLikeCommunityPost}
                onScrapCommunityPost={handleScrapCommunityPost}
                auth={auth}
                db={db}
                firebase={firebase}
              />
            )}

            {activeTab === "settings" && (
              <SettingsView
                onBack={() => setActiveTab("mypage")}
                onLogout={handleLogout}
                onDeleteAccount={handleDeleteAccount}
              />
            )}

            {activeTab === "admin_reports" && profile.role === "admin" && (
              <AdminReportsView
                onBack={() => setActiveTab("mypage")}
              />
            )}

            {activeTab === "userprofile" && activeUser && (
              <UserProfileView 
                userName={activeUser}
                posts={posts}
                creatorInfo={creatorsData[activeUser] || { bio: "플레이팅 크리에이터입니다.", followersCount: 15, followingCount: 8, avatarImg: "" }}
                isFollowing={currentFollowing.includes(activeUser)}
                onFollowToggle={() => handleFollowToggle(activeUser)}
                onBack={() => setActiveTab("home")}
                onCardClick={(post) => handleRecipePostClick(post.id)}
              />
            )}
          </main>

          <nav className="bottom-nav">
            <button className={`bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
              <i className="fa-solid fa-house"></i>
              <span>홈</span>
            </button>
            <button className={`bottom-nav-item ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
              <i className="fa-solid fa-magnifying-glass"></i>
              <span>검색</span>
            </button>
            <button className="bottom-nav-item" onClick={handleWriteClick}>
              <i className="fa-solid fa-square-plus"></i>
              <span>글쓰기</span>
            </button>
            <button className={`bottom-nav-item ${(activeTab === 'community' || activeTab === 'community_detail') ? 'active' : ''}`} onClick={() => { setActiveTab('community'); setActiveComPostId(null); }}>
              <i className="fa-solid fa-comments"></i>
              <span>커뮤니티</span>
            </button>
            <button className={`bottom-nav-item ${activeTab === 'mypage' ? 'active' : ''}`} onClick={() => setActiveTab('mypage')}>
              <i className="fa-solid fa-user"></i>
              <span>마이페이지</span>
            </button>
          </nav>

          {activePostId && (
            <DetailModal 
              postId={activePostId}
              posts={posts}
              onClose={() => setActivePostId(null)} 
              onLike={() => handleLike(activePostId)}
              onScrap={() => handleScrap(activePostId)}
              onComment={handleComment}
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
              onTagClick={(tag) => {
                setActivePostId(null);
                handleTagClick(tag);
              }}
              onAuthorClick={() => handleAuthorClick(posts.find(p => p.id === activePostId)?.author)}
              onDeletePost={handleDeletePost}
              onEditPost={handleEditPost}
              currentUserName={profile.name}
              currentUserRole={profile.role || "user"}
            />
          )}

          {writeOpen && (
            <WriteSheet 
              onClose={() => { setWriteOpen(false); setWriteInitialImages([]); }} 
              onCreate={handleCreatePost} 
              initialImages={writeInitialImages}
            />
          )}

          {loginOpen && (
            <LoginModal 
              onClose={() => setLoginOpen(false)}
              onLogin={handleLogin}
              onRegister={handleRegister}
            />
          )}

          <CustomConfirmModal 
            isOpen={confirmState.isOpen}
            title={confirmState.title}
            message={confirmState.message}
            onConfirm={() => handleConfirmClose(true)}
            onCancel={() => handleConfirmClose(false)}
          />

          {reportModalData.isOpen && (
            <ReportModal 
              onClose={() => setReportModalData({ isOpen: false, targetType: "post", targetId: "", author: "", text: "", targetParentId: "" })}
              onSubmit={(reason, description) => {
                handleReport(
                  reportModalData.targetType,
                  reportModalData.targetId,
                  reason,
                  description,
                  reportModalData.targetParentId || ""
                );
                setReportModalData({ isOpen: false, targetType: "post", targetId: "", author: "", text: "", targetParentId: "" });
              }}
            />
          )}
        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  
export default App;
