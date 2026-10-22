import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

export const followupPath = '.github/scripts/training-followup-bindings.json';
export const followup = JSON.parse(readFileSync(new URL('./training-followup-bindings.json', import.meta.url)));
const git = (...args) => execFileSync('git', args, {encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');

// A new exact candidate; the earlier Training candidates retain their own rules.
export function trainingFollowupPlan(entries, base, head, read = git) {
  if (!entries.some(entry => entry.file === followupPath)) return null;
  if (!sha(head) || base !== followup.base || !['pull_request','push'].includes(process.env.CI_EVENT || 'pull_request') || process.env.CI_FORCE_FULL === 'true') throw Error('Training follow-up requires the frozen base and a bounded PR event');
  const expected = new Set([...Object.keys(followup.source), ...followup.controls]);
  if (expected.size !== Object.keys(followup.source).length + followup.controls.length || entries.length !== expected.size || new Set(entries.map(entry => entry.file)).size !== entries.length) throw Error('Incomplete Training follow-up diff');
  for (const entry of entries) {
    if (!expected.has(entry.file) || entry.newMode !== '100644' || !((entry.status === 'A' && entry.oldMode === '000000') || (entry.status === 'M' && entry.oldMode === '100644'))) throw Error('Unknown Training follow-up path or mode: '+entry.file);
    const binding = followup.source[entry.file];
    if (binding && (entry.status !== (binding.before ? 'M' : 'A') || read('rev-parse', head+':'+entry.file) !== binding.after || read('rev-parse', followup.product+':'+entry.file) !== binding.after || (binding.before && read('rev-parse', base+':'+entry.file) !== binding.before))) throw Error('Training follow-up product drift: '+entry.file);
  }
  if (entries.find(entry => entry.file === followupPath)?.status !== 'A') throw Error('Training follow-up binding must be new');
  for (const component of ['frontend','backend']) if (read('rev-parse',head+':server-version/'+component) !== followup.components[component]) throw Error('Training follow-up component drift');
  return {schema:1, route:'training-workspace', candidate:'mac-followup', base, head, product:followup.product, sourceCount:Object.keys(followup.source).length, components:followup.components, changes:entries};
}
