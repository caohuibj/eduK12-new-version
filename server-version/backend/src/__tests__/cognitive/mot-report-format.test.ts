import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }))
import { motDefinition, getMotReportBundle } from '../../modules/cognitive/content-candidates/mot/package'
import { motConfig } from '../../modules/cognitive/content-candidates/mot/protocol'
import { getCognitiveTaskResource } from '../../modules/cognitive/task-resource'
import { freezeNativeAssignmentProfile, readFrozenReport, type FrozenReportSnapshot } from '../../modules/cognitive/profile-freeze'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { prepareUnifiedCognitiveSessionConfigSnapshot } from '../../modules/cognitive/session.service'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import { parseCognitiveResultSnapshot } from '../../modules/cognitive/v2/result-snapshot'
import { cognitiveMeasurementRelease } from '../../modules/measurement-content/cognitive'
import { prepareRelease } from '../../modules/measurement-content/release'
import type { CognitiveScoreResult } from '../../modules/cognitive/v2/types'

const resource = getCognitiveTaskResource('mot', '1.1.1', '1.1.0')!
if (resource.kind !== 'native') throw Error('native MOT required')
const native = resource
const config = motConfig('experience')
const fresh = (): FrozenReportSnapshot => readFrozenReport(freezeNativeAssignmentProfile({ resource: native, baseConfig: config, profile: 'experience' }).resolvedReportSnapshotEncrypted)!
const historical = (): FrozenReportSnapshot => {
  const frozen = fresh(), bundle = getMotReportBundle('1.1.0')!
  return { ...frozen, reportDefinitionVersion: '1.1.0', v2ReportDefinition: bundle.report,
    metricDefinitions: bundle.metrics, qualityDefinitions: bundle.quality,
    v2MetricDefinitions: bundle.metrics, v2QualityDefinitions: bundle.quality }
}
const score: CognitiveScoreResult = { metrics: { meanTrackedTargets: 8/3, meanTargetsSpeed1: 3, meanTargetsSpeed4: 8/3, meanTargetsSpeed8: null },
  quality: { state: 'interpretable', flags: {}, reasons: [] }, audit: { trialCount: 9, scorerVersion: '1.1.0' } }
const project = (version: string, value = score) => {
  const bundle = getMotReportBundle(version)!
  return projectThreeLayerReport({ testType:'mot', configVersion:'1.0.0', protocolSignature:'a'.repeat(64), engineVersion:'1.1.1',
    scoringVersion:'1.1.0', profile:'experience', definition:bundle.report, metrics:value.metrics, score:value,
    metricDefinitions:bundle.metrics, qualityDefinitions:bundle.quality })
}
const metric = (report: ReturnType<typeof project>, key: string) => [...report.headline,...report.user,...report.detail].find(m => m.key === key)!

