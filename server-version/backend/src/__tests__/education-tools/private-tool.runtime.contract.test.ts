import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {privateScaleRuntimeInput,privateScaleRuntimeOriginSchema,privateScaleResourceKey,privateScaleVariant} from '../../modules/education-tools/private-tool.runtime-origin'
import {trainingContentSnapshotSchema} from '../../modules/composite/training-content-binding'
import {privateScaleMeasurementInput} from '../../modules/education-tools/private-tool.runtime-source'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {prepareRelease} from '../../modules/measurement-content/release'

describe('Private education Scale source contract',()=>{
 it('requires explicit compatible pair rather than guessing from title or author persona',()=>{
  for(const responseMode of ['SELF','PARENT_REPORT','TEACHER_REPORT'])expect(privateScaleVariant('SCHOOL',{population:'STUDENT',responseMode}).variantKey).toBe(`STUDENT:${responseMode}`)
  expect(privateScaleVariant('TEACHER',{population:'TEACHER',responseMode:'SELF'}).variantKey).toBe('TEACHER:SELF')
  expect(()=>privateScaleVariant('TEACHER',{population:'STUDENT',responseMode:'SELF'})).toThrow('PRIVATE_TOOL_RUNTIME_VARIANT_UNSUPPORTED')
  expect(privateScaleRuntimeInput.safeParse({versionId:randomUUID(),contentHash:'a'.repeat(64)}).success).toBe(false)
  expect(privateScaleRuntimeInput.safeParse({versionId:randomUUID(),contentHash:'a'.repeat(64),administration:{population:'STUDENT',responseMode:'SELF'},ownerUserId:randomUUID()}).success).toBe(false)
 })
 it('uses real education-private release identity, never Training or library provenance',()=>{
  const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]})
  const version={id:randomUUID(),entry:'SCHOOL',organizationId:randomUUID(),ownerUserId:randomUUID(),toolId:randomUUID(),contentHash:'a'.repeat(64)}
  const school=prepareRelease(privateScaleMeasurementInput(version,definition)),teacher=prepareRelease(privateScaleMeasurementInput({...version,entry:'TEACHER'},definition))
  expect(school.scope).toEqual({kind:'PRIVATE',product:'SCHOOL',ownerId:version.ownerUserId,resourceId:version.id})
  expect(school.provenance.sourceKind).toBe('EDUCATION_PRIVATE_TOOL_VERSION')
  expect(school.key).not.toBe(teacher.key)
  expect(school.contentHash).toBe(teacher.contentHash)
  expect(()=>privateScaleMeasurementInput({...version,entry:'TRAINING'},definition)).toThrow('PRIVATE_TOOL_RUNTIME_SOURCE_INVALID')
 })
 it('does not allow a private marker to alias a public library source or other family',()=>{
  const unit={itemId:randomUUID(),family:'SCALE',source:{kind:'SCALE',id:randomUUID(),ownerId:randomUUID(),privateVersionId:randomUUID()},measurement:{releaseId:randomUUID(),contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}
  const snapshot={schemaVersion:1,compositeId:randomUUID(),units:[unit]}
  expect(trainingContentSnapshotSchema.safeParse(snapshot).success).toBe(true)
  expect(trainingContentSnapshotSchema.safeParse({...snapshot,units:[{...unit,source:{...unit.source,libraryEntryId:randomUUID()}}]}).success).toBe(false)
  expect(trainingContentSnapshotSchema.safeParse({...snapshot,units:[{...unit,source:{...unit.source,kind:'COGNITIVE_CONFIG'}}]}).success).toBe(false)
  const origin={schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE',entry:'SCHOOL',organizationId:randomUUID(),ownerUserId:randomUUID(),toolId:randomUUID(),versionId:unit.source.privateVersionId,contentHash:'a'.repeat(64),definitionHash:'b'.repeat(64),releaseId:randomUUID(),releaseHash:'c'.repeat(64),variantKey:'STUDENT:SELF'}
  const parsed=privateScaleRuntimeOriginSchema.parse(origin)
  expect(privateScaleResourceKey(parsed)).toBe(`private-scale:SCHOOL:${origin.versionId}:STUDENT:SELF`)
  expect(privateScaleRuntimeOriginSchema.safeParse({...origin,libraryEntryId:randomUUID()}).success).toBe(false)
 })
})
