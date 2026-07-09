import React from 'react';

function PostCard({ post, onLike, onCardClick, onAuthorClick }) {
  const hasMultipleImages = Array.isArray(post.image);
  const thumbnail = hasMultipleImages ? post.image[0] : post.image;

  let badgeText = "";
  let badgeType = "";

  if (post.category === "레시피") {
    badgeText = "레시피";
    badgeType = "recipe";
  } else if (post.category === "맛집") {
    badgeText = "맛집리뷰";
    badgeType = "shop";
  } else if (post.productLinks && post.productLinks.length > 0) {
    badgeText = "최저가 링크";
    badgeType = "shop";
  }

  return (
    <article className="feed-card" onClick={onCardClick}>
      <div className="feed-card-image-wrapper">
        {badgeText && (
          <span className={`feed-badge ${badgeType}`}>{badgeText}</span>
        )}
        <img 
          className="feed-card-image" 
          src={thumbnail} 
          alt={post.title} 
          loading="lazy" 
        />
      </div>

      <div className="feed-card-content">
        <h3 className="feed-card-title">{post.title}</h3>
        
        <div className="feed-card-meta" onClick={(e) => e.stopPropagation()}>
          <div className="feed-card-author cursor-pointer" onClick={onAuthorClick}>
            <span className="feed-card-avatar overflow-hidden">
              {post.avatarImg ? (
                <img src={post.avatarImg} alt="" className="w-full h-full object-cover" />
              ) : (
                post.author ? post.author.slice(0, 1) : "P"
              )}
            </span>
            <span className="feed-card-author-name">{post.author}</span>
          </div>

          <div className="feed-card-stats">
            <span className={post.liked ? "text-zinc-950 font-bold" : ""} onClick={onLike} style={{ cursor: "pointer" }}>
              <i className={post.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}></i>
              {post.likeCount || 0}
            </span>
            <span>
              <i className="fa-regular fa-comment"></i>
              {(post.comments || []).length}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default PostCard;
