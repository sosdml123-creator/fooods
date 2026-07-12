import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Login from "./views/Login";
import Dashboard from "./views/Dashboard";
import Users from "./views/Users";
import UserDetails from "./views/UserDetails";
import Reports from "./views/Reports";
import Posts from "./views/Posts";
import Comments from "./views/Comments";
import Photos from "./views/Photos";
import Blocks from "./views/Blocks";
import Notices from "./views/Notices";
import Push from "./views/Push";
import Statistics from "./views/Statistics";
import Logs from "./views/Logs";
import Admins from "./views/Admins";
import Settings from "./views/Settings";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState("dashboard"); // sidebar menu keys
  const [selectedUserId, setSelectedUserId] = useState(null); // for Detail Page navigation

  // Dark/Light Mode toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          const role = userDoc.exists() ? userDoc.data().role : null;
          // Whitelist admin check
          if (role === "admin" || currentUser.uid === "kGmi97Bh1XNapsvEymeaMl0X4AD3") {
            setUser(currentUser);
            setIsAdmin(true);
          } else {
            setUser(null);
            setIsAdmin(false);
            await auth.signOut();
            alert("관리자 권한이 없습니다.");
          }
        } catch (err) {
          console.error("Auth role check error:", err);
          setUser(null);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Callback to navigate to User Details Page
  const navigateToUserDetails = (uid) => {
    setSelectedUserId(uid);
    setCurrentView("user_details");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-[#0e1117]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  // Not logged in or not verified as admin -> Show Login View
  if (!user || !isAdmin) {
    return <Login />;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-[#0e1117] text-zinc-900 dark:text-[#c9d1d9]">
      {/* Sidebar (Desktop optimize layout) */}
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      {/* Main content body */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header 
          darkMode={darkMode} 
          setDarkMode={setDarkMode} 
          user={user} 
          currentView={currentView}
        />
        
        <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          {currentView === "dashboard" && <Dashboard navigateToUser={navigateToUserDetails} />}
          {currentView === "users" && <Users navigateToUser={navigateToUserDetails} />}
          {currentView === "user_details" && <UserDetails uid={selectedUserId} onBack={() => setCurrentView("users")} />}
          {currentView === "reports" && <Reports navigateToUser={navigateToUserDetails} />}
          {currentView === "posts" && <Posts navigateToUser={navigateToUserDetails} />}
          {currentView === "comments" && <Comments navigateToUser={navigateToUserDetails} />}
          {currentView === "photos" && <Photos />}
          {currentView === "blocks" && <Blocks />}
          {currentView === "notices" && <Notices />}
          {currentView === "push" && <Push />}
          {currentView === "statistics" && <Statistics />}
          {currentView === "logs" && <Logs />}
          {currentView === "admins" && <Admins />}
          {currentView === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
