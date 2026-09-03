import { t } from './i18n';
import {
  ChunkedCaptureReceiver,
  decodeCapturePackage,
  sha256Hex,
  type CaptureChunk,
} from '@postkeeper/capture-format';
import type { Article, Library } from '@postkeeper/local-store';

type TransferLocation = { transferId: string; secret: string };

type ExtensionTransferMessage = {
  channel?: string;
  type?: string;
  transferId?: string;
  requestNonce?: string;
  index?: number;
  totalChunks?: number;
  sha256?: string;
  payloadSha256?: string;
  bytes?: Uint8Array;
  error?: string;
};

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function parseExtensionTransferHash(hash: string): TransferLocation | null {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const transferId = parameters.get('pkTransfer');
  const secret = parameters.get('pkSecret');
  if (
    !transferId ||
    !secret ||
    !/^[a-f0-9]{32}$/.test(transferId) ||
    !/^[a-f0-9]{48}$/.test(secret)
  ) {
    return null;
  }
  return { transferId, secret };
}

function startExtensionTransfer(
  location: TransferLocation,
  library: Library,
  onImported: (article: Article) => void | Promise<void>,
  onStatus: (status: string) => void,
): () => void {
  const requestNonce = randomNonce();
  const receiver = new ChunkedCaptureReceiver();
  let payloadSha256: string | null = null;
  let started = false;
  let finished = false;

  const postRequest = () => {
    if (started || finished) return;
    started = true;
    onStatus(t('transfer.receiving'));
    window.postMessage(
      {
        channel: 'postkeeper-pwa',
        type: 'postkeeper:transfer-request',
        transferId: location.transferId,
        secret: location.secret,
        requestNonce,
      },
      window.location.origin,
    );
  };

  const onMessage = (event: MessageEvent<ExtensionTransferMessage>) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (message?.channel !== 'postkeeper-extension') return;
    if (message.type === 'postkeeper:bridge-ready') {
      postRequest();
      return;
    }
    if (
      message.transferId !== location.transferId ||
      message.requestNonce !== requestNonce ||
      finished
    ) {
      return;
    }
    if (message.type === 'postkeeper:transfer-error') {
      onStatus(t('transfer.failed', { reason: message.error ?? t('transfer.unknown') }));
      return;
    }
    if (
      message.type !== 'postkeeper:transfer-chunk' ||
      typeof message.index !== 'number' ||
      typeof message.totalChunks !== 'number' ||
      typeof message.sha256 !== 'string' ||
      typeof message.payloadSha256 !== 'string' ||
      !message.bytes
    ) {
      return;
    }
    if (payloadSha256 !== null && payloadSha256 !== message.payloadSha256) {
      onStatus(t('transfer.failed', { reason: t('transfer.changed') }));
      return;
    }
    payloadSha256 = message.payloadSha256;
    const chunk: CaptureChunk = {
      transferId: location.transferId,
      index: message.index,
      totalChunks: message.totalChunks,
      sha256: message.sha256,
      bytes: message.bytes,
    };
    void receiver
      .receive(chunk)
      .then(async (receipt) => {
        if (!receipt.complete) return;
        if ((await sha256Hex(receipt.bytes)) !== payloadSha256) {
          throw new Error(t('transfer.mismatch'));
        }
        const article = await library.importCapturePackage(decodeCapturePackage(receipt.bytes));
        finished = true;
        await onImported(article);
        window.postMessage(
          {
            channel: 'postkeeper-pwa',
            type: 'postkeeper:transfer-ack',
            transferId: location.transferId,
            secret: location.secret,
            requestNonce,
          },
          window.location.origin,
        );
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`,
        );
        onStatus(t('transfer.imported', { title: article.title }));
      })
      .catch((cause: unknown) => {
        onStatus(
          t('transfer.failed', { reason: cause instanceof Error ? cause.message : String(cause) }),
        );
      });
  };

  window.addEventListener('message', onMessage);
  window.postMessage(
    { channel: 'postkeeper-pwa', type: 'postkeeper:bridge-ping' },
    window.location.origin,
  );
  return () => window.removeEventListener('message', onMessage);
}

export function listenForExtensionTransfer(
  library: Library,
  onImported: (article: Article) => void | Promise<void>,
  onStatus: (status: string) => void,
): () => void {
  let activeCapability: string | null = null;
  let stopTransfer: () => void = () => undefined;

  const startFromHash = () => {
    const location = parseExtensionTransferHash(window.location.hash);
    const capability = location ? `${location.transferId}:${location.secret}` : null;
    if (capability === activeCapability) return;
    stopTransfer();
    activeCapability = capability;
    stopTransfer = location
      ? startExtensionTransfer(location, library, onImported, onStatus)
      : () => undefined;
  };

  window.addEventListener('hashchange', startFromHash);
  startFromHash();
  return () => {
    window.removeEventListener('hashchange', startFromHash);
    stopTransfer();
  };
}
