import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, writeBatch, addDoc } from 'firebase/firestore';
import { sha256Hash } from '../utils/hash';
import { getHashInputForContent } from '../utils/hashInput';

interface PendingInvestment {
  id: string;
  contentId: string;
  newInvestorId: string;
  userEmail?: string;
  amount: number;
  createdAt: any;
  approvals: string[];
  status: 'pending' | 'approved' | 'rejected';
}

interface Investment {
  id: string;
  userId: string;
  userEmail: string;
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
  createdAt: any; // Timestamp | string
  authorId: string;
  authorEmail: string;
  latestHash?: string;
}

const ApprovalRequestsPage: React.FC = () => {
  const [pendingList, setPendingList] = useState<PendingInvestment[]>([]);
  const [contentMap, setContentMap] = useState<{ [key: string]: Content }>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchPending = React.useCallback(async () => {
    if (!auth.currentUser) return;
    // 내가 기존 투자자인 모든 컨텐츠에 대해 승인 대기 중인 투자 요청을 찾는다
    const q = query(collection(db, 'pending_investments'), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    const pendings: PendingInvestment[] = [];
    for (const d of snap.docs) {
      const p = { id: d.id, ...d.data() } as PendingInvestment;
      // 기존 투자자인지 확인 (investments에 userId=본인, contentId=해당 컨텐츠)
      const invQ = query(collection(db, 'investments'), where('contentId', '==', p.contentId), where('userId', '==', auth.currentUser.uid));
      const invSnap = await getDocs(invQ);
      // 본인이 기존 투자자이면서 아직 승인하지 않은 요청만
      if (invSnap.size > 0 && !p.approvals.includes(auth.currentUser.uid)) {
        pendings.push(p);
      }
    }
    setPendingList(pendings);
    // 컨텐츠 정보도 미리 가져오기
    const contentIds = Array.from(new Set(pendings.map(p => p.contentId)));
    const contentFetches = contentIds.map(async contentId => {
      const cDoc = await getDoc(doc(db, 'contents', contentId));
      return { contentId, content: cDoc.exists() ? { id: cDoc.id, ...cDoc.data() } as Content : undefined };
    });
    const contentResults = await Promise.all(contentFetches);
    const cmap: { [key: string]: Content } = {};
    contentResults.forEach(({ contentId, content }) => {
      if (content) cmap[contentId] = content;
    });
    setContentMap(cmap);
  }, [auth.currentUser]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // 클라이언트에서 모든 승인/합의/배당/해시 계산 및 append-only 기록
  const handleApprove = async (pending: PendingInvestment) => {
    setLoading(true);
    setMessage('');
    try {
      // 1. 모든 승인 내역을 클라이언트에서 직접 불러옴
      const pSnap = await getDoc(doc(db, 'pending_investments', pending.id));
      const pData = pSnap.data();
      const currentApprovals = pData?.approvals ?? [];
      const newApprovals = [...currentApprovals, auth.currentUser!.uid];

      // 2. 과반수 도달 여부를 클라이언트에서 직접 판단
      // (기존 투자자 수 계산)
      const invQ = query(collection(db, 'investments'), where('contentId', '==', pending.contentId));
      const invSnap = await getDocs(invQ);
      const totalInvestors = invSnap.size;
      const majority = Math.ceil((totalInvestors + 1) / 2); // 신규 투자자 포함
      const isMajority = newApprovals.length >= majority;

      // 3. 과반수 도달 시 모든 상태 변화(투자 내역/배당/해시) 클라이언트에서 처리
      let newInvestments = invSnap.docs.map(doc => ({
        userId: doc.data().userId,
        userEmail: doc.data().userEmail,
        amount: doc.data().amount,
        createdAt: doc.data().createdAt,
        dividend: doc.data().dividend || 0
      }));
      // 신규 투자자 추가
      newInvestments.push({
        userId: pending.newInvestorId,
        userEmail: pending.userEmail,
        amount: pending.amount,
        createdAt: pending.createdAt,
        dividend: 0
      });

      // 배당 분배 로직 클라이언트에서 직접 실행
      const totalOldAmount = newInvestments
        .filter(inv => inv.userId !== pending.newInvestorId)
        .reduce((sum, inv) => sum + inv.amount, 0);
      let dividendUpdates: { [userId: string]: number } = {};
      if (totalOldAmount > 0) {
        for (const inv of newInvestments) {
          if (inv.userId !== pending.newInvestorId) {
            const share = inv.amount / totalOldAmount;
            const dividend = Math.floor(pending.amount * share);
            dividendUpdates[inv.userId] = (dividendUpdates[inv.userId] || 0) + dividend;
            inv.dividend = (inv.dividend || 0) + dividend;
          }
        }
      }

      // 3-1. Firestore에 신규 투자자 추가
      console.log('[디버그] handleApprove() 시작, pending:', JSON.stringify(pending, null, 2));
      console.log('[디버그] handleApprove() newInvestments:', JSON.stringify(newInvestments, null, 2));
      await addDoc(collection(db, 'investments'), {
        userId: pending.newInvestorId,
        userEmail: pending.userEmail,
        amount: pending.amount,
        createdAt: pending.createdAt,
        dividend: 0,
        contentId: pending.contentId // 반드시 포함!
      });
      console.log('[디버그] 신규 투자자 Firestore 추가 완료');
      // 3-2. 기존 투자자 배당 업데이트
      for (const [userId, dividend] of Object.entries(dividendUpdates)) {
        const q = query(collection(db, 'investments'), where('contentId', '==', pending.contentId), where('userId', '==', userId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'investments', snap.docs[0].id), { dividend });
        }
      }
      // Firestore에 투자자 추가/배당 업데이트가 완전히 반영될 때까지 약간 대기
      await new Promise(res => setTimeout(res, 500));
      const cDoc = await getDoc(doc(db, 'contents', pending.contentId));
      const content = cDoc.exists() ? { id: cDoc.id, ...cDoc.data() } as Content : null;
      const prevHash = content?.latestHash || '';
      // Firestore에서 최신 investments fetch (예상 해시와 완전히 동일하게)
      const invSnapForHash = await getDocs(query(collection(db, 'investments'), where('contentId', '==', pending.contentId)));
      const invsForHash = invSnapForHash.docs.map(doc => ({
        userEmail: doc.data().userEmail,
        amount: doc.data().amount,
        // createdAt, dividend 등 타입 통일
        createdAt: typeof doc.data().createdAt === 'string'
          ? doc.data().createdAt
          : doc.data().createdAt?.toDate?.()?.toISOString?.() || '' + doc.data().createdAt,
        dividend: typeof doc.data().dividend === 'number' ? doc.data().dividend : 0
      }));
      console.log('[디버그] Firestore에서 fetch한 investments:', JSON.stringify(invsForHash, null, 2));
      // 정렬 및 content 구조까지 동일하게 맞춤
      const hashInputObj = getHashInputForContent(content, invsForHash);
      const newHash = await sha256Hash(JSON.stringify(hashInputObj));

      // 예상 해시와 실제(최종) 해시 콘솔 비교
      try {
        // 예상 해시 계산용: pending 투자자를 추가해서 getHashInputForContent 호출 (calculateExpectedHash와 동일하게)
        const invSnapForExpected = await getDocs(query(collection(db, 'investments'), where('contentId', '==', pending.contentId)));
        const invsForExpected = invSnapForExpected.docs.map(doc => ({
          userEmail: doc.data().userEmail,
          amount: doc.data().amount,
          createdAt: typeof doc.data().createdAt === 'string'
            ? doc.data().createdAt
            : doc.data().createdAt?.toDate?.()?.toISOString?.() || '' + doc.data().createdAt,
          dividend: typeof doc.data().dividend === 'number' ? doc.data().dividend : 0
        }));
        // pending 투자자 추가
        invsForExpected.push({
          userEmail: pending.userEmail,
          amount: pending.amount,
          createdAt: typeof pending.createdAt === 'string'
            ? pending.createdAt
            : pending.createdAt?.toDate?.()?.toISOString?.() || '' + pending.createdAt,
          dividend: 0
        });
        // 정렬 및 구조 동일하게
        const expectedHashInputObj = getHashInputForContent(content, invsForExpected);
        const expectedHash = await sha256Hash(JSON.stringify(expectedHashInputObj));
        console.log('[해시 비교] 예상 해시:', expectedHash, '\n실제(최종) 해시:', newHash);
        console.log('[해시 비교] 예상 해시 입력:', JSON.stringify(expectedHashInputObj, null, 2));
        console.log('[해시 비교] 실제(최종) 해시 입력:', JSON.stringify(hashInputObj, null, 2));
        // 실제로 예상 해시 계산에 사용된 investments 배열
        console.log('[해시 비교] 예상 해시용 investments:', JSON.stringify(invsForExpected, null, 2));
        // 실제로 최종 해시 계산에 사용된 investments 배열
        console.log('[해시 비교] 실제(최종) 해시용 investments:', JSON.stringify(invsForHash, null, 2));
      } catch (e) {
        console.warn('[해시 비교] 예상 해시 계산 실패:', e);
      }

      // 5. (추후 확장) 내 개인키로 전자서명 생성 (지금은 구조만)
      // const signature = await signWithMyPrivateKey(newHash);

      // 6. 서버에는 append-only로 "서명된 내역"만 저장
      await addDoc(collection(db, 'approval_chain'), {
        contentId: pending.contentId,
        prevHash,
        newHash,
        investments: newInvestments,
        dividendUpdates,
        approvals: newApprovals,
        // signatures: [signature], // 추후 전자서명 추가
        timestamp: Date.now(),
        status: isMajority ? 'approved' : 'pending',
        approvedBy: isMajority ? newApprovals : [],
        pendingId: pending.id
      });

      // 7. pending_investments에 approvals만 업데이트(상태 판단은 서버가 하지 않음)
      await updateDoc(doc(db, 'pending_investments', pending.id), { approvals: newApprovals });

      setMessage(isMajority ? '과반 승인! 투자 승인 및 해시 갱신 완료.' : '승인 처리 완료. 아직 과반 미달');
    } catch (e) {
      setMessage('오류: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
      fetchPending();
    }
  };


  // 클라이언트에서 거부 판단 후 append-only로 기록
  const handleReject = async (pending: PendingInvestment) => {
    setLoading(true);
    setMessage('');
    try {
      // 1. 거부 내역을 approval_chain에 append-only로 기록
      await addDoc(collection(db, 'approval_chain'), {
        contentId: pending.contentId,
        type: 'reject',
        rejectedBy: auth.currentUser!.uid,
        pendingId: pending.id,
        timestamp: Date.now()
      });
      // 2. pending_investments에 status만 업데이트(실제 판단은 클라이언트)
      await updateDoc(doc(db, 'pending_investments', pending.id), { status: 'rejected' });
      setMessage('거부 처리 완료.');
    } catch (e) {
      setMessage('오류: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
      fetchPending();
    }
  };


  return (
    <div style={{ maxWidth: 800, margin: 'auto', padding: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16 }}>
        {auth.currentUser?.email && (
          <span style={{ marginRight: 12, color: '#555', fontWeight: 500 }}>
            {auth.currentUser.email}
          </span>
        )}
        {/* 여기에 기존 로그인/로그아웃 버튼이 있다면 그 옆에 붙습니다 */}
        <span style={{ marginLeft: 16, color: '#888', fontWeight: 700, fontSize: 16 }}>버전 1.3</span>
      </div>
      <h2>투자 승인 요청</h2>
      {message && <div style={{ color: 'green', marginBottom: 16 }}>{message}</div>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {pendingList.map((pending: PendingInvestment, idx: number) => (
          <PendingInvestmentItem
            key={pending.id}
            pending={pending}
            content={contentMap[pending.contentId]}
            handleApprove={handleApprove}
            handleReject={handleReject}
            authUserId={auth.currentUser?.uid || ''}
            pendingList={pendingList}
          />
        ))}
        {pendingList.length === 0 && <li>현재 승인 요청이 없습니다.</li>}
      </ul>
    </div>
  );
};

// 별도 컴포넌트로 분리: 펜딩 투자 항목 렌더링 및 예상 해시 계산
interface PendingInvestmentItemProps {
  pending: PendingInvestment;
  content?: Content;
  handleApprove: (pending: PendingInvestment) => void;
  handleReject: (pending: PendingInvestment) => void;
  authUserId: string;
  pendingList: PendingInvestment[];
}

const PendingInvestmentItem: React.FC<PendingInvestmentItemProps> = ({ pending, content, handleApprove, handleReject, authUserId, pendingList }) => {
  const approvals = pending.approvals || [];
  const alreadyApproved = approvals.includes(authUserId);
  const canApprove = !alreadyApproved && pending.status !== 'rejected';
  const sameContentPendings = pendingList.filter((p: PendingInvestment) => p.contentId === pending.contentId);
  const oldestPending = sameContentPendings.reduce((min: PendingInvestment | null, p: PendingInvestment) => {
    if (!min) return p;
    const d1 = min.createdAt?.toDate?.() ? min.createdAt.toDate() : min.createdAt;
    const d2 = p.createdAt?.toDate?.() ? p.createdAt.toDate() : p.createdAt;
    return d2 < d1 ? p : min;
  }, null as PendingInvestment | null);

  // 서버 latestHash와 내 localStorage latestHash 가져오기 (state)
  const [serverHash, setServerHash] = React.useState<string | null>(null);
  const [myHash, setMyHash] = React.useState<string | null>(null);
  // 예상 해시 계산 함수 (항상 Firestore fetch, ContentDetailPage와 100% 동일 구조)
  const calculateExpectedHash = React.useCallback(async () => {
    if (!content || !content.id || !pending) return;
    try {
      // 1. 현재 투자자 목록 fetch
      const invSnap = await getDocs(query(collection(db, 'investments'), where('contentId', '==', content.id)));
      let invs = invSnap.docs.map(doc => ({
        userEmail: doc.data().userEmail,
        amount: doc.data().amount,
        createdAt: doc.data().createdAt,
        dividend: doc.data().dividend
      }));
      // 검증용 로그 추가
      console.log('[예상 해시용 pending]', pending);
      console.log('[예상 해시용 investments]', invs);
      console.log('[예상 해시용 content]', content);
      // 2. 공통 함수로 해시 입력 생성
      const hashInputObj = getHashInputForContent(content, invs, pending);
      const hashInput = JSON.stringify(hashInputObj);
      console.log('[예상 해시 구조]', JSON.stringify(hashInputObj, null, 2));
      const hash = await sha256Hash(hashInput);
      setExpectedHash(hash);
    } catch (e) {
      setExpectedHash(null);
    }
  }, [content, pending]);

  React.useEffect(() => {
    if (!content) return;
    // 서버 latestHash
    setServerHash(typeof content.latestHash === 'string' ? content.latestHash : null);
    // 내 localStorage latestHash
    if (authUserId && content.id) {
      const local = localStorage.getItem(`content_latestHash_${content.id}_${authUserId}`);
      setMyHash(local || null);
    }
    // 예상 해시 계산
    calculateExpectedHash();
  }, [content, authUserId, calculateExpectedHash, pending]);
  const isOldest = oldestPending && oldestPending.id === pending.id;
  const canApproveThis = canApprove && isOldest;

  const [expectedHash, setExpectedHash] = React.useState<string | null>(null);
  // Content 타입을 명확히 지정
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
  // Content 타입 가드 함수 (중복 선언 방지)
  function isContent(obj: any): obj is Content {
    return obj && typeof obj.id === 'string' && typeof obj.title === 'string' && typeof obj.body === 'string' && typeof obj.type === 'string' && typeof obj.mediaUrl === 'string' && obj.createdAt && typeof obj.authorId === 'string' && typeof obj.authorEmail === 'string';
  }
  const [contentData, setContentData] = React.useState<Content | null>(isContent(content) ? content : null);

  React.useEffect(() => {
    (async () => {
      // 항상 최신 contentData를 Firestore에서 fetch
      const cDoc = await getDoc(doc(db, 'contents', pending.contentId));
      const cData = cDoc.exists() ? { id: cDoc.id, ...cDoc.data() } : null;
      // 타입 가드: Content인지 확인 후만 setContentData
      if (isContent(cData)) {
        setContentData(cData);
      } else if (isContent(content)) {
        setContentData(content);
      } else {
        setContentData(null);
      }
      if (!isContent(cData) && !isContent(content)) return;
      // 투자자 목록 (ContentDetailPage와 100% 동일 구조, 실제 DB 상태만 사용)
      const invSnap = await getDocs(query(collection(db, 'investments'), where('contentId', '==', pending.contentId)));
      const invsForHash = invSnap.docs
        .map(doc => ({
          userEmail: doc.data().userEmail,
          amount: doc.data().amount,
          createdAt: typeof doc.data().createdAt === 'string'
            ? doc.data().createdAt
            : doc.data().createdAt?.toDate?.()?.toISOString?.() || '' + doc.data().createdAt,
          dividend: typeof doc.data().dividend === 'number' ? doc.data().dividend : 0
        }))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const base: Content | null = isContent(cData) ? cData : (isContent(content) ? content : null);
      if (!isContent(base)) {
        setExpectedHash(null);
        return;
      }
      // 예상 해시: 실제 승인 시점의 투자자 배열(기존 + pending 투자자, 중복 제거 X)
      const invsForExpectedHash = [
        ...invsForHash.map(inv => ({ userEmail: inv.userEmail, amount: inv.amount })),
        { userEmail: pending.userEmail, amount: pending.amount }
      ];
      // 정렬(userEmail, amount)
      invsForExpectedHash.sort((a, b) => {
        if (a.userEmail < b.userEmail) return -1;
        if (a.userEmail > b.userEmail) return 1;
        if (a.amount < b.amount) return -1;
        if (a.amount > b.amount) return 1;
        return 0;
      });
      const hashInputObj = getHashInputForContent(base, invsForExpectedHash);
      console.log('[예상 해시 입력]', JSON.stringify(hashInputObj, null, 2));
      const hashInput = JSON.stringify(hashInputObj);
      const hash = await sha256Hash(hashInput);
      setExpectedHash(hash);
    })();
  }, [content, pending]);

  return (
    <li style={{ border: '1px solid #ccc', borderRadius: 8, marginBottom: 16, padding: 16 }}>
      <>
        <div><b>컨텐츠:</b> {content?.title}</div>
        <div><b>투자자:</b> {pending.userEmail}</div>
        <div><b>금액:</b> {pending.amount}</div>
        <div><b>신청일:</b> {pending.createdAt?.toDate?.()?.toLocaleString?.() || pending.createdAt}</div>
        <div><b>승인자:</b> {approvals.length}명 / {sameContentPendings.length}명</div>
        <div style={{ marginTop: 6, fontSize: 13 }}>
          <div>서버 latestHash: <code style={{ color: '#006' }}>{serverHash || '-'}</code></div>
          <div>내 latestHash: <code style={{ color: '#060' }}>{myHash || '-'}</code></div>
        </div>
        {canApprove && (
          <button onClick={() => handleApprove(pending)} style={{ marginRight: 8 }}
            disabled={!!serverHash && !!myHash && serverHash !== myHash}
          >승인</button>
        )}
        {!canApprove && <span style={{ color: 'gray' }}>이미 승인함</span>}
        <button onClick={() => handleReject(pending)} disabled={pending.status === 'rejected'}>거부</button>
        {expectedHash && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
            <div>예상 해시: <code>{expectedHash}</code></div>
          </div>
        )}
        {serverHash && myHash && serverHash !== myHash && (
          <div style={{ color: 'red', marginTop: 6, fontSize: 13 }}>
            ⚠️ 서버와 내 해시가 다릅니다. 새로고침 후 다시 시도하세요.
          </div>
        )}
      </>
    </li>
  );
};

export default ApprovalRequestsPage;
