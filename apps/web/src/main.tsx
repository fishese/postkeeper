import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';
import { isNativeAndroid } from './nativeBridge';
import { locale, direction } from './i18n';

document.documentElement.lang = locale;
document.documentElement.dir = direction;

if (!isNativeAndroid()) {
  let registration: ServiceWorkerRegistration | undefined;
  const updateServiceWorker = registerSW({
    immediate: false,
    onNeedRefresh: () => window.dispatchEvent(new Event('postkeeper:update')),
    onRegisteredSW: (_scriptUrl, registered) => {
      registration = registered;
    },
  });
  window.addEventListener('postkeeper:apply-update', () => {
    void updateServiceWorker(true);
  });
  window.addEventListener('postkeeper:check-update', () => {
    void (async () => {
      try {
        await registration?.update();
        window.dispatchEvent(new Event('postkeeper:update-check-complete'));
      } catch {
        window.dispatchEvent(new Event('postkeeper:update-check-failed'));
      }
    })();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
