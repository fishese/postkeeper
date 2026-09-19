import { useEffect, useState } from 'react';
import { t } from './i18n';
import { ExtensionLinks } from './ExtensionLinks';
import { isNativeAndroid } from './nativeBridge';
export function About() {
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'checked' | 'failed'>(
    'idle',
  );
  useEffect(() => {
    const checked = () => setUpdateStatus('checked');
    const failed = () => setUpdateStatus('failed');
    window.addEventListener('postkeeper:update-check-complete', checked);
    window.addEventListener('postkeeper:update-check-failed', failed);
    return () => {
      window.removeEventListener('postkeeper:update-check-complete', checked);
      window.removeEventListener('postkeeper:update-check-failed', failed);
    };
  }, []);

  function checkForUpdate() {
    setUpdateStatus('checking');
    window.dispatchEvent(new Event('postkeeper:check-update'));
  }

  return (
    <footer>
      <ExtensionLinks />
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
      {!isNativeAndroid() && (
        <p>
          <button type="button" disabled={updateStatus === 'checking'} onClick={checkForUpdate}>
            {updateStatus === 'checking' ? t('app.checkingForUpdates') : t('app.checkForUpdates')}
          </button>{' '}
          {updateStatus === 'checked' && <span role="status">{t('app.updateCheckComplete')}</span>}
          {updateStatus === 'failed' && <span role="alert">{t('app.updateCheckFailed')}</span>}
          <br />
          <small>{t('app.updatePreservesLibrary')}</small>
        </p>
      )}
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
