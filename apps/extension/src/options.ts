import { getSettings, saveSettings } from './api';

const form = document.querySelector<HTMLFormElement>('#settings-form');
const input = document.querySelector<HTMLInputElement>('#pwa-url');
const status = document.querySelector<HTMLElement>('#status');

if (!form || !input || !status) throw new Error('Settings controls are missing.');

void getSettings().then((settings) => {
  input.value = settings.pwaUrl;
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveSettings({ pwaUrl: input.value }).then(
    () => {
      status.textContent = 'Settings saved.';
    },
    (cause: unknown) => {
      status.textContent = cause instanceof Error ? cause.message : String(cause);
    },
  );
});
