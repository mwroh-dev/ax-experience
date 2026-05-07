// cs-ops-core/src/pipeline/router.spec.ts
import { route_by_risk } from './router';

describe('route_by_risk', () => {
  it('returns escalate when decision action is escalate', () => {
    expect(route_by_risk({ action: 'escalate', reason: 'test' })).toBe('escalate');
  });

  it('returns auto when decision action is auto', () => {
    expect(route_by_risk({ action: 'auto', reason: 'test' })).toBe('auto');
  });

  it('returns review when decision action is review', () => {
    expect(route_by_risk({ action: 'review', reason: 'test' })).toBe('review');
  });

  it('returns escalate regardless of reason content for escalate action', () => {
    expect(route_by_risk({ action: 'escalate', reason: 'privacy_request_detected' })).toBe('escalate');
  });

  it('returns auto regardless of reason content for auto action', () => {
    expect(route_by_risk({ action: 'auto', reason: 'low_risk_faq_match' })).toBe('auto');
  });

  it('returns review regardless of reason content for review action', () => {
    expect(route_by_risk({ action: 'review', reason: 'no_policy_match' })).toBe('review');
  });

  it('returns escalate with empty reason string', () => {
    expect(route_by_risk({ action: 'escalate', reason: '' })).toBe('escalate');
  });

  it('returns review with empty reason string', () => {
    expect(route_by_risk({ action: 'review', reason: '' })).toBe('review');
  });
});
