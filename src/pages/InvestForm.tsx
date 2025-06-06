import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, Timestamp, getDocs } from 'firebase/firestore';

interface InvestFormProps {
  contentId: string;
}

const InvestForm: React.FC<InvestFormProps> = ({ contentId }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleInvest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (!auth.currentUser) throw new Error('로그인이 필요합니다.');
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) throw new Error('금액을 올바르게 입력하세요.');
      // 사용자 캐시 확인
      const { getFirestore, doc, getDoc, updateDoc } = await import('firebase/firestore');
      const db2 = getFirestore();
      const userRef = doc(db2, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) throw new Error('사용자 정보가 없습니다.');
      const userData = userSnap.data();
      const currentCash = userData.cash ?? 0;
      const investAmount = Number(amount);
      if (currentCash < investAmount) throw new Error('보유 캐시가 부족합니다.');
      // 최초 참여자는 바로 승인
      const invSnap = await getDocs(collection(db, 'investments'));
      const isFirst = invSnap.docs.filter(doc => doc.data().contentId === contentId).length === 0;
      if (isFirst) {
        await addDoc(collection(db, 'investments'), {
          contentId,
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          amount: investAmount,
          createdAt: Timestamp.now(),
        });
        // 캐시 차감
        await updateDoc(userRef, { cash: currentCash - investAmount });
        setSuccess('최초 참여! 즉시 승인되었습니다.');
        setAmount('');
      } else {
        await addDoc(collection(db, 'pending_investments'), {
          contentId,
          newInvestorId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          amount: investAmount,
          createdAt: Timestamp.now(),
          approvals: [],
          status: 'pending',
        });
        // 캐시 차감
        await updateDoc(userRef, { cash: currentCash - investAmount });
        setSuccess('참여 승인 요청이 등록되었습니다.');
        setAmount('');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleInvest} style={{ marginBottom: 16 }}>
      <input
        type="number"
        min="1"
        placeholder="금액"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        style={{ marginRight: 8 }}
      />
      <button type="submit" disabled={loading}>
        {loading ? '참여 중...' : '참여하기'}
      </button>
      {error && <span style={{ color: 'red', marginLeft: 8 }}>{error}</span>}
      {success && <span style={{ color: 'green', marginLeft: 8 }}>{success}</span>}
    </form>
  );
};

export default InvestForm;
