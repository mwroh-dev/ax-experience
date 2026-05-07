/**
 * Commerce API QA Fixtures
 *
 * 원칙:
 * - QA_ prefix 네임스페이스 엄수
 * - 실제 고객 데이터 없음 — 시나리오별 합성 데이터
 * - reason_code 포함 (EvidencePacket으로 변환 가능)
 */

// ─── Scenario Keys ───────────────────────────────────────────────────────────

export const SCENARIOS = {
  ELIGIBLE_REFUND:     'eligible_refund',
  INELIGIBLE_DIGITAL:  'ineligible_digital',
  PAYMENT_CONFLICT:    'conflict_payment',
  SHIPPING_DELAYED:    'shipping_delayed',
  ORDER_DELIVERED:     'order_delivered',
  PAYMENT_PENDING:     'payment_pending',
  COUPON_EXPIRED:      'coupon_expired',
  COUPON_MIN_AMOUNT:   'coupon_min_amount',
  PRODUCT_OOS:         'product_oos',
  REVIEW_REWARD:       'review_reward',
  NOT_FOUND:           'notfound',
  TIMEOUT:             'timeout',
} as const;

// ─── Email → Scenario mapping ─────────────────────────────────────────────────

export function email_scenario(email: string): string {
  const lower = email.toLowerCase();
  if (lower.startsWith('eligible_'))   return SCENARIOS.ELIGIBLE_REFUND;
  if (lower.startsWith('ineligible_')) return SCENARIOS.INELIGIBLE_DIGITAL;
  if (lower.startsWith('conflict_'))   return SCENARIOS.PAYMENT_CONFLICT;
  if (lower.startsWith('delayed_'))    return SCENARIOS.SHIPPING_DELAYED;
  if (lower.startsWith('notfound_'))   return SCENARIOS.NOT_FOUND;
  if (lower.startsWith('timeout_'))    return SCENARIOS.TIMEOUT;
  return SCENARIOS.ELIGIBLE_REFUND; // default
}

// ─── Order ID → Scenario mapping ─────────────────────────────────────────────

export function order_scenario(order_id: string): string {
  const upper = order_id.toUpperCase();
  if (upper.includes('REFUNDABLE') || upper.includes('ELIGIBLE')) return SCENARIOS.ELIGIBLE_REFUND;
  if (upper.includes('DIGITAL'))  return SCENARIOS.INELIGIBLE_DIGITAL;
  if (upper.includes('CONFLICT')) return SCENARIOS.PAYMENT_CONFLICT;
  if (upper.includes('DELAYED'))  return SCENARIOS.SHIPPING_DELAYED;
  if (upper.includes('DELIVERED') || upper.includes('DONE')) return SCENARIOS.ORDER_DELIVERED;
  if (upper.includes('PENDING'))  return SCENARIOS.PAYMENT_PENDING;
  return SCENARIOS.ORDER_DELIVERED; // default
}

// ─── Customer Fixtures ────────────────────────────────────────────────────────

export const CUSTOMERS: Record<string, object> = {
  [SCENARIOS.ELIGIBLE_REFUND]: {
    customer_id: 'cust_qa_eligible_001',
    email_masked: 'eli***@test.com',
    tier: 'standard',
    subscription_status: 'active',
    created_at: '2025-01-15T00:00:00Z',
  },
  [SCENARIOS.INELIGIBLE_DIGITAL]: {
    customer_id: 'cust_qa_ineligible_002',
    email_masked: 'ine***@test.com',
    tier: 'standard',
    subscription_status: 'active',
    created_at: '2025-03-10T00:00:00Z',
  },
  [SCENARIOS.PAYMENT_CONFLICT]: {
    customer_id: 'cust_qa_conflict_003',
    email_masked: 'con***@test.com',
    tier: 'vip',
    subscription_status: 'active',
    created_at: '2024-11-01T00:00:00Z',
  },
};

// ─── Order Fixtures ───────────────────────────────────────────────────────────

