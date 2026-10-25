import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import { canonicalHash } from '../assessment-runtime/canonical'
import { projectStoredMeasurement } from '../assessment-runtime/measurement-result'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { buildSituationalBundleBridge, parseCanonicalUnitResultEnvelope,
  projectSituationCanonicalUnitResult, type CanonicalUnitResultEnvelopeV1 } from '../assessment-runtime/unit-result'
import type { SituationalResultV1 } from '../situational/situation-scoring'
import { parseSituationalRawSubmissionPayload, SITUATIONAL_RAW_ENCODING_VERSION } from '../situational/situational-raw-submission'
import { assertRowMatchesSnapshot } from '../situational/situational-runtime.service'
import type { FrozenUnitResult } from './final.compute'
import type { ResearchFrozenPublication, ResearchFrozenUnit } from './publication.service'
import { assertSurveySituationalReceiptBinding, SURVEY_NATIVE_SJT_PROTOCOL,
  surveySituationalExecutionProtocol, surveySituationalReceiptReferenceSchema,
  SurveySituationalProtocolError, type SurveySituationalReceiptReference } from './situational-native.contract'
import { frozenSurveyNativeSituationalRuntime } from './situational-native.definition'

export type SurveyNativeSituationalUnitResult = FrozenUnitResult & {
  nativeReference: SurveySituationalReceiptReference
}
export interface LoadedSurveySituationalResult {
  reference: SurveySituationalReceiptReference
  slotKey: string
  completedAt: Date
  result: SituationalResultV1
  canonicalResult: CanonicalUnitResultEnvelopeV1
  unitResult: SurveyNativeSituationalUnitResult
  /** The original child payload, never a second Survey raw-answer store. */
  raw?: ReturnType<typeof parseSituationalRawSubmissionPayload>
}

const fail = (code: string): never => { throw new SurveySituationalProtocolError(code) }
const storedResultSelect = {
  id: true, surveyAttemptId: true, surveyPublicationId: true, surveySlotKey: true,
  userId: true, compositeAttemptId: true, compositeItemId: true, compositeSlotKey: true,
  status: true, attemptEpoch: true, instrumentKey: true, instrumentVersion: true,
  definitionHash: true, compiledRuntimeHash: true, scorerKey: true, scoringVersion: true,
  runtimeGeneration: true, deliveryMode: true, frozenAt: true,
  submissionId: true, submissionPayloadHash: true, completedAt: true,
  resultEncrypted: true, canonicalResultEncrypted: true,
} as const
const rawSelect = {
  attemptId: true, attemptEpoch: true, responseCount: true, payloadHash: true,
  payloadSchemaVersion: true, encodingVersion: true, payloadEncrypted: true,
} as const
type StoredResultRow = Prisma.SituationalAttemptGetPayload<{ select: typeof storedResultSelect }> & {
  rawSubmission?: Prisma.SituationalRawSubmissionGetPayload<{ select: typeof rawSelect }> | null
}

function parseReferences(value: unknown): SurveySituationalReceiptReference[] {
  const parsed = z.array(surveySituationalReceiptReferenceSchema).max(30).safeParse(value)
  if (!parsed.success) return fail('SURVEY_SJT_RECEIPT_INVALID')
  const refs = parsed.data
  if (new Set(refs.map(ref => ref.attemptId)).size !== refs.length
    || new Set(refs.map(ref => ref.submissionId)).size !== refs.length)
    fail('SURVEY_SJT_RECEIPT_DUPLICATE')
  return refs
}

/** Pure stored-fact verification. Callers own current authority/locks; synthetic
 * governance trials use the identical codec with explicitly synthetic rows. */
