import React from 'react';
import PostCard from '../components/PostCard';

function Home({ 
  categories, 
  selectedCategory, 
  setSelectedCategory, 
  filteredPosts, 
  handleLike, 
  handleRecipePostClick, 
  handleAuthorClick 
}) {
  return (
    <>
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

      <div className="masonry-feed px-4 pt-4 pb-24">
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
    </>
  );
}

export default Home;
