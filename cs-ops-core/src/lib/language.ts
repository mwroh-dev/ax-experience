// cs-ops-core/src/lib/language.ts
// Language detection for customer messages — supports ko / en / other

function is_korean_char(code: number): boolean {
  return (
    (code >= 0xAC00 && code <= 0xD7A3) || // Hangul syllable blocks (가-힣)
    (code >= 0x3131 && code <= 0x318E) || // Hangul Compatibility Jamo (ㄱ-ㅎ)
    (code >= 0x314F && code <= 0x3163)    // Hangul Compatibility Jamo vowels (ㅏ-ㅣ)
  );
}

function is_ascii_letter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122); // A-Z, a-z
}

function is_whitespace(code: number): boolean {
  // space, tab, LF, CR, FF
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
}

/**
 * Detect the primary language of a customer message.
 *
 * Rules (evaluated in order):
 *   1. Empty / whitespace-only  → 'other'
 *   2. korean_chars / non_whitespace >= 0.10 → 'ko'
 *   3. ascii_letter_chars / non_whitespace >= 0.60 → 'en'
 *   4. otherwise → 'other'
 */
export function detect_language(message: string): 'ko' | 'en' | 'other' {
  if (message.length === 0) return 'other';

  let non_whitespace = 0;
  let korean_chars = 0;
  let ascii_letter_chars = 0;

  for (let i = 0; i < message.length; i++) {
    const code = message.charCodeAt(i);
    if (is_whitespace(code)) continue;
    non_whitespace++;
    if (is_korean_char(code)) korean_chars++;
    if (is_ascii_letter(code)) ascii_letter_chars++;
  }

  if (non_whitespace === 0) return 'other';
  if (korean_chars / non_whitespace >= 0.10) return 'ko';
  if (ascii_letter_chars / non_whitespace >= 0.60) return 'en';
  return 'other';
}
