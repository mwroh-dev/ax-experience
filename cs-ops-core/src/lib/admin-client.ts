// cs-ops-core/src/lib/admin-client.ts
import { OrderStatus, CustomerInfo, RefundEligibility } from '../types';

const ADMIN_BASE = process.env.MOCK_ADMIN_API_URL ?? 'http://localhost:3100';

export async function fetch_order_status(order_id: string): Promise<OrderStatus | undefined> {
  try {
    const res = await fetch(`${ADMIN_BASE}/admin/orders/${order_id}/status`);
    if (!res.ok) return undefined;
    return (await res.json()) as OrderStatus;
  } catch {
    return undefined;
  }
}

export async function fetch_customer(email: string): Promise<CustomerInfo | undefined> {
  try {
    const res = await fetch(`${ADMIN_BASE}/admin/customers/lookup?email=${encodeURIComponent(email)}`);
    if (!res.ok) return undefined;
    return (await res.json()) as CustomerInfo;
  } catch {
    return undefined;
  }
}

export async function fetch_refund_eligibility(order_id: string): Promise<RefundEligibility | undefined> {
  try {
    const res = await fetch(`${ADMIN_BASE}/admin/refunds/eligibility?orderId=${order_id}`);
    if (!res.ok) return undefined;
    return (await res.json()) as RefundEligibility;
  } catch {
    return undefined;
  }
}
