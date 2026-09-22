import test from 'node:test';
import assert from 'node:assert/strict';
import { isDataModule } from './cognitive-content.mjs';
test('allows typed literal content and local constant reuse', () => {
  assert.equal(isDataModule("import type { Seed } from './types'; const defaults = {count: 2}; export const seeds: Seed[] = [{ ...defaults, name: 'test', enabled: true }]"), true);
});
test('rejects executable code, accessors and runtime imports in content files', () => {
  for (const code of ["import './side-effect'", 'export const x = fetch("url")', 'export const x = Date.now()',
    'export const x = { get value() { return 1 } }', 'export const x = process.env', 'while (true) {}', 'export const x = () => 1',
    'export const x = {[danger()]: 1}', 'export const x = unknown', 'export const x = ;']) assert.equal(isDataModule(code), false, code);
});
