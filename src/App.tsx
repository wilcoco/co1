import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ContentCreatePage from './pages/ContentCreatePage';
import ContentListPage from './pages/ContentListPage';
import MyContentPage from './pages/MyContentPage';
import MyInvestmentsPage from './pages/MyInvestmentsPage';
import ApprovalRequestsPage from './pages/ApprovalRequestsPage';
import ContentDetailPage from './pages/ContentDetailPage';
import HashComparePage from './pages/HashComparePage';
import { auth } from './firebase';

const useAuth = () => {
  const [user, setUser] = React.useState(() => auth.currentUser);
  React.useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return () => unsub();
  }, []);
  return user;
};

const App: React.FC = () => {
  const user = useAuth();
  return (
    <Router>
      <nav style={{ padding: 16, borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link to="/" style={{ marginRight: 16 }}>전체 컨텐츠</Link>
          {user && <Link to="/create" style={{ marginRight: 16 }}>컨텐츠 생성</Link>}
          {user && <Link to="/my" style={{ marginRight: 16 }}>내 컨텐츠</Link>}
          {user && <Link to="/my-invest" style={{ marginRight: 16 }}>나의 내역</Link>}
          {user && <Link to="/approval-requests" style={{ marginRight: 16 }}>승인 요청</Link>}
          {user && <Link to="/hash-compare" style={{ marginRight: 16 }}>예상 해시 비교</Link>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {user ? (
            <button onClick={() => auth.signOut()}>로그아웃</button>
          ) : (
            <Link to="/login">로그인/회원가입</Link>
          )}
          <span style={{ marginLeft: 16, color: '#888', fontWeight: 700, fontSize: 16 }}>버전 1.3</span>
        </div>
      </nav>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ContentListPage />} />
        <Route path="/create" element={user ? <ContentCreatePage /> : <Navigate to="/login" />} />
        <Route path="/my" element={user ? <MyContentPage /> : <Navigate to="/login" />} />
        <Route path="/my-invest" element={user ? <MyInvestmentsPage /> : <Navigate to="/login" />} />
        <Route path="/approval-requests" element={user ? <ApprovalRequestsPage /> : <Navigate to="/login" />} />
        <Route path="/content/:id" element={<ContentDetailPage />} />
        <Route path="/hash-compare" element={user ? <HashComparePage /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
};

export default App;
