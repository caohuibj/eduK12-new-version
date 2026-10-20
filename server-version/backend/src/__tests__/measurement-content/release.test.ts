import { describe, expect, it } from 'vitest'
import { assertMeasurementDependency, assertReleaseReadable, assertReleaseTransition, prepareRelease } from '../../modules/measurement-content/release'
const hash = 'a'.repeat(64)
const measurement = () => ({
  family:'SCALE',layer:'MEASUREMENT',key:'private:owner:test',version:'1.0',
  scope:{kind:'PRIVATE',ownerId:'owner',product:'TRAINING',resourceId:'course'},
  assetRefs:[],sourceReleaseId:null,
  content:{projectionVersion:1,instrumentVersion:'1.0',measurementHash:hash,measurementHashScheme:'SCALE_AXES_V1',
    scoringVersion:'1',runnerKey:'scale',runnerVersion:'2',locale:'zh-CN',localizationVersion:'1',
    metrics:[{metricKey:'total',unit:'points',direction:'descriptive'}],executable:{items:[{key:'a'}]}},
})
describe('three-layer release core',()=>{
  it('is canonical and excludes scope/version labels from scientific hash',()=>{
    const one=measurement(),two={...measurement(),version:'2',scope:{kind:'PLATFORM',ownerId:'owner'}}
    expect(prepareRelease(one).contentHash).toBe(prepareRelease(two).contentHash)
    expect(prepareRelease({...one,content:{...one.content,scoringVersion:'2'}}).contentHash).not.toBe(prepareRelease(one).contentHash)
  })
  it('rejects foreign layer fields and non-JSON executable content',()=>{
    const input=measurement()
    expect(()=>prepareRelease({...input,content:{...input.content,reportVersion:'2'}})).toThrow()
    expect(()=>prepareRelease({...input,content:{...input.content,executable:{value:NaN}}})).toThrow()
    expect(()=>prepareRelease({...input,content:{...input.content,executable:{run:()=>0}}})).toThrow()
  })
  it('rejects duplicate assets and metric identities',()=>{
    const input=measurement(),asset={assetId:'one',sha256:hash,mediaType:'image/png'}
    expect(()=>prepareRelease({...input,assetRefs:[asset,asset]})).toThrow('CONTENT_ASSET_DUPLICATE')
    expect(()=>prepareRelease({...input,content:{...input.content,metrics:[...input.content.metrics,...input.content.metrics]}})).toThrow('CONTENT_METRIC_DUPLICATE')
  })
  it('keeps references and reports independently identified',()=>{
    const base=measurement(),target={releaseId:'00000000-0000-4000-8000-000000000001',contentHash:hash}
    const ref={...base,layer:'REFERENCE',content:{projectionVersion:1,measurement:target,entries:[{metricKey:'total',referenceKind:'theoretical_range',definition:{range:[0,10]}}],evidence:{method:'theoretical'}}}
    const report={...base,layer:'REPORT',content:{projectionVersion:1,measurements:[target],metricKeys:['total'],audience:'student',language:'zh-CN',generatorVersion:'1',template:{title:'描述'}}}
    expect(prepareRelease(ref).contentHash).not.toBe(prepareRelease(report).contentHash)
    expect(prepareRelease({...report,content:{...report.content,template:{title:'新描述'}}}).contentHash).not.toBe(prepareRelease(report).contentHash)
    expect(prepareRelease(ref).contentHash).toBe(prepareRelease(ref).contentHash)
  })
  it('supports existing SJT identity without introducing a runner',()=>{
    expect(prepareRelease({...measurement(),family:'SJT'}).family).toBe('SJT')
  })
  it('separates supersession, retirement and revocation from historical readability',()=>{
    for(const status of ['SUPERSEDED','RETIRED','REVOKED'] as const){
      expect(()=>assertReleaseTransition('PUBLISHED',status)).not.toThrow()
      expect(()=>assertReleaseReadable(status,'HISTORY')).not.toThrow()
      expect(()=>assertReleaseReadable(status,'NEW_BINDING')).toThrow()
    }
    expect(()=>assertReleaseReadable('SUPERSEDED','REINTERPRETATION')).not.toThrow()
    expect(()=>assertReleaseReadable('REVOKED','REINTERPRETATION')).toThrow('CONTENT_REVOKED')
    expect(()=>assertReleaseTransition('REVOKED','PUBLISHED')).toThrow('CONTENT_LIFECYCLE_INVALID')
  })
})

it('permits explicit historical correction publication without reopening old measurement delivery',()=>{
  for(const status of ['SUPERSEDED','RETIRED'] as const){
    expect(()=>assertMeasurementDependency(status,'HISTORICAL_INTERPRETATION')).not.toThrow()
    expect(()=>assertMeasurementDependency(status,'NEW_ADMINISTRATION')).toThrow('CONTENT_NOT_SELECTABLE')
  }
  expect(()=>assertMeasurementDependency('REVOKED','HISTORICAL_INTERPRETATION')).toThrow('CONTENT_REVOKED')
})
