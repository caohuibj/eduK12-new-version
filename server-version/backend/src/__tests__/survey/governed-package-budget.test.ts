import {afterAll,describe,expect,it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {packageReportWorstCaseBytes,assertPackageReportBytes,PACKAGE_REPORT_MAX_BYTES,jsonBytes} from '../../modules/survey/governed-package.budget'
import {artifactBlockers,artifactReference,type GovernedArtifact,type PackageReport} from '../../modules/survey/governed-tool.model'
import {renderPackageReport} from '../../modules/survey/governed-tool.reports'
import {dryRunSurveyForm} from '../../modules/survey/final.compute'
import type {FormDraft,FormQuestion} from '../../modules/survey/builder.definition'
const question:FormQuestion={itemKey:'text',type:'LONG_TEXT',prompt:'Synthetic',required:true,maxLength:10000,options:[],rows:[]}
const form=(q=question):FormDraft=>({schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[q]}]})
const source=(d:FormDraft)=>({ref:{kind:'FORM' as const,sourceId:'synthetic',sourceVersion:'1'},title:'Synthetic',compiledDefinition:d,displayDefinition:d,definitionDigest:canonicalHash(d),scoringDigest:null,adapterVersion:'survey-catalog-v1' as const,provenance:{}})
const components=(d:FormDraft)=>[{slotKey:'form',title:'Synthetic',source:{type:'GOVERNED' as const,id:'synthetic',hash:'a'.repeat(64)},unit:source(d)}]
const spec=(count:number):PackageReport=>({version:'1',title:'Synthetic',introduction:'',disclaimer:'',blocks:Array.from({length:count},()=>({type:'FORM_FIELD' as const,slotKey:'form',itemKey:'text',label:'Synthetic'}))})
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('published package report expansion budget',()=>{
 it('blocks 200 repeated legal long-text references before any FINAL',()=>{
  const d=form(),a:GovernedArtifact={schemaVersion:1,family:'BUNDLE',toolKey:'synthetic',version:'1',title:'Synthetic',unit:null,parameters:null,report:null,components:components(d),packageReport:spec(200),reference:artifactReference('BUNDLE','synthetic',{})}
  expect(packageReportWorstCaseBytes(a.packageReport!,a.components,a.title)).toBeGreaterThan(12_000_000)
  expect(artifactBlockers(a).join()).toContain('预算超限')
 })
 it.each(['汉字😀','\u0000','\\"','\ud800'])('bounds UTF-8 and escaping for %j without truncation',token=>{
  const d=form(),reportSpec=spec(60),answer=token.repeat(Math.floor(10000/token.length)),normalized=dryRunSurveyForm(d,{text:answer})
  const report=renderPackageReport(reportSpec,components(d),{schemaVersion:1,definitionDigest:'synthetic',units:[{instrumentKey:'form',kind:'FORM',sourceDigest:'synthetic',scoringDigest:null,...normalized,privateScoring:null}]},{form:'form'})
  const value={schemaVersion:1,packageTitle:'Synthetic',packageVersionHash:'a'.repeat(64),reportVersion:'1',sourceFinalHash:'b'.repeat(64),report}
  expect(jsonBytes(value)).toBeLessThanOrEqual(packageReportWorstCaseBytes(reportSpec,components(d),'Synthetic'))
  expect(JSON.stringify(report)).toContain(JSON.stringify(answer).slice(1,-1))
  expect(()=>assertPackageReportBytes(packageReportWorstCaseBytes(reportSpec,components(d),'Synthetic'))).not.toThrow()
 })
 it('counts repeated large matrix labels and all selected options',()=>{
  const q:FormQuestion={...question,type:'MATRIX_MULTIPLE',options:Array.from({length:30},(_,i)=>({optionKey:'o'+i,label:'汉'.repeat(2000)})),rows:Array.from({length:40},(_,i)=>({rowKey:'r'+i,label:'字'.repeat(2000)}))}
  expect(()=>assertPackageReportBytes(packageReportWorstCaseBytes(spec(1),components(form(q)),'Synthetic'))).toThrow('预算超限')
 })
 it('applies one aggregate allowance to multiple separately legal packages',()=>{
  const one=packageReportWorstCaseBytes(spec(60),components(form()),'Synthetic')
  expect(one).toBeLessThan(PACKAGE_REPORT_MAX_BYTES);expect(()=>assertPackageReportBytes(one*2,'波次所有整包最坏展开合计')).toThrow('预算超限')
 })
 it('stops unsafe historical expansion during generation without clipping text',()=>{
  const d=form(),normalized=dryRunSurveyForm(d,{text:'\u0000'.repeat(10000)})
  expect(()=>renderPackageReport(spec(200),components(d),{schemaVersion:1,definitionDigest:'synthetic',units:[{instrumentKey:'form',kind:'FORM',sourceDigest:'synthetic',scoringDigest:null,...normalized,privateScoring:null}]},{form:'form'})).toThrow('预算超限')
 })
})
