// api/src/pipeline/index.spec.ts
import { run_flow, FlowStep } from './index';

interface TestCtx { value: number }

describe('run_flow', () => {
  it('returns ok:true and accumulated trace when all steps pass', async () => {
    const steps: FlowStep<TestCtx>[] = [
      { name: 'add_one', run: async (ctx) => ({ value: ctx.value + 1 }) },
      { name: 'double',  run: async (ctx) => ({ value: ctx.value * 2 }) },
    ];
    const result = await run_flow(steps, { value: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe(4); // (1+1)*2
      expect(result.trace).toHaveLength(2);
      expect(result.trace[0]).toMatchObject({ step: 'add_one', ok: true });
      expect(result.trace[1]).toMatchObject({ step: 'double', ok: true });
    }
  });

  it('short-circuits on first failing step', async () => {
    const third_run = jest.fn();
    const steps: FlowStep<TestCtx>[] = [
      { name: 'ok_step',    run: async (ctx) => ctx },
      { name: 'fail_step',  run: async () => { throw new Error('boom'); } },
      { name: 'never_runs', run: async (ctx) => { third_run(); return ctx; } },
    ];
    const result = await run_flow(steps, { value: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('fail_step');
      expect(result.error).toBe('boom');
    }
    expect(third_run).not.toHaveBeenCalled();
  });

  it('always returns trace even when a step fails', async () => {
    const steps: FlowStep<TestCtx>[] = [
      { name: 'step_a', run: async (ctx) => ctx },
      { name: 'step_b', run: async () => { throw new Error('fail'); } },
    ];
    const result = await run_flow(steps, { value: 0 });
    expect(result.trace).toHaveLength(2);
    expect(result.trace[0].ok).toBe(true);
    expect(result.trace[1].ok).toBe(false);
  });

  it('each trace entry has duration_ms >= 0', async () => {
    const steps: FlowStep<TestCtx>[] = [
      { name: 'step', run: async (ctx) => ctx },
    ];
    const result = await run_flow(steps, { value: 0 });
    expect(result.trace[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns ok:true with empty trace for empty steps array', async () => {
    const result = await run_flow([], { value: 42 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.value).toBe(42);
    expect(result.trace).toHaveLength(0);
  });
});
