import { resolveGitReleaseStates } from '../../measurement-content/git-release-manifest'

type Declaration = {releaseKey: string; state: 'ONLINE' | 'HOLD' | 'WITHDRAWN'; replaces?: string}

export function scaleDeclarationStates(releases: readonly Declaration[]) {
  return resolveGitReleaseStates(releases, {
    errorPrefix: 'STANDARD_GIT',
    allowExternalReplacement: key => /^\d+\.\d+\.\d+\/default$/.test(key),
  })
}

export function activeScaleDeclarations<T extends Declaration>(releases: readonly T[]): T[] {
  const states = scaleDeclarationStates(releases)
  return releases.filter(release => states.get(release.releaseKey) === 'ONLINE')
}
