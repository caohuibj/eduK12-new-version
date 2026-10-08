import test from 'node:test';import assert from 'node:assert/strict';
import {uiScenarios}from './ci-ui-scenarios.mjs';
test('separate Chromium stages cover every former suite exactly once',()=>{
 const expected=uiScenarios('canonical','chromium');const split=['round5','screenshots','interactions'].flatMap(g=>uiScenarios('canonical','chromium',g));
 assert.equal(split.length,9);assert.equal(new Set(split.map(x=>x.file)).size,9);assert.deepEqual(split.map(x=>x.file).sort(),expected.map(x=>x.file).sort());
 assert.equal(uiScenarios('app-shell','chromium').length,1);
});
test('Firefox and WebKit retain the entire canonical suite',()=>{
 for(const engine of ['firefox','webkit']){const items=uiScenarios('canonical',engine);assert.equal(items.length,6);assert.ok(items.every(x=>x.engine===engine));assert.ok(items.some(x=>x.file==='qa-round5-workbench-browser-e2e.cjs'));}
 assert.equal(uiScenarios('canonical','all').length,21);
});
test('wrong engine or group fails rather than silently dropping coverage',()=>{
 for(const args of [['canonical','firefox','screenshots'],['app-shell','webkit'],['canonical','unknown'],['canonical','chromium','missing'],['wrong','chromium']])assert.throws(()=>uiScenarios(...args));
});
