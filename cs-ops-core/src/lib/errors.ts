export type ParseError      = { tag: 'parse_error';      message: string; raw?: string };
export type LLMError        = { tag: 'llm_error';        message: string; exit_code?: number };
export type NetworkError    = { tag: 'network_error';    message: string; url?: string };
export type ValidationError = { tag: 'validation_error'; issues: string[] };

export type DomainError = ParseError | LLMError | NetworkError | ValidationError;

export const parse_error      = (msg: string, raw?: string): ParseError      => ({ tag: 'parse_error',      message: msg, raw });
export const llm_error        = (msg: string, code?: number): LLMError       => ({ tag: 'llm_error',        message: msg, exit_code: code });
export const network_error    = (msg: string, url?: string): NetworkError    => ({ tag: 'network_error',    message: msg, url });
export const validation_error = (issues: string[]): ValidationError          => ({ tag: 'validation_error', issues });
