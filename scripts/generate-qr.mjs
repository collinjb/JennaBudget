// Makes a QR code for the live app URL so the iPhone camera can open it straight from the computer screen.
//
// Usage:
//   npm run qr -- https://example.github.io/budget/
//   APP_URL=https://example.github.io/budget/ npm run qr
//   npm run qr -- https://example.github.io/budget/ --out some/other/path.png
//
// Writes docs/qr.png (by default) and prints the same QR code in the terminal.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  let url;
  let out;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') out = argv[++i];
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
    else if (!arg.startsWith('-') && url === undefined) url = arg;
  }
  return { url: url ?? process.env.APP_URL, out };
}

const { url, out } = parseArgs(process.argv.slice(2));

if (!url) {
  console.error('Missing URL. Usage: npm run qr -- https://your-site.example/  (or set APP_URL)');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`"${url}" isn't a valid URL. Include https://, e.g. https://your-site.example/`);
  process.exit(1);
}
if (parsed.protocol !== 'https:') {
  console.warn(`! ${parsed.href} is not https. The home-screen app needs HTTPS to work offline.`);
}

const target = path.resolve(root, out ?? path.join('docs', 'qr.png'));
await mkdir(path.dirname(target), { recursive: true });

await QRCode.toFile(target, parsed.href, {
  type: 'png',
  errorCorrectionLevel: 'M',
  margin: 4,
  width: 720,
  color: { dark: '#1c1c1e', light: '#ffffff' },
});

console.log(await QRCode.toString(parsed.href, { type: 'terminal', small: true, errorCorrectionLevel: 'M' }));
console.log(`QR code for ${parsed.href}`);
console.log(`Saved to ${path.relative(root, target).replaceAll('\\', '/')}`);
