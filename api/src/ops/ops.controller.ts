// api/src/ops/ops.controller.ts
import { Controller, Post, Get, Query, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { process_cs_message } from '@cs-ops-core/pipeline';
import { get_kb } from '@cs-ops-core/knowledge/db';
import { suggest_kb_patterns, KbPatternCandidate } from '@cs-ops-core/knowledge/pattern-suggester';

const CsPipelineBodySchema = z.object({
  message: z.string(),
  slack_ts: z.string().optional(),
});

const KbSuggestionsQuerySchema = z.object({
  min_samples: z.string().regex(/^\d+$/).optional(),
});

@Controller()
export class OpsController {
  @Post('api/ops/cs-pipeline')
  @HttpCode(HttpStatus.OK)
  async csPipeline(@Body() body: unknown) {
    const parsed = CsPipelineBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    }
    return process_cs_message(parsed.data.message, parsed.data.slack_ts ?? 'ops_api');
  }

  @Get('api/ops/kb/suggestions')
  kbSuggestions(@Query() query: unknown): KbPatternCandidate[] {
    const parsed = KbSuggestionsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    }
    const threshold = parsed.data.min_samples ? parseInt(parsed.data.min_samples, 10) : 5;
    return suggest_kb_patterns(get_kb(), threshold);
  }
}
