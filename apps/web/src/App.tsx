import { t } from './i18n';
import { useEffect, useState } from 'react';
import { FeasibilityApp } from './FeasibilityApp';
import { LibraryApp } from './LibraryApp';

function useHash(): string {
  const [hash, setHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function App() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const hash = useHash();
  useEffect(() => {
    const handler = () => setUpdateAvailable(true);
    window.addEventListener('postkeeper:update', handler);
    return () => window.removeEventListener('postkeeper:update', handler);
  }, []);

  return (
    <>
      {updateAvailable && (
        <p className="update-banner" role="status">
          {t('app.aNewerAppVersionIsReady')}
        </p>
      )}
      {hash === '#feasibility' || hash === '#/feasibility' ? <FeasibilityApp /> : <LibraryApp />}
      <p className="print-app-help">{t('print.appHelp')}</p>
    </>
  );
}
