// api/src/pipeline/index.ts

export interface TraceEntry {
  step: string;
  started_at: number;
  duration_ms: number;
  ok: boolean;
  meta?: Record<string, unknown>;
}

export type FlowResult<T> =
  | { ok: true;  value: T; trace: TraceEntry[] }
  | { ok: false; error: string; step: string; trace: TraceEntry[] };

export interface FlowStep<Ctx> {
  name: string;
  run: (ctx: Ctx) => Promise<Ctx>;
}

export async function run_flow<Ctx>(
  steps: Array<FlowStep<Ctx>>,
  initial: Ctx,
): Promise<FlowResult<Ctx>> {
  const trace: TraceEntry[] = [];
  let ctx = initial;

  for (const step of steps) {
    const started_at = Date.now();
    try {
      ctx = await step.run(ctx);
      trace.push({ step: step.name, started_at, duration_ms: Date.now() - started_at, ok: true });
    } catch (err) {
      trace.push({
        step: step.name,
        started_at,
        duration_ms: Date.now() - started_at,
        ok: false,
      });
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        step: step.name,
        trace,
      };
    }
  }

  return { ok: true, value: ctx, trace };
}
