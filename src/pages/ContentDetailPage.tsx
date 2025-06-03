import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import InvestForm from './InvestForm';

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
}

const ContentDetailPage: React.FC = () => {
  const { id } = useParams();
  const [content, setContent] = useState<Content | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [totalInvest, setTotalInvest] = useState(0);

  useEffect(() => {
    const fetchContent = async () => {
      if (!id) return;
      const docRef = doc(db, 'contents', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setContent({ id: snap.id, ...snap.data() } as Content);
      }
    };
    fetchContent();
  }, [id]);

  useEffect(() => {
    const fetchInvestments = async () => {
      if (!id) return;
      const q = query(collection(db, 'investments'), where('contentId', '==', id), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const invs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Investment));
      setInvestments(invs);
      setTotalInvest(invs.reduce((acc, cur) => acc + (cur.amount || 0), 0));
    };
    fetchInvestments();
  }, [id]);

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
            {investments.length === 0 && <li>아직 투자 내역이 없습니다.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ContentDetailPage;
