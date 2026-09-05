import { getExtensionApi } from './api';
import { decodeBase64, type RuntimeRequest, type TransferChunkMessage } from './messages';
import { matchesConfiguredPage } from './security';

const api = getExtensionApi();

void api.runtime
  .sendMessage({ type: 'postkeeper:bridge-config' } satisfies RuntimeRequest)
  .then((rawResponse) => {
    const response = rawResponse as { ok?: boolean; pwaUrl?: string };
    if (!response.ok || !response.pwaUrl) return;
    const configured = new URL(response.pwaUrl);
    if (!matchesConfiguredPage(new URL(window.location.href), configured)) return;
    const targetOrigin = configured.origin;
    if (window.__postkeeperBridgeInstalled) {
      window.postMessage(
        { channel: 'postkeeper-extension', type: 'postkeeper:bridge-ready' },
        targetOrigin,
      );
      return;
    }
    window.__postkeeperBridgeInstalled = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== targetOrigin) return;
      const data = event.data as
        | {
            channel?: string;
            type?: string;
            transferId?: string;
            secret?: string;
            requestNonce?: string;
          }
        | undefined;
      if (data?.channel !== 'postkeeper-pwa') return;
      if (data.type === 'postkeeper:bridge-ping') {
        window.postMessage(
          { channel: 'postkeeper-extension', type: 'postkeeper:bridge-ready' },
          targetOrigin,
        );
        return;
      }
      if (
        !['postkeeper:transfer-request', 'postkeeper:transfer-ack'].includes(data.type ?? '') ||
        typeof data.transferId !== 'string' ||
        typeof data.secret !== 'string' ||
        typeof data.requestNonce !== 'string'
      ) {
        return;
      }
      void api.runtime
        .sendMessage({
          type: data.type,
          transferId: data.transferId,
          secret: data.secret,
          requestNonce: data.requestNonce,
        } as RuntimeRequest)
        .then((result) => {
          const transferResult = result as { ok?: boolean; error?: string };
          if (!transferResult?.ok) {
            window.postMessage(
              {
                channel: 'postkeeper-extension',
                type: 'postkeeper:transfer-error',
                transferId: data.transferId,
                requestNonce: data.requestNonce,
                error: transferResult?.error ?? 'Extension transfer failed.',
              },
              targetOrigin,
            );
          }
        });
    });

    api.runtime.onMessage.addListener((message: unknown) => {
      const chunk = message as TransferChunkMessage | undefined;
      if (chunk?.type !== 'postkeeper:transfer-chunk' || typeof chunk.bytesBase64 !== 'string')
        return;
      const bytes = decodeBase64(chunk.bytesBase64);
      window.postMessage(
        {
          channel: 'postkeeper-extension',
          type: chunk.type,
          transferId: chunk.transferId,
          requestNonce: chunk.requestNonce,
          index: chunk.index,
          totalChunks: chunk.totalChunks,
          sha256: chunk.sha256,
          payloadSha256: chunk.payloadSha256,
          bytes,
        },
        targetOrigin,
        [bytes.buffer],
      );
    });

    window.postMessage(
      { channel: 'postkeeper-extension', type: 'postkeeper:bridge-ready' },
      targetOrigin,
    );
  });
