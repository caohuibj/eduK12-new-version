import { execFileSync } from 'node:child_process';

const roots = ['server-version/backend', 'server-version/frontend'];
const manifests = new Set(roots.flatMap(root => [root+'/package.json',root+'/package-lock.json']));
const policy = new Set(['AGENTS.md','docs/ci-runner-policy.md',
  '.github/workflows/ci.yml','.github/workflows/ci-maintenance.yml',
  '.github/scripts/content-scope.mjs','.github/scripts/content-scope.test.mjs',
  '.github/scripts/merge-gate.mjs','.github/scripts/content-workflows.test.mjs',
  '.github/scripts/maintenance-routing.test.mjs',
  '.github/scripts/dependency-scope.mjs','.github/scripts/dependency-routing.test.mjs']);
const sections = ['dependencies','devDependencies','optionalDependencies','overrides'];
const clean = value => value && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(v=>JSON.parse(canonical(v)))
  : clean(value) ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])) : value);
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
const version = value => typeof value === 'string' && /^[~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);

export function dependencyFile(file) {
  if (typeof file !== 'string' || /[\\\x00-\x1f\x7f]/.test(file)
      || file.split('/').some(part=>!part || part==='.' || part==='..')) return false;
  return manifests.has(file) || policy.has(file)
    || /^server-version\/backend\/src\/__tests__\/[^\x00-\x1f\\]+\.test\.tsx?$/.test(file)
    || /^server-version\/frontend\/src\/(?:[^/]+\/)*__tests__\/[^\x00-\x1f\\]+\.test\.tsx?$/.test(file);
}

export function manifestDependencyOnly(before, after, oldLock, newLock) {
  if (![before,after,oldLock,newLock].every(clean)
      || canonical(omit(before,sections)) !== canonical(omit(after,sections))
      || oldLock.lockfileVersion !== 3 || newLock.lockfileVersion !== 3
      || canonical(omit(oldLock,['packages'])) !== canonical(omit(newLock,['packages']))
      || !clean(oldLock.packages) || !clean(newLock.packages)
      || !clean(oldLock.packages['']) || !clean(newLock.packages[''])
      || canonical(omit(oldLock.packages[''],sections)) !== canonical(omit(newLock.packages[''],sections))) return false;
  for (const section of sections) {
    const old = before[section] ?? {}, next = after[section] ?? {};
    if (!clean(old) || !clean(next)) return false;
    for (const [name,spec] of Object.entries(old)) if (!Object.hasOwn(next,name)) return false;
    for (const [name,spec] of Object.entries(next)) {
      if (canonical(spec) === canonical(old[name] ?? null)) continue;
      if (!version(spec)) return false;
      if (!Object.hasOwn(old,name) && section !== 'devDependencies'
          && !(section === 'overrides' && Object.hasOwn(oldLock.packages,'node_modules/'+name))) return false;
    }
    // npm ci is still mandatory; reject a root lock discrepancy before routing.
    if (section !== 'overrides' && canonical(next) !== canonical(newLock.packages[''][section] ?? {})) return false;
  }
  return true;
}

export function dependencyScope(entries, {base,head='HEAD'}) {
  if (!entries.length || !entries.some(({file})=>manifests.has(file))
      || !entries.every(({file,status,oldMode,newMode})=>dependencyFile(file)
        && !file.split('/').some(part=>!part || part==='.' || part==='..')
        && newMode==='100644' && ((status==='M' && oldMode==='100644')
          || (status==='A' && oldMode==='000000' && policy.has(file))))) return false;
  if (!/^[a-f0-9]{40}$/.test(base) || (head!=='HEAD' && !/^[a-f0-9]{40}$/.test(head))) throw new Error('Exact dependency diff commits required');
  const read = (sha,file) => JSON.parse(execFileSync('git',['show',sha+':'+file],{encoding:'utf8',maxBuffer:16*1024*1024}));
  for (const root of roots) {
    if (!entries.some(({file})=>file.startsWith(root+'/package'))) continue;
    const changed = new Set(entries.map(({file})=>file));
    if (changed.has(root+'/package.json') && !changed.has(root+'/package-lock.json')) return false;
    if (!manifestDependencyOnly(read(base,root+'/package.json'),read(head,root+'/package.json'),
      read(base,root+'/package-lock.json'),read(head,root+'/package-lock.json'))) return false;
  }
  return true;
}
