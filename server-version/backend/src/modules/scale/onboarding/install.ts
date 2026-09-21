import { withSerializableScaleTransaction } from '../deployment/transactions'
import { scaleLocalizationReasons } from '../policy/localization'
import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { hashScaleDefinition } from '../scale-definition'
import { materializeScaleInstrumentContent } from './materialize'
import { getScaleInstrumentRuntimePolicy, getScaleInstrumentSource } from './instrument-registry'
import {
  evaluateScaleDeployment,
  hashScaleDeploymentPolicy,
  scaleDeploymentPolicyV1Schema,
  type ScaleDeploymentPolicyV1,
} from '../policy/deployment'
import {
  activateScaleDeploymentRevision,
  listScaleInstrumentAuthorizations,
  readActiveScaleDeployment,
} from '../deployment/repository'

export interface InstallScaleInstrumentInput {
  instrumentKey: string
  instrumentVersion: string
  deploymentPolicy: ScaleDeploymentPolicyV1
  actorUserId: string
}

export interface InstallScaleInstrumentPlan {
  instrumentKey: string
  instrumentVersion: string
  scaleId: string | null
  createScale: boolean
  packageReleaseStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  runtimePolicyHash: string
  deploymentPolicyHash: string
  deploymentRevision: number
  deploymentAlreadyActive: boolean
  referenceCreates: string[]
  referenceUnchanged: string[]
  allowActivation: boolean
  blockers: string[]
}

const definitionCounts = (definition: { items: unknown[]; scoring: { scores: Array<{ type: string }> } }) => ({
  itemCount: definition.items.length,
  dimensionCount: definition.scoring.scores.filter((score) => score.type === 'dimension').length,
})

