import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';
import { isNativeAndroid } from './nativeBridge';
import { locale, direction } from './i18n';

document.documentElement.lang = locale;
document.documentElement.dir = direction;

if (!isNativeAndroid())
  registerSW({
    immediate: false,
    onNeedRefresh: () => window.dispatchEvent(new Event('postkeeper:update')),
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
