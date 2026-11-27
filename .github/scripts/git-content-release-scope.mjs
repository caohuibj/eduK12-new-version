const modules = 'server-version/backend/src/modules/'
const scale = /^scale\/instruments\/([a-z][a-z0-9_]*)\/(releases\.json|(?:parameters|reports)\/[^/]+\.json|\d+\.\d+\.\d+\/(?:source\.json|instrument\.ts))$/
const cognitive = /^cognitive\/tasks\/([a-z][a-z0-9_-]{0,79})\/(releases\.json|(?:parameters|reports)\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.json)$/
const bundle = /^assessment-bundle\/packages\/([a-z][a-z0-9_]*)\/(releases\.json|\d+\.\d+\.\d+\/.+)$/

/** Cover both dedicated and mixed PRs. Keep versioned bytes and modes fixed
 * once merged. State changes are made on the per-tool control file. */
export function verifyGitContentHistory(entries, { readBaseFile, readHeadFile } = {}) {
  for (const { file, status, oldMode, newMode } of entries) {
    if (!file.startsWith(modules)) continue
    const relative = file.slice(modules.length)
    const artifact = scale.exec(relative) ?? bundle.exec(relative) ?? cognitive.exec(relative)
    if (!artifact) continue
    const control = artifact[2] === 'releases.json'
    const added = status === 'A' && oldMode === '000000' && newMode === '100644'
    const updatedControl = control && status === 'M' && oldMode === '100644' && newMode === '100644'
    if (updatedControl && !scale.test(relative) && readBaseFile && readHeadFile) {
      const before = JSON.parse(readBaseFile(file)).releases
      const after = JSON.parse(readHeadFile(file)).releases
      if (!Array.isArray(before) || !Array.isArray(after)) throw new Error('Expected a release list: ' + file)
      const retained = new Set(after.map(release => release.version ?? release.releaseKey))
      if (before.some(release => !retained.has(release.version ?? release.releaseKey))) {
        throw new Error('Keep existing release identifiers; withdraw via the manifest: ' + file)
      }
    }
    if (!added && !updatedControl) {
      throw new Error(control
        ? 'Release control must be a regular JSON file; withdraw via the manifest: ' + file
        : 'Merged version is immutable; append a new version: ' + file)
    }
  }
}

export function bundleReleaseSelector(file) {
  if (!file.startsWith(modules)) return null
  const match = bundle.exec(file.slice(modules.length))
  return match?.[2] === 'releases.json' ? 'bundle:' + match[1] : null
}

export function gitContentReleaseSelector(file) {
  if (!file.startsWith(modules)) return null
  const match = cognitive.exec(file.slice(modules.length))
  return match ? 'cognitive:' + match[1] : bundleReleaseSelector(file)
}

export function isCognitiveRuntimePath(file) {
  if (file.startsWith(modules) && cognitive.test(file.slice(modules.length))) return false
  return /^server-version\/(?:backend\/src\/modules\/cognitive\/(?:tasks|generated|content-candidates)\/|frontend\/src\/modules\/cognitive\/(?:(?:tasks|generated)\/|native-runners\.tsx$))/.test(file)
}
