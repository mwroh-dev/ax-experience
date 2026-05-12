// api/src/tools/draft-eval.ts
import { spawn } from 'child_process';
import { config } from '../config';

export interface DraftEvalResult {
  polite: boolean;
  relevant: boolean;
  actionable: boolean;
  score: number;
  issues: string[];
  pass: boolean;
}

const EVAL_SYSTEM_PROMPT = `You are a quality checker for Korean CS bot drafts. Evaluate the draft response against the original customer inquiry.

Score on 3 dimensions (answer true or false):
1. POLITE: Is the tone polite and appropriate for Korean customer service?
2. RELEVANT: Does the draft actually address what the customer asked?
3. ACTIONABLE: Does the draft provide a clear answer or next step?

Respond in this exact format only:
POLITE: true|false
RELEVANT: true|false
ACTIONABLE: true|false
SCORE: 0.0 to 1.0
ISSUES: <comma-separated issues, or "none">`;

async function run_claude_eval(input: string): Promise<string> {
  const bin = config.claude_cli_bin;
  const timeout = Math.min(config.claude_cli_timeout_ms, 10_000);
  // Strip Claude Code env vars so the subprocess uses OAuth, not API key
  const child_env = { ...process.env };
  delete child_env.CLAUDECODE;
  delete child_env.CLAUDE_CODE_ENTRYPOINT;
  delete child_env.CLAUDE_CODE_EXECPATH;
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ['-p', '--no-session-persistence', '--system-prompt', EVAL_SYSTEM_PROMPT], { env: child_env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('eval timeout')); }, timeout);
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if ((code ?? 1) !== 0) reject(new Error(`eval exited ${code}: ${stderr.slice(0, 200)}`));
      else resolve(stdout.trim());
    });
    proc.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
    proc.stdin.write(input, 'utf8');
    proc.stdin.end();
  });
}

export async function eval_draft(raw_text: string, draft: string): Promise<DraftEvalResult> {
  const input = `Customer inquiry:\n${raw_text.slice(0, 300)}\n\nDraft response:\n${draft.slice(0, 500)}`;
  try {
    const raw = await run_claude_eval(input);
    return parse_eval_response(raw);
  } catch {
    return fallback_pass();
  }
}

function parse_eval_response(raw: string): DraftEvalResult {
  const bool = (key: string) => {
    const m = raw.match(new RegExp(`${key}:\\s*(true|false)`, 'i'));
    return m ? m[1].toLowerCase() === 'true' : true;
  };
  const score_match = raw.match(/SCORE:\s*([\d.]+)/i);
  const issues_match = raw.match(/ISSUES:\s*(.+)/i);

  const polite = bool('POLITE');
  const relevant = bool('RELEVANT');
  const actionable = bool('ACTIONABLE');
  const score = score_match ? Math.min(1, Math.max(0, parseFloat(score_match[1]))) : 0.5;
  const issues_raw = issues_match ? issues_match[1].trim() : 'none';
  const issues = issues_raw.toLowerCase() === 'none' ? [] : issues_raw.split(',').map(s => s.trim());

  return { polite, relevant, actionable, score, issues, pass: polite && relevant && score >= 0.5 };
}

function fallback_pass(): DraftEvalResult {
  return { polite: true, relevant: true, actionable: true, score: 0.5, issues: [], pass: true };
}
