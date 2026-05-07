/**
 * Commerce API Client
 *
 * cs-ops-core가 Commerce API를 호출하는 래퍼.
 * 현재는 mock (localhost:3100/commerce)을 가리킨다.
 * 실 연결 시 COMMERCE_API_BASE_URL 환경변수로 교체 가능.
 *
 * 원칙: Slack-specific 값 (channel_id, thread_ts 등)을 절대 전달하지 않음.
 */

import { config } from '../config';

const COMMERCE_BASE = config.commerce_api_base_url;

const TIMEOUT_MS = 5000;

async function commerce_get(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${COMMERCE_BASE}${path}`, { signal: controller.signal });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Commerce API GET ${path} failed: HTTP ${resp.status} — ${text}`);
    }
    return resp.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Commerce API GET ${path} timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function commerce_post(path: string, body: object): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${COMMERCE_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Commerce API POST ${path} failed: HTTP ${resp.status} — ${text}`);
    }
    return resp.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Commerce API POST ${path} timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookup_commerce_customer(email: string): Promise<unknown> {
  return commerce_get(`/customers/lookup?email=${encodeURIComponent(email)}`);
}

export async function get_order(order_id: string): Promise<unknown> {
  return commerce_get(`/orders/${encodeURIComponent(order_id)}`);
}

export async function get_shipment(order_id: string): Promise<unknown> {
  return commerce_get(`/orders/${encodeURIComponent(order_id)}/shipment`);
}

export async function get_payment(order_id: string): Promise<unknown> {
  return commerce_get(`/orders/${encodeURIComponent(order_id)}/payment`);
}

export async function check_refund_eligibility_by_order(order_id: string): Promise<unknown> {
  return commerce_get(`/refunds/eligibility?orderId=${encodeURIComponent(order_id)}`);
}

export async function check_refund_eligibility_by_email(email: string): Promise<unknown> {
  return commerce_get(`/refunds/eligibility?email=${encodeURIComponent(email)}`);
}

export async function dry_run_commerce_refund(
  order_id: string | null,
  customer_id: string | null,
  reason?: string
): Promise<unknown> {
  return commerce_post('/refunds/dry-run', { order_id, customer_id, reason });
}

export async function validate_coupon(code: string): Promise<unknown> {
  return commerce_get(`/coupons/${encodeURIComponent(code)}/validation`);
}

export async function get_product(product_id: string): Promise<unknown> {
  return commerce_get(`/products/${encodeURIComponent(product_id)}`);
}

export async function get_review_reward_status(event_id: string): Promise<unknown> {
  return commerce_get(`/review-events/${encodeURIComponent(event_id)}/reward-status`);
}

export async function commerce_health(): Promise<unknown> {
  return commerce_get('/health');
}
