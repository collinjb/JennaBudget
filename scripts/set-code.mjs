// Sets (or removes) the 4-digit access code that new devices must enter once.
//   npm run set-code          → asks for the code (typing is hidden), writes src/access.json
//   npm run set-code -- --off → removes the code (the app opens without asking)
// Only a salted, repeatedly-hashed form is saved; the code itself is never written anywhere.
// After changing it, commit src/access.json and push: every device asks for the new code once.
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/access.json', import.meta.url));
const ITERATIONS = 1_000;
const CODE_LENGTH = 4;

const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Must match hashCode() in src/lib/access.ts exactly. */
function hashCode(code, salt, iterations) {
  let h = sha256Hex(`${salt}:${code}`);
  for (let i = 1; i < iterations; i++) h = sha256Hex(h + salt);
  return h;
}

function write(config) {
  writeFileSync(OUT, `${JSON.stringify(config, null, 2)}\n`);
}

/** Read one line from the terminal without showing what's typed. */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('Run this in a terminal so the code can be typed in privately.'));
      return;
    }
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') {
          // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write('\nCancelled. Nothing was changed.\n');
          process.exit(1);
        }
        if (c === '\u007f' || c === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (/\d/.test(c)) {
          value += c;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

if (process.argv.includes('--off')) {
  write({ salt: '', iterations: ITERATIONS, hash: null });
  console.log('Access code removed. The app will open without asking for a code.');
  console.log('Commit src/access.json and push to publish the change.');
  process.exit(0);
}

console.log(`Pick a ${CODE_LENGTH}-digit code. New phones and browsers will ask for it once.`);
for (;;) {
  const first = await askHidden(`Type your ${CODE_LENGTH}-digit code, then press Enter: `);
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(first)) {
    console.log(`That isn't ${CODE_LENGTH} digits. Try again.\n`);
    continue;
  }
  const second = await askHidden('Type it again to confirm: ');
  if (second !== first) {
    console.log("Those didn't match. Let's try again.\n");
    continue;
  }
  const salt = randomBytes(16).toString('hex');
  write({ salt, iterations: ITERATIONS, hash: hashCode(first, salt, ITERATIONS) });
  console.log('\nDone! Your code is set. (Only a scrambled version was saved, never the code itself.)');
  console.log('You can close this window now.');
  process.exit(0);
}
