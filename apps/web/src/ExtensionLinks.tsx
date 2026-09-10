import { t } from './i18n';

export function ExtensionLinks() {
  return (
    <div className="extension-links">
      <p>
        <a
          href={`${import.meta.env.BASE_URL}extensions.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('about.browserExtension')}
        </a>
      </p>
      <p>
        <a
          href="https://github.com/fishese/postkeeper/releases/download/extension-v0.1.5/postkeeper-chromium-0.1.5.zip"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('extension.chromium')}
        </a>
        {' · '}
        <a
          href="https://github.com/fishese/postkeeper/releases/download/extension-v0.1.5/postkeeper-firefox-0.1.5.zip"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('extension.firefox')}
        </a>
      </p>
      <p className="meta">{t('extension.hint')}</p>
    </div>
  );
}
