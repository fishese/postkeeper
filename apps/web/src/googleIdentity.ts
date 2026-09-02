import type { GoogleIdentityProvider } from '@postkeeper/sync-google-drive';

declare global {
  interface Window {
    google?: GoogleIdentityProvider;
  }
}

const GIS_SCRIPT_ID = 'postkeeper-google-identity-services';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let pendingLoad: Promise<GoogleIdentityProvider> | undefined;

export function loadGoogleIdentityServices(): Promise<GoogleIdentityProvider> {
  if (window.google?.accounts.oauth2) return Promise.resolve(window.google);
  if (pendingLoad) return pendingLoad;
  pendingLoad = new Promise<GoogleIdentityProvider>((resolve, reject) => {
    document.getElementById(GIS_SCRIPT_ID)?.remove();
    const script = document.createElement('script');
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener('load', complete);
      script.removeEventListener('error', failed);
    };
    const fail = (message: string) => {
      cleanup();
      script.remove();
      reject(new Error(message));
    };
    const complete = () => {
      if (window.google?.accounts.oauth2) {
        cleanup();
        resolve(window.google);
      } else fail('Google Identity Services did not initialize.');
    };
    const failed = () => fail('Google Identity Services could not be loaded.');
    const timeout = window.setTimeout(
      () => fail('Google Identity Services timed out. Check your connection and try again.'),
      20_000,
    );
    script.addEventListener('load', complete, { once: true });
    script.addEventListener('error', failed, { once: true });
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }).finally(() => {
    pendingLoad = undefined;
  });
  return pendingLoad;
}
