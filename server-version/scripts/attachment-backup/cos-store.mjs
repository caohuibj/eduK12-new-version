import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import https from 'node:https';
import crypto from 'node:crypto';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fail } from './core.mjs';

const bool = v => v === true || v === 'true';
export class CosStore {
  constructor(c, client) { this.c = c; this.client = client; }
  target(extra = {}) { return { Bucket: this.c.backupBucket, Region: this.c.region, ...extra }; }
  source(extra = {}) { return { Bucket: this.c.sourceBucket, Region: this.c.region, ...extra }; }
  call(method, args) { return new Promise((resolve, reject) => this.client[method](args, (e, data) => e ? reject(e) : resolve(data))); }
  guard(key) { if (!key.startsWith(this.c.prefix) || key.includes('../') || key.includes('\0')) fail('COS_KEY_OUTSIDE_BACKUP_NAMESPACE'); }
  async assertPrivateVersioned() {
    const v = await this.call('getBucketVersioning', this.target());
    if (v.VersioningConfiguration?.Status !== 'Enabled') fail('BACKUP_BUCKET_VERSIONING_REQUIRED');
    const acl = await this.call('getBucketAcl', this.target());
    if (JSON.stringify(acl.Grants || []).match(/anyone|AllUsers|AuthenticatedUsers/i)) fail('PUBLIC_BACKUP_ACL_REFUSED');
    // A public bucket policy can override a private ACL. Anonymous access must also be denied.
    const key = this.c.prefix + 'catalog-latest.json';
    const status = await new Promise((resolve, reject) => {
      const req = https.request({ hostname: this.c.backupBucket + '.cos.' + this.c.region + '.myqcloud.com', path: '/' + key, method: 'HEAD', timeout: 15000 }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.on('timeout', () => req.destroy(new Error('ANONYMOUS_PROBE_TIMEOUT'))); req.end();
    });
    if (status !== 403) fail('ANONYMOUS_BACKUP_ACCESS_NOT_DENIED');
  }
  async head(key, versionId, allowMissing = false) {
    this.guard(key);
    try { return await this.call('headObject', this.target({ Key: key, ...(versionId ? { VersionId: versionId } : {}) })); }
    catch (e) { if (allowMissing && e.statusCode === 404) return null; throw e; }
  }
  async objectExists(key) { return Boolean(await this.head(key, null, true)); }
  async hasRepositoryObjects(prefix) {
    this.guard(prefix);
    const r = await this.call('getBucket', this.target({ Prefix: prefix, MaxKeys: 1 }));
    return (r.Contents || []).length > 0 || bool(r.IsTruncated);
  }
  async checkReceipt(r) {
    if (!r?.key || !r.versionId) fail('INVALID_OBJECT_RECEIPT');
    const h = await this.head(r.key, r.versionId);
    if (h.headers?.['x-cos-meta-sha256'] !== r.encryptedSha256 || Number(h.headers?.['content-length']) !== r.encryptedBytes ||
        h.headers?.['x-cos-version-id'] !== r.versionId) fail('REMOTE_OBJECT_RECEIPT_MISMATCH');
  }
  stream(args) {
    const output = new PassThrough();
    output.on('error', () => {});
    // Attach consumers before initiating the SDK request so early network errors cannot escape.
    queueMicrotask(() => this.client.getObject({ ...args, Output: output }, e => { if (e) output.destroy(e); }));
    return output;
  }
  async download(key, versionId, file, maxBytes) {
    this.guard(key);
    if (!versionId) fail('VERSION_ID_REQUIRED');
    let bytes = 0;
    const meter = new Transform({ transform(chunk, _, cb) { bytes += chunk.length; cb(bytes > maxBytes ? new Error('DOWNLOAD_SIZE_LIMIT') : null, chunk); } });
    try { await pipeline(this.stream(this.target({ Key: key, VersionId: versionId })), meter, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 })); }
    catch (e) { await fsp.rm(file, { force: true }); throw e; }
  }
  async readJson(key, maxBytes, allowMissing = false) {
    const h = await this.head(key, null, allowMissing);
    if (!h) return null;
    const versionId = h.headers?.['x-cos-version-id'];
    if (!versionId || Number(h.headers?.['content-length']) > maxBytes) fail('REMOTE_METADATA_INVALID');
    const chunks = []; let bytes = 0;
    for await (const chunk of this.stream(this.target({ Key: key, VersionId: versionId }))) {
      bytes += chunk.length;
      if (bytes > maxBytes) fail('METADATA_SIZE_LIMIT');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks));
  }
  async writeJson(key, value) {
    this.guard(key);
    const body = Buffer.from(JSON.stringify(value));
    return this.call('putObject', this.target({ Key: key, Body: body, ContentLength: body.length, ACL: 'private', ServerSideEncryption: 'AES256' }));
  }
  async upload(key, file, sha256) {
    this.guard(key);
    // putObject streams files smaller than the configured 512 MiB cap. No dependency on multipart cleanup.
    const r = await this.call('putObject', this.target({ Key: key, Body: fs.createReadStream(file), ContentLength: (await fsp.stat(file)).size,
      ACL: 'private', StorageClass: 'STANDARD', ServerSideEncryption: 'AES256', Headers: { 'x-cos-meta-sha256': sha256 } }));
    return { versionId: r.VersionId || r.headers?.['x-cos-version-id'] };
  }
  async inventory(maxSources) {
    const out = [], seen = new Set(); let marker;
    while (true) {
      const r = await this.call('getBucket', this.source({ MaxKeys: 1000, ...(marker ? { Marker: marker } : {}) }));
      for (const o of r.Contents || []) {
        if (this.c.excludedCosPrefixes.some(p => o.Key.startsWith(p)) || o.Key.endsWith('/')) continue;
        if (seen.has(o.Key)) fail('DUPLICATE_SOURCE_KEY');
        seen.add(o.Key);
        out.push({ provider: 'cos', key: o.Key, bytes: Number(o.Size), modifiedAt: o.LastModified, etag: o.ETag });
        if (out.length > maxSources) fail('SOURCE_COUNT_LIMIT');
      }
      if (!bool(r.IsTruncated)) break;
      if (!r.NextMarker || r.NextMarker === marker) fail('COS_PAGINATION_INCOMPLETE');
      marker = r.NextMarker;
    }
    return out;
  }
  async openSource(source) { return this.stream(this.source({ Key: source.key, IfMatch: source.etag })); }
  async confirmSource(source) {
    if (source.provider !== 'cos') return;
    const r = await this.call('headObject', this.source({ Key: source.key }));
    if (r.headers?.etag !== source.etag || Number(r.headers?.['content-length']) !== source.bytes) fail('SOURCE_CHANGED');
  }
}