export const ORDERS: Record<string, object> = {
  'ORD-QA-REFUNDABLE': {
    order_id: 'ORD-QA-REFUNDABLE',
    customer_id: 'cust_qa_eligible_001',
    status: 'completed',
    items: [{ product_id: 'PROD-SUB-MONTHLY', name: '월간 구독', quantity: 1, price_krw: 9900 }],
    total_krw: 9900,
    created_at: '2026-04-28T10:00:00Z',
  },
  'ORD-QA-DIGITAL': {
    order_id: 'ORD-QA-DIGITAL',
    customer_id: 'cust_qa_ineligible_002',
    status: 'completed',
    items: [{ product_id: 'PROD-EBOOK-001', name: '디지털 콘텐츠 패키지', quantity: 1, price_krw: 29900 }],
    total_krw: 29900,
    created_at: '2026-04-20T09:00:00Z',
  },
  'ORD-QA-CONFLICT': {
    order_id: 'ORD-QA-CONFLICT',
    customer_id: 'cust_qa_conflict_003',
    status: 'completed',
    items: [{ product_id: 'PROD-SUB-ANNUAL', name: '연간 구독', quantity: 1, price_krw: 99000 }],
    total_krw: 99000,
    created_at: '2026-03-01T08:00:00Z',
  },
  'ORD-QA-DELAYED': {
    order_id: 'ORD-QA-DELAYED',
    customer_id: 'cust_qa_eligible_001',
    status: 'shipped',
    items: [{ product_id: 'PROD-PHYSICAL-001', name: '웰니스 키트', quantity: 1, price_krw: 49000 }],
    total_krw: 49000,
    created_at: '2026-04-22T11:00:00Z',
  },
  'ORD-QA-DELIVERED': {
    order_id: 'ORD-QA-DELIVERED',
    customer_id: 'cust_qa_eligible_001',
    status: 'delivered',
    items: [{ product_id: 'PROD-PHYSICAL-001', name: '웰니스 키트', quantity: 1, price_krw: 49000 }],
    total_krw: 49000,
    created_at: '2026-04-15T11:00:00Z',
  },
  'ORD-QA-PAYMENT-PENDING': {
    order_id: 'ORD-QA-PAYMENT-PENDING',
    customer_id: 'cust_qa_eligible_001',
    status: 'pending',
    items: [{ product_id: 'PROD-SUB-MONTHLY', name: '월간 구독', quantity: 1, price_krw: 9900 }],
    total_krw: 9900,
    created_at: '2026-04-30T07:00:00Z',
  },
};

// ─── Shipment Fixtures ────────────────────────────────────────────────────────

export const SHIPMENTS: Record<string, object> = {
  'ORD-QA-DELAYED': {
    order_id: 'ORD-QA-DELAYED',
    carrier: 'CJ대한통운',
    tracking_number: 'CJ-QA-123456',
    status: 'delayed',
    estimated_delivery: '2026-05-03T23:59:00Z',
    reason_code: 'SHIPMENT_DELAYED',
    delay_reason: '물류 센터 적체',
  },
  'ORD-QA-DELIVERED': {
    order_id: 'ORD-QA-DELIVERED',
    carrier: 'CJ대한통운',
    tracking_number: 'CJ-QA-999999',
    status: 'delivered',
    delivered_at: '2026-04-18T14:30:00Z',
    estimated_delivery: null,
    reason_code: null,
  },
  'ORD-QA-REFUNDABLE': {
    order_id: 'ORD-QA-REFUNDABLE',
    carrier: null,
    tracking_number: null,
    status: 'not_applicable',
    reason_code: null,
    note: '디지털/구독 상품 — 배송 없음',
  },
};

// ─── Payment Fixtures ─────────────────────────────────────────────────────────

export const PAYMENTS: Record<string, object> = {
  'ORD-QA-REFUNDABLE': {
    order_id: 'ORD-QA-REFUNDABLE',
    payment_id: 'PAY-QA-ELIGIBLE-001',
    amount: 9900,
    method: 'card',
    status: 'completed',
    transaction_id: 'TXN-QA-001',
    paid_at: '2026-04-28T10:01:00Z',
  },
  'ORD-QA-DIGITAL': {
    order_id: 'ORD-QA-DIGITAL',
    payment_id: 'PAY-QA-DIGITAL-002',
    amount: 29900,
    method: 'card',
    status: 'completed',
    transaction_id: 'TXN-QA-002',
    paid_at: '2026-04-20T09:01:00Z',
  },
  'ORD-QA-CONFLICT': {
    order_id: 'ORD-QA-CONFLICT',
    payment_id: null,
    amount: null,
    method: null,
    status: 'not_found',
    reason_code: 'PAYMENT_NOT_FOUND',
    transaction_id: null,
  },
  'ORD-QA-PAYMENT-PENDING': {
    order_id: 'ORD-QA-PAYMENT-PENDING',
    payment_id: 'PAY-QA-PENDING-003',
    amount: 9900,
    method: 'bank_transfer',
    status: 'pending',
    transaction_id: null,
    note: '가상계좌 입금 대기 중',
  },
};

