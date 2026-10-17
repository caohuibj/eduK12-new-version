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
const patchPaths = Object.freeze([
  'server-version/frontend/src/pages/ScaleEdit.tsx',
  'server-version/frontend/src/pages/ScaleEdit.css',
]);
const testFixPaths = Object.freeze([
  'server-version/frontend/src/pages/__tests__/TrainingTaskDeepLinks.test.tsx',
  'server-version/e2e/visual-interaction-states-browser-e2e.cjs',
]);
const currentComponents = () => ({...manifest.components, frontend:manifest.testFix?.afterTree});
function validPatch() {
  const patch = manifest.frontendPatch;
  if (!patch || patch.beforeTree !== manifest.components.frontend || !sha(patch.afterTree)
      || patch.beforeTree === patch.afterTree
      || !same(Object.keys(patch.files ?? {}).sort(), [...patchPaths].sort())) return false;
  for (const [file, binding] of Object.entries(patch.files)) {
    const original = manifest.files[file];
    if (!sha(binding.after) || binding.after === binding.before
        || binding.before !== (original?.after ?? null)
        || !regular(binding)
        || (original ? binding.status !== 'M' : binding.status !== 'A')) return false;
  }
  return true;
}
function validTestFix() {
  const fix = manifest.testFix, assembly = manifest.frontendAssemblyReceipt;
  if (!fix || fix.beforeTree !== manifest.frontendPatch?.afterTree || !sha(fix.afterTree)
      || fix.beforeTree === fix.afterTree
      || !same(Object.keys(fix.files ?? {}).sort(), [...testFixPaths].sort())
      || !assembly || !sha(assembly.head) || !sha(assembly.tree) || !sha(assembly.mergeHead)
      || assembly.base !== manifest.base || assembly.componentTree !== fix.beforeTree
      || !/^sha256:[a-f0-9]{64}$/.test(assembly.imageId ?? '')) return false;
  for (const [file, binding] of Object.entries(fix.files)) {
    const original = manifest.files[file];
    if (!sha(binding.before) || !sha(binding.after) || binding.before === binding.after
        || binding.status !== 'M' || !regular(binding)
        || Object.hasOwn(manifest.frontendPatch.files, file)
        || (original && binding.before !== original.after)) return false;
  }
  return true;
}
function validQualification() {
  const receipt = manifest.qualificationReceipt;
  return Boolean(receipt && sha(receipt.head) && sha(receipt.tree) && sha(receipt.mergeHead)
    && receipt.base === manifest.base && receipt.frontendTree === manifest.testFix.afterTree
    && receipt.backendTree === manifest.components.backend);
}
const sourceBindings = () => ({...manifest.files,
  ...Object.fromEntries(Object.entries(manifest.frontendPatch?.files ?? {}).filter(([file]) => !Object.hasOwn(manifest.files, file))),
  ...Object.fromEntries(Object.entries(manifest.testFix?.files ?? {}).filter(([file]) => !Object.hasOwn(manifest.files, file)))});
const regular = entry => entry?.newMode === '100644'
  && ((entry.status === 'A' && entry.oldMode === '000000')
    || (entry.status === 'M' && entry.oldMode === '100644'));
