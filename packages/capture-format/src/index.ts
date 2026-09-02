export const CAPTURE_FORMAT_VERSION = 1 as const;

export const CAPTURE_LIMITS = {
  maxAssets: 256,
  maxAssetBytes: 10 * 1024 * 1024,
  maxTotalAssetBytes: 48 * 1024 * 1024,
  maxDocumentCharacters: 2_000_000,
  maxStringCharacters: 16_384,
  maxWarnings: 256,
  maxChunkBytes: 1024 * 1024,
  maxTransferBytes: 52 * 1024 * 1024,
  maxChunks: 8192,
} as const;

export const SUPPORTED_CAPTURE_MEDIA_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
] as const;

export type SupportedCaptureMediaType = (typeof SUPPORTED_CAPTURE_MEDIA_TYPES)[number];

export type CaptureAsset = {
  assetId: string;
  sourceUrl: string;
  mediaType: SupportedCaptureMediaType;
  byteLength: number;
  sha256: string;
  bytes: Uint8Array;
};

export type CaptureMetadata = {
  title: string;
  author?: string;
  siteName?: string;
  excerpt?: string;
  publishedAt?: string;
  language?: string;
};

export type CapturePackage = {
  formatVersion: 1;
  captureId: string;
  capturedAt: string;
  captureMethod: string;
  sourceBrowser: string;
  originalUrl: string;
  canonicalUrl: string;
  metadata: CaptureMetadata;
  renderedDom: string;
  extractedReaderHtml: string;
  assets: CaptureAsset[];
  warnings: string[];
  diagnostics?: Record<string, string | number | boolean | null>;
};

export type CaptureChunk = {
  transferId: string;
  index: number;
  totalChunks: number;
  sha256: string;
  bytes: Uint8Array;
};

