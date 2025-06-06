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

  const handleApprove = async (pending: PendingInvestment) => {
    setLoading(true);
    setMessage('');
    try {
      const pRef = doc(db, 'pending_investments', pending.id);
      const updatedApprovals = [...pending.approvals, auth.currentUser!.uid];
      await updateDoc(pRef, { approvals: updatedApprovals });
      // majority 체크 및 승인 처리
      const pSnap = await getDoc(pRef);
      const pData = pSnap.data();
      const majority = Math.ceil((pData?.approvals?.length || 0) / 2);
      if (pData && pData.approvals.length >= majority && pData.status !== 'approved') {
        // 1. investments 컬렉션에 신규 투자자 추가
        await addDoc(collection(db, 'investments'), {
          contentId: pending.contentId,
          userId: pending.newInvestorId,
          userEmail: pending.userEmail,
          amount: pending.amount,
          createdAt: pending.createdAt,
          dividend: 0
        });
        // 2. 기존 투자자 dividend 업데이트
        const invSnap = await getDocs(query(collection(db, 'investments'), where('contentId', '==', pending.contentId)));
        const totalAmount = invSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
        const batch = writeBatch(db);
        invSnap.docs.forEach(docu => {
          if (docu.data().userId !== pending.newInvestorId) {
            const share = docu.data().amount / (totalAmount - pending.amount);
            const dividend = Math.floor(pending.amount * share);
            batch.update(doc(db, 'investments', docu.id), {
              dividend: (docu.data().dividend || 0) + dividend
            });
          }
        });
        await batch.commit();
        // 3. 펜딩 투자 status 'approved'로 변경
        await updateDoc(pRef, { status: 'approved' });
      }
      // 승인 후 과반수 이상이면 투자 승인
      // 기존 투자자 수 계산
      const invQ = query(collection(db, 'investments'), where('contentId', '==', pending.contentId));
      const invSnap = await getDocs(invQ);
      const totalInvestors = invSnap.size;
      // 예상 해시 계산: 과반 여부와 무관하게 승인 시마다 계산
      // 실제 승인 시와 동일하게 배당 분배 시뮬레이션 포함
      const allInvSnapForHash = await getDocs(query(collection(db, 'investments'), where('contentId', '==', pending.contentId)));
      let allInvsForHash = allInvSnapForHash.docs.map(doc => ({
        id: doc.id,
        userId: doc.data().userId,
        userEmail: doc.data().userEmail,
        amount: doc.data().amount,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() || doc.data().createdAt,
        dividend: doc.data().dividend || 0
      }));
      // 신규 투자자(펜딩 투자) 추가 (dividend 0, id 없음)
      allInvsForHash.push({
        userId: pending.newInvestorId,
        userEmail: pending.userEmail,
        amount: pending.amount,
        createdAt: pending.createdAt?.toDate?.()?.toISOString?.() || pending.createdAt,
        dividend: 0,
        id: undefined as any // 타입 충돌 방지용
      });
      // 배당 분배 시뮬레이션: 기존 투자자들에게 배당 지급
      const oldInvs = allInvsForHash.filter(inv => inv.userId !== pending.newInvestorId);
      // 기존 투자자(id가 있는 경우)만 배분 및 업데이트
      const oldInvsWithId = oldInvs.filter(inv => 'id' in inv && inv.id);
      const totalOldAmount = oldInvsWithId.reduce((sum, inv) => sum + inv.amount, 0);
      if (oldInvsWithId.length > 0 && totalOldAmount > 0) {
        for (const inv of oldInvsWithId) {
          const share = inv.amount / totalOldAmount;
          const dividend = Math.floor(pending.amount * share);
          // 투자자 문서에 dividend 필드 누적 저장
          const invRef = doc(db, 'investments', inv.id);
          const prevDividend = inv.dividend || 0;
          await updateDoc(invRef, { dividend: prevDividend + dividend });
          // 투자자 캐시 지급
          const userRef = doc(db, 'users', inv.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const userCash = userData.cash ?? 0;
            await updateDoc(userRef, { cash: userCash + dividend });
          }
        }
      }
      // 4. 해시 갱신 (getHashInputForContent로 완전히 통일)
      const newInvSnap2 = await getDocs(query(collection(db, 'investments'), where('contentId', '==', pending.contentId)));
      const newInvs2 = newInvSnap2.docs.map(doc => ({
        userEmail: doc.data().userEmail,
        amount: doc.data().amount
      }));
      const cDoc2 = await getDoc(doc(db, 'contents', pending.contentId));
      const content2 = cDoc2.exists() ? { id: cDoc2.id, ...cDoc2.data() } as Content : null;
      const hashInput2Obj = getHashInputForContent(content2, newInvs2);
      console.log('[최신 해시 입력]', JSON.stringify(hashInput2Obj, null, 2));
      const hash2 = await sha256Hash(JSON.stringify(hashInput2Obj));
      await updateDoc(doc(db, 'contents', pending.contentId), { latestHash: hash2 });
      // 5. 로컬 해시도 갱신
      if (auth.currentUser) {
        localStorage.setItem(`content_latestHash_${pending.contentId}_${auth.currentUser.uid}`, hash2);
      }
      setMessage('과반 승인! 투자 승인 및 해시 갱신 완료.');
    // 승인 완료 후 최종 해시 구조 콘솔 출력 (try 블록 내부에 위치)
    if (pending.contentId && contentMap[pending.contentId]) {
      const invSnap = await getDocs(query(collection(db, 'investments'), where('contentId', '==', pending.contentId)));
      let invs = invSnap.docs.map(doc => ({
        userEmail: doc.data().userEmail,
        amount: doc.data().amount
      }));
      // 정렬: 예상/최종 해시 모두 userEmail, amount 기준
      invs.sort((a, b) => {
        if (a.userEmail < b.userEmail) return -1;
        if (a.userEmail > b.userEmail) return 1;
        if (a.amount < b.amount) return -1;
        if (a.amount > b.amount) return 1;
        return 0;
      });
      const hashInputObj = getHashInputForContent(contentMap[pending.contentId], invs);
      console.log('[최종 해시 구조]', JSON.stringify(hashInputObj, null, 2));
    }
  } catch (e) {
    setMessage('오류: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    setLoading(false);
    fetchPending(); // 새로고침 없이 펜딩 목록만 갱신
  }
};

  const handleReject = async (pending: PendingInvestment) => {
    setLoading(true);
    setMessage('');
    try {
      const pRef = doc(db, 'pending_investments', pending.id);
      await updateDoc(pRef, { status: 'rejected' });
      // 투자금 환불
      const userRef = doc(db, 'users', pending.newInvestorId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const userCash = userData.cash ?? 0;
        await updateDoc(userRef, { cash: userCash + pending.amount });
      }
      setMessage('거부 처리 완료.');
    } catch (e) {
      setMessage('오류: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
      fetchPending(); // 거부 후 펜딩 목록 새로고침
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
