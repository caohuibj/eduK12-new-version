import {describe,it,expect} from 'vitest'
import {submissionInput,reviewInput,distributionInput} from '../../modules/scale-library-governance/contracts'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {libraryCompatibility,libraryCatalogSnapshot} from '../../modules/scale-library-governance/catalog-adapter'
const id='00000000-0000-4000-8000-000000000001'
const metadata={title:'合成量表',author:'作者',copyright:'自编并授权平台使用',applicability:'研究',scoringDescription:'条目均值',reportDescription:'描述性结果'}
const display={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
describe('exact scale library contracts',()=>{
 it('requires bounded technical metadata and an exact release; author/copyright are optional references',()=>{
  expect(submissionInput.parse({requestId:id,releaseId:id,metadata}).dependencyReleaseIds).toEqual([])
  expect(submissionInput.safeParse({requestId:id,releaseId:id,metadata:{...metadata,author:'',copyright:''}}).success).toBe(true)
  expect(submissionInput.safeParse({requestId:id,releaseId:id,metadata:{...metadata,title:''}}).success).toBe(false)
  expect(submissionInput.safeParse({requestId:id,releaseId:id,metadata:{...metadata,copyright:'x'.repeat(2001)}}).success).toBe(false)
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

describe('education library scope foundation',()=>{
 it('preserves legacy grants but rejects education scope smuggling into legacy products',()=>{
  expect(distributionInput.parse({requestId:id,userId:id,product:'TRAINING'})).toMatchObject({scopeKind:'USER'})
  for(const extra of [{organizationId:id},{scopeKind:'ORGANIZATION'},{scopeId:id}]){
   expect(distributionInput.safeParse({requestId:id,userId:id,product:'SURVEY',...extra}).success).toBe(false)
  }
 })
 it('requires explicit education product, organization and bounded target',()=>{
  for(const product of ['SCHOOL','TEACHER']){
   expect(distributionInput.safeParse({requestId:id,userId:id,product}).success).toBe(false)
   expect(distributionInput.safeParse({requestId:id,userId:id,product,scopeKind:'USER',organizationId:id}).success).toBe(true)
   expect(distributionInput.safeParse({requestId:id,product,scopeKind:'USER',organizationId:id}).success).toBe(false)
   expect(distributionInput.safeParse({requestId:id,product,scopeKind:'ORGANIZATION',organizationId:id}).success).toBe(true)
   expect(distributionInput.safeParse({requestId:id,userId:null,product,scopeKind:'ORGANIZATION',organizationId:id}).success).toBe(true)
   expect(distributionInput.safeParse({requestId:id,userId:id,product,scopeKind:'ORGANIZATION',organizationId:id}).success).toBe(false)
  }
 })
 it('does not advertise runnable education entrypoints before their adapters are connected',()=>{
  const compiled=compileResearchScale('合成量表',display)
  const compatibility=libraryCompatibility({product:'SURVEY',title:'合成量表',instrumentClass:'CUSTOM_DESCRIPTIVE',definition:display,compiledDefinition:compiled})
  expect(compatibility.supportedEntrypoints).toEqual(['TRAINING','SURVEY'])
  expect(compatibility.compatibilityReasons).toMatchObject({SCHOOL:'EDUCATION_LIBRARY_APPLICABILITY_REQUIRED',TEACHER:'EDUCATION_LIBRARY_APPLICABILITY_REQUIRED'})
  expect(compatibility.educationDistribution).toMatchObject({status:'NOT_READY',canDistribute:false,contentCompatible:false})
 })
})
