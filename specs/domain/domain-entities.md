# Domain Entities — D2C CS/VOC AX Ops Hub

> Version: 1.0  
> Purpose: Canonical field names and schemas for all domain entities. All Phases reference this document.

---

## CsTicket (core entity)

```typescript
interface CsTicket {
  id: string;                    // UUID, prefix case_
  raw_text: string;              // Original customer inquiry text
  intent: string;                // Classified intent from routing-rules
  risk_level: 'low' | 'medium' | 'high' | 'unknown';
  status: CsTicketStatus;
  recommended_path: RecommendedPath;
  customer_id?: string;          // Extracted from text or lookup
  order_id?: string;             // Extracted from text
  required_fields?: string[];    // Fields needed if pending_info_required
  source_channel: string;        // Slack channel ID
  source_message_ts: string;     // Slack message timestamp
  created_at: string;            // ISO 8601
  updated_at: string;
}

type CsTicketStatus =
  | 'intake_review'       // Arrived, awaiting human action
  | 'accepted'            // Reviewer clicked Accept, draft pipeline running
  | 'pending'             // Waiting for customer to provide more info
  | 'draft_ready'         // Draft generated, awaiting Send/Deny
  | 'sent'               // Reply sent to customer
  | 'denied'             // Reviewer denied reply
  | 'escalated'          // Sent to escalation path
  | 'resolved'           // Closed as sent
  | 'no_action'          // Closed without reply
  | 'backlog';           // Moved to improvement backlog

type RecommendedPath =
  | 'auto_reply_candidate'
  | 'review_required'
  | 'pending_info_required'
  | 'admin_lookup_required'
  | 'no_source_backlog'
  | 'high_risk_escalation';
```

---

## Customer

```typescript
interface Customer {
  id: string;
  email: string;
  name?: string;
  tier?: 'standard' | 'vip' | 'trial';
}
```

---

## Order

```typescript
interface Order {
  id: string;            // Format: ORD-XXXXX
  customer_id: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  total: number;
  currency: string;
  created_at: string;
  items: OrderItem[];
}

interface OrderItem {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
}
```

---

## Shipment

```typescript
interface Shipment {
  order_id: string;
  carrier: string;
  tracking_number: string;
  status: 'preparing' | 'in_transit' | 'delivered' | 'delayed' | 'lost';
  estimated_delivery: string;   // ISO 8601 date
  last_updated: string;
  reason_code?: string;
}
```

---

## Payment

```typescript
interface Payment {
  order_id: string;
  method: 'credit_card' | 'bank_transfer' | 'virtual_account' | 'coupon_only';
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'partial_refund';
  amount: number;
  currency: string;
  transaction_id: string;
  paid_at?: string;
  reason_code?: string;
}
```

---

## RefundEligibility

```typescript
interface RefundEligibility {
  order_id: string;
  eligible: boolean;
  reason: string;
  reason_code: string;
  amount_refundable: number;
  policy_url?: string;
  expires_at?: string;
}
```

---

## Coupon

```typescript
interface Coupon {
  code: string;
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  status: 'valid' | 'expired' | 'used' | 'invalid';
  reason_code: string;
  expires_at?: string;
  min_order_amount?: number;
}
```

---

## Product

```typescript
interface Product {
  id: string;
  name: string;
  sku: string;
  status: 'available' | 'out_of_stock' | 'discontinued' | 'coming_soon';
  restock_date?: string;
  reason_code: string;
}
```

---

## ReviewEvent

```typescript
interface ReviewEvent {
  event_id: string;
  order_id: string;
  customer_id: string;
  reward_status: 'pending' | 'credited' | 'rejected' | 'expired';
  points_amount?: number;
  reason_code: string;
  credited_at?: string;
}
```

---

## EvidencePacket

```typescript
interface EvidencePacket {
  case_id: string;
  sources: EvidenceSource[];
  retrieved_at: string;
}

interface EvidenceSource {
  source_type: 'commerce' | 'notion_knowledge' | 'admin_lookup' | 'playbook';
  endpoint?: string;
  data: Record<string, unknown>;
  reason_code?: string;
  retrieved_at: string;
}
```

---

## AutomationRun

```typescript
interface AutomationRun {
  id: string;
  case_id: string;
  run_type: AutomationRunType;
  status: 'success' | 'error' | 'skipped';
  latency_ms?: number;
  input_hash?: string;         // SHA256 of input JSON
  output_summary?: string;     // First 200 chars of output
  error_message?: string;
  prompt_version_id?: string;  // Links to PromptVersion
  created_at: string;
}

type AutomationRunType =
  | 'classify'
  | 'retrieve_evidence'
  | 'commerce_lookup'
  | 'draft_reply'
  | 'pending_investigation'
  | 'retry_draft'
  | 'no_source_backlog'
  | 'escalation'
  | 'notion_write'
  | 'slack_post'
  | 'voc_report';
```

---

## PromptVersion

```typescript
interface PromptVersion {
  id: string;
  run_type: AutomationRunType;
  version: string;             // semver: 1.0.0
  template_hash: string;       // SHA256 of prompt template
  notes?: string;
  created_at: string;
}
```

---

## VocItem (generated test data)

```typescript
interface VocItem {
  id: string;
  raw_text: string;
  expected_intent: string;
  expected_route: RecommendedPath;
  expected_required_fields: string[];
  category: 'golden' | 'holdout';
  holdout_category?: 'ambiguous' | 'mixed_intent' | 'colloquial' | 'missing_info';
}
```
