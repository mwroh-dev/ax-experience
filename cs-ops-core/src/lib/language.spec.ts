import { detect_language } from './language';

describe('detect_language', () => {
  it('returns ko for a Korean customer message', () => {
    expect(detect_language('안녕하세요 주문 환불해주세요')).toBe('ko');
  });

  it('returns en for a plain English message', () => {
    expect(detect_language('Hello, I would like to request a refund for my order.')).toBe('en');
  });

  it('returns ko for mixed Korean-English text when Korean ratio >= 0.10', () => {
    // '한글' is 2 Korean chars out of ~10 non-whitespace → >=0.10
    expect(detect_language('한글 abc def ghi jkl')).toBe('ko');
  });

  it('returns other for an empty string', () => {
    expect(detect_language('')).toBe('other');
  });

  it('returns other for whitespace-only string', () => {
    expect(detect_language('   \t\n  ')).toBe('other');
  });

  it('returns other for numeric/symbol text with no Korean or ASCII letters', () => {
    expect(detect_language('12345 !@#$%')).toBe('other');
  });

  it('returns ko for jamo-only characters', () => {
    // ㄱ is U+3131, within the Jamo range
    expect(detect_language('ㄱㄴㄷㄹㅏㅑㅓㅕ')).toBe('ko');
  });

  it('returns en for English text with punctuation and digits mixed in', () => {
    // Enough ASCII letters to pass the 0.60 threshold
    expect(detect_language('Please confirm my address: 123 Main St.')).toBe('en');
  });
});
