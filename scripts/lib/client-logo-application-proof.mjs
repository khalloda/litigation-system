import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export async function proveLogoApplication(fixture, output, exercise) {
  const source = process.cwd();
  const parent = resolve(dirname(source), 'litigation-client-builds');
  mkdirSync(parent, { recursive: true });
  const mirror = mkdtempSync(join(parent, 'task41a-'));
  const dependencyLink = join(mirror, 'node_modules');
  const receipts = [];
  const environment = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        [
          'SYSTEMROOT',
          'WINDIR',
          'PATH',
          'PATHEXT',
          'COMSPEC',
          'TEMP',
          'TMP',
          'USERPROFILE',
          'LOCALAPPDATA',
          'APPDATA',
        ].includes(key.toUpperCase()),
      ),
    ),
    DATABASE_URL: fixture.runtimeUrl,
    CLIENT_LOGO_ROOT: join(mirror, 'client-logos'),
    AUTH_SECRET: randomBytes(48).toString('base64url'),
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'production',
  };
  async function run(label, args, env = environment) {
    const start = new Date().toISOString();
    const child = spawn(process.execPath, args, {
      cwd: mirror,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (data) => {
      log += data;
    });
    child.stderr.on('data', (data) => {
      log += data;
    });
    const exit = await new Promise((res, rej) => {
      child.once('exit', res);
      child.once('error', rej);
    });
    log = log.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]');
    writeFileSync(join(output, label + '.log'), log);
    receipts.push({ label, args, start, end: new Date().toISOString(), exit });
    writeFileSync(join(output, 'application-commands.json'), JSON.stringify(receipts, null, 2));
    console.log(`${exit === 0 ? 'PASS' : 'FAIL'} application mirror: ${label}`);
    return exit;
  }
  try {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: source,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    const sourceInventory = [];
    for (const file of new Set(files)) {
      assert.ok(!file.startsWith('..') && !file.startsWith('.git/'));
      const target = join(mirror, file);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(source, file), target);
      const bytes = readFileSync(target);
      sourceInventory.push({
        path: file,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    writeFileSync(
      join(output, 'application-source-inventory.json'),
      JSON.stringify({ captured: new Date().toISOString(), files: sourceInventory }, null, 2),
    );
    symlinkSync(join(source, 'node_modules'), dependencyLink, 'junction');
    cpSync(process.env.CLIENT_LOGO_ROOT, environment.CLIENT_LOGO_ROOT, { recursive: true });
    // A separate empty Git index is used only by the existing gitignore gate.
    execFileSync('git', ['init', '--quiet'], { cwd: mirror });
    execFileSync('git', ['add', '--all'], { cwd: mirror });
    assert.equal(
      await run('prisma-generate', ['node_modules/prisma/build/index.js', 'generate'], {
        ...environment,
        MIGRATION_DATABASE_URL: fixture.migrationUrl,
      }),
      0,
    );
    assert.equal(await run('next-typegen', ['node_modules/next/dist/bin/next', 'typegen']), 0);
    const checks = [
      ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
      ['lint', ['node_modules/eslint/bin/eslint.js']],
      ['format', ['node_modules/prettier/bin/prettier.cjs', '--check', '.']],
      ...[
        'rtl',
        'authorization',
        'audit',
        'user-management',
        'staff-read-only',
        'client-read-only',
        'gitignore',
        'encoding',
      ].map((name) => [name, ['node_modules/tsx/dist/cli.mjs', `scripts/check-${name}.ts`]]),
      ...['rtl', 'audit', 'user-management'].map((name) => [
        name + '-self-test',
        ['node_modules/tsx/dist/cli.mjs', `scripts/check-${name}.ts`, '--self-test'],
      ]),
    ];
    let failures = 0;
    for (const [label, args] of checks) if ((await run(label, args)) !== 0) failures++;
    assert.equal(failures, 0, 'Static checks failed; inspect individual preserved logs');
    assert.equal(
      await run('production-build', ['node_modules/next/dist/bin/next', 'build', '--webpack']),
      0,
    );
    if (exercise) await exercise({ mirror, environment, run });
  } finally {
    if (existsSync(dependencyLink)) {
      assert.equal(realpathSync(dependencyLink), realpathSync(join(source, 'node_modules')));
      unlinkSync(dependencyLink);
    }
    assert.ok(realpathSync(mirror).startsWith(realpathSync(parent) + sep));
    assert.match(mirror.slice(parent.length + 1), /^task41a-[A-Za-z0-9]+$/u);
    rmSync(mirror, { recursive: true });
    assert.equal(existsSync(mirror), false);
    writeFileSync(
      join(output, 'application-cleanup.json'),
      JSON.stringify(
        { mirror, removed: true, dependencyLinkRemoved: !existsSync(dependencyLink) },
        null,
        2,
      ),
    );
  }
}
