import { Controller, Get, Param } from '@nestjs/common';
import { QaFixtureService } from '../qa-fixture.service';
import { order_scenario, ORDERS, SHIPMENTS, PAYMENTS, SCENARIOS } from '../fixtures';

@Controller()
export class OrderController {
  constructor(private readonly qa: QaFixtureService) {}

  @Get('commerce/orders/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    const db_rec = this.qa.get('orders', orderId);
    if (db_rec) return { found: true, ...db_rec };
    const fixture = (ORDERS as any)[orderId];
    if (fixture) return { found: true, ...fixture };
    const scenario = order_scenario(orderId);
    const fallback = Object.values(ORDERS).find((o: any) => order_scenario(o.order_id) === scenario) as any;
    if (fallback) return { found: true, ...fallback, order_id: orderId };
    return { found: false, error: `Order ${orderId} not found` };
  }

  @Get('commerce/orders/:orderId/shipment')
  getShipment(@Param('orderId') orderId: string) {
    const db_rec = this.qa.get('shipments', orderId);
    if (db_rec) return { found: true, ...db_rec };
    const fixture = (SHIPMENTS as any)[orderId];
    if (fixture) return { found: true, ...fixture };
    const scenario = order_scenario(orderId);
    if (scenario === SCENARIOS.SHIPPING_DELAYED)
      return { found: true, ...(SHIPMENTS['ORD-QA-DELAYED'] as object), order_id: orderId };
    if (scenario === SCENARIOS.ORDER_DELIVERED)
      return { found: true, ...(SHIPMENTS['ORD-QA-DELIVERED'] as object), order_id: orderId };
    return { found: false, order_id: orderId, note: '배송 정보 없음 (디지털/구독 상품)' };
  }

  @Get('commerce/orders/:orderId/payment')
  getPayment(@Param('orderId') orderId: string) {
    const db_rec = this.qa.get('payments', orderId);
    if (db_rec) return { found: true, ...db_rec };
    const fixture = (PAYMENTS as any)[orderId];
    if (fixture) return { found: true, ...fixture };
    const scenario = order_scenario(orderId);
    if (scenario === SCENARIOS.PAYMENT_CONFLICT)
      return { found: true, ...(PAYMENTS['ORD-QA-CONFLICT'] as object), order_id: orderId };
    if (scenario === SCENARIOS.PAYMENT_PENDING)
      return { found: true, ...(PAYMENTS['ORD-QA-PAYMENT-PENDING'] as object), order_id: orderId };
    return {
      found: true, order_id: orderId,
      payment_id: `PAY-${orderId}-001`, amount: 9900,
      method: 'card', status: 'completed',
      transaction_id: `TXN-${orderId}-001`,
    };
  }
}
