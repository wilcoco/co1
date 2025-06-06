import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

interface Investment {
  id: string;
  contentId: string;
  amount: number;
  createdAt: any;
  dividend?: number;
}

interface Content {
  id: string;
  title: string;
  body: string;
  type: string;
  mediaUrl: string;
  latestHash?: string;
}

const MyInvestmentsPage: React.FC = () => {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [pendingInvestments, setPendingInvestments] = useState<Investment[]>([]);
  const [contentMap, setContentMap] = useState<{ [key: string]: Content }>({});
  const [localHashes, setLocalHashes] = useState<{ [key: string]: string }>({});
  const [loaded, setLoaded] = useState(false);
  const [cash, setCash] = useState<number>(0);
  const [totalInvested, setTotalInvested] = useState<number>(0);
  const [totalDividend, setTotalDividend] = useState<number>(0);

  useEffect(() => {
    const fetchInvestments = async () => {
      if (!auth.currentUser) return;
      // 승인된 투자 내역
      const q = query(
        collection(db, 'investments'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const invs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Investment));
      setInvestments(invs);
      // 펜딩 투자 내역
      const pq = query(
        collection(db, 'pending_investments'),
        where('newInvestorId', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );
      const psnap = await getDocs(pq);
      const pinvs = psnap.docs.map(doc => ({ id: doc.id, ...doc.data(), pending: true } as Investment & { pending?: boolean }));
      setPendingInvestments(pinvs);
      // 컨텐츠 정보 in 쿼리로 최적화 (10개씩 나눠서 병렬 fetch)
      const contentIds = Array.from(new Set([...invs.map(inv => inv.contentId), ...pinvs.map(inv => inv.contentId)]));
      let cmap: { [key: string]: Content } = {};
      if (contentIds.length > 0) {
        const chunkSize = 10;
        const chunks: string[][] = [];
        for (let i = 0; i < contentIds.length; i += chunkSize) {
          chunks.push(contentIds.slice(i, i + chunkSize));
        }
        const chunkFetches = chunks.map(async ids => {
          const q = query(collection(db, 'contents'), where('__name__', 'in', ids));
          const snap = await getDocs(q);
          return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Content));
        });
        const chunkResults = await Promise.all(chunkFetches);
        cmap = {};
        chunkResults.flat().forEach(content => {
          cmap[content.id] = content;
        });
      }
      setContentMap(cmap);
      // 로컬 해시값도 가져오기 및 서버와 다르면 자동 동기화
      const lhashes: { [key: string]: string } = {};
      contentIds.forEach(cid => {
        const key = `content_latestHash_${cid}_${auth.currentUser!.uid}`;
        const serverHash = cmap[cid]?.latestHash || '';
        const localHash = localStorage.getItem(key) || '';
        if (serverHash && serverHash !== localHash) {
          localStorage.setItem(key, serverHash);
          lhashes[cid] = serverHash;
        } else {
          lhashes[cid] = localHash;
        }
      });
      setLocalHashes(lhashes);
      // 내 캐시 가져오기
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        setCash(userData.cash);
      }
      // 투자/배당 합계 계산
      const totalInvested = invs.reduce((acc, inv) => acc + inv.amount, 0);
      const totalDividend = invs.reduce((acc, inv) => acc + (inv.dividend || 0), 0);
      setTotalInvested(totalInvested);
      setTotalDividend(totalDividend);
    };
    fetchInvestments().finally(() => setLoaded(true));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: 'auto', padding: 40 }}>
      <div style={{ marginBottom: 32, padding: 24, background: '#f6f9fa', borderRadius: 12, boxShadow: '0 1px 4px #eee' }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>내 캐시 현황</h3>
        <div style={{ display: 'flex', gap: 32, fontSize: 18 }}>
          <div>잔고: <b style={{ color: '#1976d2' }}>{cash.toLocaleString()} 원</b></div>
          <div>총 투자: <b style={{ color: '#388e3c' }}>{totalInvested.toLocaleString()} 원</b></div>
          <div>총 배당: <b style={{ color: '#e65100' }}>{totalDividend.toLocaleString()} 원</b></div>
        </div>
      </div>
      <h2>나의 내역</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {/* 승인/펜딩 투자 내역을 합쳐 투자일시 내림차순 정렬 */}
        {(() => {
          const allInvests = [
            ...investments.map(inv => ({ ...inv, pending: false })),
            ...pendingInvestments.map(inv => ({ ...inv, pending: true })),
          ];
          allInvests.sort((a, b) => {
            const da = a.createdAt?.toDate?.() ? a.createdAt.toDate() : a.createdAt;
            const db = b.createdAt?.toDate?.() ? b.createdAt.toDate() : b.createdAt;
            return db - da;
          });
          return allInvests.map(inv => {
            const content = contentMap[inv.contentId];
            const localHash = localHashes[inv.contentId] || '';
            const serverHash = content?.latestHash || '';
            const isPending = inv.pending;
            if (!content) return null;
            return (
              <li key={inv.id} style={{ marginBottom: 24, borderBottom: '1px solid #eee', paddingBottom: 12, color: isPending ? '#888' : undefined }}>
                <>
                  <Link to={`/content/${content.id}`}><h3>{content.title}</h3></Link>
                  <p>{content.body.slice(0, 60)}...</p>
                  <div>금액: <b>{inv.amount.toLocaleString()} 원</b></div>
                  <div>일시: {inv.createdAt?.toDate?.().toLocaleString?.()}</div>
                  {isPending && <div style={{ color: 'orange', fontWeight: 'bold' }}>(펜딩)</div>}
                  <div style={{ fontSize: 12, color: '#888' }}>서버 해시: <code style={{ wordBreak: 'break-all' }}>{serverHash || '없음'}</code></div>
                  <div style={{ fontSize: 12, color: '#888' }}>로컬 해시: <code style={{ wordBreak: 'break-all' }}>{localHash || '없음'}</code></div>
                  {inv.dividend !== undefined && inv.dividend > 0 && (
                    <div style={{ fontSize: 12, color: '#1e88e5' }}>배당: {inv.dividend.toLocaleString()}원</div>
                  )}
                </>
              </li>
            );
          });
        })()}
        {/* 로딩이 끝난 후, 실제 렌더링되는 항목이 하나도 없을 때만 메시지 */}
        {loaded && (() => {
          const allInvests = [
            ...investments.map(inv => ({ ...inv, pending: false })),
            ...pendingInvestments.map(inv => ({ ...inv, pending: true })),
          ];
          const visibleCount = allInvests.filter(inv => contentMap[inv.contentId]).length;
          if (visibleCount === 0) return <li>아직 내역이 없습니다.</li>;
          return null;
        })()}
      </ul>
    </div>
  );
};

export default MyInvestmentsPage;
