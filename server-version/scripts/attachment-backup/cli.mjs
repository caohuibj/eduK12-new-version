#!/usr/bin/env node
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { AttachmentTasks, validateConfig, safeCode, fail } from './core.mjs';
import { CosStore } from './cos-store.mjs';

process.umask(0o077);
let tasks, lock, ownsLock = false;
try {
  const [command, configPath] = process.argv.slice(2);
  if (!['backup', 'verify', 'plan'].includes(command) || !configPath) fail('USAGE_BACKUP_VERIFY_PLAN_CONFIG');
  const c = validateConfig(JSON.parse(await fsp.readFile(configPath)));
  // Credentials arrive on stdin from the root launcher; never arguments, stdout, or persisted config.
  const secrets = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!secrets.COS_SECRET_ID || !secrets.COS_SECRET_KEY) fail('COS_CREDENTIALS_REQUIRED');
  await fsp.mkdir(c.stateDir, { recursive: true, mode: 0o700 });
  if (await fsp.realpath(c.stateDir) !== path.resolve(c.stateDir)) fail('STATE_ROOT_SYMLINK_REFUSED');
  lock = path.join(c.stateDir, 'task.lock');
  const lockFd = await fsp.open(lock, 'wx', 0o600).catch(e => { if (e.code === 'EEXIST') fail('TASK_LOCK_HELD_REVIEW_REQUIRED'); throw e; });
  ownsLock = true;
  await lockFd.writeFile(JSON.stringify({ id: /^[a-f0-9]{32}$/.test(secrets.RUN_ID || '') ? secrets.RUN_ID : crypto.randomUUID(), at: new Date().toISOString() })); await lockFd.close();
  const require = createRequire(import.meta.url);
  const COS = require(c.sdkModule || '/app/node_modules/cos-nodejs-sdk-v5');
  const client = new COS({ SecretId: secrets.COS_SECRET_ID, SecretKey: secrets.COS_SECRET_KEY, ...(secrets.COS_SECURITY_TOKEN ? { SecurityToken: secrets.COS_SECURITY_TOKEN } : {}), Timeout: 60000 });
  tasks = new AttachmentTasks(c, new CosStore(c, client), secrets.BACKUP_ENCRYPTION_KEY, { runId: /^[a-f0-9]{32}$/.test(secrets.RUN_ID || '') ? secrets.RUN_ID : crypto.randomUUID().replaceAll('-', '') });
  await tasks.start();
  console.log(JSON.stringify(await tasks[command === 'plan' ? 'plan' : command]()));
} catch (e) {
  if (tasks?.state && tasks.workspace) {
    tasks.state.lastFailure = { command: process.argv[2], at: new Date().toISOString(), code: safeCode(e) };
    await tasks.save().catch(() => {});
    await tasks.status({ command: process.argv[2], failed: true, error: safeCode(e) }).catch(() => {});
  }
  console.error(JSON.stringify({ failed: true, error: safeCode(e) }));
  process.exitCode = 1;
} finally {
  await tasks?.close();
  // A lock created by another process must never be removed.
  if (ownsLock) await fsp.rm(lock, { force: true });
}