export function decodeSurveySituationalResult(row: StoredResultRow, reference: SurveySituationalReceiptReference,
  unit: ResearchFrozenUnit, input: { surveyAttemptId: string; surveyPublicationId: string; includeRaw?: boolean }): LoadedSurveySituationalResult {
  try {
    const { header, snapshot } = frozenSurveyNativeSituationalRuntime(unit)
    if (row.surveyAttemptId !== input.surveyAttemptId || row.surveyPublicationId !== input.surveyPublicationId
      || row.surveySlotKey !== unit.instrumentKey || row.userId !== null
      || row.compositeAttemptId !== null || row.compositeItemId !== null || row.compositeSlotKey !== null)
      fail('SURVEY_SJT_RECEIPT_SCOPE_MISMATCH')
    assertSurveySituationalReceiptBinding(reference, {
      surveyAttemptId: input.surveyAttemptId, surveyPublicationId: input.surveyPublicationId,
      surveySlotKey: unit.instrumentKey, attemptEpoch: header.attemptEpoch,
      instrumentKey: header.instrumentKey, instrumentVersion: header.instrumentVersion,
      definitionHash: header.definitionHash, compiledRuntimeHash: header.compiledRuntimeHash,
      scoringVersion: header.scoringVersion,
    }, { ...row, surveyAttemptId: row.surveyAttemptId!, surveyPublicationId: row.surveyPublicationId!,
      surveySlotKey: row.surveySlotKey! })
    assertRowMatchesSnapshot(row, snapshot)
    if (!row.resultEncrypted || !row.canonicalResultEncrypted || !row.completedAt)
      fail('SURVEY_SJT_RECEIPT_NOT_COMPLETED')

    const result = decryptUnifiedRuntimePayload<SituationalResultV1>(row.resultEncrypted!)
    const canonicalResult = parseCanonicalUnitResultEnvelope(
      decryptUnifiedRuntimePayload<unknown>(row.canonicalResultEncrypted!))
    if (!result || !Array.isArray(result.metrics) || !result.quality
      || !Array.isArray(result.quality.flags)
      || new Set(result.metrics.map(metric => metric.key)).size !== result.metrics.length
      || result.metrics.some(metric => !metric || typeof metric.key !== 'string'
        || (metric.value !== null && (typeof metric.value !== 'number' || !Number.isFinite(metric.value)))
        || !['calculated', 'limited', 'not_calculable'].includes(metric.status)))
      fail('SURVEY_SJT_RECEIPT_RESULT_INVALID')
    const provenance = canonicalResult.persistenceProvenance
    // Project the already stored output through the shared canonical adapter.
    // This validates its exact source identity and metrics without rescoring.
    const core = projectSituationCanonicalUnitResult({ result, runtime: snapshot.compiledRuntime, contextHash: null })
    if (canonicalResult.core.unitType !== 'SITUATIONAL'
      || canonicalHash(core) !== canonicalResult.resultHash
      || provenance.sourceType !== 'SITUATIONAL_ATTEMPT'
      || provenance.sourceAttemptId !== row.id || provenance.sourceSubmissionId !== reference.submissionId
      || canonicalResult.completedAt !== row.completedAt!.toISOString()
      || !canonicalResult.bundleBridge
      || canonicalHash(buildSituationalBundleBridge(result)) !== canonicalResult.bundleBridgeHash)
      fail('SURVEY_SJT_RECEIPT_RESULT_MISMATCH')
    const model = snapshot.definition.scoring.model
    if (model ? !result.model || result.model.modelKey !== model.modelKey
      || result.model.modelVersion !== model.modelVersion || result.model.scoringVersion !== header.scoringVersion
      : result.model !== undefined)
      fail('SURVEY_SJT_RECEIPT_RESULT_MISMATCH')

    const measurement = projectStoredMeasurement({ identity: {
      schemaVersion: 1, kind: 'SJT', sourceDigest: unit.sourceDigest, scoringDigest: unit.scoringDigest,
      engineVersion: snapshot.compiledRuntime.compilerVersion, scoringVersion: header.scoringVersion,
      protocolDigest: header.compiledRuntimeHash,
    }, storedResult: result, metricUnits: Object.fromEntries(canonicalResult.core.metrics
      .flatMap(metric => metric.unit === undefined ? [] : [[metric.key, metric.unit]])) })
    const loaded: LoadedSurveySituationalResult = {
      reference, slotKey: unit.instrumentKey, completedAt: row.completedAt!, result, canonicalResult,
      unitResult: { instrumentKey: unit.instrumentKey, kind: 'SJT', sourceDigest: unit.sourceDigest,
        scoringDigest: unit.scoringDigest, rawAnswers: {}, missing: [], privateScoring: result,
        nativeReference: reference, measurement },
    }
    if (input.includeRaw) {
      const stored = row.rawSubmission
      if (!stored || stored.attemptId !== row.id || stored.attemptEpoch !== header.attemptEpoch
        || stored.payloadHash !== reference.payloadHash)
        fail('SURVEY_SJT_RECEIPT_RAW_MISMATCH')
      const raw = parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload<unknown>(stored!.payloadEncrypted))
      // This staged upload protocol is deliberately not the online-answer protocol.
      if (raw.schemaVersion !== 1 || raw.attemptEpoch !== header.attemptEpoch
        || stored!.payloadSchemaVersion !== raw.schemaVersion || stored!.encodingVersion !== SITUATIONAL_RAW_ENCODING_VERSION
        || stored!.responseCount !== raw.responses.length
        || prepareCanonicalSubmission({ responses: raw.responses,
          ...(raw.researchCapture ? { researchCapture: raw.researchCapture } : {}) }).hash !== reference.payloadHash)
        fail('SURVEY_SJT_RECEIPT_RAW_MISMATCH')
      loaded.raw = raw
    }
    return loaded
  } catch (error) {
    if (error instanceof SurveySituationalProtocolError) throw error
    return fail('SURVEY_SJT_RECEIPT_STORED_DATA_INVALID')
  }
}

