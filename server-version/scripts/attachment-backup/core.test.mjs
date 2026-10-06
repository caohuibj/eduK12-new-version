import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AttachmentTasks, encryptStream, verifyEncrypted, seal, unseal, blobKey, cleanupPlan, retainedSnapshots, localInventory, openLocalSource } from './core.mjs';
import { CosStore } from './cos-store.mjs';

const secret = 'synthetic-test-backup-key-0123456789abcdef';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
class MemoryStore {
  constructor(c) { this.c = c; this.objects = new Map(); this.sources = new Map(); this.uploads = []; this.sourceReads = 0; this.serial = 0; this.private = true; }
  add(key, content, at = '2026-10-06T00:00:00.000Z') { this.sources.set(key, { content: Buffer.from(content), at }); }
  async assertPrivateVersioned() { assert.equal(this.private, true, 'PUBLIC_BACKUP_ACL_REFUSED'); }
  async inventory() { return [...this.sources].map(([key, o]) => ({ provider: 'cos', key, bytes: o.content.length, modifiedAt: o.at, etag: sha(o.content) })); }
  async openSource(s) { this.sourceReads++; return Readable.from([this.sources.get(s.key).content]); }
  async confirmSource(s) { if (s.provider !== 'cos') return; assert.equal(sha(this.sources.get(s.key).content), s.etag, 'SOURCE_CHANGED'); }
  async objectExists(key) { return this.objects.has(key); }
  async hasRepositoryObjects(prefix) { return [...this.objects.keys()].some(k => k.startsWith(prefix)); }
  async checkReceipt(r) {
    if (!r || !this.objects.has(r.key)) throw new Error('REMOTE_OBJECT_MISSING');
    const o = this.objects.get(r.key);
    assert.equal(o.versionId, r.versionId);
    assert.equal(sha(o.body), r.encryptedSha256);
    assert.equal(o.body.length, r.encryptedBytes);
  }
  async upload(key, file) {
    if (this.failUpload) throw new Error('UPLOAD_FAILED');
    const body = await fsp.readFile(file), versionId = String(++this.serial);
    this.objects.set(key, { body, versionId }); this.uploads.push(key); return { versionId };
  }
  async download(key, versionId, file, limit) {
    const o = this.objects.get(key); if (!o) throw new Error('REMOTE_OBJECT_MISSING');
    assert.equal(o.versionId, versionId); assert.ok(o.body.length <= limit);
    await fsp.writeFile(file, o.body, { mode: 0o600, flag: 'wx' });
  }
  async readJson(key, _, allowMissing) {
    const o = this.objects.get(key); if (!o && allowMissing) return null;
    return JSON.parse(o.body);
  }
  async writeJson(key, value) { this.objects.set(key, { body: Buffer.from(JSON.stringify(value)), versionId: String(++this.serial) }); }
}
async function fixture(t, overrides = {}) {
  const temp = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'attachment-fixture-')));
  t.after(() => fsp.rm(temp, { recursive: true, force: true }));
  const c = { schema: 1, keyId: 'synthetic-v1', prefix: 'attachments/v1/', sourceBucket: 'synthetic-source-1234', backupBucket: 'synthetic-backup-1234', region: 'ap-beijing',
    stateDir: path.join(temp, 'state'), localRoot: path.join(temp, 'uploads'), maxObjectBytes: 512, maxRunBytes: 4096, maxSources: 100, maxMetadataBytes: 1000000,
    minimumFreeBytes: 1, maxVerifyBytes: 100000, excludedCosPrefixes: ['backups/'], cleanupMode: 'plan_only',
    retention: { hourlyHours: 48, dailyDays: 30, weeklyWeeks: 12, monthlyMonths: 12 }, ...overrides };
  await fsp.mkdir(c.localRoot);
  const store = new MemoryStore(c);
  const clock = { now: Date.parse('2026-10-06T00:00:00.000Z') };
  const tasks = new AttachmentTasks(c, store, secret, { clock: () => clock.now });
  await tasks.start(); t.after(() => tasks.close()); return { c, store, tasks, clock, temp };
}
test('same content across COS names and local files shares one blob without merging source identities', async t => {
  const { store, tasks, c } = await fixture(t);
  store.add('course-a.pdf', 'same-content'); store.add('course-b.pdf', 'same-content');
  await fsp.writeFile(path.join(c.localRoot, 'local.pdf'), 'same-content');
  const originalMode = (await fsp.stat(path.join(c.localRoot, 'local.pdf'))).mode;
  const r = await tasks.backup();
  assert.equal(r.complete, true); assert.equal(r.sources, 3); assert.equal(r.uploadedObjects, 1);
  assert.equal(Object.keys(tasks.state.sources).length, 3);
  assert.equal(Object.keys(tasks.state.receipts).length, 1);
  assert.equal(tasks.state.snapshots[0].protected, true);
  assert.equal(store.uploads.filter(k => k.includes('/objects/')).length, 1);
  assert.equal((await fsp.stat(path.join(c.localRoot, 'local.pdf'))).mode, originalMode);
  assert.equal(typeof store.deleteObject, 'undefined');
});
test('unchanged inventory performs no source downloads or additional payload uploads', async t => {
  const { store, tasks, clock } = await fixture(t); store.add('x', 'hello');
  await tasks.backup(); const reads = store.sourceReads;
  clock.now += 3600000;
  const r = await tasks.backup();
  assert.equal(r.uploadedObjects, 0); assert.equal(r.reusedObjects, 1); assert.equal(store.sourceReads, reads);
  assert.equal(tasks.state.snapshots.length, 2);
  assert.equal(Object.keys(tasks.state.blobSets).length, 1);
});
test('content replacement creates a new blob while the protected baseline keeps the old one', async t => {
  const { store, tasks, clock } = await fixture(t); store.add('x', 'before');
  await tasks.backup(); const old = Object.keys(tasks.state.receipts)[0];
  clock.now += 3600000; store.add('x', 'after', new Date(clock.now).toISOString());
  await tasks.backup(); await tasks.verify();
  const plan = await tasks.plan();
  assert.ok(tasks.state.receipts[old]); assert.equal(plan.candidates, 0);
  assert.equal(Object.keys(tasks.state.receipts).length, 2);
});
test('bounded first scan resumes and never publishes an incomplete recovery point', async t => {
  const { store, tasks } = await fixture(t, { maxObjectBytes: 80, maxRunBytes: 80 });
  store.add('x', Buffer.alloc(80, 1)); store.add('y', Buffer.alloc(80, 2));
  const first = await tasks.backup(); assert.equal(first.complete, false); assert.equal(tasks.state.snapshots.length, 0);
  const second = await tasks.backup(); assert.equal(second.complete, true); assert.equal(second.uploadedObjects, 1);
  assert.equal(Object.keys(tasks.state.receipts).length, 2);
});
test('index can be rebuilt from encrypted COS checkpoint after local catalog loss', async t => {
  const { c, store, tasks, clock } = await fixture(t); store.add('x', 'saved');
  await tasks.backup(); const expected = Object.keys(tasks.state.receipts); await tasks.close();
  await fsp.rm(path.join(c.stateDir, 'catalog.json'));
  const recovered = new AttachmentTasks(c, store, secret, { clock: () => clock.now });
  await recovered.start(); t.after(() => recovered.close());
  assert.deepEqual(Object.keys(recovered.state.receipts), expected);
  assert.equal((await recovered.backup()).uploadedObjects, 0);
});
test('initialization refuses an existing repository with no authenticated checkpoint', async t => {
  const { c, store, tasks } = await fixture(t);
  store.objects.set(c.prefix + 'objects/orphan.gcm', { body: Buffer.from('orphan'), versionId: '1' }); await tasks.close();
  const other = new AttachmentTasks(c, store, secret);
  await assert.rejects(other.start(), /REMOTE_INDEX_RECOVERY_REQUIRED/);
});
test('wrong key or tampered local index fails closed', async t => {
  const { c, store, tasks } = await fixture(t); store.add('x', 'content'); await tasks.backup();
  const other = new AttachmentTasks(c, store, secret + 'wrong');
  await assert.rejects(other.start(), /INDEX_AUTHENTICATION_FAILED/);
  const file = path.join(c.stateDir, 'catalog.json'), state = JSON.parse(await fsp.readFile(file));
  state.snapshots = []; await fsp.writeFile(file, JSON.stringify(state));
  await assert.rejects(new AttachmentTasks(c, store, secret).start(), /INDEX_AUTHENTICATION_FAILED/);
});
test('source mutation prevents snapshot publication', async t => {
  const { store, tasks } = await fixture(t); store.add('x', 'one');
  store.confirmSource = async () => { throw new Error('SOURCE_CHANGED'); };
  await assert.rejects(tasks.backup(), /SOURCE_CHANGED/);
  assert.equal(tasks.state.snapshots.length, 0);
  assert.equal(tasks.state.pending, true);
  assert.equal((await tasks.plan()).candidates, 0);
  assert.ok(tasks.state.lastFailure);
});
test('upload failure preserves prior points and blocks cleanup', async t => {
  const { store, tasks, clock } = await fixture(t); store.add('x', 'original'); await tasks.backup();
  clock.now += 3600000; store.add('y', 'new-content'); store.failUpload = true;
  await assert.rejects(tasks.backup(), /UPLOAD_FAILED/);
  assert.equal(tasks.state.snapshots.length, 1);
  assert.ok(tasks.state.receipts[Object.keys(tasks.state.receipts)[0]]);
});
test('encrypted verification authenticates before publishing restored plaintext', async t => {
  const { temp } = await fixture(t); const file = path.join(temp, 'blob.gcm'), destination = path.join(temp, 'restored');
  const r = await encryptStream(Readable.from([Buffer.from('private-fixture')]), file, secret, 'synthetic-v1', 1024);
  await assert.rejects(verifyEncrypted(file, r, secret + '-bad', 'synthetic-v1', destination));
  assert.equal(fs.existsSync(destination), false);
  const body = await fsp.readFile(file); body[body.length - 1] ^= 1; await fsp.writeFile(file, body);
  await assert.rejects(verifyEncrypted(file, { ...r, encryptedSha256: sha(body) }, secret, 'synthetic-v1', destination));
  assert.equal(fs.existsSync(destination), false);
  assert.equal((await fsp.readdir(temp)).filter(n => n.includes('.partial-')).length, 0);
});
test('restored file is private and never overwrites an existing destination', async t => {
  const { temp } = await fixture(t); const file = path.join(temp, 'blob.gcm'), destination = path.join(temp, 'restored');
  const r = await encryptStream(Readable.from([Buffer.from('abc')]), file, secret, 'synthetic-v1', 1024);
  await verifyEncrypted(file, r, secret, 'synthetic-v1', destination);
  assert.equal(await fsp.readFile(destination, 'utf8'), 'abc'); assert.equal((await fsp.stat(destination)).mode & 0o777, 0o600);
  await assert.rejects(verifyEncrypted(file, r, secret, 'synthetic-v1', destination), /EEXIST/);
  assert.equal(await fsp.readFile(destination, 'utf8'), 'abc');
});
test('empty attachments still require a valid authentication tag', async t => {
  const { temp } = await fixture(t); const file = path.join(temp, 'empty.gcm');
  const r = await encryptStream(Readable.from([]), file, secret, 'synthetic-v1', 1024);
  assert.equal((await verifyEncrypted(file, r, secret, 'synthetic-v1')).bytes, 0);
});
test('symlinks, changed local files, and plaintext size limits are rejected', async t => {
  const { c, temp } = await fixture(t); const target = path.join(temp, 'outside'); await fsp.writeFile(target, 'secret');
  await fsp.symlink(target, path.join(c.localRoot, 'link'));
  await assert.rejects(localInventory(c.localRoot, 100), /SOURCE_SYMLINK_REFUSED/);
  await fsp.unlink(path.join(c.localRoot, 'link')); await fsp.writeFile(path.join(c.localRoot, 'real'), 'one');
  const sources = await localInventory(c.localRoot, 100); await fsp.writeFile(path.join(c.localRoot, 'real'), 'changed');
  await assert.rejects(openLocalSource(c.localRoot, sources[0]), /SOURCE_CHANGED/);
  await assert.rejects(encryptStream(Readable.from([Buffer.alloc(100)]), path.join(temp, 'oversize'), secret, 'synthetic-v1', 10), /OBJECT_SIZE_LIMIT/);
});
test('verification continues the same target while newer hourly snapshots are created', async t => {
  const { store, tasks, clock } = await fixture(t, { maxVerifyBytes: 1 });
  store.add('a', 'aaa'); store.add('b', 'bbb'); await tasks.backup();
  const target = tasks.state.snapshots[0].id;
  assert.equal((await tasks.verify()).complete, false);
  clock.now += 3600000; await tasks.backup();
  assert.equal((await tasks.verify()).complete, true);
  assert.equal(tasks.state.lastFullVerificationSnapshotId, target);
});
function cleanupState(c, now) {
  const keys = ['a', 'b', 'c'].map(x => blobKey(c, sha(x))), receipts = {};
  keys.forEach((key, i) => { receipts[key] = { key, sha256: sha(['a','b','c'][i]), bytes: 1, encryptedBytes: 200, encryptedSha256: sha('cipher' + i), versionId: 'v' + i, verified: true }; });
  return { pending: false, lastFailure: null, lastFullVerificationAt: new Date(now).toISOString(), candidates: {}, receipts,
    snapshots: [
      { id: 'baseline', at: '2025-01-01T00:00:00Z', complete: true, protected: true, blobs: [keys[0]] },
      { id: 'expired', at: '2025-02-01T00:00:00Z', complete: true, blobs: [keys[2]] },
      { id: 'previous', at: new Date(now - 3600000).toISOString(), complete: true, blobs: [keys[1]] },
      { id: 'latest', at: new Date(now).toISOString(), complete: true, blobs: [keys[1]] },
    ] };
}
test('cleanup protects baseline and latest points, and requires a fresh 24-hour observation', async t => {
  const { c, clock } = await fixture(t); const state = cleanupState(c, clock.now);
  const first = cleanupPlan(state, c, clock.now);
  assert.equal(first.candidates.length, 1); assert.equal(first.candidates[0].eligible, false);
  clock.now += 24 * 3600000;
  state.snapshots.at(-1).at = new Date(clock.now).toISOString(); state.lastFullVerificationAt = new Date(clock.now).toISOString();
  assert.equal(cleanupPlan(state, c, clock.now).candidates[0].eligible, true);
  state.snapshots.at(-1).blobs.push(first.candidates[0].key);
  assert.equal(cleanupPlan(state, c, clock.now).candidates.length, 0);
});
test('pending, failure, stale verification, insufficient points and clock skew all block cleanup', async t => {
  const { c, clock } = await fixture(t);
  for (const change of [
    s => s.pending = true, s => s.lastFailure = { code: 'UPLOAD_FAILED' },
    s => s.lastFullVerificationAt = null, s => s.snapshots = s.snapshots.slice(0, 1),
    s => s.snapshots.at(-1).at = new Date(clock.now + 1).toISOString(),
  ]) {
    const state = cleanupState(c, clock.now); change(state);
    assert.ok(cleanupPlan(state, c, clock.now).blocked.length > 0);
  }
});
test('cleanup refuses namespace escapes and missing dependency receipts', async t => {
  const { c, clock } = await fixture(t); const state = cleanupState(c, clock.now);
  state.snapshots.at(-1).blobs.push('releases/release-234/final-backup');
  assert.throws(() => cleanupPlan(state, c, clock.now), /MISSING_OBJECT_RECEIPT/);
  const bad = cleanupState(c, clock.now); bad.receipts['releases/other'] = bad.receipts[Object.keys(bad.receipts)[0]];
  assert.throws(() => cleanupPlan(bad, c, clock.now), /INVALID_OBJECT_RECEIPT/);
});
test('retention keeps minimum two points and multiple years of protected historical evidence', () => {
  const now = Date.parse('2026-10-06T00:00:00Z');
  const snapshots = [
    { id: 'old', at: '2020-01-01T00:00:00Z', complete: true, protected: true },
    { id: 'previous', at: '2026-01-01T00:00:00Z', complete: true },
    { id: 'latest', at: '2026-02-01T00:00:00Z', complete: true },
  ];
  const kept = retainedSnapshots(snapshots, now, { hourlyHours: 48, dailyDays: 30, weeklyWeeks: 12, monthlyMonths: 12 });
  assert.deepEqual([...kept].sort(), ['latest', 'old', 'previous']);
});
test('production buckets and destructive cleanup configuration are rejected', async t => {
  const { c, store } = await fixture(t);
  assert.throws(() => new AttachmentTasks({ ...c, backupBucket: c.sourceBucket }, store, secret), /MUST_DIFFER/);
  assert.throws(() => new AttachmentTasks({ ...c, cleanupMode: 'delete' }, store, secret), /DESTRUCTIVE/);
});
test('COS adapter paginates and excludes historical backup objects', async t => {
  const { c } = await fixture(t); const calls = [];
  const client = { getBucket(args, cb) {
    calls.push(args);
    cb(null, args.Marker ? { Contents: [{ Key: 'b', Size: '2', LastModified: 'x', ETag: 'b' }], IsTruncated: 'false' } :
      { Contents: [{ Key: 'a', Size: '1', LastModified: 'x', ETag: 'a' }, { Key: 'backups/old', Size: '900' }], IsTruncated: 'true', NextMarker: 'next' });
  } };
  const rows = await new CosStore(c, client).inventory(100);
  assert.equal(rows.length, 2); assert.equal(calls[1].Marker, 'next');
  assert.ok(calls.every(x => x.Bucket === c.sourceBucket));
  client.getBucket = (_, cb) => cb(null, { IsTruncated: 'true', Contents: [] });
  await assert.rejects(new CosStore(c, client).inventory(100), /PAGINATION_INCOMPLETE/);
});
test('COS adapter never downloads an unpinned version or uploads outside the dedicated namespace', async t => {
  const { c } = await fixture(t); const adapter = new CosStore(c, {});
  await assert.rejects(adapter.download(c.prefix + 'x', null, '/unused', 1), /VERSION_ID_REQUIRED/);
  await assert.rejects(adapter.upload('releases/important', '/unused', sha('x')), /OUTSIDE_BACKUP_NAMESPACE/);
});
test('index authentication binds the full dependency graph', () => {
  const value = seal({ snapshots: [{ id: 'snapshot', blobs: ['protected-object'] }] }, secret);
  assert.deepEqual(unseal(value, secret).snapshots[0].blobs, ['protected-object']);
  value.snapshots[0].blobs = [];
  assert.throws(() => unseal(value, secret), /INDEX_AUTHENTICATION_FAILED/);
});

