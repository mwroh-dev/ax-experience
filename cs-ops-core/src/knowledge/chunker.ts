import { FlowResult } from '@api/pipeline/index';

export interface ChunkOptions {
  size: number;
  overlap: number;
}

export function chunk_text(
  text: string,
  opts: ChunkOptions,
): FlowResult<string[]> {
  const trace = [{ step: 'chunk_text', started_at: Date.now(), duration_ms: 0, ok: true }];

  if (opts.size <= 0) {
    return { ok: false, error: 'size must be positive', step: 'chunk_text', trace };
  }
  if (opts.overlap < 0 || opts.overlap >= opts.size) {
    return { ok: false, error: 'overlap must be non-negative and less than size', step: 'chunk_text', trace };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: [], trace };
  }

  const chunks: string[] = [];
  const step = opts.size - opts.overlap;
  let start = 0;

  while (start < trimmed.length) {
    chunks.push(trimmed.slice(start, start + opts.size));
    start += step;
  }

  trace[0].duration_ms = Date.now() - trace[0].started_at;
  return { ok: true, value: chunks, trace };
}
