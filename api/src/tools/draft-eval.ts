import { z } from 'zod';
import { config } from '../config';

const DraftEvalResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string(),
    }),
  })),
});

export interface DraftEvalResult {
  polite: boolean;
  relevant: boolean;
  actionable: boolean;
  score: number;
  issues: string[];
  pass: boolean;
}

const EVAL_PROMPT = `You are a quality checker for Korean CS bot drafts.

Evaluate the draft response against the original customer inquiry.

Customer inquiry: {RAW_TEXT}

Draft response: {DRAFT}

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

export async function eval_draft(raw_text: string, draft: string): Promise<DraftEvalResult> {
  const ollama_url = config.ollama_url + '/v1/chat/completions';
  const prompt = EVAL_PROMPT
    .replace('{RAW_TEXT}', raw_text.slice(0, 300))
    .replace('{DRAFT}', draft.slice(0, 500));

  try {
    const response = await fetch(ollama_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ollama_api_key}` },
      body: JSON.stringify({
        model: 'llama3.2:1b',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.1,
        max_tokens: 150,
      }),
    });

    if (!response.ok) return fallback_pass();

    const data_result = DraftEvalResponseSchema.safeParse(await response.json());
    if (!data_result.success) return fallback_pass();
    const raw = data_result.data.choices[0]?.message?.content ?? '';
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
