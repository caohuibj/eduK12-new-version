import { decryptFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { scaleProjectionPolicyFromCompiled, denyAllScaleProjectionPolicy } from '../scale/projection/policy-resolver'
import { resolveAudienceDisclosure } from '../scale/policy/disclosure'
import { contextValues } from './context-submission'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { logger } from '../../utils/logger'
import { canonicalHash } from '../assessment-runtime/canonical'
import { compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { encryptCognitivePayload, decryptCognitivePayload } from '../cognitive/cognitive.security'
import { buildBundleContextFactsFromValues } from '../assessment-bundle/context'
import { projectBundleCognitiveSourceFromCanonicalBridge, projectBundleScaleSourceFromCanonicalBridge, projectBundleSituationalSourceFromCanonicalBridge } from '../assessment-bundle/sources'
import { projectBundleAudienceView, projectBundleReportFacts } from '../assessment-bundle/report-facts'
import { compileBundleRuntimeFromFrozenRead } from '../assessment-bundle/compile'
import { createProductBundleAnalysisEngineRegistry } from '../assessment-bundle/bootstrap'
import { validateBundleReportFacts } from '../assessment-bundle/evidence'
import type { BundleReportAudienceV1 } from '../assessment-bundle/types'
import { computeReanalysisAggregateInputHash, runExplicitBundleReanalysis } from '../assessment-reanalysis/reanalysis'
import { readFrozenBundleProductionDefinition, freezeBundleProductionDefinition, type BundleDefinitionProvider } from './definition-provider'
import { readInstance, owner, type BundleActor } from './service'
import { compositeBadRequest, compositeConflict, compositeNotFound } from '../composite/composite.errors'

const terminal = (status: string) => status === 'READY' || status === 'UNAVAILABLE'
async function inputs(attemptId: string) {
  const { readCompletedCompositeBundleInputs } = await import('../assessment-runtime/unified-aggregate-finalizer.service')
  const input = await readCompletedCompositeBundleInputs(attemptId)
  const { frozen, bindings } = readInstance(input.parent.compositeAssessment.bundleInstance)
  const cognitive = [], scale = [], situational = []
  for (const slot of frozen.bundleSnapshot.slotBindings) {
    if (slot.unitType === 'FORM') continue
    const binding = bindings.slots.find(v => v.slotKey === slot.slotKey && v.unitType === slot.unitType)
    if (!binding) throw new Error('BUNDLE_SLOT_BINDING_MISSING')
    const payload = input.payloads.find(v => v.header.slotKey === compositeItemSlotKey(binding.itemId, slot.unitType as 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'))
    if (!payload?.envelope) throw new Error('BUNDLE_CANONICAL_SOURCE_MISSING')
    const value = { slotKey: slot.slotKey, expectedInstrumentKey: slot.instrumentKey, expectedInstrumentVersion: slot.instrumentVersion, envelope: payload.envelope }
    if (slot.unitType === 'COGNITIVE') cognitive.push(projectBundleCognitiveSourceFromCanonicalBridge(value))
    else if (slot.unitType === 'SCALE') scale.push(projectBundleScaleSourceFromCanonicalBridge(value))
    else situational.push(projectBundleSituationalSourceFromCanonicalBridge(value))
  }
  const values = contextValues(bindings.context, input.payloads.flatMap(v => v.facts?.items ?? []))
  const contextFacts = frozen.contextDefinition ? buildBundleContextFactsFromValues({
    definition: frozen.contextDefinition, values, frozenAt: input.parent.completedAt,
  }) : null
  return { ...input, frozen, cognitive, scale, situational, contextFacts }
}

// Calculation can run more than once after a crash; the immutable output is committed once.
// No transaction spans engine execution. There is no fire-and-forget scheduling.
export async function processAnalysis(id: string) {
  const row = await prisma.bundleAnalysis.findUnique({ where: { id } })
  if (!row || terminal(row.status)) return row
  const admitted = await prisma.bundleAnalysis.updateMany({ where: { id, status: { in: ['PENDING','FAILED'] }, retryCount: { lt: 5 } },
    data: { status: 'PENDING', retryCount: { increment: 1 }, errorCode: null } })
  if (!admitted.count) return row
  let phase = 'SOURCE'
  try {
    const source = await inputs(row.attemptId)
    if (source.parent.attemptEpoch !== row.attemptEpoch || source.parent.aggregateInputHash !== row.parentInputHash) throw new Error('BUNDLE_STALE_SOURCE')
    const target = readFrozenBundleProductionDefinition(decryptCognitivePayload(row.targetDefinitionEncrypted))
    if (target.contentHash !== row.targetDefinitionHash) throw new Error('BUNDLE_TARGET_HASH_MISMATCH')
    phase = 'ENGINE'
    let facts
    if (row.purpose === 'REANALYSIS') {
      const result = runExplicitBundleReanalysis({
        request: { schemaVersion: 1, targetBundleKey: target.bundleSnapshot.bundleKey, targetBundleVersion: target.bundleSnapshot.bundleVersion,
          frozenCognitiveSources: source.cognitive, frozenScaleSources: source.scale, frozenSituationalSources: source.situational,
          frozenContextFacts: source.contextFacts, aggregateInputHash: null, actorUserId: row.generatedBy! },
        resolveTargetDefinition: () => target.bundleSnapshot.bundleDefinition, resolveContextDefinition: () => target.contextDefinition, ruleSet: target.ruleSet, declarativePackage: target.declarativePackage,
      })
      if (!result.ok) throw new Error('BUNDLE_REANALYSIS_' + result.reason)
      facts = result.reportFacts
    } else {
      const snapshot = target.bundleSnapshot
      const compiledRuntime = compileBundleRuntimeFromFrozenRead({ family: 'ASSESSMENT_BUNDLE', snapshotVersion: 3, snapshot })
      const aggregateInputHash = computeReanalysisAggregateInputHash({ snapshotHash: snapshot.snapshotHash,
        compiledBundleRuntimeHash: compiledRuntime.compiledRuntimeHash, cognitiveSources: source.cognitive, scaleSources: source.scale,
        situationalSources: source.situational, contextSnapshotHash: source.contextFacts?.contextSnapshotHash ?? null })
      facts = projectBundleReportFacts({ registry: createProductBundleAnalysisEngineRegistry(), engineInput: {
        snapshot, compiledRuntime, aggregateInputHash, cognitiveSources: source.cognitive, scaleSources: source.scale,
        situationalSources: source.situational, contextFacts: source.contextFacts, evidence: [], ruleSet: target.ruleSet ?? undefined, declarativePackage: target.declarativePackage,
      } })
    }
    phase = 'PERSIST'
    const payloadEncrypted = encryptCognitivePayload(facts), factsHash = canonicalHash(facts)
    await prisma.$transaction(async tx => {
      // Match FINAL's lock order: parent first; never acquire Unit locks from analysis.
      await tx.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id = ${row.attemptId} FOR UPDATE`
      const parent = await tx.compositeAssessmentAttempt.findUnique({ where: { id: row.attemptId } })
      if (!parent || parent.status !== 'COMPLETED' || parent.attemptEpoch !== row.attemptEpoch || parent.aggregateInputHash !== row.parentInputHash) throw new Error('BUNDLE_STALE_SOURCE')
      await tx.bundleAnalysis.updateMany({ where: { id, status: 'PENDING' }, data: {
        status: facts.enginePayload.kind === 'UNAVAILABLE' || ['invalid','unavailable'].includes(facts.quality.overall) ? 'UNAVAILABLE' : 'READY',
        payloadEncrypted, factsHash, aggregateInputHash: facts.provenance.aggregateInputHash, errorCode: null,
      } })
    })
  } catch (error) {
    // Error messages may contain evidence; persist a bounded category only.
    await prisma.bundleAnalysis.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'FAILED', errorCode: 'BUNDLE_ANALYSIS_' + phase + '_FAILED' } })
    logger.warn('Bundle analysis requires recovery', { analysisId: id, phase })
  }
  return prisma.bundleAnalysis.findUnique({ where: { id } })
}

export async function processInitial(attemptId: string) {
  try {
    const parent = await prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, select: { attemptEpoch: true } })
    if (!parent) return
    const row = await prisma.bundleAnalysis.findUnique({ where: { attemptId_attemptEpoch_requestKey: { attemptId, attemptEpoch: parent.attemptEpoch, requestKey: 'INITIAL' } } })
    if (row && row.retryCount < 3) await processAnalysis(row.id)
  } catch {
    // A committed PENDING row is the durable repair signal even if the DB drops
    // between completion and processing. Explicit retry resumes it.
    logger.warn('Bundle completion persisted; analysis recovery deferred', { attemptId })
  }
}

export async function readReport(attemptId: string, audience: BundleReportAudienceV1, analysisId?: string) {
  const parent = await prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, include: { compositeAssessment: { include: { bundleInstance: true } } } })
  const instance = parent?.compositeAssessment.bundleInstance
  if (!parent || !instance) throw compositeNotFound('Bundle 报告不存在')
  const row = analysisId ? await prisma.bundleAnalysis.findFirst({ where: { id: analysisId, attemptId, attemptEpoch: parent.attemptEpoch } })
    : await prisma.bundleAnalysis.findUnique({ where: { attemptId_attemptEpoch_requestKey: { attemptId, attemptEpoch: parent.attemptEpoch, requestKey: 'INITIAL' } } })
  if (!row) throw compositeNotFound('分析记录不存在')
  const target = readFrozenBundleProductionDefinition(decryptCognitivePayload(row.targetDefinitionEncrypted))
  if (target.contentHash !== row.targetDefinitionHash) throw compositeConflict('报告定义校验失败')
  let view: ReturnType<typeof projectBundleAudienceView> | null = null
  if (terminal(row.status)) {
    const facts = validateBundleReportFacts(decryptCognitivePayload(row.payloadEncrypted!))
    if (canonicalHash(facts) !== row.factsHash || facts.identity.snapshotHash !== target.bundleSnapshot.snapshotHash) throw compositeConflict('报告快照校验失败')
    view = projectBundleAudienceView(facts, audience)
    const {bindings} = readInstance(instance)
    const scaleAdmissions = await prisma.assessment.findMany({where:{compositeAttemptId:attemptId},select:{compositeItemId:true,runtimeSnapshotEncrypted:true}})
    let restrictSummary = false
    for (const binding of bindings.slots.filter(slot => slot.unitType === 'SCALE')) {
      let policy = binding.scaleDisclosure
      const admission = scaleAdmissions.find(item => item.compositeItemId === binding.itemId)
      // The policy frozen at actual admission takes precedence over creation-time compatibility.
      try {
        if (!admission?.runtimeSnapshotEncrypted) policy = denyAllScaleProjectionPolicy()
        else {
          const runtime = decryptFrozenScaleRuntimeSnapshot(admission.runtimeSnapshotEncrypted)
          if (runtime.schemaVersion === 2) policy = scaleProjectionPolicyFromCompiled(runtime.compiledPolicy)
        }
      } catch { policy = denyAllScaleProjectionPolicy() }
      const capabilities = policy && policy.disposition !== 'UNKNOWN'
        ? resolveAudienceDisclosure(policy.disclosure, audience === 'student' ? 'subject' : audience === 'parent' ? 'respondent' : audience === 'admin' ? 'researcher' : 'teacher') : null
      for (let i=0;i<facts.evidence.length;i++) {
        const evidence = facts.evidence[i]
        if (evidence.source.kind !== 'SCALE_SCORE' || evidence.source.slotKey !== binding.slotKey) continue
        if (!capabilities?.numericScores) view.evidence[i].value = {state:'redacted'}
        if (!capabilities?.scoreDerivedLabels) view.evidence[i].criterionBandKey = null
        if (!capabilities?.resultQualityDetails) view.evidence[i].quality = 'unavailable'
      }
      if (!capabilities?.individualInterpretations || !capabilities?.scoreDerivedLabels) restrictSummary = true
    }
    if (restrictSummary) {
      view.engineSummary = {engineKey:facts.enginePayload.engineKey,engineVersion:facts.enginePayload.engineVersion,kind:facts.enginePayload.kind}
      view.recommendations = []
      view.quality = {overall:'unavailable',notes:[]}
    }
  if (view && target.declarativePackage && facts?.enginePayload.kind === 'COMPUTED') {
    const payload = facts.enginePayload.payload as { conclusions?: Array<{ ruleId: string; text: string; evidenceKeys: string[] }> }
    const audienceView = view
    const allowed = (payload.conclusions ?? []).filter(c => c.evidenceKeys.every(key => {
      const item = audienceView.evidence.find(e => e.evidenceKey === key)
      return item && item.sourceKind !== 'CONTEXT_FACT' && item.value.state !== 'redacted'
    }))
    ;(view as any).declarativeState = audienceView.quality.overall === 'limited' ? target.declarativePackage.report.states.limited
      : audienceView.quality.overall === 'invalid' || audienceView.quality.overall === 'unavailable' ? target.declarativePackage.report.states.unavailable
      : audienceView.evidence.some(e => e.value.state === 'missing') ? target.declarativePackage.report.states.missing : null
    ;(view as any).blocks = target.declarativePackage.report.blocks.filter(b => b.audience.includes(audience)).map(block => ({
      blockId: block.blockId, kind: block.kind, title: block.title,
      evidence: block.kind === 'evidence' ? audienceView.evidence.filter(e => e.sourceKind !== 'CONTEXT_FACT') : [],
      limitations: block.kind === 'limitations' ? audienceView.limitations : [],
      conclusions: audienceView.quality.overall === 'unavailable' ? [] : allowed.filter(c => block.ruleIds.includes(c.ruleId)),
    }))
  }
  }
  return { schemaVersion: 1, snapshotFamily: 'ASSESSMENT_BUNDLE', analysisId: row.id, status: row.status, purpose: row.purpose,
    factsHash: row.factsHash, definitionHash: row.targetDefinitionHash, retryCount: row.retryCount,
    reportDefinition: target.reportDefinition, createdAt: row.createdAt, view }
}
export async function authorizeStaff(actor: BundleActor, attemptId: string) {
  const parent = await prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, include: { compositeAssessment: true } })
  if (!parent || parent.compositeAssessment.productKind !== 'ASSESSMENT_BUNDLE' || parent.assignmentRef) throw compositeNotFound()
  owner(actor, parent.compositeAssessment)
  if (parent.status !== 'COMPLETED') throw compositeConflict('作答尚未完成')
  return parent
}
export async function history(actor: BundleActor, attemptId: string) {
  const parent = await authorizeStaff(actor, attemptId)
  return prisma.bundleAnalysis.findMany({ where: { attemptId, attemptEpoch: parent.attemptEpoch }, orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, purpose: true, generatedBy: true, reason: true, previousAnalysisId: true, factsHash: true,
      targetDefinitionHash: true, createdAt: true, retryCount: true, errorCode: true }, take: 100 })
}
const reanalysisSchema = z.object({ requestId: z.string().uuid(), targetBundleKey: z.string().min(1),
  targetBundleVersion: z.string().regex(/^\d+\.\d+\.\d+$/), reason: z.string().trim().min(1).max(1000), previousAnalysisId: z.string().uuid() }).strict()
export async function reanalyze(actor: BundleActor, attemptId: string, raw: unknown, provider: BundleDefinitionProvider,
  assertEligible: (actor: BundleActor, key: string, version: string, db?: Prisma.TransactionClient) => Promise<unknown>) {
  const parent = await authorizeStaff(actor, attemptId), input = reanalysisSchema.parse(raw)
  const requestKey = input.requestId
  const existing = await prisma.bundleAnalysis.findUnique({ where: { attemptId_attemptEpoch_requestKey: { attemptId, attemptEpoch: parent.attemptEpoch, requestKey } } })
  if (existing) {
    const target = readFrozenBundleProductionDefinition(decryptCognitivePayload(existing.targetDefinitionEncrypted))
    if (existing.generatedBy !== actor.userId || existing.reason !== input.reason || existing.previousAnalysisId !== input.previousAnalysisId ||
        target.bundleSnapshot.bundleKey !== input.targetBundleKey || target.bundleSnapshot.bundleVersion !== input.targetBundleVersion) throw compositeConflict('相同 requestId 不能改变重分析请求')
    return readReport(attemptId, actor.role === 'ADMIN' ? 'admin' : 'teacher', existing.id)
  }
  const entry = await assertEligible(actor, input.targetBundleKey, input.targetBundleVersion) as import('./definition-provider').BundleDefinitionEntry
  const target = freezeBundleProductionDefinition(entry, { frozenAt: new Date().toISOString(), sourceReference: 'code-catalog' })
  const source = await inputs(attemptId)
  const previous = await prisma.bundleAnalysis.findFirst({ where: { id: input.previousAnalysisId, attemptId, attemptEpoch: parent.attemptEpoch } })
  if (!previous || !terminal(previous.status)) throw compositeBadRequest('前序分析不存在或尚未生成报告')
  // Validate exact compatibility before appending a history record.
  const probe = runExplicitBundleReanalysis({ request: { schemaVersion: 1, targetBundleKey: input.targetBundleKey, targetBundleVersion: input.targetBundleVersion,
    frozenCognitiveSources: source.cognitive, frozenScaleSources: source.scale, frozenSituationalSources: source.situational,
    frozenContextFacts: source.contextFacts, aggregateInputHash: null, actorUserId: actor.userId },
    resolveTargetDefinition: () => entry.definition, resolveContextDefinition: () => entry.contextDefinition, ruleSet: entry.ruleSet, declarativePackage: entry.declarativePackage })
  if (!probe.ok) throw compositeConflict(probe.reason)
  let row
  try {
    row = await prisma.$transaction(async tx => {
      // Serialize new history admission with package HOLD/RETIRED transitions.
      await assertEligible(actor, input.targetBundleKey, input.targetBundleVersion, tx)
      return tx.bundleAnalysis.create({ data: { attemptId, attemptEpoch: parent.attemptEpoch, requestKey, purpose: 'REANALYSIS',
      parentInputHash: parent.aggregateInputHash!, targetDefinitionHash: target.contentHash, targetDefinitionEncrypted: encryptCognitivePayload(target),
      generatedBy: actor.userId, reason: input.reason, previousAnalysisId: previous.id } })
    })
  } catch (error: any) {
    if (error.code !== 'P2002') throw error
    return reanalyze(actor, attemptId, raw, provider, assertEligible)
  }
  await processAnalysis(row.id)
  return readReport(attemptId, actor.role === 'ADMIN' ? 'admin' : 'teacher', row.id)
}
