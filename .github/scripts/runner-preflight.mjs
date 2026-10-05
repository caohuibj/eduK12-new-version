import { statfsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { totalmem, platform } from 'node:os';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';

export function resourceErrors({ environment, os, freeBytes, memoryBytes, light }) {
  if (environment !== 'self-hosted') return [];
  const errors=[];
  if (!light && os !== 'linux') errors.push('Heavy jobs require a Linux runner with Docker');
  if (freeBytes < (light ? 2 : 20) * 1024 ** 3) errors.push('Insufficient CI disk headroom');
  if (memoryBytes < (light ? 2 : 6) * 1024 ** 3) errors.push('Insufficient CI memory capacity');
  return errors;
}
// systemd/WSL can expose 10 GiB to os.totalmem while limiting this service to 5 GiB.
// Apply every visible ancestor limit, including the cgroup namespace root.
export function effectiveMemory(total, cgroups, read = path => readFileSync(path, 'utf8')) {
  let memory = total;
  for (const record of cgroups.trim().split('\n')) {
    const match = /^([^:]*):([^:]*):(\/.*)$/.exec(record);
    if (!match) throw new Error('Malformed cgroup membership');
    const v2 = match[1] === '0' && match[2] === '';
    if (!v2 && !match[2].split(',').includes('memory')) continue;
    if (match[3].split('/').includes('..')) throw new Error('Invalid cgroup path');
    let group = posix.normalize(match[3]);
    for (;;) {
      const file = v2
        ? posix.join('/sys/fs/cgroup', group, 'memory.max')
        : posix.join('/sys/fs/cgroup/memory', group, 'memory.limit_in_bytes');
      let value;
      try { value = read(file).trim(); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (value && value !== 'max') {
        if (!/^\d+$/.test(value)) throw new Error('Invalid cgroup memory limit');
        memory = Math.min(memory, Number(value));
      }
      if (group === '/') break;
      group = posix.dirname(group);
    }
  }
  return memory;
}
export async function requireFreePort(port) {
  const server=createServer();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if(process.env.CI !== 'true') throw new Error('Runner preflight is CI-only');
  const disk=statfsSync(process.cwd());
  const light=process.argv.includes('--light');
  const resources={environment:process.env.RUNNER_ENVIRONMENT,os:platform(),
    freeBytes:disk.bavail*disk.bsize,memoryBytes:platform() === 'linux'
      ? effectiveMemory(totalmem(), readFileSync('/proc/self/cgroup', 'utf8')) : totalmem(),light};
  console.log(JSON.stringify({ ...resources, runner:process.env.RUNNER_NAME, cpus:process.env.RUNNER_ARCH }));
  const errors=resourceErrors(resources);
  if(errors.length) throw new Error(errors.join('; '));
  // Never accept a leftover API/preview process as this run's freshly tested app.
  // Do not kill unrelated processes; fail and require isolated-environment cleanup.
  if(resources.environment === 'self-hosted' && !light)
    for(const port of [3000,5173]) await requireFreePort(port);
}
