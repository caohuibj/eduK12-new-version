import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const modules = 'server-version/backend/src/modules/';
// Only established content surfaces qualify. New engines, scorers, runners,
// shared helpers, dependencies and CI changes require the full gate.
export function domainFor(file) {
  if (typeof file !== 'string' || file.split('/').some(part => !part || part === '..' || part === '.')
      || /[\\\x00-\x1f\x7f]/.test(file)) return null;
  if (new RegExp(`^${modules}assessment-bundle/packages/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+/(manifest|evidence-map|rules|report|scientific|publication|context)\\.json$`).test(file)
      || new RegExp(`^${modules}assessment-bundle/packages/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+/fixtures/(valid|missing|invalid|not-applicable)\\.json$`).test(file)
      || new RegExp(`^${modules}assessment-bundle/ci-fixtures/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+\\.json$`).test(file)
      || file === `${modules}assessment-bundle/generated/packages.json`) return 'bundle';
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

// Parse the full raw diff so a content-looking path never hides a deletion,
// symlink, executable file or Git object type change. Reject unexpected records.
export function parseChangedEntries(raw) {
  if (!raw) return [];
  if (!raw.endsWith('\0')) throw new Error('Malformed Git diff terminator');
  const fields = raw.slice(0, -1).split('\0');
  if (fields.length % 2) throw new Error('Malformed Git diff record');
  const entries = [];
  for (let i = 0; i < fields.length; i += 2) {
    const match = /^:([0-7]{6}) ([0-7]{6}) [a-f0-9]{40} [a-f0-9]{40} ([AMDT])$/.exec(fields[i]);
    if (!match || !fields[i + 1]) throw new Error('Unsupported Git diff record');
    entries.push({ file: fields[i + 1], oldMode: match[1], newMode: match[2], status: match[3] });
  }
  return entries;
}

export function classifyChanges(entries, forceFull = false) {
  const result = classify(entries.map(entry => entry.file));
  const regularChanges = entries.every(({ status, oldMode, newMode }) =>
    newMode === '100644' && ((status === 'A' && oldMode === '000000')
      || (status === 'M' && oldMode === '100644')));
  return { ...result, content: !forceFull && result.content && regularChanges };
}

export function changedEntries(base, head = 'HEAD') {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('A full base SHA is required');
  if (head !== 'HEAD' && !/^[a-f0-9]{40}$/.test(head)) throw new Error('A full head SHA or HEAD is required');
  // --no-renames retains both sides; NUL handles unusual filenames. Explicit
  // format/algorithm flags prevent local Git configuration changing the input.
  return parseChangedEntries(execFileSync('git', ['diff', '--no-ext-diff', '--no-textconv',
    '--no-renames', '--raw', '--abbrev=40', '-z', base, head, '--'], { encoding: 'utf8' }));
}

export function changedFiles(base, head = 'HEAD') {
  return changedEntries(base, head).map(entry => entry.file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.CI_EVENT;
  const base = process.env.CI_BASE_SHA;
  const result = event === 'workflow_dispatch' ? { content: false, domains: [] } : classifyChanges(changedEntries(base), process.env.CI_FORCE_FULL === 'true');
  const output = { content: result.content, scale: result.domains.includes('scale'), cognitive: result.domains.includes('cognitive'), situational: result.domains.includes('situational'), bundle: result.domains.includes('bundle') };
  console.log(JSON.stringify({ ...output, base, validationClosure: 'all-bundles',
    reason: result.content ? 'allowlisted regular content files' : 'platform, manual override, empty or non-regular changes' }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
}
