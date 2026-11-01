import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {derivedAdapterFixture} from './derived-adapter.fixture'
import {computeSurveyNativeReports,savedSurveyNativeFeedback,decodeSurveyNativeContext,surveyNativeFeedbackAudience} from '../../modules/bundle-product/survey-native'
import {parseDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import type {ScaleDefinitionV2} from '../../modules/scale/scale-definition'
import {persistGovernedPackageReports} from '../../modules/survey/governed-package.reports'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
beforeAll(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64)))
afterAll(()=>vi.unstubAllEnvs())
const release=()=>new Map([['ase',new Set(['academic_self_efficacy'])],['vc',new Set(['value','cost'])]])
it('normalizes the adult SELF Survey consumer lane while preserving source audience and rejecting observers',()=>{
 const {native,pack,snapshot}=derivedAdapterFixture(),raw=structuredClone(pack)
 raw.manifest.definition.population={subjectPopulation:'adult',subjectMinAgeYears:18}
 native.definition=freezeBundleProductionDefinition(packageEntry(parseDeclarativePackage(raw)),{frozenAt:native.definition.frozenAt,sourceReference:'synthetic-adult-survey'})
 native.source.definitionHash=native.definition.contentHash;native.reportAudiences.ase='parent'
 const definition=structuredClone(snapshot.units[0].compiledDefinition) as ScaleDefinitionV2
 definition.respondentType='participant_self_report'
 definition.report.audienceContract={...definition.report.audienceContract!,audience:'parent',respondent:'ADULT_SELF'}
 expect(surveyNativeFeedbackAudience(native,'ase',definition)).toBe('student')
 expect(native.reportAudiences.ase).toBe('parent');expect(definition.report.audienceContract.audience).toBe('parent')
 definition.respondentType='parent_report'
 expect(surveyNativeFeedbackAudience(native,'ase',definition)).toBeNull()
})
it('decodes only the declared context type, retaining numeric-looking strings and false',()=>{
 const field={contextKey:'example',required:true}
 expect(decodeSurveyNativeContext({...field,valueType:'string'},'00123')).toBe('00123')
 expect(decodeSurveyNativeContext({...field,valueType:'enum',enumValues:['00123']},'00123')).toBe('00123')
 expect(decodeSurveyNativeContext({...field,valueType:'boolean'},'false')).toBe(false)
 expect(decodeSurveyNativeContext({...field,valueType:'number'},'0')).toBe(0)
 expect(()=>decodeSurveyNativeContext({...field,valueType:'boolean'},'1')).toThrow('CONTEXT_TYPE')
 expect(()=>decodeSurveyNativeContext({...field,valueType:'number'},'NaN')).toThrow('CONTEXT_TYPE')
})
it('projects schema3 recorded FINAL scores and typed context, preserving the separate researcher ceiling',()=>{
 const {snapshot,result}=derivedAdapterFixture(),saved=computeSurveyNativeReports(snapshot,result)[0]
 expect(saved).toMatchObject({status:'READY',views:{student:null,researcher:null},derivedViews:{student:{schemaVersion:'bundle-derived-view-v1',rows:[{value:2.2},{value:5},{value:5}]}}})
 expect(saved.derivedViews!.student!.maxSets[0].maxKeys).toEqual(['vc.value','vc.cost'])
 expect(saved.derivedViews!.researcher!.rows.every(r=>r.state==='redacted'&&r.value===null)).toBe(true)
 expect(saved.derivedViews!.researcher!.conclusions).toEqual([])
})
it('keeps independent saved results when another selected metric is unavailable or no longer released',()=>{
 const {snapshot,result}=derivedAdapterFixture();const score=(result.units[1].privateScoring as any).scores.find((s:any)=>s.key==='cost');score.value=null;score.status='not_calculable'
 ;(result.units[1].privateScoring as any).quality={status:'invalid',flags:['missing_items','score_not_calculable']}
 result.nativeBundleReports=computeSurveyNativeReports(snapshot,result)
 const view=result.nativeBundleReports[0].derivedViews!.student!
 expect(view.rows.find(r=>r.rowKey==='value')?.value).toBe(5)
 expect(view.rows.find(r=>r.rowKey==='cost')?.value).toBeNull()
 const released=release();released.get('vc')!.delete('value')
 const projected=savedSurveyNativeFeedback(snapshot.governedPackages,result,released)[0].derivedView!
 expect(projected.rows.find(r=>r.rowKey==='ase')?.value).toBe(2.2)
 expect(projected.rows.find(r=>r.rowKey==='value')).toMatchObject({state:'redacted',value:null})
 expect(projected.maxSets[0]).toMatchObject({state:'redacted',maximum:null,maxKeys:null,orderedKeys:null})
 expect(view.rows.find(r=>r.rowKey==='value')?.value).toBe(5)
})
it('saves the exact researcher DTO and reopens participant feedback without dispatch or source rescoring',async()=>{
 const {snapshot,result}=derivedAdapterFixture();result.nativeBundleReports=computeSurveyNativeReports(snapshot,result)
 const before=structuredClone(savedSurveyNativeFeedback(snapshot.governedPackages,result,release()))
 const execute=vi.fn().mockResolvedValue(1)
 await persistGovernedPackageReports({$executeRaw:execute} as any,{projectId:'project',waveId:'wave',finalId:'final',sourceFinalHash:'final-hash',snapshot:snapshot as any,calculated:result})
 const args=execute.mock.calls[0],artifact=decryptUnifiedRuntimePayload<any>(args[10])
 expect(artifact.nativeBundle.derivedView).toEqual(result.nativeBundleReports[0].derivedViews!.researcher)
 expect(canonicalHash(artifact)).toBe(args[9])
 ;(result.units[1].privateScoring as any).scores.forEach((s:any)=>{s.value=1})
 expect(savedSurveyNativeFeedback(snapshot.governedPackages,result,release())).toEqual(before)
})
it('cannot restore a value that the saved source policy had withheld, even after a broader metric release',()=>{
 const {snapshot,result,native}=derivedAdapterFixture()
 native.policies.vc=structuredClone(native.policies.vc)
 native.policies.vc.disclosure.audiences.subject!.numericScores=false
 result.nativeBundleReports=computeSurveyNativeReports(snapshot,result)
 const view=savedSurveyNativeFeedback(snapshot.governedPackages,result,release())[0].derivedView!
 expect(view.rows.find(r=>r.rowKey==='value')).toMatchObject({state:'redacted',value:null})
 expect(view.rows.find(r=>r.rowKey==='ase')?.value).toBe(2.2)
 expect(view.maxSets[0]).toMatchObject({state:'redacted',maximum:null,maxKeys:null,orderedKeys:null})
})