/** Shared reader for parent FINAL and authorized export. The caller must hold
 * current project/wave/parent Attempt authority locks in THIS transaction and
 * supply its verified, selected frozen publication. This function acquires only
 * child locks, in ID order, and never scores, writes raw data, or trusts a client
 * completion flag. Parent flow validation decides the exact required unit set.
 * includeRaw is for an already-authorized researcher export, never a participant.
 */
export async function loadSurveySituationalResults(tx: Prisma.TransactionClient, input: {
  surveyAttemptId: string
  surveyPublicationId: string
  snapshot: ResearchFrozenPublication
  references: unknown
  includeRaw?: boolean
}): Promise<LoadedSurveySituationalResult[]> {
  const references = parseReferences(input.references)
  const units = new Map<string, ResearchFrozenUnit>()
  for (const unit of input.snapshot.units) {
    if (unit.kind !== 'SJT' && unit.executionProtocol === undefined) continue
    if (surveySituationalExecutionProtocol(unit) !== SURVEY_NATIVE_SJT_PROTOCOL) continue
    if (units.has(unit.instrumentKey)) fail('SURVEY_SJT_RECEIPT_DUPLICATE_SLOT')
    units.set(unit.instrumentKey, unit)
  }
  if (!references.length) return []
  if (!units.size) return fail('SURVEY_SJT_RECEIPT_SLOT_NOT_SELECTED')
  const ids = references.map(reference => reference.attemptId)
  // Admission owns payload budgets. Do not introduce a narrower read limit
  // that could strand accepted children; this batch is bounded to 30 receipts.
  // The raw blob remains unread unless explicitly requested.
  const locked = await tx.$queryRaw<Array<{ id: string; slotKey: string }>>(Prisma.sql`
    SELECT a.id, a.survey_slot_key AS "slotKey"
    FROM situational_attempts a
    WHERE a.survey_attempt_id = ${input.surveyAttemptId} AND a.survey_publication_id = ${input.surveyPublicationId}
      AND a.id IN (${Prisma.join(ids)})
      AND a.survey_slot_key IN (${Prisma.join([...units.keys()])})
    ORDER BY a.id FOR UPDATE OF a`)
  const allowed = new Set(ids)
  if (locked.length !== references.length || new Set(locked.map(row => row.id)).size !== locked.length
    || locked.some(row => !allowed.has(row.id))) fail('SURVEY_SJT_RECEIPT_SCOPE_MISMATCH')
  if (locked.some(row => !units.has(row.slotKey))) fail('SURVEY_SJT_RECEIPT_SLOT_NOT_SELECTED')
  if (new Set(locked.map(row => row.slotKey)).size !== locked.length) fail('SURVEY_SJT_RECEIPT_DUPLICATE_SLOT')
  const rows: StoredResultRow[] = await tx.situationalAttempt.findMany({ where: {
    surveyAttemptId: input.surveyAttemptId, surveyPublicationId: input.surveyPublicationId,
    surveySlotKey: { in: [...units.keys()] }, id: { in: ids },
  }, select: { ...storedResultSelect, ...(input.includeRaw ? { rawSubmission: { select: rawSelect } } : {}) } })
  const byId = new Map(rows.map(row => [row.id, row]))
  const slots = new Set<string>()
  if (rows.length !== references.length || byId.size !== rows.length) fail('SURVEY_SJT_RECEIPT_SCOPE_MISMATCH')
  return references.map(reference => {
    const row = byId.get(reference.attemptId)
    const unit = row?.surveySlotKey ? units.get(row.surveySlotKey) : undefined
    if (!row || !unit) return fail('SURVEY_SJT_RECEIPT_SLOT_NOT_SELECTED')
    if (slots.has(unit.instrumentKey)) fail('SURVEY_SJT_RECEIPT_DUPLICATE_SLOT')
    slots.add(unit.instrumentKey)
    return decodeSurveySituationalResult(row, reference, unit, input)
  })
}

