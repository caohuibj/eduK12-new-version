import { canonicalHash } from '../assessment-runtime/canonical'
import { governedFormRelease } from './disclosure'
import type { Prisma } from '@prisma/client'
import { governedFail, originalFormArtifact, reconcileGitGovernedArtifact } from '../survey/governed-tool.service'
import type { GovernedArtifact } from '../survey/governed-tool.model'
import type { FormTemplateContent, FormTemplateReport, prepareFormRelease } from './release'
import type { prepareFormGitReleases } from './git-release'

type GitFormRelease = ReturnType<typeof prepareFormGitReleases>[number]

export function buildGovernedFormRelease(actorId: string, input: {
  requestId: string
  releaseKey: string
  content: FormTemplateContent
  report: FormTemplateReport
  prepared: ReturnType<typeof prepareFormRelease>
}): GovernedArtifact {
  const { content, report, prepared: { provenance, definition } } = input
  const artifact = originalFormArtifact(actorId, {
    requestId: input.requestId, toolKey: content.toolKey, version: content.version, title: content.title,
    statement: content.statement, definition, classificationTags: content.classificationTags, reference: content.reference,
  })
  if (!artifact.unit) throw new Error('FORM_RELEASE_CONTENT_REQUIRED')
  return {
    ...artifact, version: input.releaseKey,
    unit: { ...artifact.unit, provenance: { ...artifact.unit.provenance, formRelease: provenance } },
    report: { version: report.version, template: report.template, effectiveDisclosure: provenance.effectiveDisclosure },
  }
}

/** Serialize all new Form issuances for a series and preserve axis identity
 * across Git and interactive administrator releases. */
export async function lockFormReleaseAxes(tx: Prisma.TransactionClient, toolKey: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'governed-form-axis:' + toolKey}))`
}

export async function assertFormReleaseAxesUnchanged(tx: Prisma.TransactionClient, artifact: GovernedArtifact) {
  const unit = artifact.unit!
  const current = governedFormRelease(unit.provenance)!
  const prior = await tx.$queryRaw<Array<{ snapshot: GovernedArtifact }>>`
    SELECT snapshot FROM survey_governed_tools WHERE family='FORM' AND tool_key=${artifact.toolKey}
    AND (snapshot#>>'{unit,ref,sourceVersion}'=${current.contentVersion} OR snapshot#>>'{report,version}'=${current.reportVersion})
    ORDER BY id FOR SHARE`
  for (const { snapshot } of prior) {
    const old = governedFormRelease(snapshot.unit?.provenance)
    const sameC = snapshot.unit?.ref.sourceVersion === current.contentVersion
    if ((sameC && canonicalHash(snapshot.unit!.displayDefinition) !== canonicalHash(unit.displayDefinition))
      || (old?.contentVersion === current.contentVersion && old.contentHash !== current.contentHash)
      || (old?.reportVersion === current.reportVersion && old.reportHash !== current.reportHash))
      governedFail(409, '已使用的题本和报告版本不可覆盖')
  }
}

export async function publishFormGitRelease(tx: Prisma.TransactionClient, actorId: string, release: GitFormRelease, gitCommitSha: string) {
  const { artifact, toolKey, releaseKey, effectiveState, allowedEntries } = release
  const online = effectiveState === 'ONLINE'
  if (online) {
    await lockFormReleaseAxes(tx, toolKey)
    await assertFormReleaseAxesUnchanged(tx, artifact)
  }
  const result = await reconcileGitGovernedArtifact(tx, actorId, artifact, {
    gitCommitSha, allowedProducts: allowedEntries, online,
  })
  return { toolKey, releaseKey, ...result }
}
