import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import type { TrainingAnalysisRequestV1 } from './types'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const key = z.string().min(1).max(200)
export const trainingAnalysisSelectorSchema = z.object({
  schemaVersion: z.literal(1),
  courseId: z.string().uuid(),
  mode: z.enum(['PAIRWISE', 'FULL_CASE']),
  waves: z.array(z.object({
    waveKey: key, taskId: z.string().uuid(), publication: z.string().datetime(),
    configDigest: hash.nullable(), variantKey: key.nullable(),
    metrics: z.array(z.object({metricKey: key, itemId: z.string().uuid()}).strict()).min(1).max(32),
  }).strict()).min(2).max(8),
}).strict()

export function parseTrainingAnalysisSelector(value: unknown, courseId?: string): TrainingAnalysisRequestV1 {
  const result = trainingAnalysisSelectorSchema.safeParse(value)
  if (!result.success || (courseId !== undefined && result.data.courseId !== courseId)) {
    throw Object.assign(new Error('分析选择器无效或不属于当前课程'), {statusCode: 400, code: 'TRAINING_ANALYSIS_SELECTOR_INVALID'})
  }
  const request = result.data
  if (request.mode === 'PAIRWISE' && request.waves.length !== 2) {
    throw Object.assign(new Error('配对分析需要恰好两个波次'), {statusCode: 400, code: 'TRAINING_ANALYSIS_PAIR_REQUIRED'})
  }
  // Logical labels cannot turn the same exact selected source/metric into two
  // timepoints. Reject before shared batch readers see duplicate source rows.
  // Different tasks or frozen variants remain distinct even when published together.
  const sources = new Map<string, number>()
  request.waves.forEach((wave, index) => {
    for (const metric of wave.metrics) {
      const identity = JSON.stringify([wave.taskId, wave.publication, wave.configDigest, wave.variantKey, metric.itemId, metric.metricKey])
      const prior = sources.get(identity)
      if (prior !== undefined && prior !== index) {
        throw Object.assign(new Error('同一测量来源不能映射为两个时间点'), {statusCode: 409, code: 'TRAINING_ANALYSIS_OBSERVATION_ALIAS'})
      }
      sources.set(identity, index)
    }
  })
  // Normalize ordering without changing temporal Wave order or logical keys.
  return {...request, waves: request.waves.map(wave => ({...wave, metrics: [...wave.metrics].sort((a,b) => `${a.itemId}:${a.metricKey}`.localeCompare(`${b.itemId}:${b.metricKey}`))}))}
}

export const trainingAnalysisFrozenSourceSchema = z.object({
  waveKey: key, taskId: z.string().uuid(), attemptId: z.string().uuid(),
  attemptEpoch: z.number().int().positive(), sourceHash: hash,
  sourceHashes: z.record(z.string()),
  status: z.string(), taskSatisfaction: z.string().nullable(),
}).strict()
const dictionaryColumn = z.object({
  columnKey: key, waveKey: key, taskId: z.string().uuid(), publication: z.string().datetime(),
  configDigest: hash.nullable(), variantKey: key.nullable(), metricKey: key, itemId: z.string().uuid(),
  measurement: z.object({instrumentKey:key,scoreKey:key,scoringDigest:key,responseSignature:key,respondentType:key,unit:z.string().nullable(),version:key}).strict().nullable(),
  valueType: z.literal('NUMBER'), missingReasons: z.array(z.string()).max(32),
}).strict()
export const trainingAnalysisManifestSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('TRAINING_ANALYSIS'),
  // User.id includes authenticated historical identifiers; preserve bytes exactly.
  courseId: z.string().uuid(), actor: z.object({id:key,role:z.enum(['ADMIN','TEACHER'])}).strict(),
  selector: trainingAnalysisSelectorSchema,
  definitionHash: hash, sourceHash: hash, authorityHash: hash, qualityHash: hash,
  sourceCutoff: z.string().datetime(), manifestHash: hash,
  sources: z.array(trainingAnalysisFrozenSourceSchema).max(6000),
  dictionary: z.array(dictionaryColumn).max(512),
  observationCount: z.number().int().nonnegative().max(384000),
}).strict()
export type TrainingAnalysisManifestV1 = z.infer<typeof trainingAnalysisManifestSchema>
export type TrainingAnalysisActor = TrainingAnalysisManifestV1['actor']
export const trainingManifestHash = (manifest: Omit<TrainingAnalysisManifestV1,'manifestHash'>): string => canonicalHash(manifest)
export function trainingManifestSummary(manifest: TrainingAnalysisManifestV1) {
  return {schemaVersion:1 as const,manifestHash:manifest.manifestHash,definitionHash:manifest.definitionHash,
    sourceHash:manifest.sourceHash,qualityHash:manifest.qualityHash,authorityHash:manifest.authorityHash,
    sourceCutoff:manifest.sourceCutoff,sourceCount:manifest.sources.length,observationCount:manifest.observationCount}
}
export function assertTrainingManifest(value: unknown): TrainingAnalysisManifestV1 {
  const manifest = trainingAnalysisManifestSchema.parse(value)
  const {manifestHash,...unsigned} = manifest
  if (manifestHash !== trainingManifestHash(unsigned) || manifest.courseId !== manifest.selector.courseId
      || manifest.definitionHash !== canonicalHash(manifest.selector)) {
    throw Object.assign(new Error('分析清单完整性校验失败'), {statusCode:409,code:'TRAINING_ANALYSIS_MANIFEST_INVALID'})
  }
  return manifest
}
