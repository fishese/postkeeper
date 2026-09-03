import { t } from './i18n';
export function About() {
  return (
    <footer>
      <p>
        <a
          href={`${import.meta.env.BASE_URL}extensions.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('about.browserExtension')}
        </a>
        <br />
        {t('about.browserExtensionHint')}
      </p>
      <p>
        <a
          className="android-download"
          href={`https://github.com/fishese/postkeeper/releases/download/v${__APP_VERSION__}/postkeeper-release.apk`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('about.android')}
        </a>
        <br />
        {t('about.androidHint')}
      </p>
      <p>{t('about.saveWebpagesForOfflineReadingAnd')}</p>
      <p>{t('about.developmentPreviewReleaseHardeningIsPending')}</p>
      <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">
        {t('about.privacyPolicy')}
      </a>{' '}
      ·{' '}
      <a href={`${import.meta.env.BASE_URL}terms.html`} target="_blank" rel="noopener noreferrer">
        {t('about.termsOfService')}
      </a>{' '}
      · <a href="https://github.com/fishese/postkeeper">{t('about.sourceCode')}</a> ·{' '}
      <a href={`${import.meta.env.BASE_URL}LICENSE.txt`}>{t('about.gplv3OrLaterNoWarranty')}</a> ·{' '}
      <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}>
        {t('about.thirdPartyNotices')}
      </a>
    </footer>
  );
}
