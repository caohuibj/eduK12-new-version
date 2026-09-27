#!/usr/bin/env node
/** Destructive operations are confined to freshly created, random Docker containers. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.PR5_REHEARSAL_OUTPUT || '/tmp/eduk12-pr5-release-rehearsal';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pr5-rehearsal-'));
const suffix = crypto.randomBytes(5).toString('hex');
const source = `eduk12-restore-pr5-source-${suffix}`;
const target = `eduk12-restore-pr5-target-${suffix}`;
const pass = crypto.randomBytes(24).toString('hex');
const backupKey = crypto.randomBytes(32).toString('hex');
const manifest = { candidate: '', checks: [], status: 'RUNNING' };
const run = (command, args, opts = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed: ${String(result.stderr || result.stdout || result.error).slice(-2000)}`);
  return result.stdout;
};
const docker = args => run('docker', args).trim();
const sql = (container, query) => docker(['exec', container, 'psql', '-U', 'restore', '-d', 'restore', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query]);
const record = name => { manifest.checks.push(name); console.log(`PASS ${name}`); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start(container) {
  // RootlessKit can race Docker's automatic host-port selection with another
  // short-lived CI container. Treat bind collisions as infrastructure noise:
  // remove the half-created container and let Docker choose a fresh port.
  const maxPortAttempts = 10;
  let lastPortError = '';
  for (let attempt = 1; attempt <= maxPortAttempts; attempt++) {
    const started = spawnSync('docker', [
      'run', '-d', '--name', container,
      '-e', 'POSTGRES_USER=restore',
      '-e', `POSTGRES_PASSWORD=${pass}`,
      '-e', 'POSTGRES_DB=restore',
      '-p', '127.0.0.1::5432',
      'postgres:14-alpine',
    ], { encoding: 'utf8' });
    if (!started.error && started.status === 0) {
      for (let i = 0; i < 60; i++) {
        const r = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'restore', '-d', 'restore']);
        if (r.status === 0) {
          const port = docker(['port', container, '5432/tcp']).split(':').pop();
          assert.ok(port && /^\d+$/.test(port), 'temporary PostgreSQL host port must be numeric');
          return `postgresql://restore:${pass}@127.0.0.1:${port}/restore`;
        }
        await sleep(500);
      }
      spawnSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'ignore' });
      throw new Error('temporary PostgreSQL did not become ready');
    }

    const detail = String(started.stderr || started.stdout || started.error || '');
    spawnSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'ignore' });
    if (!/address already in use|bind:.*in use/i.test(detail)) {
      throw new Error(`docker failed: ${detail.slice(-2000)}`);
    }
    lastPortError = detail;
    await sleep(250 * attempt);
  }
  throw new Error(`temporary PostgreSQL host-port allocation failed after ${maxPortAttempts} attempts: ${lastPortError.slice(-1000)}`);
}
const tables = ['users', 'organization_memberships', 'organization_governance_audits', 'assessment_run_executions', 'assessment_run_actor_snapshots',
  'assessment_run_execution_start_claims', 'assessment_unit_snapshots', 'reporting_cohort_snapshots', 'reporting_analysis_artifacts', 'assessment_attempt_consents'];
const fingerprint = container => Object.fromEntries(tables.map(table => [table, sql(container,
  `SELECT count(*) || ':' || md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id),'')) FROM "${table}" t`)]));
async function main() {
  assert.equal(process.env.NODE_ENV, 'test', 'rehearsal requires NODE_ENV=test');
  assert.ok(process.env.DATABASE_URL, 'source test DATABASE_URL is required');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  manifest.candidate = run('git', ['rev-parse', 'HEAD']).trim();
  const sourceUrl = await start(source);
  const targetUrl = await start(target);
  const prisma = path.join(root, 'backend/node_modules/prisma/build/index.js');
  const schema = path.join(root, 'backend/prisma/schema.prisma');
  const migrate = (url, args, schemaPath = schema) => run(process.execPath, [prisma, 'migrate', ...args, '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: url } });
  fs.writeFileSync(path.join(out, 'fresh-migrate.log'), migrate(sourceUrl, ['deploy']));
  record('fresh PostgreSQL14: all repository migrations applied');
  // Snapshot the real scenario DB, including encrypted canonical results and immutable reports.
  const dump = path.join(scratch, 'scenarios.dump');
  if (process.env.PR5_SOURCE_POSTGRES_CONTAINER) {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const fd = fs.openSync(dump, 'wx', 0o600);
    try {
      run('docker', ['exec', process.env.PR5_SOURCE_POSTGRES_CONTAINER, 'pg_dump', '--username', decodeURIComponent(dbUrl.username),
        '--dbname', dbUrl.pathname.slice(1), '--format=custom', '--no-owner', '--no-privileges'], { stdio: ['ignore', fd, 'pipe'] });
    } finally { fs.closeSync(fd); }
  } else {
    run(process.env.PG_DUMP_BIN || 'pg_dump', ['--dbname', process.env.DATABASE_URL, '--format=custom', '--no-owner', '--no-privileges', '--file', dump]);
  }
  docker(['cp', dump, `${source}:/tmp/scenarios.dump`]);
  docker(['exec', source, 'pg_restore', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-privileges', '-U', 'restore', '-d', 'restore', '/tmp/scenarios.dump']);
  // Make the regression independent of fixture size: a >1 MiB binary dump
  // must pass the same production backup entry point that previously overflowed.
  sql(source, "CREATE TABLE pr5_backup_probe (id integer PRIMARY KEY, payload text); INSERT INTO pr5_backup_probe SELECT i, md5(random()::text) || md5(random()::text) FROM generate_series(1,40000) i");
  tables.push('pr5_backup_probe');
  const before = fingerprint(source);
  assert.ok(Number(before.assessment_unit_snapshots.split(':')[0]) > 0, 'must rehearse with real canonical results');
  const backupDir = path.join(scratch, 'encrypted');
  const env = { ...process.env, BACKUP_ENCRYPTION_KEY: backupKey, POSTGRES_CONTAINER: source, DB_NAME: 'restore', DB_USER: 'restore', ENCRYPTED_DIR: backupDir };
  const backupScript = path.join(root, 'scripts/backup/backup-db.mjs');
  run(process.execPath, [backupScript, 'full'], { env });
  run(process.execPath, [backupScript, 'verify-latest'], { env });
  const backup = path.join(backupDir, fs.readFileSync(path.join(backupDir, 'latest'), 'utf8').trim());
  manifest.encryptedBackupBytes = fs.statSync(backup).size;
  assert.ok(manifest.encryptedBackupBytes > 1024 * 1024, 'backup buffer regression needs a large package');
  manifest.backupSha256 = crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex');
  run(process.execPath, [path.join(root, 'scripts/backup/restore-db.mjs'), backup], { env: { ...env,
    RESTORE_CONFIRMATION: 'RESTORE', RESTORE_TARGET_CONTAINER: target, RESTORE_TARGET_DB_NAME: 'restore', RESTORE_TARGET_DB_USER: 'restore' } });
  assert.deepEqual(fingerprint(target), before);
  manifest.restoredTables = before;
  record('production encrypted backup/verify/restore entry points preserve all tested row hashes and counts');
  fs.writeFileSync(path.join(out, 'restored-migrate.log'), migrate(targetUrl, ['deploy']));
  record('restored database accepts current application migration head');
  const copied = path.join(scratch, 'prisma');
  fs.cpSync(path.join(root, 'backend/prisma'), copied, { recursive: true });
  const failureName = '20990101000000_pr5_forced_failure';
  const failure = path.join(copied, 'migrations', failureName);
  fs.mkdirSync(failure);
  fs.writeFileSync(path.join(failure, 'migration.sql'), 'BEGIN;\nCREATE TABLE pr5_must_rollback (id text);\nSELECT 1 / 0;\nCOMMIT;\n');
  let failed = false;
  try { migrate(targetUrl, ['deploy'], path.join(copied, 'schema.prisma')); }
  catch (error) { failed = true; fs.writeFileSync(path.join(out, 'injected-migration-failure.log'), String(error)); }
  assert.ok(failed, 'injected migration must fail');
  assert.equal(sql(target, "SELECT to_regclass('public.pr5_must_rollback') IS NULL"), 't');
  assert.deepEqual(fingerprint(target), before);
  assert.equal(sql(target, `SELECT count(*) FROM _prisma_migrations WHERE migration_name='${failureName}' AND finished_at IS NULL AND rolled_back_at IS NULL`), '1');
  record('failed migration rolls back its DDL and preserves historical/runtime/report data');
  migrate(targetUrl, ['resolve', '--rolled-back', failureName], path.join(copied, 'schema.prisma'));
  fs.rmSync(failure, { recursive: true });
  fs.writeFileSync(path.join(out, 'forward-recovery.log'), migrate(targetUrl, ['deploy'], path.join(copied, 'schema.prisma')));
  assert.deepEqual(fingerprint(target), before);
  record('explicit failed-migration resolution and forward deployment recover without deleting domain history');
  manifest.status = 'PASSED';
}
main().catch(error => { manifest.status = 'FAILED'; manifest.error = String(error); console.error(error); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const container of [source, target]) spawnSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'ignore' });
  fs.rmSync(scratch, { recursive: true, force: true });
});
