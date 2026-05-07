import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { QaFixtureService } from '../qa-fixture.service';
import { email_scenario, CUSTOMERS, SCENARIOS } from '../fixtures';

@Controller()
export class CustomerController {
  constructor(private readonly qa: QaFixtureService) {}

  @Get('commerce/customers/lookup')
  async lookup(@Query('email') email?: string) {
    if (!email) throw new BadRequestException('email query param required');
    const scenario = email_scenario(email);
    if (scenario === SCENARIOS.TIMEOUT) await new Promise(r => setTimeout(r, 6000));
    if (scenario === SCENARIOS.NOT_FOUND) return { found: false, customer_id: null, email_masked: null };
    const db_rec = this.qa.get('customers', scenario);
    if (db_rec) return { found: true, ...db_rec };
    const fixture = (CUSTOMERS as any)[scenario];
    if (fixture) return { found: true, ...fixture };
    return {
      found: true,
      customer_id: `cust_${email.replace(/[@.]/g, '_').slice(0, 20)}`,
      email_masked: email.replace(/(.{2}).+(@.+)/, '$1***$2'),
      tier: 'standard', subscription_status: 'active',
      created_at: '2025-06-01T00:00:00Z',
    };
  }
}
