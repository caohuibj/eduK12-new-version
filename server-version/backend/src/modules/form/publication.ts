import { canonicalHash } from '../assessment-runtime/canonical'
import { governedFormRelease } from './disclosure'
import type { Prisma } from '@prisma/client'
import { governedFail, originalFormArtifact, reconcileGitGovernedArtifact } from '../survey/governed-tool.service'
import type { GovernedArtifact } from '../survey/governed-tool.model'
import {
  prepareFormRelease, type FormTemplateContent, type FormTemplateReport,
} from './release'
import type { checkFormGitRelease } from './git-release'

type GitFormRelease = ReturnType<typeof checkFormGitRelease>['releases'][number]

export function buildGovernedFormRelease(actorId: string, input: {
  requestId: string
  releaseKey: string
  content: FormTemplateContent
  report: FormTemplateReport
  contentHash: string
  reportHash: string
}): GovernedArtifact {
  const { content, report } = input
  const { provenance, definition } = prepareFormRelease(content, report, input.contentHash, input.reportHash)
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
  const artifact = buildGovernedFormRelease(actorId, {
    ...release, requestId: '00000000-0000-4000-8000-000000000001',
  })
  if (release.state === 'ONLINE') {
    await lockFormReleaseAxes(tx, release.content.toolKey)
    await assertFormReleaseAxesUnchanged(tx, artifact)
  }
  const result = await reconcileGitGovernedArtifact(tx, actorId, artifact, {
    gitCommitSha, allowedProducts: release.allowedProducts, online: release.state === 'ONLINE',
  })
  return { toolKey: release.content.toolKey, releaseKey: release.releaseKey, ...result }
}