function boundary(entries) {
  const bindings = sourceBindings(), files = Object.keys(bindings);
  if (manifest.schema !== 1 || !files.length || !validPatch() || !validTestFix() || !validQualification() || !sha(manifest.base)
      || !sha(manifest.source?.head) || !sha(manifest.source?.tree)
      || !same(manifest.required, reviewedCandidateRequired)
      || !['frontend','backend'].every(component => sha(manifest.components?.[component]))
      || !Array.isArray(entries) || entries.length !== files.length + tools.size
      || files.some(file => tools.has(file))) return false;
  const seen = new Set();
  for (const entry of entries) {
    if (!regular(entry) || seen.has(entry.file)) return false;
    seen.add(entry.file);
    if (Object.hasOwn(bindings, entry.file)) {
      const binding = bindings[entry.file];
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
    const assembly = manifest.frontendAssemblyReceipt;
    for (const [file, binding] of Object.entries(manifest.files)) {
      const assembled = manifest.frontendPatch.files[file]?.after ?? binding.after;
      const after = manifest.testFix.files[file]?.after ?? assembled;
      if (read(head, file) !== after || read(manifest.source.head, file) !== binding.after
          || read(assembly.head, file) !== assembled
          || (binding.before !== null && read(base, file) !== binding.before)) return null;
    }
    for (const [file, binding] of Object.entries(manifest.frontendPatch.files)) {
      if (read(head, file) !== binding.after || read(assembly.head, file) !== binding.after) return null;
      if (binding.before === null) {
        // A patch-only path must be absent in both original source and main.
        for (const ref of [manifest.source.head, base]) {
          let present = false;
          try { present = Boolean(read(ref, file)); } catch { /* absent Git path */ }
          if (present) return null;
        }
      } else if (read(manifest.source.head, file) !== binding.before) return null;
    }
    for (const [file, binding] of Object.entries(manifest.testFix.files)) {
      if (read(head, file) !== binding.after || read(assembly.head, file) !== binding.before
          || read(manifest.source.head, file) !== binding.before) return null;
      // A test-only path not in the original 49-file diff must already have
      // exactly these bytes in main; it is not an unreviewed new application path.
      if (!Object.hasOwn(manifest.files, file) && read(base, file) !== binding.before) return null;
    }
    // Original receipts and the successful runtime assembly retain their exact
    // original trees. Only these two test files may differ at the current head.
    if (read(assembly.head, '') !== assembly.tree
        || read(assembly.head, 'server-version/frontend') !== manifest.frontendPatch.afterTree
        || read(assembly.head, 'server-version/backend') !== manifest.components.backend) return null;
    const qualification = manifest.qualificationReceipt;
    if (read(qualification.head, '') !== qualification.tree
        || read(qualification.head, 'server-version/frontend') !== qualification.frontendTree
        || read(qualification.head, 'server-version/backend') !== qualification.backendTree) return null;
    for (const component of ['frontend','backend']) {
      const file = `server-version/${component}`;
      if (read(manifest.source.head, file) !== manifest.components[component]
          || read(head, file) !== currentComponents()[component]) return null;
    }
    for (const [file, blob] of Object.entries(manifest.unchangedConsumers ?? {}))
      if (!sha(blob) || read(base, file) !== blob || read(head, file) !== blob) return null;
    const tree = read(head, ''), manifestBlob = read(head, manifestPath);
    if (!sha(tree) || !sha(manifestBlob)) return null;
    return {schema:1, route:'reviewed-candidate', base, head, tree,
      source:manifest.source, manifestBlob, changes:entries, changed:['frontend','backend'],
      components:currentComponents(), frontendPatch:manifest.frontendPatch, testFix:manifest.testFix,
      frontendAssemblyReceipt:manifest.frontendAssemblyReceipt, qualificationReceipt:manifest.qualificationReceipt,
      raceReceipt:manifest.raceReceipt, required:reviewedCandidateRequired};
  } catch { return null; }
}

// Shape checks here are additional to real-checkout recomputation at merge time.
// The admission worker separately authenticates source ancestry, the PR merge
// tree and official Actions receipts; a plan is never evidence of their success.
export function validReviewedCandidatePlan(plan) {
  return Boolean(plan && plan.schema === 1 && plan.route === 'reviewed-candidate'
    && plan.base === manifest.base && sha(plan.head) && sha(plan.tree) && sha(plan.manifestBlob)
    && same(plan.source, manifest.source) && same(plan.components, currentComponents())
    && same(plan.frontendPatch, manifest.frontendPatch) && same(plan.raceReceipt, manifest.raceReceipt)
    && same(plan.testFix, manifest.testFix) && same(plan.frontendAssemblyReceipt, manifest.frontendAssemblyReceipt)
    && same(plan.qualificationReceipt, manifest.qualificationReceipt)
    && same(plan.changed, ['frontend','backend']) && same(plan.required, reviewedCandidateRequired)
    && boundary(plan.changes));
}
