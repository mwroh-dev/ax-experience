import { chunk_text } from './chunker';

describe('chunk_text', () => {
  it('단일 청크: 텍스트가 size 이하이면 그대로 반환', () => {
    const result = chunk_text('hello world', { size: 50, overlap: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['hello world']);
  });

  it('다중 청크: 텍스트를 overlap 포함해서 나눔', () => {
    const text = 'a'.repeat(100);
    const result = chunk_text(text, { size: 40, overlap: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(1);
    result.value.forEach(c => expect(c.length).toBeLessThanOrEqual(40));
  });

  it('빈 문자열은 빈 배열 반환', () => {
    const result = chunk_text('   ', { size: 100, overlap: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('overlap >= size이면 error', () => {
    const result = chunk_text('text', { size: 10, overlap: 10 });
    expect(result.ok).toBe(false);
  });
});
