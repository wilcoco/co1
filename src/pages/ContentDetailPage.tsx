import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import InvestForm from './InvestForm';
import { sha256Hash } from '../utils/hash';
import { getHashInputForContent } from '../utils/hashInput';

interface Content {
  id: string;
  title: string;
  body: string;
  type: string;
  mediaUrl: string;
  createdAt: any;
  authorId: string;
  authorEmail: string;
}

interface Investment {
  id: string;
  userId: string;
  userEmail: string;
  amount: number;
  createdAt: any;
  dividend?: number;
}

interface PendingInvestment {
  id: string;
  newInvestorId: string;
  userEmail?: string;
  amount: number;
  createdAt: any;
  status: string;
}

const ContentDetailPage: React.FC = () => {
  const { id } = useParams();
  const [content, setContent] = useState<Content | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [pendingInvestments, setPendingInvestments] = useState<PendingInvestment[]>([]);
  const [totalInvest, setTotalInvest] = useState(0);

  useEffect(() => {
    if (!id) return;
    // 컨텐츠 실시간 구독
    const unsubContent = onSnapshot(doc(db, 'contents', id), docSnap => {
      if (docSnap.exists()) {
        setContent({ id: docSnap.id, ...docSnap.data() } as Content);
      } else {
        setContent(null);
      }
    });
    // 투자 내역 실시간 구독
    const invQ = query(collection(db, 'investments'), where('contentId', '==', id), orderBy('createdAt', 'desc'));
    const unsubInvest = onSnapshot(invQ, invSnap => {
      const invs = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Investment));
      setInvestments(invs);
      setTotalInvest(invs.reduce((acc, cur) => acc + (cur.amount || 0), 0));
    });
    // 펜딩 투자 내역 실시간 구독
    const pendingQ = query(collection(db, 'pending_investments'), where('contentId', '==', id), where('status', '==', 'pending'));
    const unsubPending = onSnapshot(pendingQ, snap => {
      const pendings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PendingInvestment));
      setPendingInvestments(pendings);
    });
    return () => {
      unsubContent();
      unsubInvest();
      unsubPending();
    };
  }, [id]);

  // 투자 승인 후 investments 컬렉션에 추가된 투자 내역이 즉시 반영되도록, 승인/거부/투자 요청 발생 시 투자 내역을 실시간으로 다시 불러오도록 useEffect에 pending_investments와 investments의 변경을 감지하는 로직 추가.
  useEffect(() => {
    const updateContentHash = async () => {
      if (!content) return;
      // 공통 함수로 해시 입력 생성
      const hashInputObj = getHashInputForContent(content, investments);
      console.log('[최종 해시 입력]', JSON.stringify(hashInputObj, null, 2)); // 이미 예쁘게 출력 중
      const hashInput = JSON.stringify(hashInputObj);
      const hash = await sha256Hash(hashInput);
      // Firestore 컨텐츠 문서에 최신 해시 저장
      try {
        await updateDoc(doc(db, 'contents', content.id), { latestHash: hash });
      } catch (e) { /* 무시(권한 없으면 패스) */ }
      // 로그인한 유저의 localStorage에 저장
      if (auth.currentUser) {
        localStorage.setItem(`content_latestHash_${content.id}_${auth.currentUser.uid}`, hash);
      }
    };
    updateContentHash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, investments]);

  if (!content) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 800, margin: 'auto', padding: 40 }}>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      {content.type === 'image' && content.mediaUrl && (
        <img src={content.mediaUrl} alt="media" style={{ maxWidth: '100%' }} />
      )}
      {content.type === 'video' && content.mediaUrl && (
        <video src={content.mediaUrl} controls style={{ maxWidth: '100%' }} />
      )}
      {content.type === 'music' && content.mediaUrl && (
        <audio src={content.mediaUrl} controls />
      )}
      {content.type === 'link' && content.mediaUrl && (
        <a href={content.mediaUrl} target="_blank" rel="noopener noreferrer">{content.mediaUrl}</a>
      )}
      <hr />
      {/* 투자/배당/지분 등은 이후 확장 구현 */}
      <div>
        <h3>투자</h3>
        <InvestForm contentId={content.id} />
        <div style={{ marginTop: 16 }}>
          <strong>총 투자액: {totalInvest.toLocaleString()} 원</strong>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
            {investments.map(inv => (
              <li key={inv.id} style={{ borderBottom: '1px solid #eee', padding: 4 }}>
                <span style={{ fontWeight: 'bold' }}>{inv.userEmail}</span> 님이 {inv.amount.toLocaleString()}원 투자 ( {inv.createdAt?.toDate?.().toLocaleString?.() || ''} )
              </li>
            ))}
            {pendingInvestments.map(pinv => (
              <li key={pinv.id} style={{ borderBottom: '1px solid #eee', padding: 4, color: '#888' }}>
                <span style={{ fontWeight: 'bold' }}>{pinv.userEmail}</span> 님이 {pinv.amount.toLocaleString()}원 투자 ( {pinv.createdAt?.toDate?.().toLocaleString?.() || ''} ) <span style={{ color: 'orange', fontWeight: 'bold', marginLeft: 8 }}>(펜딩)</span>
              </li>
            ))}
            {investments.length === 0 && pendingInvestments.length === 0 && <li>아직 투자 내역이 없습니다.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ContentDetailPage;
