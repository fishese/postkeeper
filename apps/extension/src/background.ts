import {
  CAPTURE_LIMITS,
  SUPPORTED_CAPTURE_MEDIA_TYPES,
  encodeCapturePackage,
  sha256Hex,
  validateCapturePackage,
  type CaptureAsset,
  type CapturePackage,
} from '@postkeeper/capture-format';
import { getExtensionApi, getSettings, injectScript } from './api';
import {
  encodeBase64,
  type PageCaptureDraft,
  type RuntimeRequest,
  type TransferChunkMessage,
} from './messages';
import { PendingTransferQueue, type PendingTransfer } from './queue';
import { assertAllowedSender, matchesConfiguredPage } from './security';

const api = getExtensionApi();
const queue = new PendingTransferQueue();
const TRANSFER_CHUNK_BYTES = 256 * 1024;
const supportedMedia = new Set<string>(SUPPORTED_CAPTURE_MEDIA_TYPES);

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function captureDraft(tabId: number): Promise<PageCaptureDraft> {
  await injectScript(tabId, 'capture.js');
  const response = (await api.tabs.sendMessage(tabId, {
    type: 'postkeeper:capture-page',
  } satisfies RuntimeRequest)) as { ok?: boolean; draft?: PageCaptureDraft; error?: string };
  if (!response?.ok || !response.draft) throw new Error(response?.error ?? 'Page capture failed.');
  return response.draft;
}

async function fetchAssets(
  urls: readonly string[],
): Promise<{ assets: CaptureAsset[]; warnings: string[] }> {
  const assets: CaptureAsset[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;
  for (const [index, sourceUrl] of urls.entries()) {
    try {
      const response = await fetch(sourceUrl, { cache: 'no-store', credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mediaType = (response.headers.get('content-type') ?? '').split(';')[0]!.toLowerCase();
      if (!supportedMedia.has(mediaType)) {
        warnings.push(`unsupported-asset-media:${mediaType || 'unknown'}`);
        continue;
      }
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > CAPTURE_LIMITS.maxAssetBytes) throw new Error('asset-too-large');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > CAPTURE_LIMITS.maxAssetBytes) {
        throw new Error('asset-size-invalid');
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > CAPTURE_LIMITS.maxTotalAssetBytes)
        throw new Error('capture-assets-too-large');
      assets.push({
        assetId: `asset-${index + 1}`,
        sourceUrl,
        mediaType: mediaType as CaptureAsset['mediaType'],
        byteLength: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        bytes,
      });
    } catch (cause) {
      warnings.push(`asset-fetch-failed:${errorMessage(cause)}`);
    }
  }
  return { assets, warnings };
}

async function enqueueCapture(draft: PageCaptureDraft): Promise<PendingTransfer> {
  const fetched = await fetchAssets(draft.assetUrls);
  const capture: CapturePackage = validateCapturePackage({
    formatVersion: 1,
    captureId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    captureMethod: `extension-${__POSTKEEPER_BROWSER_TARGET__}`,
    sourceBrowser: navigator.userAgent,
    originalUrl: draft.originalUrl,
    canonicalUrl: draft.canonicalUrl,
    metadata: draft.metadata,
    renderedDom: draft.renderedDom,
    extractedReaderHtml: draft.extractedReaderHtml,
    assets: fetched.assets,
    warnings: [...draft.warnings, ...fetched.warnings],
    diagnostics: draft.diagnostics,
  });
  const payload = encodeCapturePackage(capture);
  return queue.enqueue(payload, await sha256Hex(payload));
}

async function injectBridgeWithRetry(tabId: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await injectScript(tabId, 'bridge.js');
      return;
    } catch (cause) {
      lastError = cause;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

function waitForTabReload(tabId: number): { cancel: () => void; promise: Promise<void> } {
  let cancel = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      api.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('PostKeeper tab did not finish reloading.'));
    }, 20_000);
    const onUpdated = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      api.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    cancel = () => {
      clearTimeout(timeout);
      api.tabs.onUpdated.removeListener(onUpdated);
    };
    api.tabs.onUpdated.addListener(onUpdated);
  });
  return { cancel, promise };
}

