import {describe,it,expect} from 'vitest'
import {submissionInput,reviewInput,distributionInput} from '../../modules/scale-library-governance/contracts'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {libraryCompatibility,libraryCatalogSnapshot} from '../../modules/scale-library-governance/catalog-adapter'
const id='00000000-0000-4000-8000-000000000001'
const metadata={title:'合成量表',author:'作者',copyright:'自编并授权平台使用',applicability:'研究',scoringDescription:'条目均值',reportDescription:'描述性结果'}
const display={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
describe('exact scale library contracts',()=>{
 it('requires complete bounded rights/interpretation metadata and exact immutable release',()=>{
  expect(submissionInput.parse({requestId:id,releaseId:id,metadata}).dependencyReleaseIds).toEqual([])
  expect(submissionInput.safeParse({requestId:id,releaseId:id,metadata:{...metadata,copyright:''}}).success).toBe(false)
  expect(submissionInput.safeParse({requestId:id,releaseId:id,metadata,definition:{items:[]}}).success).toBe(false)
  expect(submissionInput.safeParse({requestId:id,releaseId:id,metadata,dependencyReleaseIds:[id,id]}).success).toBe(false)
 })
 it('never accepts expanded grants, edition rights or actor identity from client',()=>{
  expect(distributionInput.safeParse({requestId:id,userId:id,product:'SURVEY',capabilities:['material.adapt']}).success).toBe(false)
  expect(reviewInput.safeParse({expectedVersion:1,decision:'APPROVE',reason:'审核通过',actorId:id}).success).toBe(false)
  expect(reviewInput.safeParse({expectedVersion:0,decision:'APPROVE',reason:'审核通过'}).success).toBe(false)
 })
 it('preserves native Survey measurement while exposing both target entries without a new scorer',()=>{
  const compiled=compileResearchScale('合成量表',display)
  const source={product:'SURVEY' as const,title:'合成量表',instrumentClass:'CUSTOM_DESCRIPTIVE' as const,definition:display,compiledDefinition:compiled}
  expect(libraryCompatibility(source).supportedEntrypoints).toEqual(['TRAINING','SURVEY'])
  const snapshot=libraryCatalogSnapshot(id,{releaseId:id,version:'v1',contentHash:'a'.repeat(64)},source)
  expect(snapshot.compiledDefinition).toEqual(compiled)
  expect(snapshot.provenance).toMatchObject({libraryEntryId:id,libraryUseOnly:true,instrumentClass:'CUSTOM_DESCRIPTIVE',sourceMeasurementRelease:{releaseId:id}})
  expect(snapshot.ref.sourceId).toBe('library:'+id)
 })
})
