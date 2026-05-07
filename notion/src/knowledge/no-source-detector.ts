import { KnowledgeHit } from '@api/tools/notion-client';

export interface NoSourceResult {
  is_no_source: boolean;
  reason: string;
}

export function detect_no_source(notion_hits: KnowledgeHit[], admin_called: boolean): NoSourceResult {
  if (notion_hits.length === 0 && !admin_called) {
    return { is_no_source: true, reason: 'knowledge 검색 결과 없음 — Admin 조회도 불가' };
  }
  if (notion_hits.length === 0) {
    return { is_no_source: true, reason: 'knowledge 검색 결과 없음' };
  }
  return { is_no_source: false, reason: '' };
}
