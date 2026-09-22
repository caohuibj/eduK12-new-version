import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const match = require('../../server-version/backend/node_modules/picomatch');
function triggered(workflow, files) {
  const text = fs.readFileSync(new URL(`../workflows/${workflow}.yml`, import.meta.url), 'utf8');
  const paths = [...text.split('  workflow_dispatch:')[0].matchAll(/^      - '([^']+)'$/gm)].map(row => row[1]);
  return files.some(file => paths.reduce((included, pattern) => {
    const exclude = pattern.startsWith('!');
    return match(exclude ? pattern.slice(1) : pattern)(file) ? !exclude : included;
  }, false));
}
test('Cognitive declarations cannot trigger the independent video gate', () => {
  const workflow = 'media-7-cross-runtime-acceptance';
  const root = 'server-version/backend/src/modules/cognitive/';
  for (const file of ['seeds', 'participant-presentation', 'governance', 'scientific']) {
    assert.equal(triggered(workflow, [`${root}tasks/STROOP/${file}.ts`]), false);
  }
  assert.equal(triggered(workflow, [`${root}tasks/STROOP/seeds.ts`, `${root}tasks/STROOP/package.ts`]), true);
  assert.equal(triggered(workflow, [`.github/workflows/${workflow}.yml`]), true);
});
test('SJT content is targeted, while runtime and mixed changes retain browser gates', () => {
  const root = 'server-version/backend/src/modules/situational/';
  for (const workflow of ['situational-branching-acceptance', 'situational-video-acceptance']) {
    const files = ['instrument','publication','scientific'].map(name => `${root}instruments/example/1.0.0/${name}.json`);
    files.push(`${root}onboarding/instruments.generated.ts`);
    assert.equal(triggered(workflow, files), false);
    assert.equal(triggered(workflow, [...files, `${root}situational-final-submit.service.ts`]), true);
    assert.equal(triggered(workflow, [`.github/workflows/${workflow}.yml`]), true);
  }
});
