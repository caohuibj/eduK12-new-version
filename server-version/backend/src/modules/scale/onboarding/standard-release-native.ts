import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../../assessment-runtime/canonical'
import type { Triplet } from '../../survey/standard-triplet.model'
import { databaseContentSource } from '../component-import/native-source'
import { activateScaleDeploymentRevision, readActiveScaleDeployment, readScaleDeploymentRevision } from '../deployment/repository'
import { compileScalePolicy } from '../policy/compile'
import { evaluateScaleDeployment } from '../policy/deployment'
import { getLegacyScaleCompatibilityProfile } from '../policy/legacy-profile'
import { hashScaleDefinition, scaleDefinitionSchema } from '../scale-definition'
import { getScaleInstrumentSource } from './instrument-registry'
import { scaleSourceAxisPayloads } from './source-snapshot'

/** Materialize the already selected C without replacing any installed P/R or
 * enabling a legacy entry. Only the exact combination gains new entry scope. */
export async function ensureStandardNativeScale(tx: Prisma.TransactionClient, actor: string, triplet: Triplet, needsNativeRuntime: boolean) {
  if (databaseContentSource(triplet.parts.CONTENT)) return
  const {toolKey, instrumentVersion} = triplet
  const source = getScaleInstrumentSource(toolKey, instrumentVersion)
  if (!source?.executable || source.executable.releaseStatus === 'RETIRED') throw new Error('STANDARD_CONTENT_UNAVAILABLE:' + toolKey)
  const axis = scaleSourceAxisPayloads(source)
  if (canonicalHash(axis.content) !== triplet.parts.CONTENT.hash) throw new Error('STANDARD_CONTENT_CHANGED:' + toolKey)
  const nativeDefinition = source.executable.definition
  const install = {
    definition: nativeDefinition as unknown as Prisma.InputJsonValue,
    definitionHash: hashScaleDefinition(nativeDefinition),
    itemCount: nativeDefinition.items.length,
    dimensionCount: nativeDefinition.scoring.scores.filter(score => score.type === 'dimension').length,
    instruction: source.instruction?.text ?? null,
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'standard-native-code:'+toolKey}))`
  await tx.$queryRaw`SELECT id FROM scales WHERE code=${toolKey} FOR UPDATE`
  const prior = await tx.scale.findUnique({where:{code:toolKey}})
  if (prior && (prior.instrumentClass !== 'STANDARD' || prior.standardSourceKind !== 'CODE_PACKAGE'
    || prior.instrumentVersion !== instrumentVersion || prior.libraryEntryId || !['DRAFT','PUBLISHED'].includes(prior.status))) {
    throw new Error('STANDARD_NATIVE_CONFLICT:' + toolKey)
  }
  if (prior?.definition) {
    const stored = scaleDefinitionSchema.parse(prior.definition)
    const {report: _report, referencePolicy: _parameters, source: _source, license: _license, ...content} = stored
    const contentWithCeiling = source.dataCeiling ? { ...content, dataCeiling: source.dataCeiling } : content
    if (canonicalHash(contentWithCeiling) !== triplet.parts.CONTENT.hash || hashScaleDefinition(stored) !== prior.definitionHash) {
      throw new Error('STANDARD_NATIVE_CONTENT_CHANGED:' + toolKey)
    }
  }
  if (prior?.status === 'PUBLISHED' && !prior.definition) throw new Error('STANDARD_NATIVE_CONTENT_MISSING:' + toolKey)
  const scale = prior
    ? prior.status === 'PUBLISHED' ? prior : await tx.scale.update({where:{id:prior.id},data:{...(!prior.definition ? install : {}),status:'PUBLISHED',visibility:'HIDDEN'}})
    : await tx.scale.create({data:{...install,code:toolKey,name:source.catalog.identity.canonicalName,
      description:source.catalog.construct.constructDefinition,creatorId:actor,instrumentClass:'STANDARD',instrumentVersion,
      status:'PUBLISHED',visibility:'HIDDEN',tags:[source.catalog.construct.primaryDomain]}})
  if (!needsNativeRuntime) return
  const policy = compileScalePolicy(source)
  const active = await readActiveScaleDeployment(tx, scale.id)
  if (active) {
    if (active.policy.locale!==policy.contentLocale
      || (source.localization||active.policy.localizationVersion)&&active.policy.localizationVersion!==source.localization?.localizationVersion
      || !evaluateScaleDeployment({policy:active.policy,requestedMode:'COMPOSITE',instrumentKey:toolKey,
      instrumentVersion,compiledRuntimePolicyHash:policy.runtimePolicyHash,usageRequirements:policy.usageRequirements}).allowNewStarts) {
      throw new Error('STANDARD_NATIVE_DEPLOYMENT_CONFLICT:' + toolKey)
    }
    return
  }
  if (await readScaleDeploymentRevision(tx, scale.id, 1)) throw new Error('STANDARD_NATIVE_DEPLOYMENT_RETIRED:' + toolKey)
  const legacy = prior?.status === 'PUBLISHED' && getLegacyScaleCompatibilityProfile(toolKey, instrumentVersion)
  if (legacy && !triplet.effectiveDisclosure) return
  if (policy.usageRequirements?.allowedDeploymentModes?.length && !policy.usageRequirements.allowedDeploymentModes.includes('COMPOSITE')) {
    throw new Error('STANDARD_NATIVE_MODE_UNAVAILABLE:' + toolKey)
  }
  await activateScaleDeploymentRevision({db:tx,id:randomUUID(),scaleId:scale.id,createdByUserId:actor,
    policy:{schemaVersion:2,revision:1,locale:policy.contentLocale,territory:'ZZ',deploymentModes:['COMPOSITE'],
      runtimePolicyHash:policy.runtimePolicyHash,inFlightCompletion:'FROZEN_DEADLINE',
      ...(legacy ? {exactStandardOnly:true as const} : {}),
      ...(source.localization ? {localizationVersion:source.localization.localizationVersion} : {})}})
}
