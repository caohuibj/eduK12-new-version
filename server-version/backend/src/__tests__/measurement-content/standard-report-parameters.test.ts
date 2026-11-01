import {describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {standardReportParameterBlockers} from '../../modules/measurement-content/standard-report-parameters'
import {scaleDefinitionFor} from '../integration/mini-scale-definition'
import {sourceParts,composeTriplet,type Part,type Axis} from '../../modules/survey/standard-triplet.model'
import type {AssessmentReferenceSetDefinition} from '../../modules/assessment-reference/reference'

// These bounds exist solely in this synthetic unit fixture. They are never
// registered, imported, approved or attached to any real scale/material.
const synthetic=()=>{
 const definition=scaleDefinitionFor(2,'synthetic-mechanical-only')
 definition.referencePolicy={type:'declared',selections:[{scoreKey:'total',referenceKind:'criterion_threshold',referenceVersion:'synthetic-unit-only'}]}
 const references:AssessmentReferenceSetDefinition[]=[{schemaVersion:1,instrumentType:'scale',instrumentKey:'synthetic-unit-only',referenceVersion:'synthetic-unit-only',status:'ACTIVE',
  entries:[{scoreKey:'total',instrumentVersion:'2.0.0',scoringVersion:'2.0.0',referenceKind:'criterion_threshold',evidenceLevel:'theoretical',provenanceType:'theoretical_score_range',
   population:{description:'Synthetic unit fixture only'},source:{citation:'Synthetic software test; no real population or evidence claim'},statistics:{thresholds:[
    {key:'low',label:'Synthetic low',minInclusive:0,maxInclusive:0},{key:'high',label:'Synthetic high',minInclusive:1,maxInclusive:2}]} }]}]
 return {definition,references}
}
const band=(key:string)=>({key,label:'Synthetic '+key,summary:'Synthetic software fixture only.',guidance:[]})
describe('new exact-combination report requirements',()=>{
 it('checks declared template bands against the selected reference version and kind even for score-only definitions',()=>{
  const {definition,references}=synthetic()
  const template={blocks:[{type:'TEXT' as const,text:'Synthetic text stays visible'},{type:'REFERENCE_BAND' as const,metricKey:'total',referenceKind:'criterion_threshold' as const,bandKey:'low',text:'Synthetic band',guidance:[]}],limitations:[]}
  expect(standardReportParameterBlockers(definition,references,true,template)).toEqual([])
  template.blocks[1].bandKey='old'
  expect(standardReportParameterBlockers(definition,references,true,template)).toEqual(['报告所需分档缺少选定参数支持：total/old'])
  // A matching band on a different, unselected P version cannot satisfy R.
  const unused=structuredClone(references[0]);unused.referenceVersion='unused-version';unused.entries[0].statistics.thresholds![0].key='old'
  expect(standardReportParameterBlockers(definition,[...references,unused],true,template)).toEqual(['报告所需分档缺少选定参数支持：total/old'])
  template.blocks[1].bandKey='low';definition.referencePolicy={type:'none'}
  expect(standardReportParameterBlockers(definition,references,true,template)).toEqual(['报告所需分档缺少选定参数支持：total/low'])
  definition.referencePolicy={type:'declared',selections:[{scoreKey:'total',referenceVersion:'synthetic-unit-only',referenceKind:'normative_distribution'}]}
  expect(standardReportParameterBlockers(definition,references,true,template)).toEqual(['报告所需分档缺少选定参数支持：total/low'])
 })
 it('permits explicit no-R or a score-only R without inventing missing threshold requirements',()=>{
  const {definition,references}=synthetic()
  expect(standardReportParameterBlockers(definition,references,false)).toEqual([])
  expect(standardReportParameterBlockers(definition,references,true)).toEqual([])
  definition.referencePolicy={type:'none'}
  expect(standardReportParameterBlockers(definition,[],true)).toEqual([])
 })
 it('permits a report to request a subset of available P bands while keeping C/P unchanged',()=>{
  const {definition,references}=synthetic(),before=canonicalHash({scoring:definition.scoring,policy:definition.referencePolicy,references})
  definition.report.interpretations[0].source={type:'reference',referenceVersion:'synthetic-unit-only',referenceKind:'criterion_threshold'}
  definition.report.interpretations[0].bands=[band('low')]
  expect(standardReportParameterBlockers(definition,references,true)).toEqual([])
  expect(canonicalHash({scoring:definition.scoring,policy:definition.referencePolicy,references})).toBe(before)
 })
 it('rejects the specifically missing R band and cannot borrow a different reference version',()=>{
  const {definition,references}=synthetic(),report=definition.report.interpretations[0]
  report.source={type:'reference',referenceVersion:'synthetic-unit-only',referenceKind:'criterion_threshold'};report.bands=[band('not_provided')]
  expect(standardReportParameterBlockers(definition,references,true)).toEqual(['报告所需分档缺少选定参数支持：total/not_provided'])
  report.bands=[band('low')];report.source={...report.source,referenceVersion:'different-not-selected'}
  expect(standardReportParameterBlockers(definition,references,true)).toEqual(['报告所需分档缺少选定参数支持：total/low'])
  definition.referencePolicy={type:'none'}
  expect(standardReportParameterBlockers(definition,[],true)).toEqual(['报告所需分档缺少选定参数支持：total/low'])
 })
 it('does not treat unused thresholds on a distribution as executable criterion bands',()=>{
  const {definition,references}=synthetic()
  definition.referencePolicy={type:'declared',selections:[{scoreKey:'total',referenceVersion:'synthetic-unit-only',referenceKind:'normative_distribution'}]}
  references[0].entries[0].referenceKind='normative_distribution'
  definition.report.interpretations[0].bands=[band('low')]
  expect(standardReportParameterBlockers(definition,references,true)).toEqual(['报告所需分档缺少选定参数支持：total/low'])
 })
 it('checks actual registered governance bands during assembly without changing the source or historical compiler',()=>{
  const key='academic_self_efficacy_mathematics_zh_cn',parts=Object.fromEntries(sourceParts(key,'1.0.0').map(p=>[p.axis,p])) as Record<Axis,Part>
  const inputHash=canonicalHash(parts),original=composeTriplet(key,parts);expect(original.blockers).toEqual([])
  const report=structuredClone(parts.REPORT.payload) as typeof original.definition.report
  const first=report.interpretations.find(r=>r.bands.length)!
  expect(first).toBeTruthy();first.bands.push(band('synthetic-unprovided-unit-test-only'))
  const changed=composeTriplet(key,{...parts,REPORT:{...parts.REPORT,hash:canonicalHash(report),payload:report}})
  expect(changed.blockers).toContain('报告所需分档缺少选定参数支持：'+first.scoreKey+'/synthetic-unprovided-unit-test-only')
  expect(canonicalHash(parts)).toBe(inputHash)
  expect(changed.parts.CONTENT.hash).toBe(original.parts.CONTENT.hash);expect(changed.parts.PARAMETERS.hash).toBe(original.parts.PARAMETERS.hash)
 })
})