/** Admission-only reader for server-derived earlier slots. It does not accept
 * participant completion claims or duplicate raw/results into ordinary locks.
 * Parent/slot/epoch bindings and completed facts are immutable; FINAL will
 * independently verify the participant's explicit receipt set again. */
export async function loadCompletedSurveySituationalPrefix(tx:Prisma.TransactionClient,input:{
  surveyAttemptId:string;surveyPublicationId:string;snapshot:ResearchFrozenPublication;slotKeys:readonly string[];
}):Promise<Map<string,LoadedSurveySituationalResult>>{
  if(!input.slotKeys.length)return new Map()
  const keys=new Set(input.slotKeys)
  if(keys.size!==input.slotKeys.length||input.slotKeys.some(key=>!input.snapshot.units.some(unit=>
    unit.instrumentKey===key&&unit.kind==='SJT'&&unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL)))
    fail('SURVEY_SJT_RECEIPT_SLOT_NOT_SELECTED')
  const rows=await tx.situationalAttempt.findMany({where:{surveyAttemptId:input.surveyAttemptId,
    surveyPublicationId:input.surveyPublicationId,surveySlotKey:{in:[...keys]}},orderBy:{attemptEpoch:'desc'},
    select:{id:true,surveySlotKey:true,attemptEpoch:true,status:true,submissionId:true,submissionPayloadHash:true}})
  // Native protocol V1 freezes epoch 1 and permits exactly one durable child
  // per slot. Do not silently pick an old completion after a future replacement.
  if(rows.length!==keys.size||new Set(rows.map(row=>row.surveySlotKey)).size!==keys.size
    ||rows.some(row=>row.attemptEpoch!==1||row.status!=='COMPLETED'||!row.submissionId||!row.submissionPayloadHash))
    fail('SURVEY_SJT_RECEIPT_NOT_COMPLETED')
  const loaded=await loadSurveySituationalResults(tx,{...input,references:rows.map(row=>({
    protocol:SURVEY_NATIVE_SJT_PROTOCOL,attemptId:row.id,submissionId:row.submissionId!,payloadHash:row.submissionPayloadHash!,
  }))})
  const results=new Map(loaded.map(result=>[result.slotKey,result]))
  if(results.size!==keys.size||[...keys].some(key=>!results.has(key)))fail('SURVEY_SJT_RECEIPT_SCOPE_MISMATCH')
  return results
}
