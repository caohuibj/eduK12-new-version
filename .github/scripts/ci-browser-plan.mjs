import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// The merged browser result cannot be green if a caller narrows the scenario
// matrix. The exact set is deliberately fixed; each group must execute on its
// own ephemeral Hosted runner and fresh PostgreSQL/Redis service pair.
export const requiredBrowserGroups = Object.freeze(['foundation','products','security']);
export function validateBrowserGroups(raw) {
  const groups=typeof raw === 'string' ? JSON.parse(raw) : raw;
  assert.deepEqual(groups,requiredBrowserGroups,'All independent browser scenario groups must run');
  return groups;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateBrowserGroups(process.env.CI_BROWSER_GROUPS);
  console.log('browser group matrix complete:',requiredBrowserGroups.join(','));
}
