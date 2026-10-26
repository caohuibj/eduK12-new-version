import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {prepareRelease} from '../../modules/measurement-content/release'
import type {StoredRelease} from '../../modules/measurement-content/repository'
import {standardAxisHashes,standardCombinationHash,standardCombinationMeasurementInput,type StandardCombinationRecord} from '../../modules/measurement-content/standard-combination'

/** Synthetic data only: no source registration, installation, publication or trial. */
export function combinationFixture(){
  const definition=compileResearchScale('合成版本映射',{
    schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
    responseOptions:[{optionKey:'low',label:'较少',score:1},{optionKey:'high',label:'较多',score:2}],
    dimensions:[{dimensionKey:'effort',label:'投入',direction:'descriptive'}],
    items:[{itemKey:'one',prompt:'愿意尝试',required:true,reverse:false,dimensionKeys:['effort']}],
  })
  const {report,referencePolicy,source:_,license:__,...content}=definition
  const part=(axis:'CONTENT'|'PARAMETERS'|'REPORT',version:string,payload:unknown)=>({axis,version,payload,hash:canonicalHash(payload),sourceVersion:'1.0.0'})
  const parts={CONTENT:part('CONTENT','C1',content),PARAMETERS:part('PARAMETERS','P1',{referencePolicy,references:[]}),REPORT:part('REPORT','R1',report)}
  const row:StandardCombinationRecord={id:'10000000-0000-4000-8000-000000000001',tool_key:'synthetic-standard',approved_by:'system',state:'ONLINE',
    combination_hash:standardCombinationHash('synthetic-standard',standardAxisHashes(parts)),measurement_release:null,
    snapshot:{toolKey:'synthetic-standard',instrumentVersion:'1.0.0',combinationHash:'',parts,definition}}
  row.snapshot.combinationHash=row.combination_hash
  const prepared=prepareRelease(standardCombinationMeasurementInput(row))
  const measurement={...prepared,releaseId:'20000000-0000-4000-8000-000000000001',status:'PUBLISHED',publishedBy:'system',publishedAt:new Date('2026-10-25T00:00:00Z')} as StoredRelease
  row.measurement_release={releaseId:measurement.releaseId,contentHash:measurement.contentHash}
  return {row,measurement}
}
