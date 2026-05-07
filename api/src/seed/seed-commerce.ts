import { get_db } from '../db/sqlite';
import {
  CUSTOMERS, ORDERS, SHIPMENTS, PAYMENTS,
  REFUND_ELIGIBILITY, COUPONS, PRODUCTS, REVIEW_EVENTS,
} from '../commerce/fixtures';

const db = get_db();
const upsert = db.prepare(
  'INSERT OR REPLACE INTO qa_fixtures (collection, key, data_json) VALUES (?, ?, ?)'
);

db.transaction(() => {
  for (const [k, v] of Object.entries(CUSTOMERS))          upsert.run('customers',          k, JSON.stringify(v));
  for (const [k, v] of Object.entries(ORDERS))             upsert.run('orders',             k, JSON.stringify(v));
  for (const [k, v] of Object.entries(SHIPMENTS))          upsert.run('shipments',          k, JSON.stringify(v));
  for (const [k, v] of Object.entries(PAYMENTS))           upsert.run('payments',           k, JSON.stringify(v));
  for (const [k, v] of Object.entries(REFUND_ELIGIBILITY)) upsert.run('refund_eligibility', k, JSON.stringify(v));
  for (const [k, v] of Object.entries(COUPONS))            upsert.run('coupons',            k, JSON.stringify(v));
  for (const [k, v] of Object.entries(PRODUCTS))           upsert.run('products',           k, JSON.stringify(v));
  for (const [k, v] of Object.entries(REVIEW_EVENTS))      upsert.run('review_events',      k, JSON.stringify(v));
})();

console.log('[seed] Commerce QA fixtures injected into qa_fixtures table.');