const resolvePlan = async (
  db: PrismaClient | Prisma.TransactionClient,
  input: InstallScaleInstrumentInput,
): Promise<InstallScaleInstrumentPlan> => {
  const source = getScaleInstrumentSource(input.instrumentKey, input.instrumentVersion)
  const runtimePolicy = getScaleInstrumentRuntimePolicy(input.instrumentKey, input.instrumentVersion)
  if (!source?.executable || !runtimePolicy) throw new Error('Scale instrument is not executable or has no compiled runtime policy')

  const deploymentPolicy = scaleDeploymentPolicyV1Schema.parse(input.deploymentPolicy)
  const blockers: string[] = scaleLocalizationReasons(source, deploymentPolicy)
  if (deploymentPolicy.runtimePolicyHash !== runtimePolicy.runtimePolicyHash) blockers.push('RUNTIME_POLICY_HASH_MISMATCH')
  if (deploymentPolicy.locale !== runtimePolicy.contentLocale) blockers.push('DEPLOYMENT_CONTENT_LOCALE_MISMATCH')
  const localizationVersion = source.localization?.localizationVersion
  if (
    deploymentPolicy.localizationVersion
    && deploymentPolicy.localizationVersion !== localizationVersion
  ) blockers.push('DEPLOYMENT_LOCALIZATION_VERSION_MISMATCH')
  if (source.executable.releaseStatus !== 'PUBLISHED') blockers.push('EXECUTABLE_NOT_PUBLISHED')

  const scale = await db.scale.findUnique({
    where: { code: input.instrumentKey },
    select: { id: true, instrumentClass: true, instrumentVersion: true, definitionHash: true, definition: true, status: true },
  })
  if (scale) {
    if (scale.instrumentClass !== 'STANDARD') blockers.push('SCALE_CODE_OWNED_BY_CUSTOM_INSTRUMENT')
    if (scale.instrumentVersion !== input.instrumentVersion) blockers.push('DEPLOYMENT_VERSION_CONFLICT')
    if (scale.definition && canonicalHash(scale.definition) !== canonicalHash(source.executable.definition)) blockers.push('SCALE_DEFINITION_CONFLICT')
    if (scale.definitionHash && scale.definitionHash !== hashScaleDefinition(source.executable.definition)) blockers.push('SCALE_DEFINITION_CONFLICT')
    if (scale.status === 'DEPRECATED' || scale.status === 'ARCHIVED') blockers.push('SCALE_LIFECYCLE_BLOCKS_REACTIVATION')
  }

  const authorizations = await listScaleInstrumentAuthorizations(db, input.instrumentKey, input.instrumentVersion)
  for (const requestedMode of deploymentPolicy.deploymentModes) {
    const decision = evaluateScaleDeployment({
      policy: deploymentPolicy,
      requestedMode,
      instrumentKey: input.instrumentKey,
      instrumentVersion: input.instrumentVersion,
      compiledRuntimePolicyHash: runtimePolicy.runtimePolicyHash,
      authorizations,
      usageRequirements: runtimePolicy.usageRequirements,
    })
    blockers.push(...decision.reasons)
  }

  const referenceCreates: string[] = []
  const referenceUnchanged: string[] = []
  for (const reference of source.executable.references) {
    const existing = await db.assessmentReferenceSet.findUnique({
      where: {
        instrumentType_instrumentKey_referenceVersion: {
          instrumentType: 'SCALE',
          instrumentKey: input.instrumentKey,
          referenceVersion: reference.referenceVersion,
        },
      },
      select: { definition: true, status: true },
    })
    if (!existing) {
      referenceCreates.push(reference.referenceVersion)
      continue
    }
    if (canonicalHash(existing.definition) !== canonicalHash(reference)) {
      blockers.push(existing.status === 'ACTIVE'
        ? `ACTIVE_REFERENCE_IMMUTABLE:${reference.referenceVersion}`
        : `REFERENCE_VERSION_CONFLICT:${reference.referenceVersion}`)
    } else {
      referenceUnchanged.push(reference.referenceVersion)
    }
  }

  const active = scale ? await readActiveScaleDeployment(db, scale.id) : null
  const deploymentPolicyHash = hashScaleDeploymentPolicy(deploymentPolicy)
  if (active && active.revision === deploymentPolicy.revision && active.policyHash !== deploymentPolicyHash) {
    blockers.push('DEPLOYMENT_REVISION_CONFLICT')
  }

  return {
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    scaleId: scale?.id ?? null,
    createScale: !scale,
    packageReleaseStatus: source.executable.releaseStatus,
    runtimePolicyHash: runtimePolicy.runtimePolicyHash,
    deploymentPolicyHash,
    deploymentRevision: deploymentPolicy.revision,
    deploymentAlreadyActive: Boolean(active && active.revision === deploymentPolicy.revision && active.policyHash === deploymentPolicyHash),
    referenceCreates,
    referenceUnchanged,
    allowActivation: [...new Set(blockers)].length === 0,
    blockers: [...new Set(blockers)].sort(),
  }
}

export const planScaleInstrumentInstall = async (
  db: PrismaClient,
  input: InstallScaleInstrumentInput,
): Promise<InstallScaleInstrumentPlan> => resolvePlan(db, input)

export const installScaleInstrument = async (
  db: PrismaClient,
  input: InstallScaleInstrumentInput,
): Promise<InstallScaleInstrumentPlan> => {
  const preview = await resolvePlan(db, input)
  if (!preview.allowActivation) {
    throw new Error(`Scale install blocked: ${preview.blockers.join(',')}`)
  }

  return withSerializableScaleTransaction(db, async (tx) => {
    // Re-evaluate inside the serializable write transaction so a grant/revision
    // change between dry-run and apply cannot be promoted accidentally.
    const plan = await resolvePlan(tx, input)
    if (!plan.allowActivation) throw new Error(`Scale install blocked: ${plan.blockers.join(',')}`)

    const materialized = await materializeScaleInstrumentContent(tx, {
      instrumentKey: input.instrumentKey,
      instrumentVersion: input.instrumentVersion,
      actorUserId: input.actorUserId,
    })
    const scale = materialized.scale
    await activateScaleDeploymentRevision({
      db: tx,
      id: randomUUID(),
      scaleId: scale.id,
      policy: input.deploymentPolicy,
      createdByUserId: input.actorUserId,
    })
    return resolvePlan(tx, input)
  })
}
