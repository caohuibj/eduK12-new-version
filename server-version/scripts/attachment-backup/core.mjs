import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('EDUK12-ATTACHMENT-GCM1\n');
const HASH = /^[a-f0-9]{64}$/;
export const fail = (code) => { throw new Error(code); };
const need = (ok, code) => { if (!ok) fail(code); };
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => JSON.stringify(value);
const keyFor = (passphrase, salt) => crypto.pbkdf2Sync(passphrase, salt, 210000, 32, 'sha256');
export const keyFingerprint = (secret) => crypto.createHmac('sha256', secret).update('eduk12-attachment-key-v1').digest('hex');
export function seal(value, secret) {
  const { mac: ignored, ...body } = value;
  return { ...body, mac: crypto.createHmac('sha256', secret).update(canonical(body)).digest('hex') };
}
export function unseal(value, secret) {
  need(value && typeof value === 'object' && !Array.isArray(value) && HASH.test(value.mac || ''), 'INDEX_AUTHENTICATION_FAILED');
  const { mac, ...body } = value;
  const expected = seal(body, secret).mac;
  need(crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex')), 'INDEX_AUTHENTICATION_FAILED');
  return body;
}
export async function atomicJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try { need(!(await fsp.lstat(file)).isSymbolicLink(), 'STATE_SYMLINK_REFUSED'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = path.join(path.dirname(file), '.write-' + crypto.randomUUID());
  try {
    const handle = await fsp.open(temp, 'wx', 0o600);
    try { await handle.writeFile(canonical(value) + '\n'); await handle.sync(); } finally { await handle.close(); }
    await fsp.rename(temp, file);
  } finally { await fsp.rm(temp, { force: true }); }
}
export function validateConfig(c) {
  need(c?.schema === 1 && /^[a-z0-9][a-z0-9-]{2,63}$/.test(c.keyId || ''), 'INVALID_CONFIG');
  need(c.prefix === 'attachments/v1/', 'UNSAFE_BACKUP_PREFIX');
  need(typeof c.sourceBucket === 'string' && typeof c.backupBucket === 'string' && c.sourceBucket !== c.backupBucket, 'SOURCE_BACKUP_BUCKETS_MUST_DIFFER');
  need(/^ap-[a-z0-9-]+$/.test(c.region || ''), 'INVALID_REGION');
  need(path.isAbsolute(c.stateDir || '') && path.isAbsolute(c.localRoot || '') && c.localRoot !== '/', 'INVALID_PATH');
  for (const k of ['maxObjectBytes', 'maxRunBytes', 'maxSources', 'maxMetadataBytes', 'minimumFreeBytes', 'maxVerifyBytes']) {
    need(Number.isSafeInteger(c[k]) && c[k] > 0, 'INVALID_LIMIT');
  }
  need(c.maxObjectBytes <= c.maxRunBytes && c.maxObjectBytes <= 512 * 1024 ** 2 && c.maxMetadataBytes <= 16 * 1024 ** 2, 'UNSAFE_LIMIT');
  need(c.cleanupMode === 'plan_only', 'DESTRUCTIVE_CLEANUP_NOT_SUPPORTED');
  need(Array.isArray(c.excludedCosPrefixes) && c.excludedCosPrefixes.includes('backups/'), 'BACKUP_SOURCE_EXCLUSION_REQUIRED');
  need(c.retention?.hourlyHours >= 24 && c.retention?.dailyDays >= 30 && c.retention?.weeklyWeeks >= 12 && c.retention?.monthlyMonths >= 12, 'RETENTION_TOO_SHORT');
  return c;
}
export function blobKey(c, sha256) {
  need(HASH.test(sha256), 'INVALID_HASH');
  return c.prefix + 'objects/' + c.keyId + '/' + sha256 + '.gcm';
}
function identity(c, secret) {
  return { sourceBucket: c.sourceBucket, backupBucket: c.backupBucket, region: c.region, prefix: c.prefix, localRoot: c.localRoot, keyId: c.keyId, keyFingerprint: keyFingerprint(secret) };
}
function freshState(c, secret) {
  return { schema: 1, identity: identity(c, secret), receipts: {}, sources: {}, snapshots: [], blobSets: {}, candidates: {}, lastFailure: null, pending: true, lastFullVerificationAt: null };
}
export function sourceId(source) { return digest(Buffer.from(canonical([source.provider, source.key]))); }
export function sourceSignature(source) {
  return digest(Buffer.from(canonical([source.provider, source.key, source.versionId || null, source.etag || null, source.modifiedAt, source.bytes, source.fingerprint || null])));
}
async function hashFile(file) {
  const h = crypto.createHash('sha256');
  for await (const b of fs.createReadStream(file)) h.update(b);
  return h.digest('hex');
}
export async function encryptStream(input, output, secret, keyId, maxBytes) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const metadata = Buffer.from(canonical({ keyId, salt: salt.toString('hex'), iv: iv.toString('hex') }));
  const length = Buffer.alloc(4); length.writeUInt32BE(metadata.length);
  const header = Buffer.concat([MAGIC, length, metadata]);
  const h = crypto.createHash('sha256'); let bytes = 0;
  const meter = new Transform({ transform(chunk, _, callback) {
    bytes += chunk.length;
    if (bytes > maxBytes) return callback(new Error('OBJECT_SIZE_LIMIT'));
    h.update(chunk); callback(null, chunk);
  } });
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret, salt), iv);
  cipher.setAAD(header);
  const handle = await fsp.open(output, 'wx', 0o600);
  try { await handle.write(header); } finally { await handle.close(); }
  try {
    await pipeline(input, meter, cipher, fs.createWriteStream(output, { flags: 'a', mode: 0o600 }));
    await fsp.appendFile(output, cipher.getAuthTag());
    return { sha256: h.digest('hex'), bytes, encryptedSha256: await hashFile(output), encryptedBytes: (await fsp.stat(output)).size };
  } catch (e) { await fsp.rm(output, { force: true }); throw e; }
}
export async function verifyEncrypted(file, expected, secret, keyId, destination = null) {
  need(HASH.test(expected.sha256 || '') && HASH.test(expected.encryptedSha256 || '') && Number.isSafeInteger(expected.bytes) && expected.bytes >= 0, 'INVALID_OBJECT_RECEIPT');
  need(await hashFile(file) === expected.encryptedSha256, 'ENCRYPTED_HASH_MISMATCH');
  const handle = await fsp.open(file, 'r');
  let header, info, tag, size;
  try {
    size = (await handle.stat()).size;
    need(size >= MAGIC.length + 4 + 16, 'INVALID_ENCRYPTED_FORMAT');
    const start = Buffer.alloc(MAGIC.length + 4); await handle.read(start, 0, start.length, 0);
    need(start.subarray(0, MAGIC.length).equals(MAGIC), 'INVALID_ENCRYPTED_FORMAT');
    const n = start.readUInt32BE(MAGIC.length);
    need(n > 0 && n <= 1024 && size >= start.length + n + 16, 'INVALID_ENCRYPTED_HEADER');
    const meta = Buffer.alloc(n); await handle.read(meta, 0, n, start.length);
    header = Buffer.concat([start, meta]); info = JSON.parse(meta);
    need(info.keyId === keyId && /^[a-f0-9]{32}$/.test(info.salt) && /^[a-f0-9]{24}$/.test(info.iv), 'ENCRYPTED_KEY_MISMATCH');
    tag = Buffer.alloc(16); await handle.read(tag, 0, 16, size - 16);
  } finally { await handle.close(); }
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(secret, Buffer.from(info.salt, 'hex')), Buffer.from(info.iv, 'hex'));
  decipher.setAAD(header); decipher.setAuthTag(tag);
  let bytes = 0; const h = crypto.createHash('sha256');
  const meter = new Transform({ transform(chunk, _, cb) {
    bytes += chunk.length;
    if (bytes > expected.bytes) return cb(new Error('PLAINTEXT_SIZE_MISMATCH'));
    h.update(chunk); cb(null, chunk);
  } });
  const temp = destination ? destination + '.partial-' + crypto.randomUUID() : null;
  try {
    const sink = temp ? fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 }) : new Writable({ write(_, __, cb) { cb(); } });
    // Empty content has no ciphertext bytes, but the authentication tag still must be checked.
    const input = size === header.length + 16 ? Readable.from([]) : fs.createReadStream(file, { start: header.length, end: size - 17 });
    await pipeline(input, decipher, meter, sink);
    need(bytes === expected.bytes && h.digest('hex') === expected.sha256, 'PLAINTEXT_HASH_MISMATCH');
    if (temp) { await fsp.link(temp, destination); await fsp.unlink(temp); }
    return { bytes, verified: true };
  } finally { if (temp) await fsp.rm(temp, { force: true }); }
}
export async function localInventory(root, maxSources) {
  const realRoot = await fsp.realpath(root);
  need(realRoot === path.resolve(root), 'SOURCE_ROOT_SYMLINK_REFUSED');
  const list = [];
  async function walk(dir) {
    for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, d.name);
      need(!d.isSymbolicLink(), 'SOURCE_SYMLINK_REFUSED');
      if (d.isDirectory()) await walk(file);
      else {
        need(d.isFile(), 'SPECIAL_SOURCE_FILE_REFUSED');
        const st = await fsp.stat(file, { bigint: true });
        need(st.size <= BigInt(Number.MAX_SAFE_INTEGER), 'SOURCE_SIZE_INVALID');
        const key = path.relative(root, file).split(path.sep).join('/');
        list.push({ provider: 'local', key, bytes: Number(st.size), modifiedAt: new Date(Number(st.mtimeMs)).toISOString(), fingerprint: [st.dev, st.ino, st.size, st.mtimeNs, st.ctimeNs].map(String).join(':') });
        need(list.length <= maxSources, 'SOURCE_COUNT_LIMIT');
      }
    }
  }
  await walk(root); return list;
}
export async function openLocalSource(root, source) {
  const file = path.resolve(root, source.key);
  need(file.startsWith(path.resolve(root) + path.sep), 'SOURCE_PATH_ESCAPE');
  need(await fsp.realpath(file) === file, 'SOURCE_SYMLINK_REFUSED');
  const h = await fsp.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const st = await h.stat({ bigint: true });
  const fingerprint = [st.dev, st.ino, st.size, st.mtimeNs, st.ctimeNs].map(String).join(':');
  if (fingerprint !== source.fingerprint) { await h.close(); fail('SOURCE_CHANGED'); }
  return h.createReadStream();
}
export function retainedSnapshots(snapshots, now, retention) {
  const ordered = [...snapshots].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const selected = new Set(ordered.slice(0, 2).map(s => s.id)), daily = new Set(), weekly = new Set(), monthly = new Set();
  for (const s of ordered) {
    need(s.complete === true && Number.isFinite(Date.parse(s.at)) && Date.parse(s.at) <= now, 'INVALID_SNAPSHOT');
    const age = now - Date.parse(s.at), d = new Date(s.at), day = d.toISOString().slice(0, 10), month = day.slice(0, 7);
    // Monday-based UTC week bucket; UTC is explicit and does not follow host timezone.
    const week = Math.floor((Date.parse(day) / 86400000 + 3) / 7);
    if (s.protected || age <= retention.hourlyHours * 3600000) selected.add(s.id);
    if (age <= retention.dailyDays * 86400000 && !daily.has(day)) { selected.add(s.id); daily.add(day); }
    if (age <= retention.weeklyWeeks * 7 * 86400000 && !weekly.has(week)) { selected.add(s.id); weekly.add(week); }
    const months = new Date(now).getUTCFullYear() * 12 + new Date(now).getUTCMonth() - (d.getUTCFullYear() * 12 + d.getUTCMonth());
    if (months < retention.monthlyMonths && !monthly.has(month)) { selected.add(s.id); monthly.add(month); }
  }
  return selected;
}
export function snapshotBlobs(state, snapshot) {
  const blobs = snapshot.blobs || state.blobSets?.[snapshot.blobSet];
  need(Array.isArray(blobs), 'MISSING_SNAPSHOT_DEPENDENCIES');
  for (const key of blobs) need(typeof key === 'string', 'INVALID_SNAPSHOT_DEPENDENCIES');
  return blobs;
}
export function cleanupPlan(state, config, now) {
  const blocked = [];
  if (state.pending) blocked.push('BASELINE_OR_SCAN_PENDING');
  if (state.lastFailure) blocked.push('TASK_FAILED');
  if (state.snapshots.length < 2) blocked.push('TWO_RECOVERY_POINTS_REQUIRED');
  const latest = state.snapshots.at(-1);
  if (!latest || now - Date.parse(latest.at) > 90 * 60000) blocked.push('LATEST_SNAPSHOT_STALE');
  if (!state.lastFullVerificationAt || !Number.isFinite(Date.parse(state.lastFullVerificationAt)) || now - Date.parse(state.lastFullVerificationAt) > 36 * 3600000) blocked.push('FULL_VERIFICATION_STALE');
  if ((latest && Date.parse(latest.at) > now) || (state.lastFullVerificationAt && Date.parse(state.lastFullVerificationAt) > now)) blocked.push('CLOCK_SKEW');
  if (blocked.length) { state.candidates = {}; return { mode: 'plan_only', blocked, candidates: [], bytes: 0 }; }
  const retained = retainedSnapshots(state.snapshots, now, config.retention);
  const referenced = new Set(state.snapshots.filter(s => retained.has(s.id)).flatMap(s => snapshotBlobs(state, s)));
  for (const key of referenced) need(state.receipts[key]?.key === key && state.receipts[key]?.verified === true, 'MISSING_OBJECT_RECEIPT');
  const candidates = []; let bytes = 0; const next = {};
  for (const [key, r] of Object.entries(state.receipts)) {
    need(key === blobKey(config, r.sha256) && r.key === key && r.verified === true && typeof r.versionId === 'string' && r.versionId.length > 0, 'INVALID_OBJECT_RECEIPT');
    if (referenced.has(key)) continue;
    const firstSeen = state.candidates[key]?.firstSeen ?? new Date(now).toISOString();
    need(Number.isFinite(Date.parse(firstSeen)) && Date.parse(firstSeen) <= now, 'INVALID_CANDIDATE_TIME');
    next[key] = { firstSeen };
    const eligible = now - Date.parse(firstSeen) >= 24 * 3600000;
    candidates.push({ key, versionId: r.versionId, bytes: r.encryptedBytes, firstSeen, eligible, reason: 'NO_RETAINED_SNAPSHOT_REFERENCE' });
    bytes += r.encryptedBytes;
  }
  state.candidates = next;
  return { mode: 'plan_only', blocked: [], retainedSnapshotCount: retained.size, candidates, bytes };
}
export class AttachmentTasks {
  constructor(config, store, secret, { clock = () => Date.now(), runId = crypto.randomUUID().replaceAll('-', '') } = {}) {
    this.c = validateConfig(config); this.store = store; this.secret = secret; this.clock = clock;
    need(/^[a-f0-9]{32}$/.test(runId), 'INVALID_RUN_ID'); this.runId = runId;
    need(typeof secret === 'string' && secret.length >= 32, 'BACKUP_KEY_REQUIRED');
    this.file = path.join(config.stateDir, 'catalog.json');
  }
  async start() {
    await fsp.mkdir(this.c.stateDir, { recursive: true, mode: 0o700 });
    need(await fsp.realpath(this.c.stateDir) === path.resolve(this.c.stateDir), 'STATE_ROOT_SYMLINK_REFUSED');
    this.workspace = await fsp.mkdtemp(path.join(this.c.stateDir, '.work-' + this.runId + '-'));
    try {
      try { this.state = unseal(JSON.parse(await fsp.readFile(this.file)), this.secret); }
      catch (e) {
        if (e.code !== 'ENOENT') throw e;
        this.state = await this.recover() ?? freshState(this.c, this.secret);
      }
      need(this.state.schema === 1 && canonical(this.state.identity) === canonical(identity(this.c, this.secret)), 'REPOSITORY_IDENTITY_MISMATCH');
      need(Array.isArray(this.state.snapshots) && this.state.blobSets && this.state.receipts && this.state.sources && this.state.candidates, 'INVALID_CATALOG');
      await this.store.assertPrivateVersioned();
    } catch (e) { await this.close(); throw e; }
  }
  async close() { if (this.workspace) await fsp.rm(this.workspace, { recursive: true, force: true }); }
  async save() { await atomicJson(this.file, seal(this.state, this.secret)); }
  async recover() {
    const pointer = await this.store.readJson(this.c.prefix + 'catalog-latest.json', this.c.maxMetadataBytes, true);
    if (!pointer) {
      // Refuse to initialize a new catalog over an existing repository.
      need(!(await this.store.hasRepositoryObjects(this.c.prefix)), 'REMOTE_INDEX_RECOVERY_REQUIRED');
      return null;
    }
    const r = unseal(pointer, this.secret);
    need(r.key.startsWith(this.c.prefix + 'catalogs/') && r.keyId === this.c.keyId, 'INVALID_CATALOG_POINTER');
    const temp = path.join(this.workspace, 'recover.gcm'), plain = path.join(this.workspace, 'recover.json');
    await this.store.download(r.key, r.versionId, temp, this.c.maxMetadataBytes + 4096);
    await verifyEncrypted(temp, r, this.secret, this.c.keyId, plain);
    return unseal(JSON.parse(await fsp.readFile(plain)), this.secret);
  }
  async publishMetadata(value, folder) {
    const id = crypto.randomUUID();
    const file = path.join(this.workspace, id + '.gcm');
    const r = await encryptStream(Readable.from([Buffer.from(canonical(value))]), file, this.secret, this.c.keyId, this.c.maxMetadataBytes);
    const key = this.c.prefix + folder + '/' + id + '.gcm';
    const uploaded = await this.store.upload(key, file, r.encryptedSha256);
    need(typeof uploaded.versionId === 'string' && uploaded.versionId.length > 0, 'VERSION_ID_REQUIRED');
    const check = file + '.check';
    try {
      await this.store.download(key, uploaded.versionId, check, r.encryptedBytes);
      await verifyEncrypted(check, r, this.secret, this.c.keyId);
      return { ...r, key, keyId: this.c.keyId, versionId: uploaded.versionId, at: new Date(this.clock()).toISOString() };
    } finally { await fsp.rm(file, { force: true }); await fsp.rm(check, { force: true }); }
  }
  async checkpoint() {
    const r = await this.publishMetadata(seal(this.state, this.secret), 'catalogs');
    await this.store.writeJson(this.c.prefix + 'catalog-latest.json', seal(r, this.secret));
  }
  async inventory() {
    const remote = await this.store.inventory(this.c.maxSources);
    const local = await localInventory(this.c.localRoot, this.c.maxSources);
    const all = [...remote, ...local].sort((a, b) => sourceId(a).localeCompare(sourceId(b)));
    need(all.length <= this.c.maxSources && new Set(all.map(sourceId)).size === all.length, 'INVALID_SOURCE_INVENTORY');
    for (const s of all) need(Number.isSafeInteger(s.bytes) && s.bytes >= 0 && s.bytes <= this.c.maxObjectBytes, 'OBJECT_SIZE_LIMIT');
    return all;
  }
  async backup() {
    let result;
    try {
      const sources = await this.inventory();
      this.state.pending = true; await this.save();
      const entries = []; let processedBytes = 0, uploadedBytes = 0, uploadedObjects = 0, reusedObjects = 0;
      for (const source of sources) {
        const id = sourceId(source), signature = sourceSignature(source);
        let r = this.state.sources[id]?.signature === signature ? this.state.receipts[this.state.sources[id].blob] : null;
        if (r) {
          await this.store.checkReceipt(r); reusedObjects++;
        } else {
          if (processedBytes + source.bytes > this.c.maxRunBytes) break;
          const free = await fsp.statfs(this.c.stateDir);
          need(free.bavail * free.bsize >= this.c.minimumFreeBytes + source.bytes * 2 + 8192, 'INSUFFICIENT_WORKSPACE');
          const staged = path.join(this.workspace, crypto.randomUUID() + '.gcm');
          const downloaded = staged + '.check';
          try {
            const stream = source.provider === 'local' ? await openLocalSource(this.c.localRoot, source) : await this.store.openSource(source);
            const e = await encryptStream(stream, staged, this.secret, this.c.keyId, this.c.maxObjectBytes);
            need(e.bytes === source.bytes, 'SOURCE_SIZE_CHANGED');
            await this.store.confirmSource(source);
            if (source.provider === 'local') {
              const s = (await localInventory(this.c.localRoot, this.c.maxSources)).find(s => sourceId(s) === id);
              need(s && sourceSignature(s) === signature, 'SOURCE_CHANGED');
            }
            const key = blobKey(this.c, e.sha256); r = this.state.receipts[key];
            if (r) { need(r.bytes === e.bytes, 'CONTENT_IDENTITY_MISMATCH'); await this.store.checkReceipt(r); reusedObjects++; }
            else {
              // A previous interrupted upload is recovered rather than overwritten.
              const existing = await this.store.readJson(key + '.receipt.json', this.c.maxMetadataBytes, true);
              if (existing) {
                r = unseal(existing, this.secret);
                need(r.key === key && r.sha256 === e.sha256 && r.bytes === e.bytes && r.keyId === this.c.keyId && r.verified === true, 'INVALID_OBJECT_RECEIPT');
                await this.store.checkReceipt(r);
                await this.store.download(r.key, r.versionId, downloaded, r.encryptedBytes);
                await verifyEncrypted(downloaded, r, this.secret, this.c.keyId);
                reusedObjects++;
              } else {
                need(!(await this.store.objectExists(key)), 'UNINDEXED_OBJECT_REQUIRES_RECOVERY');
                const remote = await this.store.upload(key, staged, e.encryptedSha256);
                need(typeof remote.versionId === 'string' && remote.versionId.length > 0, 'VERSION_ID_REQUIRED');
                r = { ...e, key, keyId: this.c.keyId, versionId: remote.versionId, verified: true, verifiedAt: new Date(this.clock()).toISOString() };
                await this.store.download(key, r.versionId, downloaded, r.encryptedBytes);
                await verifyEncrypted(downloaded, r, this.secret, this.c.keyId);
                await this.store.writeJson(key + '.receipt.json', seal(r, this.secret));
                uploadedObjects++; uploadedBytes += r.encryptedBytes;
              }
              this.state.receipts[key] = r;
            }
            this.state.sources[id] = { signature, blob: key };
            await this.save(); processedBytes += e.bytes;
          } finally { await fsp.rm(staged, { force: true }); await fsp.rm(downloaded, { force: true }); }
        }
        entries.push({ source, blob: r.key, versionId: r.versionId, sha256: r.sha256, bytes: r.bytes });
      }
      const complete = entries.length === sources.length;
      this.state.pending = !complete;
      if (complete) {
        // Re-list both sources before committing; a changing scan is never presented as complete.
        need(canonical(sources) === canonical(await this.inventory()), 'SOURCE_INVENTORY_CHANGED');
        const manifest = { schema: 1, scope: 'attachment_inventory_only', databaseBackupId: null, complete: true, id: crypto.randomUUID(), at: new Date(this.clock()).toISOString(), entries };
        const remote = await this.publishMetadata(manifest, 'snapshots');
        const blobs = [...new Set(entries.map(e => e.blob))].sort();
        const blobSet = digest(Buffer.from(canonical(blobs)));
        this.state.blobSets[blobSet] = blobs;
        this.state.snapshots.push({ id: manifest.id, at: manifest.at, complete: true, protected: this.state.snapshots.length === 0, blobSet, remote });
        const keep = retainedSnapshots(this.state.snapshots, this.clock(), this.c.retention);
        this.state.snapshots = this.state.snapshots.filter(s => keep.has(s.id) || this.state.verifyCursor?.snapshotId === s.id);
        const sets = new Set(this.state.snapshots.map(s => s.blobSet));
        for (const id of Object.keys(this.state.blobSets)) if (!sets.has(id)) delete this.state.blobSets[id];
      }
      if (this.state.lastFailure?.command !== 'verify') this.state.lastFailure = null; await this.save(); await this.checkpoint();
      result = { command: 'backup', complete, coverage: 'attachment_inventory_only', sources: sources.length, indexed: entries.length, uploadedObjects, uploadedBytes, reusedObjects };
      await this.status(result); return result;
    } catch (e) {
      this.state.lastFailure = { command: 'backup', at: new Date(this.clock()).toISOString(), code: safeCode(e) };
      await this.save(); await this.status({ command: 'backup', complete: false, failed: true, error: safeCode(e) }); throw e;
    }
  }
  async verify() {
    const latest = this.state.snapshots.at(-1);
    if (!latest?.complete || this.state.pending) {
      const result = { command: 'verify', complete: false, skipped: 'BASELINE_OR_SCAN_PENDING', coverage: 'attachment_inventory_only' };
      await this.status(result); return result;
    }
    const previous = this.state.verifyCursor;
    const target = previous && !previous.complete ? this.state.snapshots.find(s => s.id === previous.snapshotId) : latest;
    need(target?.complete, 'VERIFICATION_TARGET_MISSING');
    const blobs = snapshotBlobs(this.state, target);
    const cursor = previous?.snapshotId === target.id && !previous.complete ? previous : { snapshotId: target.id, offset: 0 };
    const manifestFile = path.join(this.workspace, 'manifest-check.gcm');
    try {
      await this.store.download(target.remote.key, target.remote.versionId, manifestFile, target.remote.encryptedBytes);
      await verifyEncrypted(manifestFile, target.remote, this.secret, this.c.keyId);
    } finally { await fsp.rm(manifestFile, { force: true }); }
    let bytes = 0, checked = 0;
    while (cursor.offset < blobs.length) {
      const r = this.state.receipts[blobs[cursor.offset]];
      need(r?.verified === true, 'MISSING_OBJECT_RECEIPT');
      if (bytes + r.encryptedBytes > this.c.maxVerifyBytes && checked > 0) break;
      const file = path.join(this.workspace, 'verify.gcm');
      try {
        const free = await fsp.statfs(this.c.stateDir);
        need(free.bavail * free.bsize >= this.c.minimumFreeBytes + r.encryptedBytes, 'INSUFFICIENT_WORKSPACE');
        await this.store.download(r.key, r.versionId, file, r.encryptedBytes);
        await verifyEncrypted(file, r, this.secret, this.c.keyId);
      } finally { await fsp.rm(file, { force: true }); }
      cursor.offset++; checked++; bytes += r.encryptedBytes;
    }
    const complete = cursor.offset === blobs.length;
    cursor.complete = complete;
    this.state.verifyCursor = cursor;
    if (complete) {
      this.state.lastFullVerificationAt = new Date(this.clock()).toISOString();
      this.state.lastFullVerificationSnapshotId = target.id;
      if (this.state.lastFailure?.command === 'verify') this.state.lastFailure = null;
    }
    await this.save(); await this.checkpoint();
    const result = { command: 'verify', complete, checked, bytes, coverage: 'attachment_inventory_only' };
    await this.status(result); return result;
  }
  async plan() {
    await this.store.assertPrivateVersioned();
    const plan = cleanupPlan(this.state, this.c, this.clock());
    try {
      await fsp.lstat(path.join(this.c.stateDir, 'launcher-failure.json'));
      this.state.candidates = {}; plan.blocked.push('HOST_LAUNCHER_FAILED'); plan.candidates = []; plan.bytes = 0;
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    // Recheck every retained immutable version; missing payload blocks all cleanup candidates.
    if (!plan.blocked.length) {
      try {
        const keep = retainedSnapshots(this.state.snapshots, this.clock(), this.c.retention);
        const keys = new Set(this.state.snapshots.filter(s => keep.has(s.id)).flatMap(s => snapshotBlobs(this.state, s)));
        for (const s of this.state.snapshots.filter(s => keep.has(s.id))) await this.store.checkReceipt(s.remote);
        for (const key of keys) await this.store.checkReceipt(this.state.receipts[key]);
      } catch { this.state.candidates = {}; plan.blocked.push('RETAINED_OBJECT_UNAVAILABLE'); plan.candidates = []; plan.bytes = 0; }
    }
    await atomicJson(path.join(this.c.stateDir, 'cleanup-plan.json'), seal({ at: new Date(this.clock()).toISOString(), ...plan }, this.secret));
    await this.save();
    const result = { command: 'plan', mode: 'plan_only', blocked: plan.blocked, candidates: plan.candidates.length, eligible: plan.candidates.filter(c => c.eligible).length, bytes: plan.bytes };
    await this.status(result); return result;
  }
  async status(result) {
    await atomicJson(path.join(this.c.stateDir, 'status.json'), { at: new Date(this.clock()).toISOString(), ...result, pending: this.state.pending, snapshotCount: this.state.snapshots.length, uniqueObjects: Object.keys(this.state.receipts).length, lastSnapshotAt: this.state.snapshots.at(-1)?.at || null, lastFullVerificationAt: this.state.lastFullVerificationAt, cleanupMode: 'plan_only', notifications: 'local_only' });
  }
}
export function safeCode(e) { return /^[A-Z][A-Z0-9_]{2,80}$/.test(e?.message || '') ? e.message : 'ATTACHMENT_TASK_FAILED'; }
