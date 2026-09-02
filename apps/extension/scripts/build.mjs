import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const targets = ['chromium', 'firefox'];
const entries = {
  background: resolve(root, 'src/background.ts'),
  bridge: resolve(root, 'src/bridge.ts'),
  capture: resolve(root, 'src/capture-content.ts'),
  options: resolve(root, 'src/options.ts'),
  popup: resolve(root, 'src/popup.ts'),
};

for (const target of targets) {
  const outdir = resolve(root, `dist-${target}`);
  await rm(outdir, { force: true, recursive: true });
  await mkdir(outdir, { recursive: true });
  for (const [name, entry] of Object.entries(entries)) {
    await build({
      bundle: true,
      entryPoints: [entry],
      outfile: resolve(outdir, `${name}.js`),
      format: 'iife',
      platform: 'browser',
      target: target === 'chromium' ? ['chrome120'] : ['firefox121'],
      define: { __POSTKEEPER_BROWSER_TARGET__: JSON.stringify(target) },
      legalComments: 'none',
      minify: false,
      sourcemap: true,
    });
  }
  for (const file of ['background.html', 'options.html', 'popup.html', 'extension.css']) {
    await cp(resolve(root, 'static', file), resolve(outdir, file));
  }
  for (const file of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) {
    await cp(resolve(root, '../web/public', file), resolve(outdir, file));
  }
  const manifest = await readFile(resolve(root, 'manifests', `${target}.json`), 'utf8');
  await writeFile(resolve(outdir, 'manifest.json'), manifest);
}
