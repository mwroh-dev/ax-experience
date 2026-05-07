import { Controller, Get, Post, Query, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { QaFixtureService } from '../qa-fixture.service';
import { email_scenario, order_scenario, REFUND_ELIGIBILITY, SCENARIOS } from '../fixtures';

const EligibilityQuerySchema = z.object({
  orderId: z.string().optional(),
  email: z.string().optional(),
});

const DryRunBodySchema = z.object({
  order_id: z.string().optional(),
  customer_id: z.string().optional(),
  reason: z.string().optional(),
});

@Controller()
export class RefundController {
  constructor(private readonly qa: QaFixtureService) {}

  @Get('commerce/refunds/eligibility')
  checkEligibility(@Query() query: unknown) {
    const parsed = EligibilityQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    }
    const { orderId, email } = parsed.data;
    if (!orderId && !email) throw new BadRequestException('orderId or email query param required');
    if (orderId) {
      const db_rec = this.qa.get('refund_eligibility', orderId);
      if (db_rec) return { found: true, ...db_rec };
      const fixture = (REFUND_ELIGIBILITY as any)[orderId];
      if (fixture) return { found: true, ...fixture };
      const s = order_scenario(orderId);
      if (s === SCENARIOS.ELIGIBLE_REFUND)
        return { found: true, ...(REFUND_ELIGIBILITY['ORD-QA-REFUNDABLE'] as object), order_id: orderId };
      if (s === SCENARIOS.INELIGIBLE_DIGITAL)
        return { found: true, ...(REFUND_ELIGIBILITY['ORD-QA-DIGITAL'] as object), order_id: orderId };
      if (s === SCENARIOS.PAYMENT_CONFLICT)
        return { found: true, ...(REFUND_ELIGIBILITY['ORD-QA-CONFLICT'] as object), order_id: orderId };
    }
    if (email) {
      const s = email_scenario(email);
      if (s === SCENARIOS.ELIGIBLE_REFUND)
        return { found: true, ...(REFUND_ELIGIBILITY['ORD-QA-REFUNDABLE'] as object) };
      if (s === SCENARIOS.INELIGIBLE_DIGITAL)
        return { found: true, ...(REFUND_ELIGIBILITY['ORD-QA-DIGITAL'] as object) };
      if (s === SCENARIOS.PAYMENT_CONFLICT)
        return { found: true, ...(REFUND_ELIGIBILITY['ORD-QA-CONFLICT'] as object) };
    }
    return {
      found: true, eligible: null, reason_codes: [], within_window: null,
      requires_human_review: true,
      notes: ['환불 가능 여부 확인을 위해 주문번호 또는 고객 정보가 필요합니다'],
    };
  }

  @Post('commerce/refunds/dry-run')
  @HttpCode(HttpStatus.OK)
  dryRunRefund(@Body() body: unknown) {
    const parsed = DryRunBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    }
    const { order_id, customer_id, reason } = parsed.data;
    if (!order_id && !customer_id) throw new BadRequestException('order_id or customer_id required');
    const eligibility = order_id ? (REFUND_ELIGIBILITY as any)[order_id] : null;
    if (eligibility?.eligible === false) {
      return {
        dry_run: true, order_id: order_id ?? null, customer_id: customer_id ?? null,
        would_refund: false, reason_codes: eligibility.reason_codes,
        warnings: ['This is a dry-run. No actual refund was processed.', 'Refund not eligible per current policy.'],
      };
    }
    return {
      dry_run: true, order_id: order_id ?? null, customer_id: customer_id ?? null,
      reason: reason ?? 'unspecified', would_refund: true, would_refund_amount: 9900,
      processing_days: 3,
      warnings: ['This is a dry-run. No actual refund was processed.', 'Real execution requires admin approval.'],
    };
  }
}
