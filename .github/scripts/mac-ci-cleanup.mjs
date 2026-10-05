import { lstatSync, readdirSync, rmSync, readFileSync, writeFileSync, realpathSync, truncateSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, platform, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const MiB = 1024 ** 2;
function exists(path) { try { return lstatSync(path); } catch (e) { if(e.code === 'ENOENT') return null; throw e; } }
export function bytes(path) {
  const stat = exists(path);
  if (!stat || stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + bytes(join(path, name)), 0);
}
export function boundedCache(path, { maxBytes, maxAgeMs, now = Date.now() }) {
  const stat = exists(path);
  if (!stat) return { removedBytes: 0 };
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(path) !== resolve(path)) throw new Error('Cache root must be a real directory');
  const marker = path + '.last-cleaned';
  if(exists(marker)?.isSymbolicLink()) throw new Error('Cache marker cannot be a symlink');
  let maintained = now;
  try { maintained = Number(readFileSync(marker, 'utf8')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  if (!Number.isFinite(maintained)) maintained = 0;
  const size = bytes(path);
  const remove = size > maxBytes || now - maintained >= maxAgeMs;
  if (remove) rmSync(path, {recursive: true, force: true});
  if (remove || !exists(marker)) writeFileSync(marker, String(now), { mode: 0o600 });
  return { removedBytes: remove ? size : 0, retainedBytes: remove ? 0 : size };
}
export function assertDedicatedHome(home, user) {
  if (home !== '/Users/eduk12ci' || user !== 'eduk12ci')
    throw new Error('Cleanup is restricted to the dedicated Mac CI account');
}
export function assertWorkspace(home, workspace) {
  const root = join(home, 'actions-runner', '_work');
  const relative = resolve(workspace).slice(root.length + 1).split('/');
  if (!resolve(workspace).startsWith(root + '/') || relative.length !== 2 || relative.some(p => !p || p.startsWith('_')))
    throw new Error('Cleanup requires the exact nested Actions checkout');
}
export function removeExpired(path, maxAgeMs, now = Date.now()) {
  const stat = exists(path);
  if (!stat) return;
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(path) !== resolve(path)) throw new Error('Cleanup root must be a real directory');
  for (const name of readdirSync(path)) {
    const child = join(path,name), item = lstatSync(child);
    if (now-item.mtimeMs >= maxAgeMs) rmSync(child, {recursive:true,force:true});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (platform() !== 'darwin') throw new Error('Mac CI cleanup only');
  const home = homedir(); assertDedicatedHome(home, userInfo().username);
  if (realpathSync(home) !== home) throw new Error('CI home cannot be a symlink');
  const idle = process.argv.includes('--idle');
  if (idle) {
    try { execFileSync('pgrep',['-u',String(userInfo().uid),'-f','Runner.Worker'],{stdio:'ignore'}); process.exit(0); }
    catch(e) { if(e.status !== 1) throw e; }
  } else {
    if (process.env.CI !== 'true' || !process.env.GITHUB_WORKSPACE) throw new Error('Post-job cleanup requires Actions');
    const workspace = realpathSync(process.env.GITHUB_WORKSPACE); assertWorkspace(home, workspace);
    for(const component of ['frontend','backend']) {
      const base = join(workspace,'server-version',component);
      if(exists(base) && realpathSync(base) !== base) throw new Error('Project root cannot be a symlink');
      for(const name of ['node_modules','dist']) rmSync(join(base,name),{recursive:true,force:true});
    }
  }
  if (!idle) {
    const browser = join(realpathSync(process.env.GITHUB_WORKSPACE),'ci','browser');
    if(exists(browser) && realpathSync(browser) !== browser) throw new Error('Browser runtime root cannot be a symlink');
    rmSync(join(browser,'node_modules'),{recursive:true,force:true});
  }
  const week = 7*24*3600*1000;
  const results = {
    browsers: boundedCache(join(home,'.cache','eduk12-ci-browsers'),{maxBytes:1536*MiB,maxAgeMs:week}),
    npm: boundedCache(join(home,'.npm','_cacache'),{maxBytes:512*MiB,maxAgeMs:week}),
  };
  removeExpired(join(home,'.npm','_logs'),week);
  if(idle) {
    results.tools = boundedCache(join(home,'actions-runner','_work','_tool'),{maxBytes:512*MiB,maxAgeMs:week});
    results.actions = boundedCache(join(home,'actions-runner','_work','_actions'),{maxBytes:256*MiB,maxAgeMs:week});
    removeExpired(join(home,'actions-runner','_work','_temp'),24*3600*1000);
    removeExpired(join(home,'actions-runner','_diag'),week);
    for(const name of ['runner.stdout.log','runner.stderr.log','maintenance.stdout.log','maintenance.stderr.log']) {
      const path=join(home,'logs',name); if(exists(path)?.isFile() && bytes(path)>16*MiB) truncateSync(path,0);
    }
  }
  if (!idle) {
    const target = join(home,'tools','mac-ci-cleanup.mjs');
    const stat = exists(target);
    if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.uid !== userInfo().uid || realpathSync(join(home,'tools')) !== join(home,'tools'))
      throw new Error('Hourly maintenance must be an existing CI-account-owned regular file');
    const source = readFileSync(fileURLToPath(import.meta.url),'utf8');
    if (readFileSync(target,'utf8') !== source) {
      const temporary = target + '.next-' + process.pid;
      writeFileSync(temporary,source,{mode:0o600,flag:'wx'});
      renameSync(temporary,target);
    }
    results.hourlyMaintenance = 'updated for bounded browser cache cleanup';
  }
  console.log(JSON.stringify({ cleanup:'dedicated Mac CI only', ...results }));
}
