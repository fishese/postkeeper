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
          A newer app version is ready; reload when convenient.
        </p>
      )}
      {hash === '#feasibility' || hash === '#/feasibility' ? <FeasibilityApp /> : <LibraryApp />}
      <footer>
        <p>
          Save webpages for offline reading and organization, with optional encrypted Google Drive
          sync.
        </p>
        <p>Development preview — release hardening is pending. Use test data.</p>
        <a
          href={`${import.meta.env.BASE_URL}privacy.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>{' '}
        ·{' '}
        <a href={`${import.meta.env.BASE_URL}terms.html`} target="_blank" rel="noopener noreferrer">
          Terms of Service
        </a>{' '}
        · <a href="https://github.com/fishese/postkeeper">Source code</a> ·{' '}
        <a href={`${import.meta.env.BASE_URL}LICENSE.txt`}>GPLv3-or-later · no warranty</a> ·{' '}
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}>Third-party notices</a>
      </footer>
    </>
  );
}
