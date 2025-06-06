import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // 회원가입 시 1000 캐시 지급
        const { user } = cred;
        const { getFirestore, doc, setDoc } = await import('firebase/firestore');
        const db = getFirestore();
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || '',
          cash: 1000,
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 구글 로그인 핸들러
  const handleGoogleLogin = async () => {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      // 구글 로그인 시 users 문서 없으면 cash: 1000으로 생성
      const { user } = result;
      const { getFirestore, doc, getDoc, setDoc } = await import('firebase/firestore');
      const db = getFirestore();
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || '',
          cash: 1000,
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: 'auto', padding: 40 }}>
      <h2>{isRegister ? '회원가입' : '로그인'}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12 }}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12 }}
        />
        <button type="submit" style={{ width: '100%' }}>
          {isRegister ? '회원가입' : '로그인'}
        </button>
      </form>
      <button onClick={handleGoogleLogin} style={{ width: '100%', marginTop: 12, background: '#4285F4', color: 'white', fontWeight: 'bold' }}>
        구글로 로그인
      </button>
      <button onClick={() => setIsRegister(!isRegister)} style={{ marginTop: 12 }}>
        {isRegister ? '로그인 하기' : '회원가입 하기'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default LoginPage;
