export interface ClassifyLLM {
  classifyTicket(raw_message: string): Promise<{
    raw_llm_response: string;
  }>;
}

export interface DraftLLM {
  generateDraft(input: {
    case_id: string;
    user_message: string;
    evidence_snippets: string[];
  }): Promise<{
    draft: string;
    confidence: 'high' | 'medium' | 'low';
    needs_more_info: boolean;
    raw_output: string;
  }>;
}

export interface SummaryLLM {
  keepSummary(input: {
    case_id: string;
    user_message: string;
  }): Promise<{ summary: string }>;
}
