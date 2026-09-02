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
  if (sender.origin !== configured.origin || !sender.pathname.startsWith(configured.pathname)) {
    throw new Error('Transfer sender is not the configured PostKeeper application.');
  }
}
