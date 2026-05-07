import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';

function customer_id_from_email(email: string): string {
  return `cust_${email.replace(/[@.]/g, '_').replace(/[^a-z0-9_]/gi, '').slice(0, 20)}`;
}

@Controller()
export class AdminCustomerController {
  @Get('admin/customers/lookup')
  async lookup(@Query('email') email?: string) {
    if (!email) throw new BadRequestException('email query param required');
    if (email.toLowerCase().startsWith('notfound_')) return null;
    if (email.toLowerCase().startsWith('timeout_')) await new Promise(r => setTimeout(r, 6000));
    return {
      customerId: customer_id_from_email(email),
      email_masked: email.replace(/(.{2}).+(@.+)/, '$1***$2'),
      orderCount: 3,
      firstOrderDate: '2025-01-15',
    };
  }

  @Get('admin/customers/:customerId/subscription')
  getSubscription(@Param('customerId') customerId: string) {
    return {
      customer_id: customerId,
      subscription_id: 'sub_stub_001',
      plan: 'monthly',
      status: 'active',
      started_at: '2025-01-15T00:00:00Z',
      next_billing_at: '2026-05-15T00:00:00Z',
      auto_renew: true,
    };
  }
}
