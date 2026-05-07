import { Controller, Get, Query } from '@nestjs/common';
import { get_latency_metrics, get_eval_trend, EvalTrendRow } from './metrics-store';

@Controller()
export class MetricsController {
  @Get('api/metrics/latency')
  getLatency(@Query('period') period: string = '24h') {
    return get_latency_metrics(period);
  }

  @Get('api/metrics/eval-trend')
  getEvalTrend(@Query('period') period: string = '7d'): EvalTrendRow[] {
    return get_eval_trend(period);
  }
}
