import {describe,expect,it} from 'vitest'
import {compileFrozenResearchUnit,surveyMeasurementReleaseInput} from '../../modules/survey/publication.service'
import {prepareRelease} from '../../modules/measurement-content/release'
const definition={schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:0}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'one',prompt:'Question',required:true,reverse:false,dimensionKeys:['total']}]}
const legacy={id:'draft',instrumentKey:'private',kind:'SCALE',title:'Private',revision:7,definition}
describe('explicit authoring lineage does not rewrite historical measurement identity',()=>{
 it('preserves old release version, scientific instrumentVersion and provenance exactly',()=>{
  const input=surveyMeasurementReleaseInput(compileFrozenResearchUnit(legacy),'owner','project')
  expect(input.version).toBe('7');expect(input.provenance).toEqual({});expect(input.sourceReleaseId).toBe(null)
  if(input.layer!=='MEASUREMENT')throw Error('wrong layer')
  expect(input.content.instrumentVersion).toBe('7')
 })
 it('exposes formal v1/v2 separately from edit revision and freezes authoring metadata',()=>{
  const source='10000000-0000-4000-8000-000000000001'
  const first=surveyMeasurementReleaseInput(compileFrozenResearchUnit({...legacy,authoringFamilyId:'family',authoringVersion:1}),'owner','project')
  const next=surveyMeasurementReleaseInput(compileFrozenResearchUnit({...legacy,revision:8,authoringFamilyId:'family',authoringVersion:2,revisionSourceReleaseId:source}),'owner','project')
  expect(first.version).toBe('v1');expect(next.version).toBe('v2');expect(first.key).toBe(next.key)
  expect(next.sourceReleaseId).toBe(source)
  expect(next.provenance).toMatchObject({authoringFamilyId:'family',authoringVersion:2,authoringRelationship:'REVISION',authoringSnapshot:{title:'Private',definition,product:'SURVEY',instrumentClass:'CUSTOM_DESCRIPTIVE'}})
  expect(prepareRelease(first).contentHash).not.toBe(prepareRelease(next).contentHash)
 })
 it('new independent tool has a new family and exact source without STANDARD privilege',()=>{
  const input=surveyMeasurementReleaseInput(compileFrozenResearchUnit({...legacy,id:'copy',instrumentKey:'new-tool',authoringFamilyId:'new-family',authoringVersion:1,revisionSourceReleaseId:'10000000-0000-4000-8000-000000000001'}),'owner','project')
  expect(input.provenance).toMatchObject({authoringFamilyId:'new-family',authoringRelationship:'COPY',authoringSnapshot:{instrumentClass:'CUSTOM_DESCRIPTIVE'}})
  expect(input.key).not.toBe(surveyMeasurementReleaseInput(compileFrozenResearchUnit(legacy),'owner','project').key)
 })
})
