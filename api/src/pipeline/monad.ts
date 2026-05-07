// api/src/pipeline/monad.ts
import { FlowStep } from './index';

export function pipe<Ctx>(...steps: FlowStep<Ctx>[]): FlowStep<Ctx> {
  return {
    name: steps.map((s) => s.name).join(' → '),
    run: async (initial: Ctx) => {
      let ctx = initial;
      for (const step of steps) {
        ctx = await step.run(ctx);
      }
      return ctx;
    },
  };
}

export function flat_map<Ctx>(name: string, fn: (ctx: Ctx) => Promise<Ctx>): FlowStep<Ctx> {
  return { name, run: fn };
}

export function recover<Ctx>(
  step: FlowStep<Ctx>,
  fallback: (ctx: Ctx, err: Error) => Promise<Ctx>,
): FlowStep<Ctx> {
  return {
    name: `${step.name}(recovered)`,
    run: async (ctx: Ctx) => {
      try {
        return await step.run(ctx);
      } catch (err) {
        return fallback(ctx, err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}
