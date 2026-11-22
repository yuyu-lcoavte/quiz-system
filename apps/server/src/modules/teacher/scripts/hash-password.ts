import { hashPassword } from '../auth/password-hash.js';

/**
 * `npm run teacher:hash-password`
 * Prompts for the Teacher password without echoing it and prints only the scrypt hash for TEACHER_PASSWORD_HASH.
 * The password is never read from command-line arguments (they end up in shell history).
 */

function promptHidden(question: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    // Piped input (e.g. automation): read the first line without echo concerns.
    return new Promise((resolve, reject) => {
      let data = '';
      input.setEncoding('utf8');
      input.on('data', (chunk) => { data += chunk; });
      input.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
      input.on('error', reject);
    });
  }
  return new Promise((resolve) => {
    process.stderr.write(question);
    let value = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const onData = (char: string) => {
      for (const key of char) {
        if (key === '\r' || key === '\n') {
          input.setRawMode(false);
          input.pause();
          input.off('data', onData);
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (key === '\u0003') { // Ctrl+C
          input.setRawMode(false);
          process.stderr.write('\n');
          process.exit(130);
        }
        if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
        else value += key;
      }
    };
    input.on('data', onData);
  });
}

async function main() {
  if (process.argv.length > 2) {
    process.stderr.write('Do not pass the password as an argument; run the command without arguments and type it at the prompt.\n');
    process.exit(2);
  }
  const password = await promptHidden('Teacher password: ');
  if (!password) {
    process.stderr.write('Password must not be empty.\n');
    process.exit(1);
  }
  if (process.stdin.isTTY && (await promptHidden('Repeat password: ')) !== password) {
    process.stderr.write('Passwords do not match.\n');
    process.exit(1);
  }
  process.stdout.write(`${await hashPassword(password)}\n`);
}

void main();
