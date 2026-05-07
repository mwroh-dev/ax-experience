# Commerce API (Mock)

## Role

The Mock Commerce API provides fixture-based order, refund, and coupon data for the CS pipeline. When a CS message contains an order ID or customer reference, the pipeline queries this API to retrieve commerce evidence for the draft reply.

- **Port:** 3101 (auto-started by api on boot)
- **Data:** All responses are deterministic fixtures — no real payment processor
- **Endpoints:** orders, shipments, payment details, refund eligibility, coupon validation, product info

## Prerequisites

None — the mock Commerce API starts automatically with api. No external accounts or tokens needed.

## Fixture Order IDs

| Order ID | Scenario |
|----------|---------|
| ORD-REFUND | Refund-eligible order |
| ORD-SHIPPED | Order with tracking info |
| ORD-PENDING | Order awaiting shipment |

Use these IDs in test CS messages to trigger commerce lookups.

## What Breaks Without It

If port 3101 is unavailable (e.g., port conflict):
- `commerce_lookup` AutomationRun fails
- Evidence retrieval returns no commerce data
- Drafts lack order/refund context

Check: `curl -s http://localhost:3101/commerce/orders/ORD-REFUND`

## Limitations

- No real payment data — all amounts and dates are hardcoded fixtures
- No state mutations — refund requests do not change order status
- Single-process only (SQLite constraint; not for concurrent production use)
