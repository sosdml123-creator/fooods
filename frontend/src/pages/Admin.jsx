import React, { useState, useEffect } from 'react';

function AdminReportsView({ 
  onBack, 
  db, 
  auth, 
  firebase, 
  API_URL, 
  initialCreatorsData 
}) {
  const [adminTab, setAdminTab] = useState("dashboard"); // dashboard, reports, users, posts, comments, stats
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [comPosts, setComPosts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [reportSubTab, setReportSubTab] = useState("waiting"); // waiting, completed
  const [viewingPost, setViewingPost] = useState(null); // Post details modal
  
  const [stats, setStats] = useState({
    todayReports: 0,
    totalPosts: 0,
    totalMembers: 0,
    todayRegistrations: 0,
    todayPosts: 0,
    todayComments: 0
  });

  useEffect(() => {
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
  }, [db]);

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    
    const todayReps = reports.filter(r => r.createdAt && r.createdAt.startsWith(todayStr)).length;
    const totalMems = users.length;
    const todayRegs = users.filter(u => u.registeredAt && u.registeredAt.startsWith(todayStr)).length;
    const totalP = posts.length + comPosts.length;
    const todayP = posts.filter(p => p.createdAt && p.createdAt.startsWith(todayStr)).length + 
                   comPosts.filter(p => p.createdAt && p.createdAt.startsWith(todayStr)).length;

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
      <div className="admin-header">
        <button className="text-zinc-500 text-xs py-1.5 active:scale-95 transition-transform" onClick={onBack}>
          <i className="fa-solid fa-chevron-left mr-1"></i> 마이페이지
        </button>
        <h1 className="text-sm font-bold text-zinc-950 flex items-center gap-1.5">
          🛡️ 플레이터 관리자 센터
        </h1>
      </div>

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

            </div>
          )}

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
                          <span className="text-[10px] text-zinc-450">{new Date(g.createdAt).toLocaleDateString()}</span>
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
                    <span className="text-[10px] text-zinc-405 block mt-0.5 truncate">{u.email || "(이메일 없음)"}</span>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button className="admin-btn secondary py-1.5" onClick={() => handleToggleMemberRole(u.uid, u.role)}>권한변경</button>
                    <button className="admin-btn danger py-1.5" onClick={() => handleDeleteMember(u.uid)}>탈퇴</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === "posts" && (
            <div className="animate-fade-in flex flex-col gap-3">
              <div className="text-[10px] text-zinc-400 font-bold mb-1">전체 글: {posts.length + comPosts.length}개</div>
              
              <div>
                <h3 className="text-xs font-bold text-zinc-950 mb-2">💬 커뮤니티 게시글</h3>
                <div className="flex flex-col gap-2.5">
                  {comPosts.map(p => (
                    <div key={p.id} className="admin-glass-card flex justify-between items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] bg-zinc-100 text-zinc-650 px-2 py-0.5 rounded font-bold">{p.category}</span>
                        <h4 className="text-xs font-bold text-zinc-950 truncate mt-1">{p.title}</h4>
                        <p className="text-[10px] text-zinc-505 truncate mt-0.5">{p.body}</p>
                      </div>
                      <button className="admin-btn danger py-1.5 flex-shrink-0" onClick={() => handleDeleteContent(p.id, "post", "")}>삭제</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <h3 className="text-xs font-bold text-zinc-950 mb-2">🍳 레시피 피드 게시글</h3>
                <div className="flex flex-col gap-2.5">
                  {posts.map(p => (
                    <div key={p.id} className="admin-glass-card flex justify-between items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold border border-amber-100">레시피</span>
                        <h4 className="text-xs font-bold text-zinc-950 truncate mt-1">{p.title}</h4>
                        <p className="text-[10px] text-zinc-505 truncate mt-0.5">{p.description}</p>
                      </div>
                      <button className="admin-btn danger py-1.5 flex-shrink-0" onClick={() => handleDeleteContent(p.id, "post", "")}>삭제</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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
                        <span className="text-[9px] text-zinc-450">{new Date(c.createdAt || "").toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-zinc-705 mt-1 leading-relaxed">{c.text}</p>
                    </div>
                    <button className="admin-btn danger py-1.5 flex-shrink-0" onClick={() => handleDeleteContent(c.id, "comment", c.postId)}>삭제</button>
                  </div>
                ))
              )}
            </div>
          )}

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
                        <div className="text-[10px] text-zinc-650 flex justify-between mb-1">
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
              <span className="text-[10px] bg-zinc-100 text-zinc-655 px-2 py-0.5 rounded font-bold">{viewingPost.category || "레시피"}</span>
              <h4 className="text-sm font-bold text-zinc-950 mt-1.5">{viewingPost.title}</h4>
              <p className="text-xs text-zinc-655 mt-2 whitespace-pre-wrap leading-relaxed">{viewingPost.body || viewingPost.description}</p>
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

export default AdminReportsView;
