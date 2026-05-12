import { make_mock_embedder } from './embedder';

describe('mock_embedder', () => {
  const embed = make_mock_embedder(8);

  it('각 텍스트에 대해 지정 차원의 벡터 반환', async () => {
    const result = await embed(['hello', 'world']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(2);
    expect(result.value[0].length).toBe(8);
    expect(result.value[1].length).toBe(8);
  });

  it('동일 입력에 결정론적 출력', async () => {
    const r1 = await embed(['test text']);
    const r2 = await embed(['test text']);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value[0]).toEqual(r2.value[0]);
  });

  it('다른 텍스트는 다른 벡터', async () => {
    const result = await embed(['hello', 'world']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).not.toEqual(result.value[1]);
  });

  it('빈 배열은 빈 배열 반환', async () => {
    const result = await embed([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});
