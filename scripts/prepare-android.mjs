import { cp, mkdir, rm, readFile, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { build } from 'esbuild';
const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'apps/android/app/src/main/assets');
if (!process.env.npm_execpath) throw new Error('Run with npm run prepare:android.');
const built = spawnSync(
  process.execPath,
  [
    process.env.npm_execpath,
    'run',
    'build',
    '--workspace=@postkeeper/web',
    '--',
    '--outDir',
    'dist-android',
  ],
  {
    cwd: root,
    env: { ...process.env, POSTKEEPER_BASE_PATH: '/assets/web/', VITE_GOOGLE_CLIENT_ID: '' },
    stdio: 'inherit',
  },
);
if (built.status !== 0) throw new Error('Android web build failed.');
await mkdir(assets, { recursive: true });
const destination = resolve(assets, 'web');
if (destination !== resolve(root, 'apps/android/app/src/main/assets/web'))
  throw new Error('Invalid asset destination');
await rm(destination, { recursive: true, force: true });
await cp(resolve(root, 'apps/web/dist-android'), destination, { recursive: true });
await appendFile(
  resolve(destination, 'THIRD_PARTY_NOTICES.txt'),
  '\n\n' +
    (await readFile(resolve(root, 'apps/android/NOTICE.txt'), 'utf8')) +
    '\n\n' +
    (await readFile(resolve(root, 'apps/android/LICENSE-APACHE-2.0.txt'), 'utf8')),
);
const result = await build({
  entryPoints: [resolve(root, 'apps/android/capture-entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome100',
  write: false,
  legalComments: 'none',
});
// esbuild's iife discards the last expression; a global-free wrapper returns the draft explicitly.
const { writeFile } = await import('node:fs/promises');
const source = result.outputFiles[0].text;
const marker = '(() => JSON.stringify(captureRenderedPage(document)))();';
if (!source.includes(marker))
  throw new Error('Capture wrapper shape changed; review its return value.');
await writeFile(
  resolve(assets, 'capture.js'),
  source.replace(marker, 'return JSON.stringify(captureRenderedPage(document));'),
);
