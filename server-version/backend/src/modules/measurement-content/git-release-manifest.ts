import { z } from 'zod'

const releaseKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)

export const gitReleaseManifestFields = {
  schemaVersion: z.literal(1),
  toolKey: z.string().regex(/^[a-z][a-z0-9_-]{0,119}$/),
}

export const gitReleaseSelectionFields = {
  releaseKey,
  state: z.enum(['ONLINE', 'HOLD', 'WITHDRAWN']),
  allowedEntries: z.array(z.enum(['TRAINING', 'SCHOOL', 'TEACHER', 'SURVEY'])).min(1).max(4)
    .refine(entries => new Set(entries).size === entries.length, 'Duplicate entry'),
  replaces: releaseKey.optional(),
}

export type GitReleaseState = z.infer<typeof gitReleaseSelectionFields.state> | 'RETIRED'
type Declaration = { releaseKey: string; state: GitReleaseState; replaces?: string }

export function resolveGitReleaseStates(
  releases: readonly Declaration[],
  { errorPrefix = 'CONTENT_GIT', allowExternalReplacement }: {
    errorPrefix?: string
    allowExternalReplacement?: (key: string) => boolean
  } = {},
): Map<string, GitReleaseState> {
  const byKey = new Map(releases.map(release => [release.releaseKey, release]))
  if (byKey.size !== releases.length) throw new Error(errorPrefix + '_DUPLICATE_RELEASE_KEY')

  const superseded = new Set<string>()
  for (const { releaseKey, state, replaces } of releases) {
    if (replaces && !byKey.has(replaces) && !allowExternalReplacement?.(replaces)) {
      throw new Error(errorPrefix + '_REPLACEMENT_NOT_FOUND:' + releaseKey + ':' + replaces)
    }
    const visited = new Set([releaseKey])
    let predecessor = replaces
    while (predecessor && byKey.has(predecessor)) {
      if (visited.has(predecessor)) throw new Error(errorPrefix + '_REPLACEMENT_CYCLE:' + predecessor)
      visited.add(predecessor)
      if (state === 'ONLINE') superseded.add(predecessor)
      predecessor = byKey.get(predecessor)?.replaces
    }
  }

  // A live successor takes precedence over HOLD on its predecessors. An
  // independent HOLD leaves that release at its current deployed state.
  return new Map(releases.map(({ releaseKey, state }) => [
    releaseKey, state !== 'RETIRED' && superseded.has(releaseKey) ? 'WITHDRAWN' : state,
  ]))
}
