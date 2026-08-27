#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backupScript = fileURLToPath(new URL('./backup-db.mjs', import.meta.url));
const result = spawnSync(process.execPath, [backupScript, 'restore', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('restore entry point failed to start');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