test('COS adapter reads SDK nested versioning status and rejects suspended or unconfigured buckets', async t => {
  const { c } = await fixture(t);
  for (const response of [{ VersioningConfiguration: { Status: 'Suspended' } }, { VersioningConfiguration: {} }, { Status: 'Enabled' }]) {
    const adapter = new CosStore(c, { getBucketVersioning(_, cb) { cb(null, response); } });
    await assert.rejects(adapter.assertPrivateVersioned(), /BACKUP_BUCKET_VERSIONING_REQUIRED/);
  }
});

test('host launcher failure blocks planning even when the last snapshot and verification were healthy', async t => {
  const { store, tasks, clock, c } = await fixture(t);
  store.add('x', 'content'); await tasks.backup();
  clock.now += 3600000; await tasks.backup(); await tasks.verify();
  await fsp.writeFile(path.join(c.stateDir, 'launcher-failure.json'), '{}');
  const result = await tasks.plan();
  assert.ok(result.blocked.includes('HOST_LAUNCHER_FAILED')); assert.equal(result.candidates, 0);
});

test('scheduled verification waits for baseline without falsely reporting a task failure', async t => {
  const { tasks } = await fixture(t);
  const result = await tasks.verify();
  assert.equal(result.skipped, 'BASELINE_OR_SCAN_PENDING');
  assert.equal(tasks.state.lastFailure, null);
});
