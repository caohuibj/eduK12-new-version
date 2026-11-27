type Declaration = {releaseKey: string; state: 'ONLINE' | 'WITHDRAWN'; replaces?: string}

export function activeScaleDeclarations<T extends Declaration>(releases: readonly T[]): T[] {
  const byKey = new Map(releases.map(release => [release.releaseKey, release]))
  if (byKey.size !== releases.length) throw new Error('STANDARD_GIT_DUPLICATE_RELEASE_KEY')
  for (const {releaseKey, replaces} of releases) {
    if (replaces && !/^\d+\.\d+\.\d+\/default$/.test(replaces) && !byKey.has(replaces)) {
      throw new Error(`STANDARD_GIT_REPLACEMENT_NOT_FOUND:${releaseKey}:${replaces}`)
    }
  }
  const superseded = new Set<string>()
  for (const release of releases) {
    const chain = new Set([release.releaseKey])
    let key = release.replaces
    while (key && byKey.has(key)) {
      if (chain.has(key)) throw new Error('STANDARD_GIT_REPLACEMENT_CYCLE:' + key)
      chain.add(key)
      if (release.state === 'ONLINE') superseded.add(key)
      key = byKey.get(key)?.replaces
    }
  }
  return releases.filter(release => release.state === 'ONLINE' && !superseded.has(release.releaseKey))
}
