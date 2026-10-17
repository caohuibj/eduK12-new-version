import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const manifestPath = '.github/scripts/reviewed-candidate-source.json';
const manifest = JSON.parse(readFileSync(new URL('./reviewed-candidate-source.json', import.meta.url), 'utf8'));
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const reviewedCandidateRequired = ['official-input-bound-evidence','training-runtime-browser','scale-runtime-race','changed-tool-contracts','tool-sast'];
// Every entry is required in the complete base-to-head diff. This is deliberately
// an exact tool set, never permission for a directory or for new application code.
export const reviewedCandidateTools = Object.freeze([
  manifestPath,
  '.github/scripts/reviewed-candidate-scope.mjs',
  '.github/scripts/reviewed-candidate-scope.test.mjs',
  '.github/scripts/reviewed-candidate-admission.py',
  '.github/scripts/reviewed-candidate-admission.test.py',
  '.github/scripts/reviewed-candidate-browser.mjs',
  '.github/scripts/reviewed-candidate-scale-race.cjs',
  '.github/scripts/content-scope.mjs',
  '.github/scripts/merge-gate.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/ci-reviewed-candidate.yml',
  'docs/release/README.md',
]);
const tools = new Set(reviewedCandidateTools);
const regular = entry => entry?.newMode === '100644'
  && ((entry.status === 'A' && entry.oldMode === '000000')
    || (entry.status === 'M' && entry.oldMode === '100644'));
function boundary(entries) {
  const files = Object.keys(manifest.files ?? {});
  if (manifest.schema !== 1 || !files.length || !sha(manifest.base)
      || !sha(manifest.source?.head) || !sha(manifest.source?.tree)
      || !same(manifest.required, reviewedCandidateRequired)
      || !['frontend','backend'].every(component => sha(manifest.components?.[component]))
      || !Array.isArray(entries) || entries.length !== files.length + tools.size
      || files.some(file => tools.has(file))) return false;
  const seen = new Set();
  for (const entry of entries) {
    if (!regular(entry) || seen.has(entry.file)) return false;
    seen.add(entry.file);
    if (Object.hasOwn(manifest.files, entry.file)) {
      const binding = manifest.files[entry.file];
      if (!sha(binding.after) || !(binding.before === null || sha(binding.before))
          || !['status','oldMode','newMode'].every(key => entry[key] === binding[key])
          || (binding.before === null) !== (entry.status === 'A')) return false;
    } else if (!tools.has(entry.file)) return false;
  }
  return [...files, ...tools].every(file => seen.has(file));
}
const git = (ref, file) => execFileSync('git', ['rev-parse', `${ref}:${file}`], {encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();

export function reviewedCandidatePlan(entries, base, head, read = git) {
  if (!sha(base) || !sha(head) || base !== manifest.base || !boundary(entries)) return null;
  try {
    for (const [file, binding] of Object.entries(manifest.files)) {
      if (read(head, file) !== binding.after
          || (binding.before !== null && read(base, file) !== binding.before)) return null;
    }
    // Whole component trees bind dependencies, config, Dockerfiles and unchanged
    // application files as well as the explicit source patch.
    for (const component of ['frontend','backend'])
      if (read(head, `server-version/${component}`) !== manifest.components[component]) return null;
    for (const [file, blob] of Object.entries(manifest.unchangedConsumers ?? {}))
      if (!sha(blob) || read(base, file) !== blob || read(head, file) !== blob) return null;
    const tree = read(head, ''), manifestBlob = read(head, manifestPath);
    if (!sha(tree) || !sha(manifestBlob)) return null;
    return {schema:1, route:'reviewed-candidate', base, head, tree,
      source:manifest.source, manifestBlob, changes:entries, changed:['frontend','backend'],
      components:manifest.components, required:reviewedCandidateRequired};
  } catch { return null; }
}

// Shape checks here are additional to real-checkout recomputation at merge time.
// The admission worker separately authenticates source ancestry, the PR merge
// tree and official Actions receipts; a plan is never evidence of their success.
export function validReviewedCandidatePlan(plan) {
  return Boolean(plan && plan.schema === 1 && plan.route === 'reviewed-candidate'
    && plan.base === manifest.base && sha(plan.head) && sha(plan.tree) && sha(plan.manifestBlob)
    && same(plan.source, manifest.source) && same(plan.components, manifest.components)
    && same(plan.changed, ['frontend','backend']) && same(plan.required, reviewedCandidateRequired)
    && boundary(plan.changes));
}
