#!/usr/bin/env node
// Optional private-bucket transport probe. Synthetic bytes only; no production source reads or deletes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { encryptStream, verifyEncrypted, safeCode } from './core.mjs';
import { CosStore } from './cos-store.mjs';

process.umask(0o077);
let dir;
try {
  const secrets = JSON.parse(fs.readFileSync(0, 'utf8'));
  const id = crypto.randomUUID();
  const c = { backupBucket: 'eduk12-backups-1393949445', sourceBucket: 'ptool-videos-edu-1393949445', region: 'ap-beijing', prefix: 'attachments-validation/' + id + '/' };
  const COS = createRequire(import.meta.url)('/app/node_modules/cos-nodejs-sdk-v5');
  const store = new CosStore(c, new COS({ SecretId: secrets.COS_SECRET_ID, SecretKey: secrets.COS_SECRET_KEY, Timeout: 60000 }));
  await store.assertPrivateVersioned();
  dir = await fsp.mkdtemp('/state/.transport-');
  const file = path.join(dir, 'encrypted.gcm');
  const r = await encryptStream(Readable.from([Buffer.from('synthetic-attachment-transport-fixture-v1')]), file, secrets.BACKUP_ENCRYPTION_KEY, 'transport-fixture-v1', 4096);
  const key = c.prefix + 'fixture.gcm';
  const uploaded = await store.upload(key, file, r.encryptedSha256);
  assert.ok(uploaded.versionId);
  const receipt = { ...r, key, versionId: uploaded.versionId };
  await store.checkReceipt(receipt);
  const downloaded = path.join(dir, 'download.gcm');
  await store.download(key, uploaded.versionId, downloaded, r.encryptedBytes);
  const restored = path.join(dir, 'restored');
  await verifyEncrypted(downloaded, r, secrets.BACKUP_ENCRYPTION_KEY, 'transport-fixture-v1', restored);
  assert.equal(await fsp.readFile(restored, 'utf8'), 'synthetic-attachment-transport-fixture-v1');
  await store.writeJson(c.prefix + 'fixture-index.json', { schema: 1, bytes: r.bytes });
  assert.equal((await store.readJson(c.prefix + 'fixture-index.json', 4096)).bytes, r.bytes);
  await assert.rejects(store.readJson(c.prefix + 'fixture-index.json', 1));
  console.log(JSON.stringify({ success: true, synthetic: true, uploadedObjects: 2, encryptedBytes: r.encryptedBytes, pinnedVersionDownload: true, authenticatedRestore: true, publicAccessDenied: true, deletes: 0 }));
} catch (e) {
  console.error(JSON.stringify({ failed: true, error: safeCode(e), ...(typeof e?.code === 'string' && /^[a-zA-Z0-9_]+$/.test(e.code) ? { code: e.code } : {}), ...(Number.isInteger(e?.statusCode) ? { statusCode: e.statusCode } : {}) }));
  process.exitCode = 1;
} finally { if (dir) await fsp.rm(dir, { recursive: true, force: true }); }
