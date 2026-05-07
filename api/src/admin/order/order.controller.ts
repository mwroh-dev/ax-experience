import { Controller, Get, Param } from '@nestjs/common';

function order_scenario(orderId: string): { status: string; carrier?: string; trackingNumber?: string; estimatedDelivery?: string } {
  const id = orderId.toLowerCase();
  if (id.startsWith('transit_') || id.includes('67890'))
    return { status: 'in_transit', carrier: 'CJ대한통운', trackingNumber: `TRK${orderId.slice(-6).padStart(9, '0')}`, estimatedDelivery: '2026-05-15' };
  if (id.startsWith('delivered_') || id.includes('12345'))
    return { status: 'delivered' };
  if (id.startsWith('cancelled_') || id.includes('33333'))
    return { status: 'cancelled' };
  if (id.startsWith('returned_') || id.includes('22222'))
    return { status: 'returned' };
  if (id.startsWith('notshipped_') || id.includes('11111'))
    return { status: 'not_shipped', estimatedDelivery: '2026-05-20' };
  // Default: all unrecognized IDs treated as in_transit for demo/test purposes
  return { status: 'in_transit', carrier: 'CJ대한통운', trackingNumber: `TRK${orderId.slice(-6).padStart(9, '0')}`, estimatedDelivery: '2026-05-15' };
}

@Controller()
export class AdminOrderController {
  @Get('admin/orders/:orderId/status')
  getOrderStatus(@Param('orderId') orderId: string) {
    return { orderId, ...order_scenario(orderId) };
  }
}
