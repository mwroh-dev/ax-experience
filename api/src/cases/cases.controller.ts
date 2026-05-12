import { Controller, Get, Post, Body, Query, Param, Res, HttpCode, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { list_cases, create_case, find_case_by_external_request_id, get_case } from './case-store';
import { get_automation_runs, get_recent_automation_runs } from './automation-run-store';
import { write_case_summary } from '../tools/notion-client';
import { on_cs_event } from '../workflows/on_cs_event';
import { check_trajectory } from '../tools/trajectory-eval';
import { post_knowledge_gap_digest } from '../metrics/knowledge-gap-digest';
import { post_stale_case_alert } from '../ops/stale-case-alert';

const CreateCaseBodySchema = z.object({
  source_type: z.string(),
  external_request_id: z.string().optional(),
  raw_text: z.string(),
});

const ListCasesQuerySchema = z.object({
  limit: z.string().optional(),
});

@Controller()
export class CasesController {
  @Get('admin/cases')
  listCases(@Query() query: unknown) {
    const parsed = ListCasesQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map(i => i.message));
    }
    const limit = parsed.data.limit ?? '50';
    const n = Math.min(parseInt(limit, 10) || 50, 200);
    const cases = list_cases(n).map(c => ({
      ...c,
      raw_text: undefined,
      raw_preview: c.raw_text.length > 60 ? c.raw_text.slice(0, 60) + '…' : c.raw_text,
    }));
    return { cases };
  }

  @Post('api/cases')
  createCase(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = CreateCaseBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map(i => i.message));
    }
    if (parsed.data.external_request_id) {
      const existing = find_case_by_external_request_id(parsed.data.external_request_id);
      if (existing) {
        res.status(HttpStatus.OK);
        return existing;
      }
    }
    res.status(HttpStatus.CREATED);
    return create_case(parsed.data);
  }

  @Get('api/automation-runs')
  listRuns(@Query('case_id') case_id?: string, @Query('limit') limit = '50') {
    if (case_id) {
      return { runs: get_automation_runs(String(case_id)) };
    }
    return { runs: get_recent_automation_runs(parseInt(limit, 10) || 50) };
  }

  @Get('admin/cases/:case_id/eval')
  evalCase(@Param('case_id') case_id: string) {
    const c = get_case(case_id);
    if (!c) throw new NotFoundException(`case not found: ${case_id}`);

    const trajectory = check_trajectory(case_id);
    const runs = get_automation_runs(case_id);
    const eval_run = runs.filter(r => r.run_type === 'eval_draft').at(-1);

    return {
      case_id,
      trajectory,
      draft_eval: eval_run
        ? { summary: eval_run.output_summary, status: eval_run.status }
        : null,
    };
  }

  @Post('api/cases/:case_id/notion-write')
  async notionWrite(
    @Param('case_id') case_id: string,
    @Body() body: { final_action?: string; resolved_at?: string }
  ) {
    const c = get_case(case_id);
    if (!c) throw new NotFoundException(`case not found: ${case_id}`);
    const result = await write_case_summary({
      case_id: c.id,
      source_type: c.source_type,
      status: c.status,
      intent: c.intent,
      raw_text: c.raw_text,
      final_action: body.final_action,
      created_at: c.created_at,
      resolved_at: body.resolved_at,
    });
    return { ok: true, case_id, ...result };
  }

  @Post('api/ops/knowledge-gap-digest')
  async knowledgeGapDigest() {
    return post_knowledge_gap_digest();
  }

  @Post('api/ops/stale-case-alert')
  async staleCaseAlert() {
    return post_stale_case_alert();
  }

  @Post('api/cs-events')
  @HttpCode(HttpStatus.CREATED)
  async csEvent(@Body() body: {
    source: string;
    event_type?: string;
    message: string;
    customer_ref?: { email?: string };
    metadata?: { request_id?: string };
  }) {
    if (!body?.source || !body?.message) {
      throw new BadRequestException('source and message are required');
    }
    return on_cs_event({
      source: body.source,
      event_type: body.event_type,
      message: body.message,
      customer_ref: body.customer_ref,
      metadata: body.metadata,
    });
  }
}
