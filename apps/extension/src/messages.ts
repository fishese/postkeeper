export type PageCaptureDraft = {
  originalUrl: string;
  canonicalUrl: string;
  metadata: {
    title: string;
    author?: string;
    siteName?: string;
    excerpt?: string;
    publishedAt?: string;
    language?: string;
  };
  renderedDom: string;
  extractedReaderHtml: string;
  assetUrls: string[];
  warnings: string[];
  diagnostics: { elementCount: number };
};

export type RuntimeRequest =
  | { type: 'postkeeper:save-page'; tabId?: number }
  | { type: 'postkeeper:capture-page' }
  | { type: 'postkeeper:bridge-config' }
  | {
      type: 'postkeeper:transfer-request';
      transferId: string;
      secret: string;
      requestNonce: string;
    }
  | {
      type: 'postkeeper:transfer-ack';
      transferId: string;
      secret: string;
      requestNonce: string;
    };

export type TransferChunkMessage = {
  type: 'postkeeper:transfer-chunk';
  transferId: string;
  requestNonce: string;
  index: number;
  totalChunks: number;
  sha256: string;
  payloadSha256: string;
  bytesBase64: string;
};

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
  }
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
