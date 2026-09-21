import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { qualificationAllowsScientificMaturity } from '../../assessment-governance/scientific-qualification'
import { evaluateScaleSourceScientificQualification } from '../library/scientific-qualification'
import { listScaleInstrumentAuthorizations, readActiveScaleDeployment } from '../deployment/repository'
import { withSerializableScaleTransaction } from '../deployment/transactions'
import { getScaleInstrumentSource } from './instrument-registry'
import { planScaleInstrumentInstall } from './install'
import { validateScaleInstrumentSource } from './validate-instrument'
import { hashScaleDefinition } from '../scale-definition'
import { publishedScaleMediaOwner, retainScaleAssessmentImages } from '../scale-image.adapter'

export const standardScalePublishInputSchema = z.object({
  instrumentKey: z.string().min(1), instrumentVersion: z.string().min(1), actorUserId: z.string().min(1),
  visibility: z.enum(['HIDDEN', 'COURSE', 'PUBLIC']),
  expectedProofHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict()
type Input = z.infer<typeof standardScalePublishInputSchema>
type Db = PrismaClient | Prisma.TransactionClient

export const planStandardScalePublication = async (db: Db, value: Input) => {
  const input = standardScalePublishInputSchema.parse(value)
  const blockers: string[] = []
  const actor = await db.user.findUnique({ where: { id: input.actorUserId } })
  if (!actor || actor.platformRole !== 'SYSTEM_ADMIN' || !actor.isActive || actor.isFrozen
    || (actor.expiresAt && actor.expiresAt <= new Date())) blockers.push('SYSTEM_ADMIN_REQUIRED')
  const source = getScaleInstrumentSource(input.instrumentKey, input.instrumentVersion)
  if (!source?.executable) throw new Error('EXECUTABLE_SOURCE_MISSING')
  blockers.push(...validateScaleInstrumentSource(source).issues.filter(row => row.severity === 'error').map(row => `${row.path}:${row.message}`))
  const qualification = evaluateScaleSourceScientificQualification(source)
  if (!qualificationAllowsScientificMaturity(source.catalog.scientificMaturity, qualification)) blockers.push('SCIENTIFIC_CLAIM_NOT_QUALIFIED')
  const scale = await db.scale.findUnique({ where: { code: input.instrumentKey } })
  const active = scale ? await readActiveScaleDeployment(db, scale.id) : null
  if (!scale) blockers.push('SCALE_NOT_INSTALLED')
  if (!active) blockers.push('DEPLOYMENT_BINDING_MISSING')
  if (scale && (scale.definitionHash !== hashScaleDefinition(source.executable.definition) || !scale.definition)) blockers.push('SCALE_DEFINITION_CONFLICT')
  if (active) {
    if (source.catalog.scientificMaturity !== 'PILOT' && source.scientificReview?.territory !== active.policy.territory) blockers.push('SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH')
    const install = await planScaleInstrumentInstall(db, { ...input, deploymentPolicy: active.policy })
    blockers.push(...install.blockers)
    if (install.referenceCreates.length) blockers.push('REFERENCES_NOT_INSTALLED')
  }
  const authorizations = active ? (await listScaleInstrumentAuthorizations(db, input.instrumentKey, input.instrumentVersion))
    .filter(row => active.authorizationRefs.includes(row.authorizationId)) : []
  const proof = {
    schemaVersion: 1, identity: source.identity, actorUserId: input.actorUserId, scaleId: scale?.id ?? null,
    definitionHash: hashScaleDefinition(source.executable.definition), sourceHash: canonicalHash({ ...source, executable: { ...source.executable, scorerPlugins: source.executable.scorerPlugins?.map(({ key, version }) => ({ key, version })) ?? [] } }),
    authorizationStateHash: canonicalHash(authorizations),
    deploymentPolicyHash: active?.policyHash ?? null, deploymentRevision: active?.revision ?? null,
    scientificMaturity: source.catalog.scientificMaturity, qualification,
    visibility: input.visibility, previousStatus: scale?.status ?? null, previousVisibility: scale?.visibility ?? null,
  }
  const proofHash = canonicalHash(proof)
  if (input.expectedProofHash && input.expectedProofHash !== proofHash) blockers.push('PUBLICATION_PREVIEW_STALE')
  return { allowPublish: blockers.length === 0, blockers: [...new Set(blockers)].sort(), proofHash, proof }
}

/** Explicit human publication, distinct from installation. Retains media and audit atomically. */
export const publishStandardScale = async (db: PrismaClient, value: Input & { expectedProofHash: string }) => {
  const input = standardScalePublishInputSchema.extend({ expectedProofHash: z.string().regex(/^[0-9a-f]{64}$/) }).parse(value)
  return withSerializableScaleTransaction(db, async tx => {
    const plan = await planStandardScalePublication(tx, input)
    if (!plan.allowPublish || !plan.proof.scaleId) throw new Error(`Scale publication blocked: ${plan.blockers.join(',')}`)
    const source = getScaleInstrumentSource(input.instrumentKey, input.instrumentVersion)!
    await retainScaleAssessmentImages({ owner: publishedScaleMediaOwner(plan.proof.scaleId, plan.proof.definitionHash), definition: source.executable!.definition, db: tx as never })
    const scale = await tx.scale.update({ where: { id: plan.proof.scaleId }, data: { status: 'PUBLISHED', visibility: input.visibility } })
    await tx.$executeRaw(Prisma.sql`INSERT INTO "scale_publication_audits" ("id", "scale_id", "actor_user_id", "proof_hash", "proof") VALUES (${randomUUID()}::uuid, ${scale.id}, ${input.actorUserId}, ${plan.proofHash}, CAST(${JSON.stringify(plan.proof)} AS jsonb))`)
    return { scaleId: scale.id, status: scale.status, visibility: scale.visibility, proofHash: plan.proofHash }
  })
}
