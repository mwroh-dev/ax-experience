// cs-ops-core/src/lib/scorer.spec.ts
import { score_documents, ScoredHit } from './scorer';
import { NotionHit } from './notion-client';

function make_hit(
  id: string,
  title: string,
  content: string,
  source_db: 'faq' | 'policy' = 'faq',
): NotionHit {
  return { source_db, source_id: id, title, content };
}

describe('score_documents', () => {
  it('ranks the higher-relevance doc above the lower-relevance doc', () => {
    const docs: NotionHit[] = [
      make_hit('low', 'Privacy policy', 'We protect your personal data.'),
      make_hit('high', 'Refund delay policy', 'We handle delivery delays by issuing a refund.'),
    ];
    const result = score_documents('delivery delay refund', docs);
    expect(result[0].source_id).toBe('high');
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('includes score=0 docs (not filtered out)', () => {
    const docs: NotionHit[] = [
      make_hit('relevant', 'Refund policy', 'You can request a refund within 30 days.'),
      make_hit('irrelevant', 'Cookie policy', 'We use cookies for analytics.'),
    ];
    // query term "refund" does not appear in the second doc
    const result = score_documents('refund', docs);
    expect(result).toHaveLength(2);
    const irrelevant = result.find((r) => r.source_id === 'irrelevant');
    expect(irrelevant).toBeDefined();
    // relevant doc should rank first
    expect(result[0].source_id).toBe('relevant');
  });

  it('returns all docs with score=0 when query is empty', () => {
    const docs: NotionHit[] = [
      make_hit('a', 'Title A', 'Content A'),
      make_hit('b', 'Title B', 'Content B'),
    ];
    const result = score_documents('', docs);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.score).toBe(0);
    }
  });

  it('returns a single doc with a numeric score', () => {
    const docs: NotionHit[] = [
      make_hit('solo', 'Refund FAQ', 'How to request a refund from our store.'),
    ];
    const result = score_documents('refund', docs);
    expect(result).toHaveLength(1);
    expect(result[0].source_id).toBe('solo');
    expect(typeof result[0].score).toBe('number');
  });

  it('handles Korean text — correct doc ranks first', () => {
    const docs: NotionHit[] = [
      make_hit('delivery', '배송 정책', '배송은 3-5일 이내에 완료됩니다.'),
      make_hit('refund', '환불 정책', '환불은 30일 이내에 가능합니다.'),
    ];
    const result = score_documents('환불', docs);
    // The refund doc should rank higher because it contains "환불"
    expect(result[0].source_id).toBe('refund');
  });

  it('returns empty array when docs list is empty', () => {
    const result = score_documents('refund', []);
    expect(result).toEqual([]);
  });

  it('returned items preserve all NotionHit fields plus score', () => {
    const doc = make_hit('x', 'Some title', 'Some content', 'policy');
    const result = score_documents('title', [doc]);
    expect(result[0].source_db).toBe('policy');
    expect(result[0].source_id).toBe('x');
    expect(result[0].title).toBe('Some title');
    expect(result[0].content).toBe('Some content');
    expect(result[0]).toHaveProperty('score');
  });
});
