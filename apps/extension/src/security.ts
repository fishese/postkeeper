export function randomCapability(bytes = 24): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function assertAllowedSender(senderUrl: string | undefined, configuredPwaUrl: string): void {
  if (!senderUrl) throw new Error('Transfer sender has no URL.');
  const sender = new URL(senderUrl);
  const configured = new URL(configuredPwaUrl);
  if (!matchesConfiguredPage(sender, configured)) {
    throw new Error('Transfer sender is not the configured PostKeeper application.');
  }
}

export function matchesConfiguredPage(current: URL, configured: URL): boolean {
  const directory = configured.pathname.endsWith('/')
    ? configured.pathname
    : `${configured.pathname}/`;
  return (
    current.origin === configured.origin &&
    (current.pathname === configured.pathname || current.pathname.startsWith(directory))
  );
}
