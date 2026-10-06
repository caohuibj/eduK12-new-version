import crypto from 'node:crypto';
import { retainedSnapshots } from '../attachment-backup/core.mjs';

export const need = (ok, code) => { if (!ok) throw Error(code); };
export const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const id = r => JSON.stringify([r.key, r.versionId]);
export const age = (at, now) => { const t = Date.parse(at); need(Number.isFinite(t) && t <= now, 'INVALID_OR_FUTURE_TIME'); return now - t; };
const HOUR = 3600000;
export function config(c) {
  need(c?.schema === 1 && c.backupBucket === 'eduk12-backups-1393949445' && c.sourceBucket === 'ptool-videos-edu-1393949445' && c.region === 'ap-beijing', 'BUCKET_BINDING_REFUSED');
  need(['plan_only', 'execute'].includes(c.mode), 'CLEANUP_MODE_REFUSED');
  for (const [k, min, max] of [['quarantineHours',24,168],['maxDeleteObjects',1,100],['maxDeleteBytes',1,536870912],['maxInventoryVersions',1,10000],['maxScanBytes',1,67108864]])
    need(Number.isSafeInteger(c[k]) && c[k] >= min && c[k] <= max, 'CLEANUP_LIMIT_REFUSED');
  need(c.retention?.hourlyHours >= 48 && c.retention.dailyDays >= 30 && c.retention.weeklyWeeks >= 12 && c.retention.monthlyMonths >= 12, 'RETENTION_TOO_SHORT');
  return c;
}
export function validRecord(r) {
  need(r && typeof r.versionId === 'string' && r.versionId.length > 0 && r.versionId !== 'null' && /^[a-f0-9]{64}$/.test(r.sha256 || '') && Number.isSafeInteger(r.bytes) && r.bytes >= 0, 'INVALID_VERSION_RECEIPT');
  need(/^host-backups\/v1\/[a-f0-9]{32}\/(database\.edubackup\.enc|server-config\.gcm|receipt\.json)$/.test(r.key)
    || /^attachments\/v1\/(catalog-latest\.json|(?:snapshots|catalogs)\/[a-f0-9-]{36}\.gcm|objects\/[a-z0-9-]+\/[a-f0-9]{64}\.gcm(?:\.receipt\.json)?)$/.test(r.key), 'DELETE_NAMESPACE_REFUSED');
  return r;
}
function keepHosts(points, now, r) {
  const active = points.filter(p => p.status !== 'RETIRED');
  need(new Set(points.map(p => p.id)).size === points.length, 'DUPLICATE_HOST_POINT');
  for (const p of active) need(/^[a-f0-9]{32}$/.test(p.id) && p.status === 'VERIFIED' && p.restore?.status === 'PASS'
    && p.objects?.length === 2 && p.objects.every(o => o.downloadVerified === true && o.authenticatedDecryptionVerified === true), 'HOST_RECOVERY_POINT_INVALID');
  return retainedSnapshots(active.map(p => ({ ...p, complete: true })), now, { ...r, hourlyHours: 0 });
}
export function protectedGraph(c, input, now) {
  config(c);
  const { host, attachment: a, proof, snapshots, catalogs, records } = input;
  for(const r of records.values()) age(r.at,now);
  need(host.schema === 1 && Array.isArray(host.points) && a.schema === 1 && a.identity?.backupBucket === c.backupBucket
    && a.identity.sourceBucket === c.sourceBucket && a.identity.region === c.region && a.identity.prefix === 'attachments/v1/', 'CATALOG_IDENTITY_REFUSED');
  const blocked = [];
  if (a.pending || a.lastFailure || input.launcherFailure) blocked.push('ATTACHMENT_SCAN_PENDING_OR_FAILED');
  if (a.snapshots.length < 2 || host.points.filter(p => p.status === 'VERIFIED').length < 2) blocked.push('TWO_RECOVERY_POINTS_REQUIRED');
  if (!a.lastFullVerificationAt || age(a.lastFullVerificationAt, now) > 36 * HOUR) blocked.push('ATTACHMENT_FULL_VERIFICATION_STALE');
  const latest = a.snapshots.at(-1);
  if (!latest || age(latest.at, now) > 90 * 60000) blocked.push('ATTACHMENT_SNAPSHOT_STALE');
  const latestHost = host.points.filter(p => p.status === 'VERIFIED').at(-1);
  if (!latestHost || age(latestHost.at, now) > 36 * HOUR || input.hostStatus?.status !== 'VERIFIED') blocked.push('HOST_BACKUP_FAILED_OR_STALE');
  if (input.unknownMetadata.length) blocked.push('UNMANAGED_RECOVERY_METADATA');
  const keepHost = keepHosts(host.points, now, c.retention);
  const allSnapshots = [...snapshots.values()];
  need(new Set(allSnapshots.map(s => s.id)).size === allSnapshots.length, 'DUPLICATE_ATTACHMENT_POINT');
  const keepSnapshot = retainedSnapshots(allSnapshots, now, c.retention);
  if (a.verifyCursor && !a.verifyCursor.complete) keepSnapshot.add(a.verifyCursor.snapshotId);
  const proofOK = proof?.schema === 1 && proof.bucket === c.backupBucket && proof.region === c.region && proof.status === 'VERIFIED'
    && proof.checks?.databaseRestore === true && proof.checks?.attachmentDecrypt === true && proof.checks?.databaseReferences === true
    && age(proof.at, now) <= 36 * HOUR && Array.isArray(proof.bindings);
  if (!proofOK) blocked.push('JOINT_RECOVERY_PROOF_REQUIRED');
  else {
    for (const p of host.points.filter(p => keepHost.has(p.id))) {
      const binding = proof.bindings.find(b => b.hostPointId === p.id);
      const s = binding && snapshots.get(binding.attachmentSnapshotId);
      if (!s || s.remote.versionId !== binding.snapshotVersionId || p.objects[0].versionId !== binding.databaseVersionId)
        blocked.push('RETAINED_HOST_POINT_NOT_JOINTLY_VERIFIED');
      else keepSnapshot.add(s.id);
      const linked = p.attachmentAssociation?.snapshot;
      if (linked) { need(snapshots.has(linked.id), 'HOST_ATTACHMENT_DEPENDENCY_MISSING'); keepSnapshot.add(linked.id); }
    }
  }
  need([...keepSnapshot].every(s => snapshots.has(s)), 'PROTECTED_SNAPSHOT_MISSING');
  const protectedVersions = new Set(), protectedBlobs = new Set();
  for (const p of host.points.filter(p => keepHost.has(p.id))) for (const o of [...p.objects, p.metadata]) {
    need(o && records.has(id(o)), 'HOST_OBJECT_DEPENDENCY_MISSING'); protectedVersions.add(id(o));
  }
  for (const s of allSnapshots.filter(s => keepSnapshot.has(s.id))) {
    need(records.has(id(s.remote)), 'SNAPSHOT_OBJECT_MISSING'); protectedVersions.add(id(s.remote));
    for (const b of s.blobs) { need(records.has(b), 'BLOB_DEPENDENCY_MISSING'); protectedVersions.add(b); protectedBlobs.add(b); }
  }
  const pointers = [...records.values()].filter(r => r.kind === 'pointer').sort((a,b) => Number(!!b.latest)-Number(!!a.latest)
    || Date.parse(b.publishedAt || b.at) - Date.parse(a.publishedAt || a.at));
  need(pointers.length >= 1 && catalogs.has(pointers[0].catalog), 'CURRENT_REMOTE_CATALOG_MISSING');
  const currentMetadata = new Set();
  for (const p of pointers.slice(0,2)) { currentMetadata.add(id(p)); currentMetadata.add(p.catalog); }
  return { blocked: [...new Set(blocked)], keepHost, keepSnapshot, protectedVersions, protectedBlobs, currentMetadata };
}
export function plan(c, input, previous, now) {
  const graph = protectedGraph(c, input, now), { records, snapshots, catalogs, host } = input;
  const candidates = [], observations = {};
  const observe = (r, reason) => {
    validRecord(r); const key = id(r), digest = hash(r);
    const old = previous?.observations?.[key];
    const first = old?.digest === digest && age(old.lastSeen, now) <= 36 * HOUR ? old.firstSeen : new Date(now).toISOString();
    age(first, now); observations[key] = { digest, firstSeen: first, lastSeen: new Date(now).toISOString() };
    candidates.push({ ...r, reason, firstSeen: first, eligible: age(first,now) >= c.quarantineHours * HOUR });
  };
  if (!graph.blocked.length) {
    for (const r of records.values()) {
      if (graph.protectedVersions.has(id(r)) || graph.currentMetadata.has(id(r))) continue;
      if (r.kind === 'host' && !graph.keepHost.has(r.pointId)) observe(r, 'HOST_RETENTION_EXPIRED');
      else if (r.kind === 'snapshot' && !graph.keepSnapshot.has(r.snapshotId)) observe(r, 'SNAPSHOT_RETENTION_EXPIRED');
      else if (r.kind === 'pointer' || r.kind === 'catalog') observe(r, 'SUPERSEDED_RECOVERY_INDEX');
      else if ((r.kind === 'blob' || r.kind === 'blob_receipt') && !graph.protectedBlobs.has(r.blob)) observe(r, 'NO_RETAINED_RECOVERY_REFERENCE');
    }
  }
  const eligible = new Map(candidates.filter(x => x.eligible).map(x => [id(x),x]));
  const actions = new Map(); let bytes = 0;
  const addGroup = rows => {
    const newRows = [...new Map(rows.map(r=>[id(r),r])).values()].filter(x => !actions.has(id(x)));
    if (actions.size + newRows.length > c.maxDeleteObjects || bytes + newRows.reduce((n,r) => n+r.bytes,0) > c.maxDeleteBytes) return false;
    for (const r of newRows) { actions.set(id(r),r); bytes += r.bytes; } return true;
  };
  // Whole host points; never retire one because only its small receipt fits a budget.
  for (const p of host.points.filter(p => !graph.keepHost.has(p.id) && p.status === 'VERIFIED')) {
    const group = [...records.values()].filter(r => r.kind === 'host' && r.pointId === p.id);
    if (group.length === 3 && group.every(r => eligible.has(id(r)))) addGroup(group);
  }
  // Detach all historical dependencies before a payload version is deleted.
  for (const r of eligible.values()) if (r.kind === 'blob') {
    const group = [r]; let safe = true;
    const dependencies = new Set();
    for (const s of snapshots.values()) if (s.blobs.includes(id(r))) dependencies.add(id(s.remote));
    for (const [key, cat] of catalogs) if (cat.blobs.includes(id(r))) {
      dependencies.add(key);
      for (const p of records.values()) if (p.kind === 'pointer' && p.catalog === key) dependencies.add(id(p));
    }
    for (const sidecar of records.values()) if (sidecar.kind === 'blob_receipt' && sidecar.blob === id(r)) dependencies.add(id(sidecar));
    for (const dep of dependencies) {
      if (graph.currentMetadata.has(dep)) continue; // Replaced by two checked, detached checkpoints before deletion.
      if (!eligible.has(dep)) { safe = false; break; } group.push(eligible.get(dep));
    }
    // Replacing the current two metadata pairs is part of the same bounded transaction.
    if (safe) for (const dep of graph.currentMetadata) group.push(records.get(dep));
    if (safe) addGroup(group);
  }
  for (const r of eligible.values()) if (['snapshot','catalog','pointer'].includes(r.kind)) {
    if (r.kind === 'catalog') {
      const ps = [...records.values()].filter(p => p.kind === 'pointer' && p.catalog === id(r));
      if (ps.every(p => eligible.has(id(p)))) addGroup([r,...ps]);
    } else if (r.kind === 'snapshot') {
      const group=[r];let safe=true;
      for (const [key,cat] of catalogs) if(cat.snapshotIds.includes(r.snapshotId)) {
        const deps=[key,...[...records.values()].filter(p=>p.kind==='pointer'&&p.catalog===key).map(id)];
        for(const dep of deps) {
          if(graph.currentMetadata.has(dep))group.push(records.get(dep));
          else if(eligible.has(dep))group.push(eligible.get(dep));
          else {safe=false;break;}
        }
      }
      if(safe)addGroup(group);
    }
  }
  const rank={host:0,pointer:1,catalog:2,snapshot:3,blob_receipt:4,blob:5};
  const ordered = [...actions.values()].sort((a,b) => rank[a.kind]-rank[b.kind]);
  return { schema: 1, at: new Date(now).toISOString(), mode: c.mode, blocked: graph.blocked, observations,
    inventoryHash: input.inventoryHash, sourceHashes: input.sourceHashes, actions: ordered, bytes,
    retainedHostIds: [...graph.keepHost], retainedSnapshotIds: [...graph.keepSnapshot],
    protectedVersionIds: [...graph.protectedVersions], currentMetadata: [...graph.currentMetadata],
    candidateCount: candidates.length, eligibleCount: eligible.size };
}
export function detach(input, p) {
  const host = structuredClone(input.host), attachment = structuredClone(input.attachment);
  const targets = new Set(p.actions.map(id)), removedBlobs = new Set(p.actions.filter(r => r.kind === 'blob').map(r => r.key));
  for (const point of host.points) if (point.objects?.every(o => targets.has(id(o)))) point.status = 'RETIRED';
  // Preserve manifests pinned by older database points even if the attachment
  // writer has already rotated them out of its local lookup table.
  attachment.snapshots = [...input.snapshots.values()].filter(s => !targets.has(id(s.remote)))
    .map(s => ({ id:s.id, at:s.at, complete:true, protected:!!s.protected, remote:s.remote, blobs:s.blobKeys }))
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  for (const s of attachment.snapshots) for (const key of s.blobs) {
    const source = input.snapshots.get(s.id);
    const versions = source.blobs.map(version=>input.records.get(version)).filter(r=>r?.key===key);
    need(versions.length===1, 'DETACH_BLOB_VERSION_AMBIGUOUS');
    const r = versions[0];
    const previous = attachment.receipts[key];
    // A rotating key-index cannot encode two retained versions of one key.
    need(!previous || id(previous)===id(r), 'DETACH_CONFLICTING_RETAINED_BLOB_VERSION');
    need(r?.receipt, 'DETACH_BLOB_RECEIPT_MISSING');attachment.receipts[key]=r.receipt;
  }
  for (const [k,r] of Object.entries(attachment.receipts)) if (removedBlobs.has(r.key)) delete attachment.receipts[k];
  for (const [k,s] of Object.entries(attachment.sources)) if (removedBlobs.has(s.blob)) delete attachment.sources[k];
  for (const [k,blobs] of Object.entries(attachment.blobSets)) if (blobs.some(b => removedBlobs.has(b))) {
    need(!attachment.snapshots.some(s => s.blobSet === k), 'DETACH_REFERENCED_BLOB_REFUSED'); delete attachment.blobSets[k];
  }
  attachment.candidates = {};
  need(host.points.filter(x=>x.status==='VERIFIED').length >= 2 && attachment.snapshots.length >= 2, 'DETACH_MINIMUM_RECOVERY_POINTS_REFUSED');
  return { host, attachment };
}
