export type Chunk = {
  transferId: string;
  sequence: number;
  total: number;
  bytes: string;
  hash: string;
};

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A protocol-only spike: browser adapters will supply the actual WebExtension port in Milestone 3. */
export async function transferBoundedPayload(payload: string, chunkSize = 16): Promise<string> {
  const transferId = crypto.randomUUID();
  const parts = Array.from({ length: Math.ceil(payload.length / chunkSize) }, (_, index) =>
    payload.slice(index * chunkSize, (index + 1) * chunkSize),
  );
  const chunks: Chunk[] = await Promise.all(
    parts.map(async (bytes, sequence) => ({
      transferId,
      sequence,
      total: parts.length,
      bytes,
      hash: await digest(bytes),
    })),
  );
  const received: string[] = [];
  for (const chunk of chunks) {
    if (
      chunk.transferId !== transferId ||
      chunk.sequence !== received.length ||
      chunk.hash !== (await digest(chunk.bytes))
    )
      throw new Error('Chunk validation failed.');
    received.push(chunk.bytes);
  }
  if (received.length !== chunks[0]?.total) throw new Error('Incomplete transfer.');
  return received.join('');
}
