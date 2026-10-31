import {it,expect} from 'vitest'
import type {CanonicalUnitResultCoreV1} from '../../modules/assessment-runtime/unit-result'
import {schoolPrivateGroupLeafDisclosure,type SchoolPrivateGroupDisclosureSource} from '../../modules/education-tools/school-private-group-leaf'
import {schoolPrivateGroupDisclosure,schoolPrivateGroupOwnContract} from '../../modules/education-tools/school-private-group-source'

it('binds the authorized slot and actual source identity without same-key or audience fallback (synthetic core only)',()=>{
 const contract=schoolPrivateGroupDisclosure({approved:schoolPrivateGroupOwnContract({mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]}),
  minimumRespondents:10,audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['total']}})
 const source:SchoolPrivateGroupDisclosureSource={parent:{resourceKind:'BUNDLE',resourceKey:'synthetic-parent',resourceVersion:'1.0.0',entryHash:'a'.repeat(64)},
  leaves:[{slotKey:'scale:authorized',instrumentKey:'education-private-scale:original',instrumentVersion:'1.0.0',sourceDefinitionHash:'b'.repeat(64),contract,
   metricUnits:{total:{measurement:'points',runtime:'score'}}}]}
 const leaf={slotKey:'scale:authorized',unitType:'SCALE' as const,instrumentKey:'education-private-scale:original',instrumentVersion:'1.0.0',compiledRuntimeHash:'c'.repeat(64)}
 const core={unitType:'SCALE',instrumentKey:leaf.instrumentKey,instrumentVersion:leaf.instrumentVersion,compiledRuntimeHash:leaf.compiledRuntimeHash,
  sourceDefinitionHash:'b'.repeat(64),scorerKey:'synthetic',scorerVersion:'1.0.0',scientificProvenance:{},metrics:[{key:'total',unit:'score',value:1}]} as CanonicalUnitResultCoreV1
 const bound=schoolPrivateGroupLeafDisclosure(source,leaf,core)
 expect(bound.identity?.parent).toEqual(source.parent);expect(bound.contract.audiences.PROFESSIONAL.mode).toBe('NONE')
 expect(schoolPrivateGroupLeafDisclosure(source,leaf).identity).toBeNull()
 expect(()=>schoolPrivateGroupLeafDisclosure(source,{...leaf,slotKey:'scale:another-same-score'},core)).toThrow('reporting resource not found')
 expect(()=>schoolPrivateGroupLeafDisclosure(source,leaf,{...core,sourceDefinitionHash:'d'.repeat(64)})).toThrow('reporting resource not found')
 expect(()=>schoolPrivateGroupLeafDisclosure(source,leaf,{...core,compiledRuntimeHash:'e'.repeat(64)})).toThrow('reporting resource not found')
 expect(bound.metricUnits.total.measurement).toBe('points')
 expect(()=>schoolPrivateGroupLeafDisclosure(source,leaf,{...core,metrics:[{...core.metrics[0],unit:'ms'}]})).toThrow('reporting resource not found')
})
