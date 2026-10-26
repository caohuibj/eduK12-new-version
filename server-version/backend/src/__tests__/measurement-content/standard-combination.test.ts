import {describe,expect,it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {describeStandardCombination,standardAxisHashes,standardCombinationHash,standardCombinationMeasurementInput} from '../../modules/measurement-content/standard-combination'
import {combinationFixture} from './standard-combination.fixture'

describe('one exact C/P/R identity shared by entry management',()=>{
  it('preserves the existing combination hash formula and ignores unrelated metadata',()=>{
    const {row}=combinationFixture(),p=row.snapshot.parts,hashes=standardAxisHashes(p)
    expect(standardCombinationHash(row.tool_key,{...hashes,extra:'display-only'} as typeof hashes)).toBe(canonicalHash({
      toolKey:row.tool_key,CONTENT:p.CONTENT.hash,PARAMETERS:p.PARAMETERS.hash,REPORT:p.REPORT.hash}))
  })
  it.each(['CONTENT','PARAMETERS','REPORT'] as const)('changes only the %s pointer when that axis changes',axis=>{
    const {row}=combinationFixture(),original=structuredClone(row),p=row.snapshot.parts[axis]
    p.payload={syntheticRevision:axis};p.version+='-2';p.hash=canonicalHash(p.payload)
    const changed=standardCombinationHash(row.tool_key,standardAxisHashes(row.snapshot.parts))
    expect(changed).not.toBe(original.combination_hash)
    for(const other of ['CONTENT','PARAMETERS','REPORT'] as const)if(other!==axis)expect(row.snapshot.parts[other]).toEqual(original.snapshot.parts[other])
    expect(original.snapshot.combinationHash).toBe(original.combination_hash)
  })
  it('reuses the exact existing platform MEASUREMENT producer without a second release scheme',()=>{
    const {row}=combinationFixture(),t=row.snapshot
    expect(standardCombinationMeasurementInput(row)).toEqual(scaleMeasurementRelease({localId:'survey-standard:'+t.toolKey,
      version:t.parts.CONTENT.hash,instrumentVersion:t.instrumentVersion,definition:t.definition,instrumentClass:'STANDARD',
      scope:{kind:'PLATFORM',ownerId:row.approved_by},provenance:{surveyStandardContentHash:t.parts.CONTENT.hash,toolKey:t.toolKey}}))
  })
  it('maps existing snapshots and formal content separately while both entry authorizations remain unevaluated',()=>{
    const {row,measurement}=combinationFixture(),result=describeStandardCombination(row,measurement)
    expect(result.identity).toEqual({releaseId:row.id,toolKey:row.tool_key,combinationHash:row.combination_hash})
    expect(result.axisIdentity).toEqual({status:'VALID',issues:[]})
    expect(result.compatibility).toBe('NOT_EVALUATED')
    expect(result.measurement).toEqual({pointer:row.measurement_release,status:'PUBLISHED'})
    expect(result.axes.CONTENT.axisHash).not.toBe(row.measurement_release!.contentHash)
    expect(result.axes.PARAMETERS.formalReleaseBinding).toBe('NOT_RECORDED_IN_COMBINATION')
    expect(result.axes.REPORT.formalReleaseBinding).toBe('NOT_RECORDED_IN_COMBINATION')
    expect(result.consumers.SURVEY).toMatchObject({sourceAdapter:'CONNECTED',entryAdmission:'NOT_EVALUATED',targetUseGrant:'NOT_EVALUATED'})
    expect(result.consumers.TRAINING).toMatchObject({sourceAdapter:'NOT_CONNECTED',sourceRef:null,entryAdmission:'NOT_EVALUATED',targetUseGrant:'NOT_EVALUATED'})
    expect(result.consumers.TRAINING.missingContracts).toEqual(['EXACT_COMBINATION_SOURCE','COMBINATION_ENTRY_ADMISSION','COMBINATION_TARGET_GRANT',
      'FROZEN_COMBINATION_BINDING','PARAMETER_REPORT_BINDING','CURRENT_COMBINATION_STOP_CHECK'])
    expect(result.runtimeAuthorization).toBe('NOT_EVALUATED')
    expect(JSON.stringify(result)).not.toMatch(/"payload"|"definition"|"template"|"authorizations"|"canUse"|"canDistribute"/)
  })
  it('distinguishes explicit empty P/R from missing database pointers',()=>{
    const {row,measurement}=combinationFixture()
    for(const axis of ['PARAMETERS','REPORT'] as const){row.snapshot.parts[axis].payload=null;row.snapshot.parts[axis].hash=canonicalHash(null)}
    row.combination_hash=row.snapshot.combinationHash=standardCombinationHash(row.tool_key,standardAxisHashes(row.snapshot.parts))
    const result=describeStandardCombination(row,measurement)
    expect(result.axisIdentity.status).toBe('VALID')
    expect(result.axes.PARAMETERS.configuration).toBe('EXPLICITLY_UNCONFIGURED')
    expect(result.axes.REPORT.configuration).toBe('EXPLICITLY_UNCONFIGURED')
    expect(result.axes.CONTENT.configuration).toBe('CONFIGURED')
  })
  it.each(['tool-key','combination','snapshot-combination','content-source','axis-kind','axis-payload','required-content'])(
    'reports %s mismatch without granting runtime or entry use',field=>{
      const {row,measurement}=combinationFixture()
      if(field==='tool-key')row.tool_key='other'
      if(field==='combination')row.combination_hash='f'.repeat(64)
      if(field==='snapshot-combination')row.snapshot.combinationHash='f'.repeat(64)
      if(field==='content-source')row.snapshot.parts.CONTENT.sourceVersion='other'
      if(field==='axis-kind')row.snapshot.parts.PARAMETERS.axis='REPORT'
      if(field==='axis-payload')row.snapshot.parts.REPORT.payload={unexpected:'revision'}
      if(field==='required-content'){row.snapshot.parts.CONTENT.payload=null;row.snapshot.parts.CONTENT.hash=canonicalHash(null)}
      const result=describeStandardCombination(row,measurement)
      expect(result.axisIdentity.status).toBe('INVALID');expect(result.axisIdentity.issues.length).toBeGreaterThan(0)
      expect(result.runtimeAuthorization).toBe('NOT_EVALUATED');expect(result.consumers.TRAINING.sourceRef).toBeNull()
    })
  it('keeps unrecorded, absent and stopped formal releases distinct',()=>{
    const {row,measurement}=combinationFixture()
    expect(describeStandardCombination(row,null).measurement.status).toBe('MISSING')
    for(const status of ['REVOKED','RETIRED','SUPERSEDED'] as const)expect(describeStandardCombination(row,{...measurement,status}).measurement.status).toBe(status)
    row.measurement_release=null
    expect(describeStandardCombination(row,null).measurement.status).toBe('NOT_RECORDED')
    expect(describeStandardCombination(row,null).axes.CONTENT.formalReleaseBinding).toBe('NOT_RECORDED_IN_COMBINATION')
  })
  it.each(['release-id','hash','family','layer','scope','key','version','provenance','source','assets'])(
    'does not mistake another formal %s for this C axis',field=>{
      const {row,measurement}=combinationFixture(),other=structuredClone(measurement) as any
      if(field==='release-id')other.releaseId='foreign'
      if(field==='hash')other.contentHash='f'.repeat(64)
      if(field==='family')other.family='COGNITIVE'
      if(field==='layer')other.layer='REPORT'
      if(field==='scope')other.scope={kind:'PRIVATE',product:'SURVEY',ownerId:'owner',resourceId:'project'}
      if(field==='key')other.key='another-tool'
      if(field==='version')other.version='another-version'
      if(field==='provenance')other.provenance={...other.provenance,toolKey:'another-tool'}
      if(field==='source')other.sourceReleaseId='foreign'
      if(field==='assets')other.assetRefs=[{assetId:'foreign',sha256:'f'.repeat(64),mediaType:'image/png'}]
      expect(describeStandardCombination(row,other).measurement.status).toBe('IDENTITY_MISMATCH')
    })
  it.each(['APPROVED','TRIAL_RUNNING','TRIAL_FAILED','ONLINE','WITHDRAWN'])(
    '%s and valid content still never imply Training is connected or a target is authorized',state=>{
      const {row,measurement}=combinationFixture();row.state=state
      const before=structuredClone(row),result=describeStandardCombination(row,measurement)
      expect(result.approval.state).toBe(state)
      expect(result.consumers.TRAINING.sourceAdapter).toBe('NOT_CONNECTED')
      expect(result.consumers.SURVEY.targetUseGrant).toBe('NOT_EVALUATED')
      expect(row).toEqual(before)
    })
})
