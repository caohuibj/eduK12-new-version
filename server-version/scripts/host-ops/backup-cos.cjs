// Standalone transport: backup bucket only; no production object writes/deletes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const PREFIX = 'host-backups/v1/';
const FILES = new Set(['database.edubackup.enc', 'server-config.gcm', 'receipt.json']);
const valid = (ok, code) => { if (!ok) throw Error(code); };
function keyFor(runId, file) {
  valid(/^[a-f0-9]{32}$/.test(runId) && FILES.has(file), 'NAMESPACE_REFUSED');
  return PREFIX + runId + '/' + file;
}
async function digest(file) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function transfer(input, client, options = {}) {
  const c = input.config;
  valid(c.backupBucket === 'eduk12-backups-1393949445' && c.sourceBucket === 'ptool-videos-edu-1393949445' && c.region === 'ap-beijing', 'BUCKET_BINDING_REFUSED');
  const call = (method, extra = {}) => new Promise((resolve, reject) => client[method]({ Bucket: c.backupBucket, Region: c.region, ...extra }, (e, r) => e ? reject(e) : resolve(r)));
  const v = await call('getBucketVersioning');
  valid(v.VersioningConfiguration?.Status === 'Enabled', 'VERSIONING_REQUIRED');
  const acl = await call('getBucketAcl');
  valid(!/anyone|AllUsers|AuthenticatedUsers/i.test(JSON.stringify(acl.Grants || [])), 'PRIVATE_BUCKET_REQUIRED');
  const lifecycle = await call('getBucketLifecycle').catch(e => { if (e.statusCode === 404) return { Rules: [] }; throw e; });
  valid(!(lifecycle.Rules || []).some(r => r.Status === 'Enabled' && (r.Expiration || r.NoncurrentVersionExpiration)
    && (PREFIX.startsWith(r.Filter?.Prefix ?? r.Prefix ?? '') || (r.Filter?.Prefix ?? r.Prefix ?? '').startsWith(PREFIX))), 'UNREVIEWED_EXPIRATION_RULE');
  const probe = () => new Promise((resolve, reject) => {
    const req = https.request({ hostname: c.backupBucket + '.cos.' + c.region + '.myqcloud.com', path: '/' + PREFIX + 'private-access-probe', method: 'HEAD', timeout: 15000 }, r => { r.resume(); resolve(r.statusCode); });
    req.on('error', reject); req.on('timeout', () => req.destroy(Error('ANONYMOUS_PROBE_TIMEOUT'))); req.end();
  });
  const anonymous = await (options.anonymousProbe || probe)();
  valid(anonymous === 403, 'PUBLIC_POLICY_REFUSED');
  if (input.command === 'probe') {
    const r = await call('getBucket', { Prefix: PREFIX, MaxKeys: 1 });
    return { repositoryExists: (r.Contents || []).length > 0 || r.IsTruncated === true || r.IsTruncated === 'true' };
  }
  valid(input.command === 'put', 'COMMAND_REFUSED');
  const Key = keyFor(input.runId, input.file), file = (options.workspace || '/work') + '/' + input.file;
  const stat = fs.lstatSync(file);
  valid(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= c.maxBackupBytes, 'FILE_LIMIT');
  const hash = await digest(file);
  valid(hash === input.sha256, 'LOCAL_HASH_MISMATCH');
  try { await call('headObject', { Key }); throw Error('REFUSE_OVERWRITE'); }
  catch (e) { if (e.statusCode !== 404) throw e; }
  const uploaded = await call('putObject', { Key, Body: fs.createReadStream(file), ContentLength: stat.size,
    ACL: 'private', StorageClass: 'STANDARD', ServerSideEncryption: 'AES256', Headers: { 'x-cos-meta-sha256': hash } });
  const versionId = uploaded.VersionId || uploaded.headers?.['x-cos-version-id'];
  valid(typeof versionId === 'string' && versionId.length > 0, 'VERSION_RECEIPT_REQUIRED');
  const head = await call('headObject', { Key, VersionId: versionId });
  valid(Number(head.headers?.['content-length']) === stat.size && head.headers?.['x-cos-meta-sha256'] === hash && head.headers?.['x-cos-version-id'] === versionId, 'REMOTE_RECEIPT_MISMATCH');
  const output = file + '.remote'; let bytes = 0;
  try {
    // SDK streaming keeps the 198 MB database envelope out of JS buffers.
    const stream = require('node:stream').PassThrough(); stream.on('error', () => {});
    queueMicrotask(() => client.getObject({ Bucket: c.backupBucket, Region: c.region, Key, VersionId: versionId, Output: stream }, e => { if (e) stream.destroy(e); }));
    await pipeline(stream, new Transform({ transform(b, _, done) { bytes += b.length; done(bytes > stat.size ? Error('DOWNLOAD_LIMIT') : null, b); } }), fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }));
    valid(bytes === stat.size && await digest(output) === hash, 'REMOTE_HASH_MISMATCH');
    return { key: Key, versionId, bytes, sha256: hash, downloadVerified: true, anonymousAccessDenied: true };
  } catch (e) { fs.rmSync(output, { force: true }); throw e; }
}
module.exports = { keyFor, transfer };
if (require.main === module) {
  (async () => {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const COS = require('/app/node_modules/cos-nodejs-sdk-v5');
    const client = new COS({ SecretId: input.credentials.COS_SECRET_ID, SecretKey: input.credentials.COS_SECRET_KEY,
      ...(input.credentials.COS_SECURITY_TOKEN ? { SecurityToken: input.credentials.COS_SECURITY_TOKEN } : {}), Timeout: 60000 });
    console.log(JSON.stringify(await transfer(input, client)));
  })().catch(() => { console.error('HOST_BACKUP_COS_FAILED'); process.exitCode = 1; });
}
