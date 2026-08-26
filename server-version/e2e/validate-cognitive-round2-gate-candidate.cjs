const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

const MANIFEST_FILE = path.join(__dirname, 'cognitive-round2-gate-manifest.json')
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))

const candidateResourceIds = () => {
  assert.ok(Array.isArray(MANIFEST.candidatePackages), 'Gate manifest candidatePackages is required')
  const ids = MANIFEST.candidatePackages.map((item) => `${item.key}@${item.version}`)
  assert.equal(new Set(ids).size, ids.length, 'Gate manifest candidatePackages contains duplicates')
  return ids
}

const validateCandidatePackage = (resourceId) => {
  assert.equal(typeof resourceId, 'string', 'candidate package resource id is required')
  assert.match(resourceId, /^[^@]+@[^@]+$/, 'candidate package resource id must be key@version')
  assert.ok(candidateResourceIds().includes(resourceId), `candidate package is not in the reviewed manifest: ${resourceId}`)
  return resourceId
}

if (require.main === module) {
  validateCandidatePackage(process.argv[2])
  console.log(process.argv[2])
}

module.exports = {
  MANIFEST,
  candidateResourceIds,
  validateCandidatePackage,
}
