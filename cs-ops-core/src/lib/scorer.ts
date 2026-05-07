// cs-ops-core/src/lib/scorer.ts
// Pure TF-IDF document scorer — no external dependencies, no classes.

import { NotionHit } from './notion-client';

export type ScoredHit = NotionHit & { score: number };

/**
 * Tokenize text for TF-IDF scoring.
 * Splits on whitespace, removes punctuation (Unicode-aware), and lowercases.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Score and re-rank documents using TF-IDF.
 *
 * tf  = term_freq / doc_length
 * idf = log(N / df + 1)     — parsed as log((N/df) + 1); 0 when df=0 (term absent from all docs)
 * score = Σ tf * idf  over all query terms
 *
 * Returns docs sorted by score descending.
 * Docs with score=0 (no query terms found) are included and sorted last.
 */
export function score_documents(query: string, docs: NotionHit[]): ScoredHit[] {
  if (docs.length === 0) return [];

  const query_terms = tokenize(query);

  // Empty query → every doc gets score 0 (preserve original order)
  if (query_terms.length === 0) {
    return docs.map((doc) => ({ ...doc, score: 0 }));
  }

  const N = docs.length;

  // Tokenize each document (title + content combined)
  const doc_tokens: string[][] = docs.map((doc) =>
    tokenize(`${doc.title} ${doc.content}`)
  );

  // Compute document frequency (df) for each unique query term
  const df: Record<string, number> = {};
  for (const term of query_terms) {
    if (df[term] === undefined) {
      df[term] = 0;
      for (const tokens of doc_tokens) {
        if (tokens.includes(term)) df[term]++;
      }
    }
  }

  // Score each document
  const scored: ScoredHit[] = docs.map((doc, i) => {
    const tokens = doc_tokens[i];
    const doc_length = tokens.length > 0 ? tokens.length : 1;

    let score = 0;
    for (const term of query_terms) {
      const term_freq = tokens.filter((t) => t === term).length;
      const tf = term_freq / doc_length;
      // idf = log(N / df + 1) where df > 0; 0 when df=0 (term absent — tf is also 0)
      const idf = df[term] > 0 ? Math.log(N / df[term] + 1) : 0;
      score += tf * idf;
    }

    return { ...doc, score };
  });

  // Sort descending by score; ties preserve original relative order (stable sort)
  return scored.sort((a, b) => b.score - a.score);
}
