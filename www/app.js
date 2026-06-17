const { useState, useEffect } = React;

// 템플릿 이미지 (Unsplash 무채색/감성 요리 이미지 모음)
const fallbackImages = [
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=800",
  "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&q=80&w=800",
  "https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&q=80&w=800"
];

const categories = ["전체", "레시피", "디저트", "주방리뷰", "맛집"];

// 더미 링크 미리보기 데이터베이스 (유저가 쿠팡 등 링크를 넣었을 때 자동으로 예쁜 카드를 만들어주는 모의 DB)
const mockProductDatabase = [
  {
    domain: "coupang.com",
    title: "유기농 압착 올리브유 500ml (엑스트라 버진)",
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=200",
    host: "coupang.com"
  },
  {
    domain: "smartstore.naver.com",
    title: "무쇠 미니 프라이팬 20cm (인덕션 겸용)",
    image: "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&q=80&w=200",
    host: "smartstore.naver.com"
  },
  {
    domain: "kurly.com",
    title: "무항생제 신선란 10구 (1등급)",
    image: "https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?auto=format&fit=crop&q=80&w=200",
    host: "kurly.com"
  }
];

// 기본 초기 게시글 데이터
const defaultPosts = [
  {
    id: "1",
    author: "푸드스타일리스트",
    title: "미니멀 주방에서 만드는 감성 바질 파스타",
    body: "오늘 아침에는 직접 기른 바질로 페스토를 만들고, 엑스트라 버진 올리브유를 듬뿍 둘러 파스타를 요리해봤습니다. 무채색으로 정돈된 주방에서 만드는 요리는 늘 마음을 차분하게 해주네요. 제가 쓴 올리브유와 팬 정보는 하단에 달아둘게요!",
    category: "레시피",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800",
    tags: ["#파스타", "#바질페스토", "#미니멀라이프", "#감성요리"],
    likeCount: 42,
    liked: false,
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
      },
      {
        id: "l2",
        title: "무쇠 미니 프라이팬 20cm (인덕션 겸용)",
        image: "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&q=80&w=200",
        url: "https://smartstore.naver.com/kitchen/products/6789",
        host: "smartstore.naver.com"
      }
    ]
  },
  {
    id: "2",
    author: "쿠킹클래스",
    title: "겉바속촉 감성 스콘 구우실 때 꿀팁!",
    body: "오븐을 예열할 때 주방용 온도계를 꼭 사용하세요. 생각보다 오븐 내부 오차가 크거든요. 200도에서 15분 바싹 구워낸 스콘에 버터 한 조각 올리면 홈카페 완성입니다. 제가 사용하는 미니 오븐 온도계 구매처입니다.",
    category: "디저트",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=800",
    tags: ["#베이킹", "#스콘", "#오븐온도계", "#디저트"],
    likeCount: 28,
    liked: false,
    comments: [],
    productLinks: [
      {
        id: "l3",
        title: "무항생제 신선란 10구 (1등급)",
        image: "https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?auto=format&fit=crop&q=80&w=200",
        url: "https://kurly.com/goods/5678",
        host: "kurly.com"
      }
    ]
  }
];

