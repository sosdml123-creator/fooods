import React, { useState, useRef } from 'react';

function MyPage({ 
  posts, 
  profile, 
  setProfile, 
  categories, 
  onCardClick, 
  followingList = [], 
  creatorsData = {}, 
  onFollowToggle, 
  onAuthorClick, 
  onAdminCenterClick, 
  onSettingsClick, 
  communityPosts = [], 
  onCommunityCardClick, 
  onLikeCommunityPost, 
  onScrapCommunityPost,
  initialCreatorsData,
  API_URL,
  auth,
  db,
  firebase
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editBio, setEditBio] = useState(profile.bio);
  const [editPhoto, setEditPhoto] = useState(profile.avatarImg || "");
  const fileInputRef = useRef(null);
  
  const [myTab, setMyTab] = useState("posts");
  const [myCategory, setMyCategory] = useState("전체");
  const [scrapSubTab, setScrapSubTab] = useState("recipe"); // "recipe" or "community"
  const [followModal, setFollowModal] = useState(null); // null, "followers", or "following"
  const mockFollowers = ["카페투어러", "푸드스타일리스트"];

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

  async function handleSave() {
    const targetName = editName.trim();
    if (!targetName) return;

    let token = "";
    if (auth && auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch (tokenErr) {
        console.error("Failed to retrieve Firebase ID Token:", tokenErr);
      }
    }

    fetch("/api/v1/users/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        nickname: targetName,
        bio: editBio.trim(),
        avatarImg: editPhoto
      })
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
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
              <span className="w-16 h-16 rounded-full border-2 border-white shadow-md overflow-hidden bg-zinc-200 flex-shrink-0 flex items-center justify-center text-zinc-800 text-xl font-bold">
                {profile.avatarImg ? <img src={profile.avatarImg} alt="" className="w-full h-full object-cover" /> : profile.avatar}
              </span>
              
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

            <div className="flex justify-around items-center mt-5 mb-1 px-2">
              <div className="flex flex-col items-center">
                <span className="text-lg font-black text-zinc-950 leading-none">{myPosts.length}</span>
                <span className="text-[10px] text-zinc-450 font-bold mt-2">게시물</span>
              </div>
              <div className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform" onClick={() => setFollowModal("followers")}>
                <span className="text-lg font-black text-zinc-950 leading-none">{mockFollowers.length}</span>
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
          <h2>카테고리별 글 보기</h2>
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
                      <span className="text-[10px] text-zinc-450 block truncate">{post.author}</span>
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
                              post.author ? post.author.slice(0, 1) : "P"
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
                            {post.likeCount || 0}
                          </span>
                          <span>
                            <i className="fa-regular fa-comment"></i>
                            {(post.comments || []).length}
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
              <h2>{followModal === "followers" ? "팔로워" : "팔로잉"}</h2>
              <button type="button" onClick={() => setFollowModal(null)}>×</button>
            </header>
            <div className="py-2 max-h-[350px] overflow-y-auto no-scrollbar">
              {(() => {
                const list = followModal === "followers" ? mockFollowers : followingList;
                if (!list || list.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-400 text-xs">
                      {followModal === "followers" ? "팔로워가 없습니다." : "팔로잉하는 사용자가 없습니다."}
                    </div>
                  );
                }
                return list.map(username => {
                  const userData = creatorsData[username] || { 
                    bio: "플레이팅 크리에이터입니다.", 
                    avatarImg: "" 
                  };
                  const isFollowing = followingList.includes(username);
                  return (
                    <div key={username} className="flex items-center justify-between py-2.5 border-b border-zinc-100 last:border-none">
                      <div 
                        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                        onClick={() => {
                          setFollowModal(null);
                          onAuthorClick(username);
                        }}
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
                          <span className="text-[10px] text-zinc-450 block truncate mt-0.5">{userData.bio}</span>
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
              })()}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default MyPage;
