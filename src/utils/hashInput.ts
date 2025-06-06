// 공통 해시 입력 생성 함수
// content: Content 객체
// investments: 투자자 배열 (DB에서 fetch한 상태)
// pending: PendingInvestment | null (예상 해시 계산 시만 사용)

export function getHashInputForContent(content: any, investments: any[], pending?: any) {
  // 1. 투자자 배열 복사 (dividend 제외)
  let invs = investments.map(inv => ({
    userEmail: inv.userEmail,
    amount: inv.amount
  }));

  // 2. pending 투자자(예상 해시 계산 시) 추가
  if (pending) {
    invs.push({
      userEmail: pending.userEmail,
      amount: pending.amount
    });
  }

  // 3. 정렬(이제 createdAt이 없으므로 userEmail+amount 기준 정렬)
  invs.sort((a, b) => {
    if (a.userEmail < b.userEmail) return -1;
    if (a.userEmail > b.userEmail) return 1;
    if (a.amount < b.amount) return -1;
    if (a.amount > b.amount) return 1;
    return 0;
  });

  // 4. content 필드 포맷
  return {
    id: content.id,
    title: content.title,
    body: content.body,
    type: content.type,
    mediaUrl: content.mediaUrl,
    createdAt: content.createdAt,
    authorId: content.authorId,
    authorEmail: content.authorEmail,
    investments: invs
  };
}
