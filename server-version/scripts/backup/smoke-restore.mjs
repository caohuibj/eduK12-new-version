#!/usr/bin/env node

import crypto from 'node:crypto';
import { cleanupRestoreContainer } from './cleanup-restore-container.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('usage: smoke-restore.mjs <backup>');
  process.exit(1);
}

const suffix = crypto.randomBytes(6).toString('hex');
const container = `eduk12-restore-${suffix}`;
const password = crypto.randomBytes(24).toString('base64url');
const env = {
  ...process.env,
  RESTORE_CONFIRMATION: 'RESTORE',
  RESTORE_TARGET_CONTAINER: container,
  RESTORE_TARGET_DB_NAME: 'restore',
  RESTORE_TARGET_DB_USER: 'restore',
};

function run(args, options = {}) {
  const result = spawnSync('docker', args, { ...options, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const detail = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`docker operation failed${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }
  return result.stdout.trim();
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  run(['run', '-d', '--name', container, '--env', 'POSTGRES_USER=restore', '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=restore', 'postgres:16.15-bookworm']);
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '--username', 'restore', '--dbname', 'restore'], { encoding: 'utf8' });
    if (result.status === 0) {
      ready = true;
      break;
    }
    await sleep(1_000);
  }
  if (!ready) throw new Error('temporary PostgreSQL did not become ready');

  const restoreScript = fileURLToPath(new URL('./restore-db.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [restoreScript, backupPath], { stdio: 'inherit', env });
  if (result.error || result.status !== 0) throw new Error('restore command failed');

  const migrationCount = run(['exec', container, 'psql', '--username', 'restore', '--dbname', 'restore', '-Atqc', 'SELECT COUNT(*) FROM "_prisma_migrations";']);
  const userCount = run(['exec', container, 'psql', '--username', 'restore', '--dbname', 'restore', '-Atqc', 'SELECT COUNT(*) FROM "users";']);
  if (!/^\d+$/.test(migrationCount) || !/^\d+$/.test(userCount)) throw new Error('restore smoke query returned invalid counts');
  console.log(`restore smoke test passed (migrations=${migrationCount}, users=${userCount})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'restore smoke test failed');
  process.exitCode = 1;
}).finally(() => {
  if (!cleanupRestoreContainer(container)) {
    console.error('temporary restore cleanup failed; inspect the named restore container');
    process.exitCode = 1;
  }
});
