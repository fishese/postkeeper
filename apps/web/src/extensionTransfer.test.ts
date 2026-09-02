// @vitest-environment jsdom

import type { Library } from '@postkeeper/local-store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenForExtensionTransfer, parseExtensionTransferHash } from './extensionTransfer';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('extension transfer URL capability', () => {
  it('accepts only the bounded hexadecimal transfer ID and secret', () => {
    expect(
      parseExtensionTransferHash(`#pkTransfer=${'a'.repeat(32)}&pkSecret=${'b'.repeat(48)}`),
    ).toEqual({ transferId: 'a'.repeat(32), secret: 'b'.repeat(48) });
    expect(parseExtensionTransferHash('#pkTransfer=../x&pkSecret=secret')).toBeNull();
    expect(parseExtensionTransferHash('#/feasibility')).toBeNull();
  });

  it('starts a fresh request when an existing PWA tab receives a new capability hash', () => {
    const firstTransferId = 'a'.repeat(32);
    const firstSecret = 'b'.repeat(48);
    const secondTransferId = 'c'.repeat(32);
    const secondSecret = 'd'.repeat(48);
    window.history.replaceState(
      null,
      '',
      `/#pkTransfer=${firstTransferId}&pkSecret=${firstSecret}`,
    );
    const postMessage = vi.spyOn(window, 'postMessage');
    const stop = listenForExtensionTransfer({} as Library, vi.fn(), vi.fn());

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: 'postkeeper-extension', type: 'postkeeper:bridge-ready' },
        origin: window.location.origin,
        source: window,
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        transferId: firstTransferId,
        secret: firstSecret,
        type: 'postkeeper:transfer-request',
      }),
      window.location.origin,
    );

    window.history.replaceState(
      null,
      '',
      `/#pkTransfer=${secondTransferId}&pkSecret=${secondSecret}`,
    );
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: 'postkeeper-extension', type: 'postkeeper:bridge-ready' },
        origin: window.location.origin,
        source: window,
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        transferId: secondTransferId,
        secret: secondSecret,
        type: 'postkeeper:transfer-request',
      }),
      window.location.origin,
    );

    stop();
  });
});
