import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

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
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) throw new Error('투자 금액을 올바르게 입력하세요.');
      await addDoc(collection(db, 'investments'), {
        contentId,
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        amount: Number(amount),
        createdAt: Timestamp.now(),
      });
      setSuccess('투자 완료!');
      setAmount('');
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
        placeholder="투자 금액"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        style={{ marginRight: 8 }}
      />
      <button type="submit" disabled={loading}>
        {loading ? '투자 중...' : '투자하기'}
      </button>
      {error && <span style={{ color: 'red', marginLeft: 8 }}>{error}</span>}
      {success && <span style={{ color: 'green', marginLeft: 8 }}>{success}</span>}
    </form>
  );
};

export default InvestForm;