function App() {
  const [posts, setPosts] = useState(() => {
    const saved = localStorage.getItem("foodhouse_posts");
    return saved ? JSON.parse(saved) : defaultPosts;
  });
  const [activeTab, setActiveTab] = useState("home"); // home, write, mypage
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [writeOpen, setWriteOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("foodhouse_logged_in") === "true";
  });

  useEffect(() => {
    localStorage.setItem("foodhouse_posts", JSON.stringify(posts));
  }, [posts]);

  // 글쓰기 시트 열기 제어 (비전공자용 카카오 로그인 연동 안내 포함)
  function handleWriteClick() {
    if (!isLoggedIn) {
      setLoginOpen(true);
    } else {
      setWriteOpen(true);
    }
  }

  // 로그인 모의 처리
  function handleLogin(type) {
    if (type === "kakao") {
      alert("카카오 로그인 연동 시뮬레이션: 추후 카카오 개발자 콘솔에서 발급한 JavaScript SDK 키를 연동하면 실서버 계정 로그인이 활성화됩니다.");
    }
    setIsLoggedIn(true);
    localStorage.setItem("foodhouse_logged_in", "true");
    setLoginOpen(false);
    setWriteOpen(true);
  }

  function handleLogout() {
    setIsLoggedIn(false);
    localStorage.removeItem("foodhouse_logged_in");
    alert("로그아웃 되었습니다.");
  }

  function handleCreatePost(newPostData) {
    const newPost = {
      id: crypto.randomUUID(),
      author: "나",
      likeCount: 0,
      liked: false,
      comments: [],
      ...newPostData
    };
    setPosts([newPost, ...posts]);
    setWriteOpen(false);
    setActiveTab("home");
  }

  function handleLike(id) {
    setPosts(posts.map(post => {
      if (post.id === id) {
        return {
          ...post,
          liked: !post.liked,
          likeCount: post.liked ? post.likeCount - 1 : post.likeCount + 1
        };
      }
      return post;
    }));
  }

  function handleComment(postId, text) {
    setPosts(posts.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          comments: [...post.comments, { id: crypto.randomUUID(), author: "나", text }]
        };
      }
      return post;
    }));
  }

  const filteredPosts = selectedCategory === "전체" 
    ? posts 
    : posts.filter(post => post.category === selectedCategory);

  return (
    <div className="app-container">
      {/* 상단 광고 배너 (수익 모델: 플랫폼용 구글 애드센스 홀더) */}
      <AdBanner />

      {/* 헤더 */}
      <header className="app-header">
        <h1>PLAYTING</h1>
        {isLoggedIn ? (
          <button className="text-xs font-semibold text-zinc-400" onClick={handleLogout}>로그아웃</button>
        ) : (
          <button className="text-xs font-semibold text-zinc-900 border border-zinc-200 px-3 py-1.5 rounded-full active:bg-zinc-100" onClick={() => setLoginOpen(true)}>로그인</button>
        )}
      </header>

      {/* 카테고리 필터 (홈 탭일 때만 활성화) */}
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

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 overflow-y-auto no-scrollbar">
        {activeTab === "home" && (
          <div className="main-feed">
            {filteredPosts.length > 0 ? (
              filteredPosts.map(post => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  onLike={() => handleLike(post.id)}
                  onComment={(text) => handleComment(post.id, text)}
                />
              ))
            ) : (
              <div className="text-center py-20 text-zinc-400 text-sm">등록된 글이 없습니다.</div>
            )}
          </div>
        )}

        {activeTab === "mypage" && (
          <MyPage posts={posts} />
        )}
      </main>

      {/* 하단 내비게이션 바 */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <i className="fa-solid fa-house"></i>
          <span>홈</span>
        </button>
        <button className="bottom-nav-item" onClick={handleWriteClick}>
          <i className="fa-solid fa-square-plus"></i>
          <span>글쓰기</span>
        </button>
        <button className={`bottom-nav-item ${activeTab === 'mypage' ? 'active' : ''}`} onClick={() => setActiveTab('mypage')}>
          <i className="fa-solid fa-user"></i>
          <span>마이페이지</span>
        </button>
        <button className="bottom-nav-item" onClick={() => alert("광고 문의: sosdml123@naver.com\n배너 클릭 시 광고 사이트로 이동합니다.")}>
          <i className="fa-solid fa-rectangle-ad"></i>
          <span>제휴안내</span>
        </button>
      </nav>

      {/* 글쓰기 모달 시트 */}
      {writeOpen && (
        <WriteSheet 
          onClose={() => setWriteOpen(false)} 
          onCreate={handleCreatePost} 
        />
      )}

      {/* 로그인 모달 */}
      {loginOpen && (
        <LoginModal 
          onClose={() => setLoginOpen(false)}
          onLogin={handleLogin}
        />
      )}
    </div>
  );
}

// 1. 구글 애드센스 연동을 염두에 둔 무채색 광고 배너
function AdBanner() {
  return (
    <div className="ad-banner cursor-pointer" onClick={() => alert("구글 애드센스 승인 후 광고 스크립트(ins 태그)를 이곳에 삽입하여 수익을 창출합니다.")}>
      <div className="text-xs font-semibold text-zinc-950">🍳 요리할 때 필수! 감성 타이머 특가 할인 중</div>
      <div className="text-[10px] text-zinc-400">sponsored by Plating Partner</div>
    </div>
  );
}

