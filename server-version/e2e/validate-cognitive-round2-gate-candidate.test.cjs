const assert = require('assert/strict')
const test = require('node:test')

const { candidateResourceIds, validateCandidatePackage } = require('./validate-cognitive-round2-gate-candidate.cjs')

test('accepts only exact manifest candidate package resources', () => {
  const candidates = candidateResourceIds()
  assert.ok(candidates.length >= 2)
  assert.equal(validateCandidatePackage(candidates[0]), candidates[0])
})

test('rejects an unrelated or malformed package resource', () => {
  for (const value of ['future_package_v1@1.0.0', 'attention_stability_v1', 'attention_stability_v1@9.9.9']) {
    assert.throws(() => validateCandidatePackage(value), /candidate package|resource id/)
  }
})
