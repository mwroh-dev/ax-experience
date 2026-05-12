import { EmbedFn } from '@cs-ops-core/knowledge/embedder';
import { FlowResult } from '@api/pipeline/index';

export function make_openai_embedder(api_key: string, model = 'text-embedding-3-small'): EmbedFn {
  return async (texts: string[]): Promise<FlowResult<number[][]>> => {
    const trace = [{ step: 'openai_embed', started_at: Date.now(), duration_ms: 0, ok: true }];

    if (texts.length === 0) {
      return { ok: true, value: [], trace };
    }

    try {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return {
          ok: false,
          error: `OpenAI embed HTTP ${resp.status}: ${text.slice(0, 200)}`,
          step: 'openai_embed',
          trace,
        };
      }

      const data = await resp.json() as { data: { embedding: number[]; index: number }[] };
      const vectors = data.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);

      trace[0].duration_ms = Date.now() - trace[0].started_at;
      return { ok: true, value: vectors, trace };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        step: 'openai_embed',
        trace,
      };
    }
  };
}