// 2. 포스트 카드 컴포넌트
function PostCard({ post, onLike, onComment }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    onComment(commentText.trim());
    setCommentText("");
  }

  function handleShare() {
    alert("링크가 복사되었습니다. (쿠팡 파트너스 링크가 내장된 게시물입니다)");
  }

  return (
    <article className="post-card">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="w-6 height-6 rounded-full bg-zinc-200 text-zinc-700 font-bold text-[10px] flex items-center justify-center">
          {post.author.slice(0, 1)}
        </span>
        <span className="text-xs font-bold text-zinc-800">{post.author}</span>
      </div>

      <div className="post-image-wrapper">
        <img className="post-image" src={post.image} alt={post.title} />
      </div>

      <div className="post-body">
        <h2>{post.title}</h2>
        <p>{post.body}</p>
        
        <div className="tag-row">
          {post.tags.map(tag => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
        </div>

        {/* 오늘의집 핵심: 크리에이터의 수익 링크 리스트 */}
        {post.productLinks && post.productLinks.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
              <i className="fa-solid fa-link mr-1"></i> 크리에이터 추천 아이템
            </div>
            <div className="link-list">
              {post.productLinks.map((link, idx) => (
                <ProductPreview key={idx} link={link} creator={post.author} />
              ))}
            </div>
          </div>
        )}

        <div className="actions">
          <button className={post.liked ? "active" : ""} onClick={onLike}>
            <i className={post.liked ? "fa-solid fa-heart" : "fa-fr fa-heart"}></i>
            좋아요 {post.likeCount}
          </button>
          <button onClick={() => setCommentsOpen(!commentsOpen)}>
            <i className="fa-regular fa-comment"></i>
            댓글 {post.comments.length}
          </button>
          <button onClick={handleShare}>
            <i className="fa-regular fa-share-from-square"></i>
            공유
          </button>
        </div>

        {commentsOpen && (
          <section className="comment-area">
            {post.comments.map(c => (
              <p className="comment" key={c.id}>
                <strong>{c.author}</strong> {c.text}
              </p>
            ))}
            <form className="comment-form" onSubmit={submitComment}>
              <input 
                value={commentText} 
                onChange={(e) => setCommentText(e.target.value)} 
                placeholder="댓글로 소통해보세요..." 
              />
              <button type="submit">등록</button>
            </form>
          </section>
        )}
      </div>
    </article>
  );
}

// 3. 크리에이터 어필리에이트 상품 프리뷰 컴포넌트
function ProductPreview({ link, creator }) {
  return (
    <div className="flex flex-col gap-1">
      <a className="product-preview" href={link.url} target="_blank" rel="noopener noreferrer">
        <img src={link.image} alt="" />
        <div>
          <strong>{link.title}</strong>
          <p>{link.url}</p>
          <small>{link.host}</small>
        </div>
      </a>
      <span className="text-[9px] text-zinc-400 px-1">
        * 구매 시 크리에이터 [{creator}] 님에게 제휴 수수료가 적립됩니다.
      </span>
    </div>
  );
}