describe('MOT report-only 1.1.1 compatibility', () => {
  it('pins the historical bundle bytes and rounds only four means without changing values/null/gates', () => {
    const bytes = readFileSync('src/modules/cognitive/content-candidates/mot/report-bundle-1.1.0.json')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('29b432bc9aa0f9cddf0406a8d6950831c35e58c8c5257e770b4373b6f6b6649e')
    const old = getMotReportBundle('1.1.0')!, next = getMotReportBundle('1.1.1')!
    const expected = structuredClone(old); expected.report.version = '1.1.1'
    for (const key of ['meanTrackedTargets','meanTargetsSpeed1','meanTargetsSpeed4','meanTargetsSpeed8']) expected.metrics[key].precision = 1
    expect(next).toEqual(expected)
    expect(metric(project('1.1.1'),'meanTrackedTargets')).toMatchObject({value:8/3,formatted:'2.7'})
    expect(metric(project('1.1.0'),'meanTrackedTargets').formatted).toBe(String(8/3))
    expect(metric(project('1.1.1'),'meanTargetsSpeed1').formatted).toBe('3')
    expect(metric(project('1.1.1'),'meanTargetsSpeed8')).toMatchObject({value:null,formatted:'—'})
    const invalid = project('1.1.1',{...score,quality:{state:'invalid',flags:{noInterpretableCondition:true},reasons:['synthetic invalid']}})
    expect(invalid.headline).toEqual([]); expect(invalid.user).toEqual([])
    next.metrics.meanTrackedTargets.precision = 9
    expect(getMotReportBundle('1.1.1')!.metrics.meanTrackedTargets.precision).toBe(1)
  })
  it('reads old/new frozen descriptors exactly and refuses unknown, mixed, or wrong identity bundles', () => {
    for (const frozen of [historical(),fresh()]) {
      const bytes = JSON.stringify(frozen)
      expect(JSON.stringify(readFrozenReport(encryptCognitivePayload(frozen)))).toBe(bytes)
    }
    for (const mutate of [
      (f:FrozenReportSnapshot) => { f.reportDefinitionVersion='unknown' },
      (f:FrozenReportSnapshot) => { f.v2MetricDefinitions!.meanTrackedTargets.precision=1 },
      (f:FrozenReportSnapshot) => { f.nativeIdentity!.engineVersion='1.1.0' },
    ]) {
      const frozen=historical(); mutate(frozen)
      expect(() => readFrozenReport(encryptCognitivePayload(frozen))).toThrow('IDENTITY')
    }
  })
  it('new START preparation compiles the assignment frozen bundle, retains measurement identity, and does not write storage', async () => {
    const input={testType:'mot',engineVersion:'1.1.1',scoringVersion:'1.1.0',configVersion:'1.0.0',config}
    // Empty references must not perform any database access; the trap makes that contract observable.
    const db=new Proxy({}, {get(){throw Error('unexpected database access in reference-free preparation')}}) as NonNullable<Parameters<typeof prepareUnifiedCognitiveSessionConfigSnapshot>[0]['db']>
    const oldFrozen=historical(), oldBytes=JSON.stringify(oldFrozen)
    const old=await prepareUnifiedCognitiveSessionConfigSnapshot({...input,frozenReport:oldFrozen,db})
    const next=await prepareUnifiedCognitiveSessionConfigSnapshot({...input,frozenReport:fresh(),db})
    expect(old.compiledRuntime.reportDefinition.version).toBe('1.1.0')
    expect(next.compiledRuntime.reportDefinition.version).toBe('1.1.1')
    expect(old.snapshot.configHash).toBe(next.snapshot.configHash)
    expect(old.snapshot.protocolSignature).toBe(next.snapshot.protocolSignature)
    expect(old.compiledRuntime.sourceDefinitionHash).not.toBe(next.compiledRuntime.sourceDefinitionHash)
    expect(old.compiledRuntime.compiledRuntimeHash).not.toBe(next.compiledRuntime.compiledRuntimeHash)
    expect(JSON.stringify(oldFrozen)).toBe(oldBytes)
    await expect(prepareUnifiedCognitiveSessionConfigSnapshot({...input,config:{...config,profile:'research'},frozenReport:oldFrozen,db})).rejects.toThrow('tuple mismatch')
    await expect(prepareUnifiedCognitiveSessionConfigSnapshot({...input,configVersion:'wrong',frozenReport:oldFrozen,db})).rejects.toThrow('tuple mismatch')
  })
  it('leaves measurement release hashes and already stored old formatted reports unchanged', () => {
    const input={localId:'synthetic-report-precision',version:'1.0.0',testType:'mot',engineVersion:'1.1.1',scoringVersion:'1.1.0',configVersion:'1.0.0',config,scope:{kind:'PLATFORM' as const}}
    const currentReport=motDefinition.report,currentMetrics=motDefinition.metrics
    const next=prepareRelease(cognitiveMeasurementRelease(input))
    let old: typeof next
    try { const bundle=getMotReportBundle('1.1.0')!; motDefinition.report=bundle.report; motDefinition.metrics=bundle.metrics
      old=prepareRelease(cognitiveMeasurementRelease(input))
    } finally { motDefinition.report=currentReport; motDefinition.metrics=currentMetrics }
    expect(old.contentHash).toBe(next.contentHash); expect(old.content).toEqual(next.content)
    const stored={schemaVersion:1,completedAt:'2026-10-26T00:00:00.000Z',testType:'mot',configVersion:'1.0.0',engineVersion:'1.1.1',scoringVersion:'1.1.0',
      protocolSignature:'a'.repeat(64),profile:'experience',metrics:score.metrics,quality:score.quality,references:[],report:project('1.1.0'),assessmentContext:null}
    const bytes=JSON.stringify(stored)
    expect(JSON.stringify(parseCognitiveResultSnapshot(JSON.parse(bytes)))).toBe(bytes)
    expect(metric(parseCognitiveResultSnapshot(stored).report as unknown as ReturnType<typeof project>,'meanTrackedTargets').formatted).toBe(String(8/3))
  })
})
