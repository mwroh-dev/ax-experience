import { Test } from '@nestjs/testing';
import { EngagementController } from './engagement.controller';
import { QaFixtureService } from '../qa-fixture.service';

const mockQa = { get: jest.fn().mockReturnValue(null) };

describe('Commerce / EngagementController', () => {
  let ctrl: EngagementController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [EngagementController],
      providers: [{ provide: QaFixtureService, useValue: mockQa }],
    }).compile();
    ctrl = m.get(EngagementController);
    jest.clearAllMocks();
  });

  it('EVT-QA-REVIEW-001 returns reward_status=pending', () => {
    const r = ctrl.getReviewReward('EVT-QA-REVIEW-001');
    expect(r.found).toBe(true);
    expect((r as any).reward_status).toBe('pending');
  });

  it('unknown event returns found=false', () => {
    const r = ctrl.getReviewReward('EVT-UNKNOWN-999');
    expect(r.found).toBe(false);
  });
});
