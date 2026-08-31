import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import { setApprovedAccountPassword } from '../src/lib/auth/service';
import { passwordMeetsPolicy } from '../src/lib/auth/password';
import { db } from '../src/lib/db';
import { t } from '../src/strings';

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('tty-required');
  }
  stdout.write(prompt);
  stdin.setEncoding('utf8');
  stdin.resume();
  stdin.setRawMode(true);

  return new Promise<string>((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          value = [...value].slice(0, -1).join('');
          continue;
        }
        value += character;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username || process.argv.length !== 3) throw new Error('usage');
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('tty-required');

  const password = await readHidden(t.auth.passwordAdmin.firstPrompt);
  const confirmation = await readHidden(t.auth.passwordAdmin.secondPrompt);
  if (password !== confirmation) throw new Error('mismatch');
  if (!passwordMeetsPolicy(password)) throw new Error('policy');

  const result = await setApprovedAccountPassword(username, password);
  console.log(`${t.auth.passwordAdmin.success} ${result.username} — ${result.personName}`);
}

main()
  .catch((error: unknown) => {
    const code = error instanceof Error ? error.message : '';
    const message =
      code === 'usage'
        ? t.auth.passwordAdmin.usage
        : code === 'tty-required'
          ? t.auth.passwordAdmin.ttyRequired
          : code === 'mismatch'
            ? t.auth.passwordAdmin.mismatch
            : code === 'policy' || code === 'password-policy'
              ? t.auth.passwordAdmin.policy
              : t.auth.passwordAdmin.failed;
    console.error(message);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