// ─── RefundEligibility Fixtures ───────────────────────────────────────────────

export const REFUND_ELIGIBILITY: Record<string, object> = {
  'ORD-QA-REFUNDABLE': {
    order_id: 'ORD-QA-REFUNDABLE',
    eligible: true,
    reason_codes: ['WITHIN_REFUND_WINDOW'],
    within_window: true,
    dry_run_result: { refund_amount: 9900, processing_days: 3 },
    notes: ['구독 해지 후 7일 이내 환불 가능'],
  },
  'ORD-QA-DIGITAL': {
    order_id: 'ORD-QA-DIGITAL',
    eligible: false,
    reason_codes: ['DIGITAL_CONTENT_DOWNLOADED'],
    within_window: true,
    dry_run_result: null,
    notes: ['디지털 콘텐츠 다운로드 완료 — 정책상 환불 불가'],
  },
  'ORD-QA-CONFLICT': {
    order_id: 'ORD-QA-CONFLICT',
    eligible: false,
    reason_codes: ['PAYMENT_NOT_FOUND'],
    within_window: null,
    dry_run_result: null,
    requires_human_review: true,
    notes: ['결제 기록 없음 — 수동 조사 필요'],
  },
};

// ─── Coupon Fixtures ──────────────────────────────────────────────────────────

export const COUPONS: Record<string, object> = {
  'QA-EXPIRED': {
    code: 'QA-EXPIRED',
    valid: false,
    discount_type: 'percentage',
    discount_value: 20,
    expiry: '2026-03-31T23:59:59Z',
    min_order_amount: 0,
    reason_code: 'COUPON_EXPIRED',
    message: '쿠폰 유효기간이 만료됐습니다',
  },
  'QA-MIN-AMOUNT': {
    code: 'QA-MIN-AMOUNT',
    valid: false,
    discount_type: 'fixed',
    discount_value: 5000,
    expiry: '2026-12-31T23:59:59Z',
    min_order_amount: 30000,
    reason_code: 'MIN_ORDER_AMOUNT_NOT_MET',
    message: '최소 주문금액(30,000원) 미충족',
  },
  'QA-VALID-10': {
    code: 'QA-VALID-10',
    valid: true,
    discount_type: 'percentage',
    discount_value: 10,
    expiry: '2026-12-31T23:59:59Z',
    min_order_amount: 0,
    reason_code: null,
    message: '사용 가능한 쿠폰입니다',
  },
};

// ─── Product Fixtures ─────────────────────────────────────────────────────────

export const PRODUCTS: Record<string, object> = {
  'PROD-QA-OOS': {
    product_id: 'PROD-QA-OOS',
    name: '웰니스 프리미엄 키트',
    category: '건강/뷰티',
    in_stock: false,
    restock_eta: '2026-05-15',
    reason_code: 'PRODUCT_OUT_OF_STOCK',
    message: '현재 품절 상태입니다. 재입고 예정일: 2026-05-15',
  },
  'PROD-PHYSICAL-001': {
    product_id: 'PROD-PHYSICAL-001',
    name: '웰니스 키트',
    category: '건강/뷰티',
    in_stock: true,
    restock_eta: null,
    reason_code: null,
  },
  'PROD-SUB-MONTHLY': {
    product_id: 'PROD-SUB-MONTHLY',
    name: '월간 구독',
    category: '구독',
    in_stock: true,
    restock_eta: null,
    reason_code: null,
  },
};

// ─── Review Event Fixtures ────────────────────────────────────────────────────

export const REVIEW_EVENTS: Record<string, object> = {
  'EVT-QA-REVIEW-001': {
    event_id: 'EVT-QA-REVIEW-001',
    customer_id: 'cust_qa_eligible_001',
    product_id: 'PROD-PHYSICAL-001',
    review_submitted_at: '2026-04-25T10:00:00Z',
    reward_status: 'pending',
    reward_points: 500,
    reason_code: 'REVIEW_REWARD_PENDING',
    expected_credit_at: '2026-05-02T10:00:00Z',
    message: '리뷰 적립금은 리뷰 작성 후 7일 이내 지급됩니다',
  },
  'EVT-QA-REVIEW-002': {
    event_id: 'EVT-QA-REVIEW-002',
    customer_id: 'cust_qa_eligible_001',
    product_id: 'PROD-PHYSICAL-001',
    review_submitted_at: '2026-04-01T10:00:00Z',
    reward_status: 'credited',
    reward_points: 500,
    reason_code: null,
    credited_at: '2026-04-08T10:00:00Z',
  },
};
