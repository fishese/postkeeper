/** Shared text is untrusted, and may include a title before the URL. */
export function parseSharedLink(input: { url?: string; text?: string; title?: string }): {
  url: string;
  title: string;
} {
  for (const value of Object.values(input)) {
    if (typeof value !== 'string' || value.length > 16_384)
      throw new Error('Shared text is too large.');
  }
  const candidate = input.url?.trim() || input.text?.match(/https?:\/\/[^\s<>"']+/iu)?.[0];
  if (!candidate || candidate.length > 8192) throw new Error('Share one HTTP or HTTPS link.');
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Share an HTTP or HTTPS link without embedded credentials.');
  }
  url.hash = '';
  return { url: url.href, title: input.title?.trim().slice(0, 512) || url.hostname };
}
