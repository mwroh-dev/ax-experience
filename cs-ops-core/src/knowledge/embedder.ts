import { FlowResult } from '@api/pipeline/index';

export type EmbedFn = (texts: string[]) => Promise<FlowResult<number[][]>>;

export function make_mock_embedder(dims: number): EmbedFn {
  return async (texts: string[]): Promise<FlowResult<number[][]>> => {
    const trace = [{ step: 'mock_embed', started_at: Date.now(), duration_ms: 0, ok: true }];

    const vectors = texts.map(text => {
      const vec: number[] = [];
      for (let d = 0; d < dims; d++) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
          h ^= text.charCodeAt(i) + d * 31;
          h = Math.imul(h, 16777619);
        }
        vec.push(((h >>> 0) / 0xffffffff) * 2 - 1);
      }
      const mag = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
      return mag > 0 ? vec.map(x => x / mag) : vec;
    });

    trace[0].duration_ms = Date.now() - trace[0].started_at;
    return { ok: true, value: vectors, trace };
  };
}
