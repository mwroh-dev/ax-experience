export type RiskLevel = 'low' | 'medium' | 'high';
export type RecommendedPath =
  | 'auto_reply'
  | 'review_required'
  | 'pending'
  | 'escalation'
  | 'no_source_backlog';

export interface RoutingRule {
  intent: string;
  risk_level: RiskLevel;
  requires_commerce_api: boolean;
  requires_customer_identifier: boolean;
  requires_human_review: boolean;
  recommended_path: RecommendedPath;
  reason: string;
}

/** Keyword → routing rule mapping (MVP: keyword-based) */
export const ROUTING_RULES: Array<{
  keywords: string[];
  rule: RoutingRule;
}> = [
  // ── High-risk: escalation required ────────────────────────────────────────
  {
    keywords: ['법적', '소송', '법원', '고소', '고발', '변호사', 'legal', 'lawsuit'],
    rule: {
      intent: 'legal_threat',
      risk_level: 'high',
      requires_commerce_api: false,
      requires_customer_identifier: false,
      requires_human_review: true,
      recommended_path: 'escalation',
      reason: '법적 대응 언급 — 자동 응답 금지, 담당자 검토 필요',
    },
  },
  {
    keywords: ['개인정보', '삭제 요청', 'gdpr', 'data deletion', 'privacy'],
    rule: {
      intent: 'privacy_request',
      risk_level: 'high',
      requires_commerce_api: false,
      requires_customer_identifier: false,
      requires_human_review: true,
      recommended_path: 'escalation',
      reason: '개인정보/GDPR 요청 — 자동 응답 금지, 전문 처리 필요',
    },
  },
  {
    keywords: ['결제 사고', '이중 청구', '불법 청구', 'payment incident', 'double charge'],
    rule: {
      intent: 'payment_incident',
      risk_level: 'high',
      requires_commerce_api: true,
      requires_customer_identifier: true,
      requires_human_review: true,
      recommended_path: 'escalation',
      reason: '결제 사고 — 긴급 처리 필요, 자동 응답 금지',
    },
  },

  // ── Medium-risk: customer-specific queries needing Commerce API ────────────
  {
    keywords: ['제 구독', '내 구독', '저의 구독', '구독 환불', '구독 취소되나'],
    rule: {
      intent: 'subscription.customer_specific',
      risk_level: 'medium',
      requires_commerce_api: true,
      requires_customer_identifier: true,
      requires_human_review: true,
      recommended_path: 'review_required',
      reason: '고객별 구독 상태 확인 필요 — Commerce API 조회 후 검토',
    },
  },
  {
    keywords: ['제 환불', '내 환불', '환불 되나요', '환불 가능한가요', '환불 해주세요', '환불 받을 수 있'],
    rule: {
      intent: 'refund.customer_specific',
      risk_level: 'medium',
      requires_commerce_api: true,
      requires_customer_identifier: true,
      requires_human_review: true,
      recommended_path: 'review_required',
      reason: '고객별 환불 가능 여부는 Commerce API 조회 필요',
    },
  },
  {
    keywords: ['결제가 안', '결제 실패', '결제 오류', '결제 확인', '가상계좌', '입금 확인'],
    rule: {
      intent: 'payment.status',
      risk_level: 'medium',
      requires_commerce_api: true,
      requires_customer_identifier: true,
      requires_human_review: true,
      recommended_path: 'review_required',
      reason: '결제 상태 확인 — Commerce API 조회 필요',
    },
  },
  {
    keywords: ['배송 언제', '배송 현황', '배송 추적', '주문번호', 'ord-', '언제 와요', '배송됐나요', '배송이 안'],
    rule: {
      intent: 'shipping.status',
      risk_level: 'medium',
      requires_commerce_api: true,
      requires_customer_identifier: true,
      requires_human_review: true,
      recommended_path: 'review_required',
      reason: '배송 상태는 주문번호 기반 Commerce API 조회 필요',
    },
  },
  {
    keywords: ['쿠폰이 안', '쿠폰 오류', '쿠폰 사용', '할인코드', '프로모션 코드', '쿠폰 적용'],
    rule: {
      intent: 'coupon_inquiry',
      risk_level: 'medium',
      requires_commerce_api: true,
      requires_customer_identifier: false,
      requires_human_review: true,
      recommended_path: 'review_required',
      reason: '쿠폰 유효성 확인 — Commerce API 조회 필요',
    },
  },
  {
    keywords: ['품절', '재고 없음', '재입고', '언제 다시', '품절됐나요', '재고 확인'],
    rule: {
      intent: 'product.availability',
      risk_level: 'medium',
      requires_commerce_api: true,
      requires_customer_identifier: false,
      requires_human_review: true,
      recommended_path: 'review_required',
      reason: '상품 재고 확인 — Commerce API 조회 필요',
    },
  },
  {
    keywords: ['리뷰 적립금', '적립금이 안', '리뷰 혜택', '포인트 안 왔', '리뷰 보상'],
    rule: {
      intent: 'review_reward',
      risk_level: 'medium',
      requires_commerce_api: true,
      requires_customer_identifier: true,
      requires_human_review: true,
      recommended_path: 'review_required',
      reason: '리뷰 적립금 상태 확인 — Commerce API 조회 필요',
    },
  },

  // ── Low-risk: general FAQ / policy questions ───────────────────────────────
  {
    keywords: ['환불 정책', '반품 정책', '환불 규정', '환불 기간', '환불 절차'],
    rule: {
      intent: 'policy_faq',
      risk_level: 'low',
      requires_commerce_api: false,
      requires_customer_identifier: false,
      requires_human_review: false,
      recommended_path: 'auto_reply',
      reason: '일반 환불 정책 FAQ — 자동 응답 가능',
    },
  },
  {
    keywords: ['구독 해지', '구독 해지 방법', '어디서 해지', '해지하는 방법'],
    rule: {
      intent: 'policy_faq',
      risk_level: 'low',
      requires_commerce_api: false,
      requires_customer_identifier: false,
      requires_human_review: false,
      recommended_path: 'auto_reply',
      reason: '구독 해지 방법 FAQ — 자동 응답 가능',
    },
  },
  {
    keywords: ['배송 기간', '배송 얼마나', '배송 며칠', '영업일'],
    rule: {
      intent: 'policy_faq',
      risk_level: 'low',
      requires_commerce_api: false,
      requires_customer_identifier: false,
      requires_human_review: false,
      recommended_path: 'auto_reply',
      reason: '일반 배송 정책 FAQ — 자동 응답 가능',
    },
  },
  {
    keywords: ['쿠폰 정책', '쿠폰 사용 방법', '할인 기간', '프로모션 기간'],
    rule: {
      intent: 'policy_faq',
      risk_level: 'low',
      requires_commerce_api: false,
      requires_customer_identifier: false,
      requires_human_review: false,
      recommended_path: 'auto_reply',
      reason: '일반 쿠폰/할인 정책 FAQ — 자동 응답 가능',
    },
  },
];

/** Default fallback rule */
export const DEFAULT_RULE: RoutingRule = {
  intent: 'unknown',
  risk_level: 'medium',
  requires_commerce_api: false,
  requires_customer_identifier: false,
  requires_human_review: true,
  recommended_path: 'review_required',
  reason: '분류 불가 — 기본 검토 경로',
};
