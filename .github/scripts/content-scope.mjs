import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const modules = 'server-version/backend/src/modules/';
// Only established content surfaces qualify. New engines, scorers, runners,
// shared helpers, dependencies and CI changes require the full gate.
export function domainFor(file) {
  if (file.split('/').some(part => part === '..' || part === '.') || file.includes('\\')) return null;
  if (new RegExp(`^${modules}scale/instruments/[^/]+/[^/]+/`).test(file)
      || file === `${modules}scale/onboarding/instruments.generated.ts`
      || file.startsWith('server-version/backend/src/__tests__/scale/instruments/')
      || file.startsWith('docs/scale-instruments/')) return 'scale';
  if (new RegExp(`^${modules}situational/instruments/[^/]+/[^/]+/(instrument|publication|scientific)\\.json$`).test(file)
      || file === `${modules}situational/onboarding/instruments.generated.ts`) return 'situational';
  if (new RegExp(`^${modules}cognitive/tasks/[^/]+/(seeds|participant-presentation|governance|scientific)\\.ts$`).test(file)) return 'cognitive';
  return null;
}

export function classify(files) {
  const domains = [...new Set(files.map(domainFor).filter(Boolean))].sort();
  return { content: files.length > 0 && files.every(domainFor), domains };
}

export function changedFiles(base, head = 'HEAD') {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('A full base SHA is required');
  // --no-renames includes both sides of moves, so moving core code into a
  // content directory cannot accidentally qualify. NUL handles unusual names.
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head],
    { encoding: 'utf8' }).split('\0').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.CI_EVENT;
  const base = process.env.CI_BASE_SHA;
  const result = event === 'workflow_dispatch' ? { content: false, domains: [] } : classify(changedFiles(base));
  const output = { content: result.content, scale: result.domains.includes('scale'), cognitive: result.domains.includes('cognitive'), situational: result.domains.includes('situational') };
  console.log(JSON.stringify({ ...output, base }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
}
