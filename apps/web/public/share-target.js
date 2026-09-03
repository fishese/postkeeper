/* Installed PWAs intercept shared POST bodies locally; never forward them to the host. */
self.addEventListener('fetch', (event) => {
  const target = new URL('share-target', self.registration.scope);
  if (event.request.method !== 'POST' || event.request.url !== target.href) return;
  event.respondWith(
    (async () => {
      try {
        const reader = event.request.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 32768) {
            await reader.cancel();
            throw new Error('Too large');
          }
          chunks.push(value);
        }
        const form = await new Response(new Blob(chunks), {
          headers: { 'Content-Type': event.request.headers.get('Content-Type') },
        }).formData();
        const input = {};
        for (const key of ['url', 'text', 'title']) {
          const value = form.get(key);
          if (value !== null) {
            if (typeof value !== 'string' || value.length > 16384) throw new Error('Invalid share');
            input[key] = value;
          }
        }
        return Response.redirect(
          self.registration.scope + '#share=' + encodeURIComponent(JSON.stringify(input)),
          303,
        );
      } catch {
        return new Response('Share one short HTTP or HTTPS link. No data was saved.', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })(),
  );
});
