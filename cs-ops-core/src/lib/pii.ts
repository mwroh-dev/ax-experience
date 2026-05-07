// cs-ops-core/src/lib/pii.ts
export function mask_pii(text: string): string {
  return text
    .replace(
      /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
      (match) => {
        const at = match.indexOf('@');
        const local = match.slice(0, at);
        const domain = match.slice(at + 1);
        const prefix = local.length > 2 ? local.slice(0, 2) + '**' : local.slice(0, 1) + '**';
        return `${prefix}@${domain}`;
      }
    )
    .replace(/\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '***-****');
}
