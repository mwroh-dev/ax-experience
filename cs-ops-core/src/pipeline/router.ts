// cs-ops-core/src/pipeline/router.ts
import { match } from 'ts-pattern';
import { RiskDecision } from '../types';

export type RouteAction = 'auto' | 'review' | 'escalate';

export function route_by_risk(decision: RiskDecision): RouteAction {
  return match(decision.action)
    .with('auto', () => 'auto' as const)
    .with('review', () => 'review' as const)
    .with('escalate', () => 'escalate' as const)
    .exhaustive();
}
