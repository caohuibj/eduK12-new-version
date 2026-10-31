import {randomUUID} from 'node:crypto'
import {expect,it} from 'vitest'
import {teacherCompositionGroupChoice} from '../../modules/education-tools/teacher-composition-group-source'
import {parseSchoolPrivateGroupSelection} from '../../modules/education-tools/school-private-group-selection'
import {privateCompositionDefinitionSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {schoolPrivateGroupDisclosure,schoolPrivateGroupOwnContract} from '../../modules/education-tools/school-private-group-source'
import {schoolPrivateGroupLeafDisclosure,type SchoolPrivateGroupDisclosureSource} from '../../modules/education-tools/school-private-group-leaf'
import type {CanonicalUnitResultCoreV1} from '../../modules/assessment-runtime/unit-result'

it('freezes an explicit Teacher SELF choice with organization-only native/original ceilings and retains the own rule',()=>{
 const version={id:randomUUID(),title:'Synthetic fixed source',contentHash:'a'.repeat(64)}
 const choices=[{provider:'PRIVATE_VERSION',kind:'SCALE',metricKeys:['total'],license:{status:'self_authored',redistribution:'allowed'}},
  {provider:'COGNITIVE_CONFIG',kind:'COGNITIVE',metricKeys:['rt']},{provider:'SJT_RELEASE',kind:'SJT',metricKeys:['dimension']}]
 for(const choice of choices){
  const bound=teacherCompositionGroupChoice(version,choice)!
  expect(bound.audiences.PROFESSIONAL).toEqual([]);expect(bound.audiences.TEACHER).toEqual([])
  const blockId=randomUUID(),selected={schemaVersion:1,minimumRespondents:10,leaves:[{...bound,blockId}].map(({versionId,contentHash,audiences,blockId})=>({versionId,contentHash,audiences,blockId}))}
  const context={entry:'TEACHER' as const,administration:{population:'TEACHER',responseMode:'SELF'},sources:[{...bound,blockId}]}
  const parsed=parseSchoolPrivateGroupSelection(selected,context)
  expect(parsed.leaves[0].audiences.ORGANIZATION).toEqual(choice.metricKeys)
  const own={mode:'INDIVIDUAL_SUMMARY' as const,metricKeys:['own'],longitudinalMetricKeys:[]}
  const contract=schoolPrivateGroupDisclosure({approved:schoolPrivateGroupOwnContract(own),minimumRespondents:10,audiences:bound.audiences})
  expect(contract.audiences.RESPONDENT).toEqual(own)
  expect(()=>parseSchoolPrivateGroupSelection({...selected,leaves:[{...selected.leaves[0],audiences:{...bound.audiences,TEACHER:choice.metricKeys}}]},context)).toThrow()
  expect(()=>parseSchoolPrivateGroupSelection(selected,{...context,administration:{population:'TEACHER',responseMode:'STUDENT_REPORT'}})).toThrow()
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:context.administration,instruction:'',groupReporting:parsed,
   blocks:[{blockId,instruction:'',source:{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:version.id,contentHash:version.contentHash}}]}
  expect(privateCompositionDefinitionSchema.parse(definition).groupReporting).toEqual(parsed)
 }
 expect(teacherCompositionGroupChoice(version,{provider:'LIBRARY_SCALE',kind:'SCALE',metricKeys:['total']})).toBeNull()
 expect(teacherCompositionGroupChoice(version,{provider:'PRIVATE_VERSION',kind:'SCALE',metricKeys:['total'],license:{status:'restricted',redistribution:'not_allowed'}})).toBeNull()
})

it('keeps private Cognitive/SJT slot, runner version and physical units separate even with equal score names',()=>{
 const contract=schoolPrivateGroupDisclosure({approved:schoolPrivateGroupOwnContract({mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]}),minimumRespondents:10,
  audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['score']}})
 const source:SchoolPrivateGroupDisclosureSource={parent:{resourceKind:'BUNDLE',resourceKey:'education-composition:TEACHER:synthetic',resourceVersion:'1.0.0',entryHash:'b'.repeat(64)},leaves:[
  {slotKey:'cognitive:first',unitType:'COGNITIVE',instrumentKey:'reaction',instrumentVersion:'1.0.0',contract,metricUnits:{score:{measurement:'ms',runtime:'ms'}}},
  {slotKey:'situational:second',unitType:'SITUATIONAL',instrumentKey:'exact-sjt',instrumentVersion:'3.0.0',contract,metricUnits:{score:{measurement:'score',runtime:'score'}}}]}
 for(const selected of source.leaves){
  const leaf={slotKey:selected.slotKey,unitType:selected.unitType!,instrumentKey:selected.instrumentKey,instrumentVersion:selected.instrumentVersion,compiledRuntimeHash:'c'.repeat(64)}
  const core={unitType:leaf.unitType,instrumentKey:leaf.instrumentKey,instrumentVersion:leaf.instrumentVersion,compiledRuntimeHash:leaf.compiledRuntimeHash,
   sourceDefinitionHash:'d'.repeat(64),scorerKey:'synthetic',scorerVersion:'1.0.0',scientificProvenance:{},metrics:[{key:'score',unit:selected.metricUnits.score.runtime,value:1}]} as CanonicalUnitResultCoreV1
  expect(schoolPrivateGroupLeafDisclosure(source,leaf,core).identity?.parent).toEqual(source.parent)
  expect(()=>schoolPrivateGroupLeafDisclosure(source,{...leaf,instrumentVersion:'different-profile'},core)).toThrow()
  expect(()=>schoolPrivateGroupLeafDisclosure(source,leaf,{...core,metrics:[{...core.metrics[0],unit:'wrong-unit'}]})).toThrow()
 }
})
