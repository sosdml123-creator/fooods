import React, { useState, useEffect } from 'react';

// 커뮤니티 자유 게시글 리스트 뷰
export function CommunityView({ 
  communityPosts, 
  onPostClick, 
  onOpenCommunityWrite, 
  onLikePost, 
  onScrapPost, 
  onAuthorClick,
  CommunityRulesModal
}) {
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

      {CommunityRulesModal && (
        <CommunityRulesModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />
      )}

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
                        post.author ? post.author.slice(0, 1) : "P"
                      )}
                    </span>
                    <span className="everytime-author hover:underline font-bold">{post.author}</span>
                  </div>
                  {badge && (
                    <span className={`everytime-badge ${badge.type}`}>{badge.text}</span>
                  )}
                </div>

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

                <div className="everytime-meta" onClick={(e) => e.stopPropagation()}>
                  <div className="everytime-actions">
                    <span 
                      className={`cursor-pointer ${post.liked ? 'text-red-500 font-semibold' : ''}`}
                      onClick={() => onLikePost(post.id)}
                    >
                      <i className={post.liked ? "fa-solid fa-heart text-red-500" : "fa-regular fa-heart"}></i>
                      <span style={{marginLeft:'3px'}}>{post.likeCount || 0}</span>
                    </span>
                    <span>
                      <i className="fa-regular fa-comment"></i>
                      <span style={{marginLeft:'3px'}}>{(post.comments || []).length}</span>
                    </span>
                    <span 
                      className={`cursor-pointer ${post.scrapped ? 'text-zinc-950 font-bold' : ''}`}
                      onClick={() => onScrapPost(post.id)}
                    >
                      <i className={post.scrapped ? "fa-solid fa-bookmark text-zinc-950" : "fa-regular fa-bookmark"}></i>
                      <span style={{marginLeft:'3px'}}>{post.scrapped ? "스크랩됨" : "스크랩"}</span>
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

// 커뮤니티 상세 및 댓글 관리 뷰
export function CommunityDetailView({ 
  activeComPostId, 
  communityPosts, 
  onBack, 
  onLikePost, 
  onDeletePost, 
  onEditPost, 
  onAddComment, 
  onEditComment, 
  onDeleteComment, 
  onScrapPost, 
  currentUserName, 
  currentUserRole, 
  onAuthorClick,
  ImageCarousel,
  db,
  generateId
}) {
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

        {post.image && post.image.length > 0 && !isEditingCom && (
          <div className="rounded-lg overflow-hidden aspect-[4/5] bg-zinc-100 mb-4 max-h-[400px]">
            {post.image.length > 1 && ImageCarousel ? (
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

        <div className="flex justify-between items-center text-xs text-zinc-400 border-t border-zinc-100 pt-3 mt-3">
          <div className="flex items-center gap-2">
            <span>조회 {(post.viewCount || 0).toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            <button 
              className={`border rounded-full px-3 py-1 flex items-center gap-1 active:scale-95 transition-transform ${post.liked ? 'border-zinc-950 bg-zinc-950 text-white font-bold' : 'border-zinc-200 text-zinc-500 bg-white'}`}
              onClick={() => onLikePost(post.id)}
            >
              <i className={post.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}></i> 공감 {post.likeCount}
            </button>
            <button 
              className={`border rounded-full px-3 py-1 flex items-center gap-1 active:scale-95 transition-transform ${post.scrapped ? 'border-zinc-950 bg-zinc-950 text-white font-bold' : 'border-zinc-200 text-zinc-500 bg-white'}`}
              onClick={() => onScrapPost(post.id)}
            >
              <i className={post.scrapped ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"}></i> 스크랩
            </button>
          </div>
        </div>
      </div>

      <div className="community-detail-card">
        <span className="text-xs font-bold text-zinc-800 block mb-2">댓글 ({(post.comments || []).length})</span>
        <div className="flex flex-col gap-1 mb-4 divide-y divide-zinc-50">
          {(post.comments || []).map(c => {
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

                {c.replies && c.replies.length > 0 && (
                  <div style={{marginLeft:'14px', borderLeft:'2px solid #f1f1f1', paddingLeft:'10px', marginTop:'6px'}} className="flex flex-col gap-2">
                    {c.replies.map(r => (
                      <div key={r.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <i className="fa-solid fa-turn-up fa-flip-horizontal text-zinc-300" style={{fontSize:'9px'}}></i>
                          <span className="text-[11px] font-bold text-zinc-700 cursor-pointer hover:underline" onClick={() => onAuthorClick(r.author)}>{r.author}</span>
                        </div>
                        <p className="text-xs text-zinc-650" style={{marginLeft:'14px'}}>{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

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
