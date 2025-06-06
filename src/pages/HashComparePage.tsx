import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

interface Content {
  id: string;
  title: string;
  latestHash?: string;
}

const HashComparePage: React.FC = () => {
  const [contents, setContents] = useState<Content[]>([]);
  const [pendingHashes, setPendingHashes] = useState<{ [key: string]: string }>({});
  const [status, setStatus] = useState<'loading'|'done'>('loading');

  useEffect(() => {
    const fetch = async () => {
      if (!auth.currentUser) return;
      // 내가 참여한 컨텐츠 목록
      const q = query(collection(db, 'investments'), where('userId', '==', auth.currentUser.uid));
      const snap = await getDocs(q);
      const contentIds = Array.from(new Set(snap.docs.map(doc => doc.data().contentId)));
      if (contentIds.length === 0) {
        setContents([]);
        setStatus('done');
        return;
      }
      // 컨텐츠 정보 fetch (10개씩 쿼리)
      const chunkSize = 10;
      let contentList: Content[] = [];
      for (let i = 0; i < contentIds.length; i += chunkSize) {
        const ids = contentIds.slice(i, i + chunkSize);
        const cq = query(collection(db, 'contents'), where('__name__', 'in', ids));
        const csnap = await getDocs(cq);
        csnap.docs.forEach(docu => {
          contentList.push({ id: docu.id, ...docu.data() } as Content);
        });
      }
      setContents(contentList);
      // 임시 해시 fetch
      const hashes: { [key: string]: string } = {};
      for (const cid of contentIds) {
        const key = `content_pendingHash_${cid}_${auth.currentUser!.uid}`;
        hashes[cid] = localStorage.getItem(key) || '';
      }
      setPendingHashes(hashes);
      setStatus('done');
    };
    fetch();
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: 'auto', padding: 40 }}>
      <h2>예상 해시 vs 서버 해시 비교</h2>
      <p style={{ color: '#888' }}>각 컨텐츠별로 마지막 승인 요청 시점의 "예상 해시"와 실제 서버에 저장된 해시를 비교합니다.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
        <thead>
          <tr style={{ background: '#f6f9fa' }}>
            <th style={{ padding: 8, border: '1px solid #ddd' }}>컨텐츠</th>
            <th style={{ padding: 8, border: '1px solid #ddd' }}>예상 해시<br/>(내 승인 시점)</th>
            <th style={{ padding: 8, border: '1px solid #ddd' }}>서버 해시<br/>(최종 승인)</th>
            <th style={{ padding: 8, border: '1px solid #ddd' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {status === 'done' && contents.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>참여한 컨텐츠가 없습니다.</td></tr>
          )}
          {contents.map(content => {
            const pendingHash = pendingHashes[content.id] || '';
            const serverHash = content.latestHash || '';
            let state = '';
            let color = '#888';
            if (pendingHash && serverHash) {
              if (pendingHash === serverHash) {
                state = '정상 승인';
                color = '#388e3c';
              } else {
                state = '불일치 (위변조 의심)';
                color = '#d32f2f';
              }
            } else if (pendingHash && !serverHash) {
              state = '아직 승인 대기';
              color = '#1976d2';
            } else {
              state = '-';
            }
            return (
              <tr key={content.id}>
                <td style={{ padding: 8, border: '1px solid #ddd' }}><Link to={`/content/${content.id}`}>{content.title}</Link></td>
                <td style={{ padding: 8, border: '1px solid #ddd', fontSize: 12, wordBreak: 'break-all' }}>{pendingHash || <span style={{color:'#bbb'}}>없음</span>}</td>
                <td style={{ padding: 8, border: '1px solid #ddd', fontSize: 12, wordBreak: 'break-all' }}>{serverHash || <span style={{color:'#bbb'}}>없음</span>}</td>
                <td style={{ padding: 8, border: '1px solid #ddd', color }}>{state}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default HashComparePage;
