// cs-ops-core/src/llm/claude-cli-runner.ts
import { spawn } from 'child_process';

export async function run_claude_cli(opts: {
  bin: string;
  timeout_ms: number;
  args: string[];
  input: string;
}): Promise<string> {
  if (process.env.MOCK_LLM_FAILURE === 'true') {
    throw new Error('MOCK_LLM_FAILURE: simulated LLM unreachable');
  }
  // Strip Claude Code env vars so the subprocess uses OAuth, not API key
  const child_env = { ...process.env };
  delete child_env.CLAUDECODE;
  delete child_env.CLAUDE_CODE_ENTRYPOINT;
  delete child_env.CLAUDE_CODE_EXECPATH;
  return new Promise((resolve, reject) => {
    const proc = spawn(opts.bin, opts.args, { env: child_env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`claude CLI timed out after ${opts.timeout_ms}ms`)); }, opts.timeout_ms);
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null, signal: string | null) => {
      clearTimeout(timer);
      if (signal) reject(new Error(`claude was terminated by signal ${signal}`));
      else if ((code ?? 1) !== 0) reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
      else resolve(stdout.trim());
    });
    proc.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
    proc.stdin.on('error', () => {}); // prevent unhandled EPIPE if process exits before stdin is consumed
    proc.stdin.write(opts.input, 'utf8');
    proc.stdin.end();
  });
}

export function extract_inner_json(raw: string): unknown {
  try {
    const outer = JSON.parse(raw) as Record<string, unknown>;
    if (typeof outer !== 'object' || outer === null) return outer;
    if ('structured_output' in outer && outer.structured_output !== null) {
      return outer.structured_output;
    }
    if ('result' in outer && typeof outer.result === 'string' && outer.result) {
      return JSON.parse(outer.result);
    }
    return outer;
  } catch {
    throw new Error(`Failed to parse LLM output: ${raw.slice(0, 100)}`);
  }
}
