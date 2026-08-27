#!/usr/bin/env node

/**
 * Database-only encrypted backup entry point.
 *
 * The legacy shell script delegates here so every supported backup uses the
 * same authenticated encryption, manifest, verification, and restore rules.
 * WAL/tar "incremental" backups are deliberately not supported.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const FORMAT = 'eduk12-db-backup';
const VERSION = 1;
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} must be set`);
  }
  return value.trim();
}

function env(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    // `null` is intentional for binary pg_dump output. Using `??` here
    // silently converted Buffer output to UTF-8 text and could corrupt a
    // backup before encryption.
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    stdio: options.stdio ?? undefined,
  });

  if (result.error) {
    throw new Error(`${command} failed to start`);
  }
  if (result.status !== 0) {
    const detail = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`${command} failed${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }
  return result;
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(
    Buffer.from(passphrase, 'utf8'),
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256',
  );
}

function encryptPackage(packageBytes, passphrase) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(packageBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    format: FORMAT,
    version: VERSION,
    encryptedAt: new Date().toISOString(),
    kdf: {
      name: 'pbkdf2',
      digest: 'sha256',
      iterations: PBKDF2_ITERATIONS,
      salt: salt.toString('base64'),
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    },
    plaintextSha256: sha256(packageBytes),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptPackage(envelope, passphrase) {
  if (!envelope || envelope.format !== FORMAT || envelope.version !== VERSION) {
    fail('unsupported backup format');
  }
  if (
    envelope.kdf?.name !== 'pbkdf2' ||
    envelope.kdf.digest !== 'sha256' ||
    envelope.kdf.iterations !== PBKDF2_ITERATIONS ||
    envelope.cipher?.name !== 'aes-256-gcm'
  ) {
    fail('backup encryption parameters do not match the supported format');
  }

  let salt;
  let iv;
  let authTag;
  let ciphertext;
  try {
    salt = Buffer.from(envelope.kdf.salt, 'base64');
    iv = Buffer.from(envelope.cipher.iv, 'base64');
    authTag = Buffer.from(envelope.cipher.authTag, 'base64');
    ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  } catch {
    fail('backup contains invalid encryption data');
  }
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH || authTag.length !== 16) {
    fail('backup contains invalid encryption lengths');
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (sha256(plaintext) !== envelope.plaintextSha256) {
      fail('backup plaintext checksum mismatch');
    }
    return plaintext;
  } catch {
    fail('backup authentication or decryption failed');
  }
}

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function createDatabaseDump(tempDir) {
  const dumpPath = path.join(tempDir, 'database.dump');
  const container = env('POSTGRES_CONTAINER', 'ptool-postgres');
  const database = env('DB_NAME', 'ptool');
  const user = env('DB_USER', 'ptool');
  const result = run(
    'docker',
    ['exec', container, 'pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--username', user, '--dbname', database],
    { encoding: null },
  );
  fs.writeFileSync(dumpPath, result.stdout);
  return dumpPath;
}

function packageDump(tempDir, dumpPath) {
  const manifest = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    database: {
      name: env('DB_NAME', 'ptool'),
      user: env('DB_USER', 'ptool'),
    },
    components: [
      {
        name: 'database.dump',
        bytes: fs.statSync(dumpPath).size,
        sha256: sha256(fs.readFileSync(dumpPath)),
      },
    ],
  };
  fs.writeFileSync(path.join(tempDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  const packagePath = path.join(tempDir, 'package.tar');
  run('tar', ['-cf', packagePath, '-C', tempDir, 'manifest.json', 'database.dump']);
  return packagePath;
}

function validatePackage(packageBytes, tempDir) {
  const packagePath = path.join(tempDir, 'verify.tar');
  const extractDir = path.join(tempDir, 'extracted');
  fs.writeFileSync(packagePath, packageBytes, { mode: 0o600 });
  fs.mkdirSync(extractDir, { mode: 0o700 });

  const entries = run('tar', ['-tf', packagePath]).stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowedEntries = new Set(['manifest.json', 'database.dump']);
  if (
    entries.length !== allowedEntries.size ||
    entries.some((entry) => !allowedEntries.has(entry)) ||
    new Set(entries).size !== entries.length
  ) {
    fail('backup package contains unexpected archive entries');
  }
  run('tar', ['-xf', packagePath, '-C', extractDir]);

  const manifestPath = path.join(extractDir, 'manifest.json');
  const dumpPath = path.join(extractDir, 'database.dump');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(dumpPath)) {
    fail('backup package is missing required components');
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    fail('backup manifest is not valid JSON');
  }
  if (
    manifest.format !== FORMAT ||
    manifest.version !== VERSION ||
    !Array.isArray(manifest.components) ||
    manifest.components.length !== 1
  ) {
    fail('backup manifest format is invalid');
  }
  const component = manifest.components.find((item) => item?.name === 'database.dump');
  const dump = fs.readFileSync(dumpPath);
  if (
    !component ||
    !Number.isSafeInteger(component.bytes) ||
    component.bytes !== dump.length ||
    !/^[a-f0-9]{64}$/i.test(component.sha256 || '') ||
    component.sha256 !== sha256(dump)
  ) {
    fail('database dump checksum validation failed');
  }
  return { manifest, dumpPath };
}

function readAndVerifyBackup(backupPath, tempDir) {
  const backupBytes = fs.readFileSync(backupPath);
  const sidecarPath = `${backupPath}.sha256`;
  if (!fs.existsSync(sidecarPath)) {
    fail('backup checksum sidecar is missing');
  }
  const expected = fs.readFileSync(sidecarPath, 'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected) || expected.toLowerCase() !== sha256(backupBytes)) {
    fail('encrypted backup checksum validation failed');
  }
  let envelope;
  try {
    envelope = JSON.parse(backupBytes.toString('utf8'));
  } catch {
    fail('encrypted backup is not valid JSON');
  }
  const packageBytes = decryptPackage(envelope, requiredEnv('BACKUP_ENCRYPTION_KEY'));
  return validatePackage(packageBytes, tempDir);
}

function outputDirectory() {
  return env('ENCRYPTED_DIR', env('BACKUP_DIR', path.join(process.cwd(), 'backups', 'encrypted')));
}

function markBackupVerified() {
  const statusFile = process.env.BACKUP_STATUS_FILE;
  if (!statusFile) return;
  fs.mkdirSync(path.dirname(statusFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(statusFile, `${Math.floor(Date.now() / 1000)}\n`, { mode: 0o600 });
}

function writeBackup() {
  const passphrase = requiredEnv('BACKUP_ENCRYPTION_KEY');
  const targetDir = outputDirectory();
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  const tempDir = createTempDir('eduk12-backup');
  let backupPath;
  let sidecarPath;
  let latestTempPath;
  let published = false;
  try {
    const dumpPath = createDatabaseDump(tempDir);
    const packagePath = packageDump(tempDir, dumpPath);
    const envelope = encryptPackage(fs.readFileSync(packagePath), passphrase);
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    backupPath = path.join(targetDir, `eduk12-db-${timestamp}.edubackup.enc`);
    sidecarPath = `${backupPath}.sha256`;
    const output = Buffer.from(`${JSON.stringify(envelope)}\n`, 'utf8');
    fs.writeFileSync(backupPath, output, { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(sidecarPath, `${sha256(output)}  ${path.basename(backupPath)}\n`, { mode: 0o600, flag: 'wx' });
    readAndVerifyBackup(backupPath, tempDir);
    latestTempPath = path.join(targetDir, `.latest-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(latestTempPath, `${path.basename(backupPath)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(latestTempPath, path.join(targetDir, 'latest'));
    latestTempPath = undefined;
    published = true;
    markBackupVerified();
    console.log(`database backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    if (latestTempPath) fs.rmSync(latestTempPath, { force: true });
    if (!published) {
      if (backupPath) fs.rmSync(backupPath, { force: true });
      if (sidecarPath) fs.rmSync(sidecarPath, { force: true });
    }
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function verifyBackup(backupPath) {
  const resolved = path.resolve(backupPath);
  const tempDir = createTempDir('eduk12-verify');
  try {
    readAndVerifyBackup(resolved, tempDir);
    markBackupVerified();
    console.log(`database backup verified: ${resolved}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function latestBackup() {
  const latestFile = path.join(outputDirectory(), 'latest');
  if (!fs.existsSync(latestFile)) fail('latest backup pointer is missing');
  const name = fs.readFileSync(latestFile, 'utf8').trim();
  if (!name || path.basename(name) !== name) fail('latest backup pointer is invalid');
  return path.join(outputDirectory(), name);
}

function validateRestoreTarget() {
  const target = requiredEnv('RESTORE_TARGET_CONTAINER');
  if (!/^(eduk12-restore|ptool-restore)-[a-z0-9-]+$/i.test(target)) {
    fail('RESTORE_TARGET_CONTAINER must be an isolated restore container');
  }
  const inspect = run('docker', ['inspect', '--format={{.Config.Image}}', target]);
  const image = inspect.stdout.trim();
  if (!/^postgres(?:[:@]|$)/i.test(image)) {
    fail('restore target must use a PostgreSQL image');
  }
  return target;
}

function restoreBackup(backupPath) {
  if (process.env.RESTORE_CONFIRMATION !== 'RESTORE') {
    fail('RESTORE_CONFIRMATION=RESTORE is required');
  }
  const target = validateRestoreTarget();
  const tempDir = createTempDir('eduk12-restore');
  try {
    const { dumpPath } = readAndVerifyBackup(path.resolve(backupPath), tempDir);
    const database = env('RESTORE_TARGET_DB_NAME', 'restore');
    const user = env('RESTORE_TARGET_DB_USER', 'restore');
    const result = spawnSync('docker', ['exec', '-i', target, 'pg_restore', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--username', user, '--dbname', database], {
      input: fs.readFileSync(dumpPath),
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) {
      const detail = typeof result.stderr === 'string' ? result.stderr.trim() : '';
      fail(`database restore failed${detail ? `: ${detail.slice(0, 240)}` : ''}`);
    }
    console.log(`database restored into isolated container: ${target}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function listBackups() {
  const dir = outputDirectory();
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).filter((item) => item.endsWith('.edubackup.enc')).sort()) {
    console.log(path.join(dir, name));
  }
}

function main(argv) {
  const command = argv[0] || 'full';
  if (command === 'full') {
    writeBackup();
    return;
  }
  if (command === 'verify') {
    if (!argv[1]) fail('usage: backup-db.mjs verify <backup>');
    verifyBackup(argv[1]);
    return;
  }
  if (command === 'verify-latest') {
    verifyBackup(latestBackup());
    return;
  }
  if (command === 'restore') {
    if (!argv[1]) fail('usage: backup-db.mjs restore <backup>');
    restoreBackup(argv[1]);
    return;
  }
  if (command === 'list') {
    listBackups();
    return;
  }
  if (command === 'incremental') {
    fail('WAL incremental backups are paused until a formal base-backup/PITR implementation exists');
  }
  fail('unsupported backup command');
}

if (pathToFileURL(process.argv[1] ?? '').href === pathToFileURL(SCRIPT_PATH).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'backup operation failed');
    process.exitCode = 1;
  }
}

export { decryptPackage, encryptPackage, main, validatePackage };
