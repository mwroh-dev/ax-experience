// cs-ops-core/src/lib/notion-client.spec.ts
// Tests for read_page and update_page_status — mocks @notionhq/client

// ---------- Mock setup (hoisted by Jest) ----------
jest.mock('@notionhq/client', () => {
  const mock_retrieve = jest.fn();
  const mock_update = jest.fn();
  return {
    Client: jest.fn().mockImplementation(() => ({
      pages: {
        retrieve: mock_retrieve,
        update: mock_update,
      },
    })),
    // Expose the mock functions for test access
    __mock_retrieve: mock_retrieve,
    __mock_update: mock_update,
  };
});

import { read_page, update_page_status } from './notion-client';

const notion_mock = jest.requireMock('@notionhq/client') as {
  __mock_retrieve: jest.MockedFunction<() => Promise<unknown>>;
  __mock_update: jest.MockedFunction<() => Promise<unknown>>;
};

describe('notion-client — read_page', () => {
  beforeAll(() => {
    // Ensure NOTION_API_KEY is set so get_client() does not throw
    process.env.NOTION_API_KEY = 'test-notion-key';
  });

  beforeEach(() => {
    notion_mock.__mock_retrieve.mockReset();
    notion_mock.__mock_update.mockReset();
  });

  it('returns ok:true with extracted title when page has a title property', async () => {
    notion_mock.__mock_retrieve.mockResolvedValueOnce({
      object: 'page',
      id: 'page-abc',
      properties: {
        Name: {
          type: 'title',
          title: [{ plain_text: 'Help Center Article', href: null }],
          id: 'prop-name',
        },
        Status: {
          type: 'status',
          status: { name: 'Published', id: 'status-id', color: 'green' },
          id: 'prop-status',
        },
      },
    });

    const result = await read_page('page-abc');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.value.title).toBe('Help Center Article');
    expect(result.value.properties).toBeDefined();
    expect(result.trace.length).toBeGreaterThanOrEqual(1);
    expect(result.trace[0].step).toBe('read_page');
  });

  it('returns ok:false when the Notion API throws', async () => {
    notion_mock.__mock_retrieve.mockRejectedValueOnce(new Error('page not found'));

    const result = await read_page('nonexistent-page');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false');
    expect(result.error).toBe('page not found');
    expect(result.step).toBe('read_page');
    expect(result.trace[0].ok).toBe(false);
  });

  it('returns empty title when page has no title-type property', async () => {
    notion_mock.__mock_retrieve.mockResolvedValueOnce({
      object: 'page',
      id: 'page-def',
      properties: {
        Count: {
          type: 'number',
          number: 42,
          id: 'prop-count',
        },
      },
    });

    const result = await read_page('page-def');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.value.title).toBe('');
  });

  it('returns empty title and ok:true when page is partial (no properties field)', async () => {
    notion_mock.__mock_retrieve.mockResolvedValueOnce({
      object: 'page',
      id: 'page-partial',
      // No properties — simulates PartialPageObjectResponse
    });

    const result = await read_page('page-partial');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.value.title).toBe('');
  });
});

describe('notion-client — update_page_status', () => {
  beforeEach(() => {
    notion_mock.__mock_update.mockReset();
  });

  it('returns ok:true with void value when API succeeds', async () => {
    notion_mock.__mock_update.mockResolvedValueOnce({
      object: 'page',
      id: 'page-xyz',
    });

    const result = await update_page_status('page-xyz', 'Done');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.value).toBeUndefined();
    expect(result.trace[0].step).toBe('update_page_status');
    expect(result.trace[0].ok).toBe(true);
  });

  it('returns ok:false when the Notion API throws', async () => {
    notion_mock.__mock_update.mockRejectedValueOnce(new Error('rate limited'));

    const result = await update_page_status('page-xyz', 'In Progress');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false');
    expect(result.error).toBe('rate limited');
    expect(result.step).toBe('update_page_status');
  });

  it('returns ok:false with descriptive message on network error', async () => {
    notion_mock.__mock_update.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await update_page_status('page-xyz', 'Hold');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false');
    expect(result.error).toContain('ECONNREFUSED');
    expect(result.trace[0].ok).toBe(false);
  });
});
