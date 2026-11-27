const modules = 'server-version/backend/src/modules/'
const scale = /^scale\/instruments\/([a-z][a-z0-9_]*)\/(releases\.json|(?:parameters|reports)\/[^/]+\.json|\d+\.\d+\.\d+\/(?:source\.json|instrument\.ts))$/
const bundle = /^assessment-bundle\/packages\/([a-z][a-z0-9_]*)\/(releases\.json|\d+\.\d+\.\d+\/.+)$/

/** Cover both dedicated and mixed PRs. Keep versioned bytes and modes fixed
 * once merged. State changes are made on the per-tool control file. */
export function verifyGitContentHistory(entries) {
  for (const { file, status, oldMode, newMode } of entries) {
    if (!file.startsWith(modules)) continue
    const relative = file.slice(modules.length)
    const artifact = scale.exec(relative) ?? bundle.exec(relative)
    if (!artifact) continue
    const control = artifact[2] === 'releases.json'
    const added = status === 'A' && oldMode === '000000' && newMode === '100644'
    const updatedControl = control && status === 'M' && oldMode === '100644' && newMode === '100644'
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
