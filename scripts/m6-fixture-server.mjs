import { createServer } from 'node:http';
const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="seagreen"/><text x="10" y="50" fill="white">M6 saved image</text></svg>';
export async function startM6Fixtures() {
  const servers = [];
  for (const port of [4186, 4187]) {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1:' + port);
      const authenticated = (req.headers.cookie ?? '').includes('m6-auth=fixture-only');
      if (url.pathname === '/login' && req.method === 'POST') {
        req.resume();
        res.writeHead(303, {
          'Set-Cookie': 'm6-auth=fixture-only; HttpOnly; SameSite=Lax; Path=/',
          Location: '/private',
        });
        res.end();
        return;
      }
      if (url.pathname === '/image.svg') {
        if (url.searchParams.has('auth') && !authenticated) {
          res.writeHead(401);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        res.end(image);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      if (url.pathname === '/private' && !authenticated) {
        res.end(
          '<!doctype html><title>M6 fixture sign-in</title><h1>Fixture sign-in</h1><form action="/login" method="POST"><label>Fixture username<input name="username" value="fixture-user"></label><label>Fixture password<input type="password" value="TEST_PASSWORD_DO_NOT_CAPTURE"></label><button>Sign in to fixture</button></form>',
        );
        return;
      }
      const name = url.pathname === '/private' ? 'M6 authenticated article' : 'M6 public article';
      res.end(
        `<!doctype html><html lang="en"><head><title>${name}</title><meta name="author" content="Fixture author"><meta name="csrf-token" content="TEST_CSRF_DO_NOT_CAPTURE"></head><body><article><h1>${name}</h1><p>Offline mountain field notes from the Android capture browser. This harmless fixture checks full article extraction and a locally stored image.</p><p>Native capture keeps the authenticated website session separate from the personal reader library.</p><img src="/image.svg${url.pathname === '/private' ? '?auth=1' : ''}" alt="M6 saved image"><p>Final native fixture sentence.</p></article><input type="password" value="TEST_PASSWORD_DO_NOT_CAPTURE"><script>localStorage.setItem('m6-site','fixture-session');document.documentElement.dataset.nativeBridge=typeof window.PostKeeperNative;document.documentElement.dataset.javaBridge=typeof window.Android;document.documentElement.dataset.origin=location.origin;</script></body></html>`,
      );
    });
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    servers.push(server);
  }
  return async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  };
}
if (process.argv.includes('--serve')) {
  await startM6Fixtures();
  console.log('M6 fixtures listening on loopback 4186 and 4187.');
}