async function openPostKeeper(transfer: PendingTransfer): Promise<void> {
  const settings = await getSettings();
  const destination = new URL(settings.pwaUrl);
  destination.hash = `pkTransfer=${encodeURIComponent(transfer.id)}&pkSecret=${encodeURIComponent(transfer.secret)}`;
  const configured = new URL(settings.pwaUrl);
  const tabs = await api.tabs.query({});
  const existing = tabs.find((tab) => {
    if (!tab.url) return false;
    try {
      const url = new URL(tab.url);
      return matchesConfiguredPage(url, configured);
    } catch {
      return false;
    }
  });
  if (existing?.id && existing.url) {
    const existingUrl = new URL(existing.url);
    const sameDocument =
      existingUrl.origin === destination.origin &&
      existingUrl.pathname === destination.pathname &&
      existingUrl.search === destination.search;
    const navigation = sameDocument ? undefined : waitForTabReload(existing.id);
    try {
      const tab = await api.tabs.update(existing.id, { active: true, url: destination.href });
      if (!tab.id) throw new Error('PostKeeper tab could not be opened.');
      await navigation?.promise;
      await injectBridgeWithRetry(tab.id);
      return;
    } catch (cause) {
      navigation?.cancel();
      throw cause;
    }
  }

  const tab = await api.tabs.create({ active: true, url: destination.href });
  if (!tab.id) throw new Error('PostKeeper tab could not be opened.');
  await injectBridgeWithRetry(tab.id);
}

async function savePage(
  tabId?: number,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const tab =
      typeof tabId === 'number'
        ? (await api.tabs.query({})).find((candidate) => candidate.id === tabId)
        : (await api.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      throw new Error('Open an HTTP(S) page before saving.');
    }
    const draft = await captureDraft(tab.id);
    const transfer = await enqueueCapture(draft);
    await openPostKeeper(transfer);
    return { ok: true, message: 'Capture queued. PostKeeper will confirm after durable import.' };
  } catch (cause) {
    return { ok: false, error: errorMessage(cause) };
  }
}

async function deliverTransfer(
  transferId: string,
  secret: string,
  requestNonce: string,
  sender: { tab?: { id?: number; url?: string } },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    assertAllowedSender(sender.tab?.url, settings.pwaUrl);
    if (!sender.tab?.id) throw new Error('Transfer sender tab is unavailable.');
    const transfer = await queue.authorizeRequest(transferId, secret, requestNonce);
    const totalChunks = Math.ceil(transfer.payload.byteLength / TRANSFER_CHUNK_BYTES);
    for (let index = 0; index < totalChunks; index += 1) {
      const bytes = transfer.payload.slice(
        index * TRANSFER_CHUNK_BYTES,
        Math.min((index + 1) * TRANSFER_CHUNK_BYTES, transfer.payload.byteLength),
      );
      await api.tabs.sendMessage(sender.tab.id, {
        type: 'postkeeper:transfer-chunk',
        transferId,
        requestNonce,
        index,
        totalChunks,
        sha256: await sha256Hex(bytes),
        payloadSha256: transfer.payloadSha256,
        bytesBase64: encodeBase64(bytes),
      } satisfies TransferChunkMessage);
    }
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: errorMessage(cause) };
  }
}

async function acknowledgeTransfer(
  transferId: string,
  secret: string,
  requestNonce: string,
  sender: { tab?: { id?: number; url?: string } },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    assertAllowedSender(sender.tab?.url, settings.pwaUrl);
    await queue.acknowledge(transferId, secret, requestNonce);
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: errorMessage(cause) };
  }
}

api.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const request = message as RuntimeRequest | undefined;
  let response: Promise<unknown> | undefined;
  if (request?.type === 'postkeeper:save-page') {
    response = savePage(request.tabId ?? sender.tab?.id);
  } else if (request?.type === 'postkeeper:bridge-config') {
    response = getSettings().then((settings) => ({ ok: true, pwaUrl: settings.pwaUrl }));
  } else if (request?.type === 'postkeeper:transfer-request') {
    response = deliverTransfer(request.transferId, request.secret, request.requestNonce, sender);
  } else if (request?.type === 'postkeeper:transfer-ack') {
    response = acknowledgeTransfer(
      request.transferId,
      request.secret,
      request.requestNonce,
      sender,
    );
  }
  if (!response) return;
  void response.then(sendResponse, (cause) =>
    sendResponse({ ok: false, error: errorMessage(cause) }),
  );
  return true;
});
