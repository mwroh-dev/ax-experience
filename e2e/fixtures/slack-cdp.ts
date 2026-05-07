// e2e/fixtures/slack-cdp.ts
import { chromium, BrowserContext } from '@playwright/test';

const CDP_URL = process.env.CDP_URL ?? 'http://localhost:9222';

let _ctx: BrowserContext | null = null;

export async function get_slack_context(): Promise<BrowserContext> {
  if (_ctx) return _ctx;
  const browser = await chromium.connectOverCDP(CDP_URL);
  _ctx = browser.contexts()[0];
  if (!_ctx) throw new Error('No Slack browser context found at CDP_URL=' + CDP_URL);
  return _ctx;
}

export async function find_slack_page(ctx: BrowserContext, url_fragment: string) {
  const pages = ctx.pages();
  const page = pages.find((p) => p.url().includes(url_fragment));
  if (!page) throw new Error(`No Slack page found matching: ${url_fragment}`);
  return page;
}

/**
 * Navigate the Slack Electron page to a specific channel.
 * Required before wait_for_message when the channel is not currently visible.
 *
 * Slack Electron is an SPA: page.goto() alone does not close thread panels.
 * When a thread panel is open, the thread panel toolbar contains a channel-name
 * breadcrumb button. Clicking it navigates to the main channel view.
 */
export async function navigate_to_channel(
  ctx: BrowserContext,
  team_id: string,
  channel_id: string,
): Promise<void> {
  const pages = ctx.pages().filter((p) => p.url().includes('app.slack.com/client'));
  const page = pages[0];
  if (!page) throw new Error('No Slack app page found via CDP');

  // Close any open thread panel by clicking the channel breadcrumb button.
  // The thread panel has: role="group" aria-label="Thread in channel <name>"
  // Inside it: toolbar > generic > [text: "Thread", button("<channel-name>")]
  const closed_thread = await page.evaluate(() => {
    const threadGroup = document.querySelector('[aria-label^="Thread in channel"]');
    if (!threadGroup) return false;
    // The channel link button is the first <button> inside the thread toolbar
    const btn = threadGroup.querySelector('button');
    if (btn) {
      (btn as HTMLElement).click();
      return true;
    }
    return false;
  }).catch(() => false);

  if (closed_thread) {
    // Give Slack time to transition to the main channel view
    await page.waitForFunction(
      () => !document.querySelector('[aria-label^="Thread in channel"]'),
      { timeout: 5_000 },
    ).catch(() => {});
  }

  // Now navigate to the target channel using page.goto()
  const target_url = `https://app.slack.com/client/${team_id}/${channel_id}`;
  if (!page.url().includes(channel_id) || closed_thread) {
    await page.goto(target_url, { waitUntil: 'domcontentloaded' });
  }

  // Wait for Slack channel content to load
  await page.waitForSelector('[data-qa="message_content"]', { timeout: 10_000 }).catch(() => {});
  // Scroll to the bottom of the virtual message list so the latest messages are rendered
  await page.evaluate(() => {
    const list = document.querySelector('[data-qa="slack_kit_list"], [data-qa="virtual_list"], .c-virtual_list__scroll_container');
    if (list) list.scrollTop = list.scrollHeight;
  }).catch(() => {});
}

/**
 * Wait for a Slack message containing `text` to appear in any open page.
 * Slack renders messages in [data-qa="message_content"] spans.
 */
export async function wait_for_message(ctx: BrowserContext, text: string, timeout = 20_000): Promise<void> {
  const pages = ctx.pages();
  for (const page of pages) {
    try {
      await page.waitForFunction(
        (searchText: string) => {
          const nodes = document.querySelectorAll('[data-qa="message_content"]');
          return Array.from(nodes).some((n) => n.textContent?.includes(searchText));
        },
        text,
        { timeout },
      );
      return;
    } catch {
      // try next page
    }
  }
  throw new Error(`Message not found within ${timeout}ms: "${text}"`);
}

/**
 * Open the Slack thread for a message that contains case_id.
 * Required before wait_for_message('[CS Bot Draft]') since thread replies
 * are not in the channel DOM until the thread panel is open.
 * Throws if no reply button is found within the timeout.
 */
export async function open_thread_for_case(ctx: BrowserContext, case_id: string, timeout = 20_000): Promise<void> {
  const pages = ctx.pages();
  for (const page of pages) {
    const found = await page.waitForFunction(
      (cid: string) => {
        const items = document.querySelectorAll('li, [role="listitem"]');
        return Array.from(items).some((el) => el.textContent?.includes(cid) && el.textContent?.includes('reply'));
      },
      case_id,
      { timeout },
    ).then(() => true).catch(() => false);

    if (!found) continue;

    const clicked = await page.evaluate((cid: string) => {
      const items = document.querySelectorAll('li, [role="listitem"]');
      for (const item of items) {
        if (item.textContent?.includes(cid) && item.textContent?.includes('reply')) {
          const buttons = item.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent?.includes('reply') || btn.textContent?.includes('View thread')) {
              (btn as HTMLElement).click();
              return true;
            }
          }
        }
      }
      return false;
    }, case_id).catch(() => false);

    if (clicked) return;
  }
  throw new Error(`Thread reply button not found for case_id: ${case_id}`);
}

/**
 * Navigate to the VOC log channel if Slack CDP is available. Skips gracefully when offline.
 * Used in KB fast-path E2E tests to verify auto-sent drafts reached the channel.
 */
export async function try_navigate_voc_channel(): Promise<void> {
  const ws = process.env.SLACK_TEAM_ID ?? '';
  const ch = process.env.SLACK_VOC_LOG_CHANNEL_ID ?? process.env.SLACK_VOC_LOG_CHANNEL ?? '';
  if (!ws || !ch) return;
  try {
    const ctx = await get_slack_context();
    await navigate_to_channel(ctx, ws, ch);
  } catch (err) {
    console.warn('[e2e] Slack CDP unavailable — skipping channel navigation:', (err as Error).message);
  }
}

/**
 * Click the first Slack block action button matching action_id value.
 * Tries [data-qa="bk_actions"] first (newer Slack), then falls back to
 * any visible button inside the message list (Electron Slack may not use bk_actions).
 */
export async function click_action_button(ctx: BrowserContext, action_text: string, timeout = 10_000): Promise<void> {
  const pages = ctx.pages();
  for (const page of pages) {
    // Try the structured bk_actions wrapper first
    const bk_btn = page.locator(`[data-qa="bk_actions"] button`, { hasText: action_text }).first();
    if (await bk_btn.isVisible().catch(() => false)) {
      await bk_btn.click({ timeout });
      return;
    }
    // Fallback: any visible button in the message list with exact text (Electron CDP)
    const fallback_btn = page.locator(`[data-qa="virtual-list-item"] button, [role="listitem"] button`, { hasText: action_text }).last();
    if (await fallback_btn.isVisible().catch(() => false)) {
      await fallback_btn.click({ timeout });
      return;
    }
  }
  throw new Error(`Button not found: "${action_text}"`);
}
