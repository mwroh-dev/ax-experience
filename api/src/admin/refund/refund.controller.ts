import { Controller, Get, Post, Query, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const AdminEligibilityQuerySchema = z.object({
  orderId: z.string().optional(),
});

const AdminDryRunBodySchema = z.object({
  customer_id: z.string(),
  payment_id: z.string(),
  reason: z.string().optional(),
});

@Controller()
export class AdminRefundController {
  @Get('admin/refunds/eligibility')
  async checkEligibility(@Query() query: unknown) {
    const parsed = AdminEligibilityQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map(i => i.message));
    }
    const { orderId } = parsed.data;
    if (!orderId) throw new BadRequestException('orderId query param required');
    if (orderId.toLowerCase().startsWith('ineligible_')) {
      return { eligible: false, reason: 'Digital content already downloaded', daysReturn: 30, withinWindow: false };
    }
    return { eligible: true, reason: 'Within 30-day return window', daysReturn: 30, withinWindow: true };
  }

  @Post('admin/refunds/dry-run')
  @HttpCode(HttpStatus.OK)
  dryRunRefund(@Body() body: unknown) {
    const parsed = AdminDryRunBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map(i => i.message));
    }
    const { customer_id, payment_id, reason } = parsed.data;
    return {
      dry_run: true, customer_id, payment_id,
      reason: reason ?? 'unspecified',
      would_refund_krw: 9900,
      warnings: ['This is a dry-run. No actual refund was processed.'],
    };
  }
}
