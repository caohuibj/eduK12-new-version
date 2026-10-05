import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const digest = data => createHash('sha256').update(data).digest('hex');
export function treeDigest(dir) {
  const hash = createHash('sha256');
  function visit(base, relative = '') {
    for (const entry of readdirSync(base, { withFileTypes: true }).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = relative + entry.name;
      if (name === 'ci-build-manifest.json') continue;
      if (entry.isSymbolicLink()) throw new Error('Build artifacts cannot contain symlinks');
      if (entry.isDirectory()) visit(join(base, entry.name), name + '/');
      else if (entry.isFile()) hash.update(name + '\0' + digest(readFileSync(join(base, entry.name))) + '\0');
      else throw new Error('Unsupported artifact entry');
    }
  }
  visit(dir); return hash.digest('hex');
}
export function verifyManifest(actual, expected, contentDigest) {
  for (const [key, value] of Object.entries(expected))
    if (actual[key] !== value) throw new Error(`Build artifact ${key} mismatch`);
  if (actual.contentDigest !== contentDigest) throw new Error('Build artifact content mismatch');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, kind, directory] = process.argv.slice(2);
  if (!['write','verify'].includes(command) || !['backend','frontend','frontend-ui-lab'].includes(kind))
    throw new Error('Usage: ci-artifact.mjs write|verify backend|frontend|frontend-ui-lab [directory]');
  const root = execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
  const head = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if (process.env.CI !== 'true' || !process.env.GITHUB_RUN_ID || head !== process.env.GITHUB_SHA)
    throw new Error('Artifacts require this Actions run and exact checked-out SHA');
  const component = kind === 'backend' ? 'backend' : 'frontend';
  const dir = resolve(root, directory || `server-version/${component}/dist`);
  const expected = { schemaVersion:1, sha:head, runId:process.env.GITHUB_RUN_ID, kind,
    lockDigest:digest(readFileSync(join(root,`server-version/${component}/package-lock.json`))) };
  const entry = join(dir,component === 'backend' ? 'index.js' : 'index.html');
  if (!readFileSync(entry).length) throw new Error('Missing build entry point');
  const manifest = join(dir,'ci-build-manifest.json');
  const contentDigest = treeDigest(dir);
  if (command === 'write') writeFileSync(manifest, JSON.stringify({...expected,contentDigest},null,2)+'\n');
  else verifyManifest(JSON.parse(readFileSync(manifest,'utf8')), expected, contentDigest);
  console.log(`${command}: ${kind} build bound to ${head} / run ${expected.runId}`);
}
