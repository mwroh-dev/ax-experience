import { Controller, Get, Param } from '@nestjs/common';
import { QaFixtureService } from '../qa-fixture.service';
import { REVIEW_EVENTS } from '../fixtures';

@Controller()
export class EngagementController {
  constructor(private readonly qa: QaFixtureService) {}

  @Get('commerce/review-events/:eventId/reward-status')
  getReviewReward(@Param('eventId') eventId: string) {
    const db_rec = this.qa.get('review_events', eventId);
    if (db_rec) return { found: true, ...db_rec };
    const fixture = (REVIEW_EVENTS as any)[eventId];
    if (fixture) return { found: true, ...fixture };
    return { found: false, event_id: eventId, reward_status: 'not_found', message: '리뷰 이벤트를 찾을 수 없습니다' };
  }
}