// 4. 마이페이지 컴포넌트
function MyPage({ posts }) {
  const myPosts = posts.filter(post => post.author === "나");
  const totalLikes = myPosts.reduce((sum, post) => sum + post.likeCount, 0);
  const totalComments = myPosts.reduce((sum, post) => sum + post.comments.length, 0);

  return (
    <section className="my-page">
      <div className="my-card">
        <div className="my-profile">
          <span className="avatar">나</span>
          <div>
            <h2>나의 플레이팅</h2>
            <p>레시피와 쿠팡파트너스 수익링크를 관리합니다.</p>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <strong>{myPosts.length}</strong>
            <span>게시글</span>
          </div>
          <div className="stat">
            <strong>{totalLikes}</strong>
            <span>받은 좋아요</span>
          </div>
          <div className="stat">
            <strong>{totalComments}</strong>
            <span>댓글 피드백</span>
          </div>
        </div>
      </div>

      <div className="my-card">
        <h2>내가 작성한 글 목록</h2>
        <div className="my-list">
          {myPosts.length > 0 ? (
            myPosts.map(post => (
              <div className="my-item" key={post.id}>
                <img src={post.image} alt="" />
                <div>
                  <strong>{post.title}</strong>
                  <span>{post.category} · 등록 링크 {post.productLinks.length}개</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-zinc-400 text-center py-6">아직 작성한 포스팅이 없습니다.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// 5. 글쓰기 시트 컴포넌트 (모의 링크 파서 기능 고도화)
function WriteSheet({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("레시피");
  const [links, setLinks] = useState([{ id: crypto.randomUUID(), url: "" }]);
  const [loading, setLoading] = useState(false);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  }

  // 사용자가 입력한 상품 URL 분석 및 모의 메타데이터 자동 추출 기능
  async function resolveLinkPreviews() {
    return links
      .filter(l => l.url.trim() !== "")
      .map(l => {
        const urlStr = l.url.trim();
        let matched = mockProductDatabase.find(db => urlStr.includes(db.domain));
        
        // 데이터베이스에 없는 새로운 주소인 경우 기본 정보 자동 추출 매핑
        if (!matched) {
          let host = "web";
          try {
            host = new URL(urlStr).hostname;
          } catch(e) {}
          matched = {
            domain: host,
            title: `추천 주방 아이템 (${host})`,
            image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&q=80&w=200",
            host: host
          };
        }
        return {
          id: crypto.randomUUID(),
          url: urlStr,
          ...matched
        };
      });
  }

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setLoading(true);

    const productLinks = await resolveLinkPreviews();
    
    setLoading(false);
    onCreate({
      title: title.trim(),
      body: body.trim(),
      category,
      image: image || fallbackImages[Math.floor(Math.random() * fallbackImages.length)],
      tags: tags.split(/\s+/).map(tag => tag.trim()).filter(Boolean).map(tag => tag.startsWith("#") ? tag : `#${tag}`),
      productLinks
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
          <label>
            카테고리 선택
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.filter(c => c !== "전체").map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            포스팅 제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 입력해 주세요" required />
          </label>
          <label>
            이야기 / 레시피 내용
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="오늘 한 요리의 이야기나 꿀팁 레시피를 적어보세요" required />
          </label>
          <label>
            음식 사진 추가
            <input type="file" accept="image/*" onChange={handlePhoto} />
            {image && <img className="photo-preview" src={image} alt="미리보기" />}
          </label>
          <label>
            해시태그
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="스페이스바로 구분 예: #레시피 #바질" />
          </label>

          <div className="link-editor-list">
            <div className="text-xs font-bold text-zinc-500 mb-2">
              <i className="fa-solid fa-cart-shopping mr-1"></i> 소개된 재료/도구 구매 링크 (쿠팡 파트너스 등)
            </div>
            {links.map((link, idx) => (
              <div className="link-editor" key={link.id}>
                <label className="mb-1">
                  구매 링크 #{idx + 1}
                  <input 
                    type="url" 
                    value={link.url} 
                    onChange={(e) => setLinks(links.map(item => item.id === link.id ? { ...item, url: e.target.value } : item))} 
                    placeholder="https://... 상품 링크 주소 입력" 
                  />
                </label>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-400">도메인 자동 감지: coupang.com / kurly.com 등</span>
                  <button className="secondary px-2 py-1 text-[11px] rounded" type="button" onClick={() => setLinks(links.filter(item => item.id !== link.id))}>삭제</button>
                </div>
              </div>
            ))}
          </div>

          <button className="secondary full border border-dashed" type="button" onClick={() => setLinks([...links, { id: crypto.randomUUID(), url: "" }])}>
            + 구매 상품 링크 추가
          </button>
          <button className="primary full mt-4" type="submit" disabled={loading}>
            {loading ? "처리 중..." : "글 등록 및 제휴 링크 연동"}
          </button>
        </form>
      </section>
    </div>
  );
}

// 6. 카카오 로그인 모의 모달 (카카오 연동 가이드 포함)
function LoginModal({ onClose, onLogin }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>간편 로그인</h2>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="text-center py-4">
          <p className="text-sm text-zinc-800 font-bold mb-1">플레이팅에 오신 것을 환영합니다</p>
          <p className="text-xs text-zinc-400 mb-6">글쓰기와 링크 수익 창출은 로그인 후 사용 가능합니다.</p>
          
          {/* 카카오 로그인 데모 버튼 */}
          <button className="full kakao-btn mb-3" onClick={() => onLogin("kakao")}>
            <i className="fa-solid fa-comment text-zinc-950"></i> 카카오로 시작하기
          </button>
          
          <div className="mt-8 text-left bg-zinc-50 p-3 rounded-lg border border-zinc-200 text-[11px] text-zinc-500 leading-relaxed">
            <span className="font-bold text-zinc-700 block mb-1">💡 비전공자 운영자 팁 (카카오 로그인 구현 방법)</span>
            향후 모바일 및 실배포 시에는 카카오 디벨로퍼스(developers.kakao.com)에서 애플리케이션 등록 후, 
            발급된 REST API 키와 JavaScript 키를 `app.js`에 주입하면 실제 카카오 로그인 인증창이 작동하게 됩니다.
          </div>
        </div>
      </section>
    </div>
  );
}

// 리액트 DOM 마운트
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
