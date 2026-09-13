import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
  statSync,
  readFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import {
  withApprovedMigrationClient,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal.ts';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import { createDatabaseClient } from '../src/lib/db.ts';
import { setApprovedAccountPassword, changeOwnPassword } from '../src/lib/auth/service.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import { t } from '../src/strings.ts';
import {
  staffZoomExtension,
  staffAccessibilityTree,
  staffComputedTargets,
} from './lib/staff-accessibility-browser.mjs';

export async function proveHearingBrowser(fixture, output, editorProof) {
  const source = process.cwd();
  const inspect = (work) =>
    withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
  await inspect((db) =>
    assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
  );
  assert.ok(process.env.STAFF_PLAYWRIGHT_MODULE && process.env.STAFF_CHROMIUM_EXECUTABLE);
  const { chromium } = await import(
    pathToFileURL(resolve(process.env.STAFF_PLAYWRIGHT_MODULE)).href
  );
  const axe = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  const parent = resolve(dirname(source), 'litigation-client-builds');
  const mirror = mkdtempSync(join(parent, 'task43-'));
  const dependencyLink = join(mirror, 'node_modules');
  const evidence = [],
    commands = [],
    remoteRequests = [];
  let server, context, page, port;
  const runtime = createDatabaseClient(fixture.runtimeUrl);
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
    NODE_ENV: 'production',
    DATABASE_URL: fixture.runtimeUrl,
    AUTH_SECRET: randomBytes(48).toString('base64url'),
    CLIENT_LOGO_ROOT: join(mirror, 'client-logos'),
    NEXT_TELEMETRY_DISABLED: '1',
    JITI_FS_CACHE: 'false',
  };
  const boundedRuntime = new URL(environment.DATABASE_URL);
  boundedRuntime.searchParams.set('options', '-c statement_timeout=8000');
  environment.DATABASE_URL = boundedRuntime.toString();
  const launch = (args, env = environment) => {
    const child = spawn(process.execPath, args, {
      cwd: mirror,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (b) => {
      log += b;
    });
    child.stderr.on('data', (b) => {
      log += b;
    });
    const done = new Promise((res, rej) => {
      child.once('exit', res);
      child.once('error', rej);
    });
    return { child, done, log: () => log.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]') };
  };
  // Shared installed packages are read inputs only. Build caches/generated
  // outputs reside in the task mirror; compare every dependency file's metadata.
  function dependencyState() {
    const entries = [];
    function walk(path) {
      for (const e of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const p = join(path, e.name);
        if (e.isDirectory()) walk(p);
        else {
          const s = statSync(p);
          entries.push([p, s.size, s.mtimeMs]);
        }
      }
    }
    walk(join(source, 'node_modules'));
    return entries;
  }
  const dependenciesBefore = dependencyState();
  try {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: source,
      encoding: 'utf8',
      windowsHide: true,
    })
      .trim()
      .split('\n');
    writeFileSync(
      join(output, 'browser-test-source.json'),
      JSON.stringify(
        files
          .filter((file) => file.startsWith('scripts/'))
          .map((file) => ({
            path: file,
            sha256: createHash('sha256')
              .update(readFileSync(join(source, file)))
              .digest('hex'),
          })),
        null,
        2,
      ),
    );
    const buildFiles = files.filter((file) =>
      /^(?:src\/|assets\/|prisma\/schema\.prisma$|(?:next-env\.d\.ts|next\.config\.ts|tsconfig\.json|package(?:-lock)?\.json|prisma\.config\.ts)$)/u.test(
        file,
      ),
    );
    for (const file of new Set(buildFiles)) {
      assert.ok(!file.startsWith('..'));
      const dest = join(mirror, file);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(source, file), dest);
    }
    writeFileSync(
      join(output, 'build-source.json'),
      JSON.stringify(
        [...new Set(buildFiles)].map((file) => ({
          path: file,
          sha256: createHash('sha256')
            .update(readFileSync(join(mirror, file)))
            .digest('hex'),
        })),
        null,
        2,
      ),
    );
    cpSync(join(source, 'src/generated'), join(mirror, 'src/generated'), { recursive: true });
    symlinkSync(join(source, 'node_modules'), dependencyLink, 'junction');
    cpSync(process.env.CLIENT_LOGO_ROOT, environment.CLIENT_LOGO_ROOT, { recursive: true });
    if (editorProof) {
      const generate = launch(['node_modules/prisma/build/index.js', 'generate'], {
        ...environment,
        MIGRATION_DATABASE_URL: fixture.migrationUrl,
      });
      const exit = await generate.done;
      writeFileSync(join(output, 'isolated-prisma-generate.log'), generate.log());
      assert.equal(exit, 0);
    }
    const build = launch(['node_modules/next/dist/bin/next', 'build', '--webpack']);
    const exit = await build.done;
    writeFileSync(join(output, 'production-build.log'), build.log());
    commands.push({ name: 'production-build', exit });
    assert.equal(exit, 0, 'Production build failed; see retained log');
    console.log('PASS isolated production build');
    const accounts = [];
    const owner = await createApprovedMigrationPrismaClient(fixture.migrationUrl);
    try {
      const rows = await owner.userAccount.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, username: true, roleCode: true },
      });
      assert.equal(rows.length, 4);
      for (const row of rows) {
        const temporary = randomBytes(32).toString('base64url'),
          password = randomBytes(32).toString('base64url');
        await setApprovedAccountPassword(row.username, temporary, {
          database: owner,
          auditMetadata: createMaintenanceAuditMetadata(),
        });
        const a = await owner.userAccount.findUniqueOrThrow({ where: { id: row.id } });
        assert.equal(
          await changeOwnPassword(
            {
              accountId: row.id,
              sessionVersion: a.sessionVersion,
              currentPassword: temporary,
              newPassword: password,
            },
            { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
          ),
          'changed',
        );
        accounts.push({ ...row, password });
      }
    } finally {
      await owner.$disconnect();
    }
    const listener = createServer();
    await new Promise((res) => listener.listen(0, '127.0.0.1', res));
    port = listener.address().port;
    await new Promise((res) => listener.close(res));
    const base = `http://localhost:${port}`;
    server = launch([
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ]);
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/login')).ok) break;
      } catch {}
      await new Promise((res) => setTimeout(res, 200));
      if (i === 99) throw new Error('Listener not ready');
    }
    const extension = staffZoomExtension(mirror),
      browserEnv = { ...environment };
    delete browserEnv.DATABASE_URL;
    delete browserEnv.AUTH_SECRET;
    context = await chromium.launchPersistentContext(join(mirror, 'browser-profile'), {
      headless: true,
      executablePath: process.env.STAFF_CHROMIUM_EXECUTABLE,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport: { width: 1440, height: 1000 },
      env: browserEnv,
    });
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin === base || u.origin === `http://127.0.0.1:${port}`) return route.continue();
      remoteRequests.push(u.origin);
      return route.abort();
    });
    page = await context.newPage();
    const goto = (path) =>
      page.goto(path.startsWith('http') ? path : base + path, { waitUntil: 'networkidle' });
    const screenshot = async (name) => {
      if ((await page.evaluate(() => devicePixelRatio)) !== 1) {
        const cdp = await context.newCDPSession(page);
        try {
          const { contentSize } = await cdp.send('Page.getLayoutMetrics');
          const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 },
          });
          const png = Buffer.from(data, 'base64');
          assert.equal(
            png.readUInt32BE(16),
            Math.ceil(contentSize.width),
            'complete zoom capture width',
          );
          assert.equal(
            png.readUInt32BE(20),
            Math.ceil(contentSize.height),
            'complete zoom capture height',
          );
          writeFileSync(join(output, name + '.png'), png);
          writeFileSync(
            join(output, name + '-capture.json'),
            JSON.stringify(
              {
                contentSize,
                pixels: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
              },
              null,
              2,
            ),
          );
        } finally {
          await cdp.detach();
        }
        return;
      }
      await page.screenshot({ path: join(output, name + '.png'), fullPage: true });
    };
    const audit = async (name) => {
      await page.addScriptTag({ path: axe });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
      );
      evidence.push({
        name,
        violations,
        width: await page.evaluate(() => innerWidth),
        targets: await staffComputedTargets(page),
      });
      writeFileSync(join(output, 'browser-results.json'), JSON.stringify(evidence, null, 2));
      assert.deepEqual(violations, [], name);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        name + ' reflow',
      );
      await staffAccessibilityTree(context, page);
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    };
    const login = async (account) => {
      await context.clearCookies();
      await goto('/login');
      await page.getByLabel(t.auth.username, { exact: true }).fill(account.username);
      await page.getByLabel(t.auth.password, { exact: true }).fill(account.password);
      await page.getByRole('button', { name: t.auth.submit, exact: true }).click();
      await page.waitForURL(base + '/');
    };
    await editorProof({
      page,
      context,
      base,
      accounts,
      login,
      goto,
      audit,
      screenshot,
      evidence,
      inspect,
      runtime,
    });
    assert.deepEqual(remoteRequests, []);
    writeFileSync(join(output, 'browser-results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS hearing browser interactions');
  } catch (error) {
    writeFileSync(join(output, 'browser-results.json'), JSON.stringify(evidence, null, 2));
    writeFileSync(
      join(output, 'browser-failure.json'),
      JSON.stringify(
        {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          current: await inspect(
            async (db) =>
              (
                await db.query(
                  'SELECT (SELECT count(*)::integer FROM matters) matters,(SELECT count(*)::integer FROM _migration.matter_edit_change) changes,(SELECT count(*)::integer FROM _migration.matter_edit_submission) submissions',
                )
              ).rows[0],
          ).catch(() => null),
        },
        null,
        2,
      ),
    );
    if (page && !page.isClosed()) {
      await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
      writeFileSync(
        join(output, 'failure-state.json'),
        JSON.stringify(
          {
            url: new URL(page.url()).pathname,
            text: await page
              .locator('body')
              .innerText()
              .catch(() => 'Unavailable'),
          },
          null,
          2,
        ),
      );
    }
    throw error;
  } finally {
    if (context) await context.close();
    if (server) {
      server.child.kill();
      await server.done;
      writeFileSync(join(output, 'server.log'), server.log());
      const probe = createServer();
      await new Promise((res, rej) => {
        probe.once('error', rej);
        probe.listen(port, '127.0.0.1', res);
      });
      await new Promise((res) => probe.close(res));
    }
    await runtime.$disconnect();
    const dependenciesAfter = dependencyState();
    if (existsSync(dependencyLink)) {
      assert.equal(realpathSync(dependencyLink), realpathSync(join(source, 'node_modules')));
      unlinkSync(dependencyLink);
    }
    assert.ok(realpathSync(mirror).startsWith(realpathSync(parent) + sep));
    assert.match(mirror.slice(parent.length + 1), /^task43-[A-Za-z0-9]+$/u);
    rmSync(mirror, { recursive: true });
    assert.deepEqual(
      dependenciesAfter,
      dependenciesBefore,
      'Shared installed dependencies changed',
    );
    writeFileSync(
      join(output, 'browser-cleanup.json'),
      JSON.stringify(
        {
          mirror,
          removed: !existsSync(mirror),
          listenerStopped:
            !server || server.child.exitCode !== null || server.child.signalCode !== null,
          portReusable: true,
          dependenciesUnchanged: true,
          dependencyFiles: dependenciesBefore.length,
          commands,
          remoteRequests,
        },
        null,
        2,
      ),
    );
  }
}
