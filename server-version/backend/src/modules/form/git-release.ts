import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  gitReleaseManifestFields, gitReleaseSelectionFields, resolveGitReleaseStates,
} from '../measurement-content/git-release-manifest'
import {
  formGitContentSchema, formReleaseToolKey, formReleaseVersion, formTemplateReportSchema, prepareFormRelease,
  verifyFormRepresentativeCase,
} from './release'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const selection = z.object({
  ...gitReleaseSelectionFields,
  releaseKey: formReleaseVersion,
  replaces: formReleaseVersion.optional(),
  contentVersion: formReleaseVersion,
  reportVersion: formReleaseVersion,
  contentHash: hash,
  reportHash: hash,
  // Native Form completion projection is implemented for Survey. Preserve
  // legacy non-report Training Form support outside this release adapter.
  allowedEntries: z.tuple([z.literal('SURVEY')]),
}).strict()
const releaseIndex = z.object({
  ...gitReleaseManifestFields,
  toolKey: formReleaseToolKey,
  releases: z.array(selection).min(1).max(100),
}).strict()

function checkedDirectory(path: string) {
  if (!lstatSync(path).isDirectory()) throw new Error('FORM_RELEASE_DIRECTORY_REQUIRED: ' + path)
  return path
}

function readJson(path: string): unknown {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('FORM_RELEASE_REGULAR_JSON_REQUIRED: ' + path)
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function checkFormGitRelease(root: string, key: string) {
  const toolKey = formReleaseToolKey.parse(key)
  const directory = checkedDirectory(join(realpathSync(root), toolKey))
  const index = releaseIndex.parse(readJson(join(directory, 'releases.json')))
  if (index.toolKey !== toolKey) throw new Error('FORM_RELEASE_TOOL_IDENTITY_MISMATCH: ' + toolKey)
  const effectiveStates = resolveGitReleaseStates(index.releases, { errorPrefix: 'FORM_RELEASE' })
  const reportDirectory = checkedDirectory(join(directory, 'reports'))
  const contentDescriptors = new Map<string, string>()
  return {
    toolKey,
    releases: index.releases.map(entry => {
      const rawContent = readJson(join(directory, entry.contentVersion + '.json'))
      const rawReport = readJson(join(reportDirectory, entry.reportVersion + '.json'))
      if (canonicalHash(rawContent) !== entry.contentHash || canonicalHash(rawReport) !== entry.reportHash)
        throw new Error('FORM_RELEASE_AXIS_HASH_MISMATCH: ' + entry.releaseKey)
      const { representativeCase, ...content } = formGitContentSchema.parse(rawContent)
      const report = formTemplateReportSchema.parse(rawReport)
      if (content.toolKey !== toolKey || content.version !== entry.contentVersion || report.version !== entry.reportVersion)
        throw new Error('FORM_RELEASE_AXIS_IDENTITY_MISMATCH: ' + entry.releaseKey)
      const prepared = prepareFormRelease(content, report, entry.contentHash, entry.reportHash)
      const descriptor = canonicalHash({ definition: prepared.definition, dataCeiling: content.dataCeiling.audiences })
      const priorVersion = contentDescriptors.get(descriptor)
      if (priorVersion && priorVersion !== content.version) throw new Error('FORM_RELEASE_DUPLICATE_CONTENT_VERSION: ' + entry.releaseKey)
      contentDescriptors.set(descriptor, content.version)
      verifyFormRepresentativeCase(prepared.definition, representativeCase)
      const effectiveState = effectiveStates.get(entry.releaseKey)
      if (!effectiveState || effectiveState === 'RETIRED') throw new Error('FORM_RELEASE_INVALID_STATE: ' + entry.releaseKey)
      return { ...entry, effectiveState, content, report, prepared }
    }),
  }
}

export async function syncFormGitReleases(root: string, tx: Prisma.TransactionClient, actorId: string, gitCommitSha: string) {
  const keys = readdirSync(realpathSync(root), { withFileTypes: true })
    .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
    .map(entry => formReleaseToolKey.parse(entry.name)).sort()
  const selected = keys.flatMap(key => checkFormGitRelease(root, key).releases).filter(release => release.effectiveState !== 'HOLD')
  if (!selected.length) return []
  const { publishFormGitRelease } = await import('./publication')
  const changes = []
  for (const release of selected)
    changes.push(await publishFormGitRelease(tx, actorId, release, gitCommitSha))
  return changes
}