export type ChunkReceipt =
  { complete: false; nextIndex: number } | { complete: true; bytes: Uint8Array };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const mediaTypes = new Set<string>(SUPPORTED_CAPTURE_MEDIA_TYPES);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean; max?: number } = {},
): string {
  if (typeof value !== 'string' || (!options.allowEmpty && !value.trim())) {
    throw new Error(`Invalid ${label}.`);
  }
  if (value.length > (options.max ?? CAPTURE_LIMITS.maxStringCharacters)) {
    throw new Error(`${label} is too large.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : stringValue(value, label, { allowEmpty: true });
}

function identifier(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!ID_PATTERN.test(result)) throw new Error(`Invalid ${label}.`);
  return result;
}

function isoTimestamp(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`Invalid ${label}.`);
  return result;
}

function httpUrl(value: unknown, label: string): string {
  const result = stringValue(value, label);
  let parsed: URL;
  try {
    parsed = new URL(result);
  } catch {
    throw new Error(`${label} must be an HTTP(S) URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must be an HTTP(S) URL.`);
  }
  parsed.hash = '';
  return parsed.href;
}

function bytesValue(value: unknown, label: string): Uint8Array {
  if (
    !ArrayBuffer.isView(value) ||
    Object.prototype.toString.call(value) !== '[object Uint8Array]'
  ) {
    throw new Error(`${label} must contain bytes.`);
  }
  const view = value as Uint8Array;
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

function validateMetadata(value: unknown): CaptureMetadata {
  const input = record(value, 'Capture metadata');
  const result: CaptureMetadata = { title: stringValue(input.title, 'metadata.title') };
  for (const key of ['author', 'siteName', 'excerpt', 'language'] as const) {
    const item = optionalString(input[key], `metadata.${key}`);
    if (item !== undefined) result[key] = item;
  }
  if (input.publishedAt !== undefined) {
    result.publishedAt = isoTimestamp(input.publishedAt, 'metadata.publishedAt');
  }
  return result;
}

function validateAsset(value: unknown, index: number): CaptureAsset {
  const input = record(value, `assets[${index}]`);
  const bytes = bytesValue(input.bytes, `assets[${index}].bytes`);
  if (bytes.byteLength === 0 || bytes.byteLength > CAPTURE_LIMITS.maxAssetBytes) {
    throw new Error(`assets[${index}] has an invalid size.`);
  }
  if (input.byteLength !== bytes.byteLength) {
    throw new Error(`assets[${index}] byte length does not match its bytes.`);
  }
  const mediaType = stringValue(input.mediaType, `assets[${index}].mediaType`).toLowerCase();
  if (!mediaTypes.has(mediaType)) throw new Error(`Unsupported asset media type: ${mediaType}.`);
  const sha256 = stringValue(input.sha256, `assets[${index}].sha256`).toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) throw new Error(`Invalid assets[${index}].sha256.`);
  return {
    assetId: identifier(input.assetId, `assets[${index}].assetId`),
    sourceUrl: httpUrl(input.sourceUrl, `assets[${index}].sourceUrl`),
    mediaType: mediaType as SupportedCaptureMediaType,
    byteLength: bytes.byteLength,
    sha256,
    bytes,
  };
}

function validateWarnings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > CAPTURE_LIMITS.maxWarnings) {
    throw new Error('Invalid capture warnings.');
  }
  return value.map((warning, index) => stringValue(warning, `warnings[${index}]`));
}

function validateDiagnostics(
  value: unknown,
): Record<string, string | number | boolean | null> | undefined {
  if (value === undefined) return undefined;
  const input = record(value, 'Capture diagnostics');
  if (Object.keys(input).length > 64) throw new Error('Capture diagnostics has too many entries.');
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(input)) {
    identifier(key, 'diagnostic key');
    if (typeof item === 'string') {
      output[key] = stringValue(item, `diagnostics.${key}`, { allowEmpty: true });
    } else if (typeof item === 'number' && Number.isFinite(item)) output[key] = item;
    else if (typeof item === 'boolean' || item === null) output[key] = item;
    else throw new Error(`Invalid diagnostics.${key}.`);
  }
  return output;
}

export function validateCapturePackage(value: unknown): CapturePackage {
  const input = record(value, 'Capture package');
  if (input.formatVersion !== CAPTURE_FORMAT_VERSION) {
    throw new Error('Unsupported capture format version.');
  }
  const renderedDom = stringValue(input.renderedDom, 'renderedDom', {
    max: CAPTURE_LIMITS.maxDocumentCharacters,
  });
  const extractedReaderHtml = stringValue(input.extractedReaderHtml, 'extractedReaderHtml', {
    allowEmpty: true,
    max: CAPTURE_LIMITS.maxDocumentCharacters,
  });
  if (!Array.isArray(input.assets) || input.assets.length > CAPTURE_LIMITS.maxAssets) {
    throw new Error('Invalid capture assets.');
  }
  const assets = input.assets.map(validateAsset);
  if (new Set(assets.map((asset) => asset.assetId)).size !== assets.length) {
    throw new Error('Capture asset IDs must be unique.');
  }
  const totalAssetBytes = assets.reduce((total, asset) => total + asset.byteLength, 0);
  if (totalAssetBytes > CAPTURE_LIMITS.maxTotalAssetBytes) {
    throw new Error('Capture assets exceed the total size limit.');
  }
  const diagnostics = validateDiagnostics(input.diagnostics);
  return {
    formatVersion: CAPTURE_FORMAT_VERSION,
    captureId: identifier(input.captureId, 'captureId'),
    capturedAt: isoTimestamp(input.capturedAt, 'capturedAt'),
    captureMethod: identifier(input.captureMethod, 'captureMethod'),
    sourceBrowser: stringValue(input.sourceBrowser, 'sourceBrowser'),
    originalUrl: httpUrl(input.originalUrl, 'originalUrl'),
    canonicalUrl: httpUrl(input.canonicalUrl, 'canonicalUrl'),
    metadata: validateMetadata(input.metadata),
    renderedDom,
    extractedReaderHtml,
    assets,
    warnings: validateWarnings(input.warnings),
    ...(diagnostics ? { diagnostics } : {}),
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyCaptureAssetHashes(capture: CapturePackage): Promise<void> {
  for (const asset of capture.assets) {
    if ((await sha256Hex(asset.bytes)) !== asset.sha256) {
      throw new Error(`Asset hash mismatch for ${asset.assetId}.`);
    }
  }
}

type EncodedCaptureMetadata = Omit<CapturePackage, 'assets'> & {
  assets: Array<Omit<CaptureAsset, 'bytes'>>;
};

export function encodeCapturePackage(value: unknown): Uint8Array {
  const capture = validateCapturePackage(value);
  const metadata: EncodedCaptureMetadata = {
    ...capture,
    assets: capture.assets.map((asset) => ({
      assetId: asset.assetId,
      sourceUrl: asset.sourceUrl,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
    })),
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const totalLength =
    4 +
    metadataBytes.byteLength +
    capture.assets.reduce((total, asset) => total + asset.byteLength, 0);
  if (totalLength > CAPTURE_LIMITS.maxTransferBytes)
    throw new Error('Encoded capture is too large.');
  const encoded = new Uint8Array(totalLength);
  new DataView(encoded.buffer).setUint32(0, metadataBytes.byteLength, false);
  encoded.set(metadataBytes, 4);
  let offset = 4 + metadataBytes.byteLength;
  for (const asset of capture.assets) {
    encoded.set(asset.bytes, offset);
    offset += asset.byteLength;
  }
  return encoded;
}

export function decodeCapturePackage(value: unknown): CapturePackage {
  const encoded = bytesValue(value, 'encoded capture');
  if (encoded.byteLength < 4 || encoded.byteLength > CAPTURE_LIMITS.maxTransferBytes) {
    throw new Error('Invalid encoded capture size.');
  }
  const metadataLength = new DataView(
    encoded.buffer,
    encoded.byteOffset,
    encoded.byteLength,
  ).getUint32(0, false);
  if (metadataLength === 0 || metadataLength > CAPTURE_LIMITS.maxDocumentCharacters * 3) {
    throw new Error('Invalid encoded capture metadata size.');
  }
  const assetOffset = 4 + metadataLength;
  if (assetOffset > encoded.byteLength) throw new Error('Truncated encoded capture metadata.');
  let metadata: EncodedCaptureMetadata;
  try {
    metadata = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(encoded.slice(4, assetOffset)),
    ) as EncodedCaptureMetadata;
  } catch {
    throw new Error('Invalid encoded capture metadata.');
  }
  if (!metadata || !Array.isArray(metadata.assets)) {
    throw new Error('Invalid encoded capture asset metadata.');
  }
  let offset = assetOffset;
  const assets = metadata.assets.map((asset, index) => {
    if (!asset || !Number.isInteger(asset.byteLength) || asset.byteLength < 0) {
      throw new Error(`Invalid encoded asset ${index}.`);
    }
    const end = offset + asset.byteLength;
    if (end > encoded.byteLength) throw new Error(`Truncated encoded asset ${index}.`);
    const decoded: CaptureAsset = { ...asset, bytes: encoded.slice(offset, end) };
    offset = end;
    return decoded;
  });
  if (offset !== encoded.byteLength) throw new Error('Encoded capture has trailing bytes.');
  return validateCapturePackage({ ...metadata, assets });
}

export class ChunkedCaptureReceiver {
  private readonly chunks: Uint8Array[] = [];
  private transferId: string | null = null;
  private totalChunks = 0;
  private totalBytes = 0;
  private complete = false;

  constructor(private readonly maxTransferBytes = CAPTURE_LIMITS.maxTransferBytes) {}

  async receive(chunk: CaptureChunk): Promise<ChunkReceipt> {
    if (this.complete) throw new Error('Capture transfer is already complete.');
    const transferId = identifier(chunk.transferId, 'transferId');
    if (!Number.isInteger(chunk.index) || chunk.index < 0) throw new Error('Invalid chunk index.');
    if (
      !Number.isInteger(chunk.totalChunks) ||
      chunk.totalChunks < 1 ||
      chunk.totalChunks > CAPTURE_LIMITS.maxChunks
    ) {
      throw new Error('Invalid total chunk count.');
    }
    const bytes = bytesValue(chunk.bytes, 'chunk bytes');
    if (bytes.byteLength === 0 || bytes.byteLength > CAPTURE_LIMITS.maxChunkBytes) {
      throw new Error('Invalid chunk size.');
    }
    const hash = stringValue(chunk.sha256, 'chunk sha256').toLowerCase();
    if (!SHA256_PATTERN.test(hash) || (await sha256Hex(bytes)) !== hash) {
      throw new Error('Chunk hash mismatch.');
    }
    if (this.transferId === null) {
      this.transferId = transferId;
      this.totalChunks = chunk.totalChunks;
    }
    if (transferId !== this.transferId || chunk.totalChunks !== this.totalChunks) {
      throw new Error('Chunk transfer metadata changed during receipt.');
    }
    if (chunk.index !== this.chunks.length) {
      throw new Error(`Expected chunk ${this.chunks.length}, received ${chunk.index}.`);
    }
    this.totalBytes += bytes.byteLength;
    if (this.totalBytes > this.maxTransferBytes) throw new Error('Capture transfer is too large.');
    this.chunks.push(bytes);
    if (this.chunks.length < this.totalChunks) {
      return { complete: false, nextIndex: this.chunks.length };
    }
    const assembled = new Uint8Array(this.totalBytes);
    let offset = 0;
    for (const item of this.chunks) {
      assembled.set(item, offset);
      offset += item.byteLength;
    }
    this.complete = true;
    return { complete: true, bytes: assembled };
  }
}
