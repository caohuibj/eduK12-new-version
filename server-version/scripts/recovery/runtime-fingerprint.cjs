'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

function hashFile(file) {
  const fd = fs.openSync(file, 'r'), hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
  try { for (let size; (size = fs.readSync(fd, buffer)) > 0;) hash.update(buffer.subarray(0, size)) }
  finally { fs.closeSync(fd) }
  return hash.digest('hex')
}
function distManifest(root) {
  const entries = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('RECOVERY_DIST_SYMLINK_FORBIDDEN')
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile()) entries.push([path.relative(root, file), fs.statSync(file).mode & 0o777, hashFile(file)])
    }
  }
  visit(root)
  return { files: entries.length, sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex') }
}
function fingerprint(backend) {
  const files = {}
  for (const relative of ['package-lock.json', 'prisma/schema.prisma', 'node_modules/.prisma/client/schema.prisma', 'node_modules/.prisma/client/index.js']) {
    files[relative] = hashFile(path.join(backend, relative))
  }
  return { schemaVersion: 1, nodeVersion: process.version, nodeSha256: hashFile(process.execPath),
    dist: distManifest(path.join(backend, 'dist')), files,
    preloadSha256: hashFile(path.join(__dirname, 'loopback-only.cjs')) }
}
module.exports = { hashFile, fingerprint }
if (require.main === module) process.stdout.write(JSON.stringify(fingerprint(path.resolve(process.argv[2]))))
