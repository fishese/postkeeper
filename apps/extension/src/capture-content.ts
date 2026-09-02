import { getExtensionApi } from './api';
import { captureRenderedPage } from './capture-page';
import type { RuntimeRequest } from './messages';

if (!window.__postkeeperCaptureContentInstalled) {
  window.__postkeeperCaptureContentInstalled = true;
  getExtensionApi().runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if ((message as RuntimeRequest | undefined)?.type !== 'postkeeper:capture-page') return;
    try {
      sendResponse({ ok: true, draft: captureRenderedPage(document, window.location.href) });
    } catch (cause) {
      sendResponse({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
    }
  });
}
