import {randomUUID} from 'node:crypto'
import {describe,it,expect} from 'vitest'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {privateScaleResourceEntry} from '../../modules/education-tools/private-tool.runtime-policy'
import {privateScaleRuntimeOriginSchema,privateScaleResourceKey} from '../../modules/education-tools/private-tool.runtime-origin'
import {schoolPrivateScaleGroupChoice} from '../../modules/education-tools/school-private-group-source'
import {selfGroupAggregateCeiling,isSelfGroupV2Entry} from '../../modules/assessment-policy/self-group-contract'

describe('School private Scale publication contract integration',()=>{
 it('creates a distinct explicit source identity, preserves the own ceiling and keeps every aggregate audience independent',()=>{
  const definition=compileResearchScale('Synthetic own Scale',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
   items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]})
  definition.report.audienceContract={schemaVersion:1,respondent:'STUDENT_SELF',audience:'student',locale:'zh-CN',longitudinalMetricKeys:['total']}
  const origin=privateScaleRuntimeOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE',entry:'SCHOOL',
   organizationId:randomUUID(),ownerUserId:randomUUID(),toolId:randomUUID(),versionId:randomUUID(),contentHash:'a'.repeat(64),
   definitionHash:'b'.repeat(64),releaseId:randomUUID(),releaseHash:'c'.repeat(64),variantKey:'STUDENT:SELF'})
  const original=privateScaleResourceEntry(origin,'Original',definition,randomUUID())
  const groupReporting={schemaVersion:1,minimumRespondents:12,leaves:[{versionId:origin.versionId,contentHash:origin.contentHash,
   audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['total']}}]}
  const grouped=privateScaleRuntimeOriginSchema.parse({...origin,schemaVersion:2,adapterVersion:'2.0.0',groupReporting})
  if(grouped.schemaVersion!==2)throw new Error('Expected the new School source identity')
  const entry=privateScaleResourceEntry(grouped,'Original',definition,randomUUID())
  expect(isSelfGroupV2Entry(entry)).toBe(true)
  expect(privateScaleResourceKey(grouped)).not.toBe(privateScaleResourceKey(origin))
  expect(entry.resultDisclosure!.audiences.RESPONDENT).toEqual(original.resultDisclosure!.audiences.RESPONDENT)
  expect(original.applicability.analysisMode).toBe('INDIVIDUAL_ONLY');expect(original.resultDisclosure!.audiences.ORGANIZATION.mode).toBe('NONE')
  expect(selfGroupAggregateCeiling({contract:entry.resultDisclosure!,audience:'PROFESSIONAL'})).toBeNull()
  expect(selfGroupAggregateCeiling({contract:entry.resultDisclosure!,audience:'TEACHER'})).toBeNull()
  expect(selfGroupAggregateCeiling({contract:entry.resultDisclosure!,audience:'ORGANIZATION'})?.metricKeys).toEqual(['total'])
  expect(grouped.releaseId).toBe(origin.releaseId);expect(grouped.definitionHash).toBe(origin.definitionHash)
  expect(()=>privateScaleRuntimeOriginSchema.parse({...grouped,entry:'TEACHER',variantKey:'TEACHER:SELF'})).toThrow()
  expect(()=>privateScaleResourceEntry({...grouped,groupReporting:{...grouped.groupReporting,leaves:[{...grouped.groupReporting.leaves[0],audiences:{PROFESSIONAL:['unknown'],TEACHER:[],ORGANIZATION:[]}}]}},'Original',definition,randomUUID())).toThrow()
  expect(schoolPrivateScaleGroupChoice({id:origin.versionId,entry:'SCHOOL',title:'Original',contentHash:origin.contentHash},
   {...definition,license:{...definition.license,status:'restricted'}})).toBeNull()
 })
})
