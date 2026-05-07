// api/src/pipeline/monad.spec.ts
import { pipe, flat_map, recover } from './monad';

interface Ctx { value: number; log: string[] }

describe('pipe', () => {
  it('composes steps left to right', async () => {
    const composed = pipe<Ctx>(
      { name: 'add_one', run: async (ctx) => ({ ...ctx, value: ctx.value + 1 }) },
      { name: 'double',  run: async (ctx) => ({ ...ctx, value: ctx.value * 2 }) },
    );
    const result = await composed.run({ value: 1, log: [] });
    expect(result.value).toBe(4); // (1+1)*2
  });

  it('name is concatenation of step names', () => {
    const composed = pipe<Ctx>(
      { name: 'step_a', run: async (ctx) => ctx },
      { name: 'step_b', run: async (ctx) => ctx },
    );
    expect(composed.name).toBe('step_a → step_b');
  });
});

describe('flat_map', () => {
  it('wraps an async function as a named FlowStep', async () => {
    const step = flat_map<Ctx>('append_hello', async (ctx) => ({
      ...ctx,
      log: [...ctx.log, 'hello'],
    }));
    expect(step.name).toBe('append_hello');
    const result = await step.run({ value: 0, log: [] });
    expect(result.log).toEqual(['hello']);
  });
});

describe('recover', () => {
  it('catches step errors and returns fallback ctx', async () => {
    const risky = { name: 'risky', run: async (): Promise<Ctx> => { throw new Error('fail'); } };
    const safe = recover<Ctx>(risky, async (ctx) => ({ ...ctx, log: [...ctx.log, 'recovered'] }));
    const result = await safe.run({ value: 0, log: [] });
    expect(result.log).toEqual(['recovered']);
  });

  it('passes ctx through unchanged when step succeeds', async () => {
    const ok_step = { name: 'ok', run: async (ctx: Ctx) => ({ ...ctx, value: 99 }) };
    const safe = recover<Ctx>(ok_step, async (ctx) => ({ ...ctx, value: -1 }));
    const result = await safe.run({ value: 0, log: [] });
    expect(result.value).toBe(99);
  });

  it('normalizes non-Error throws to Error before calling fallback', async () => {
    const string_throw = { name: 'bad', run: async (): Promise<Ctx> => { throw 'not an error object'; } };
    let received_err: Error | undefined;
    const safe = recover<Ctx>(string_throw, async (ctx, err) => {
      received_err = err;
      return { ...ctx, log: [...ctx.log, 'caught'] };
    });
    const result = await safe.run({ value: 0, log: [] });
    expect(result.log).toEqual(['caught']);
    expect(received_err).toBeInstanceOf(Error);
    expect(received_err?.message).toBe('not an error object');
  });
});
