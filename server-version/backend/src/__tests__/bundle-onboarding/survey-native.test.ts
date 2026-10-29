import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {it,expect} from 'vitest'
import {computeSurveyNativeReports,savedSurveyNativeFeedback} from '../../modules/bundle-product/survey-native'
import {surveyNativeFixture} from './survey-native.fixture'
import {rawParticipantFeedback} from '../../modules/survey/participant-feedback'

it('projects already recorded Survey FINAL facts through the same native model and freezes distinct audiences',()=>{
 const {snapshot,result}=surveyNativeFixture(),reports=computeSurveyNativeReports(snapshot,result)
 expect(reports[0],JSON.stringify({report:reports[0],identities:snapshot.units.filter(u=>u.kind==='SCALE').map(u=>({key:u.instrumentKey,hash:canonicalHash(u.compiledDefinition)}))})).toMatchObject({status:'READY',views:{student:{state:'MATCHED',profileId:'P4',actions:[]},researcher:{state:'WITHHELD',profileId:null,candidates:[],constructs:[]}}})
 expect(reports).toEqual(computeSurveyNativeReports(snapshot,structuredClone(result)))
 result.nativeBundleReports=reports
 const released=new Map([['ase',new Set(['academic_self_efficacy'])],['vc',new Set(['value','cost'])]])
 expect(savedSurveyNativeFeedback(snapshot.governedPackages,result,released)[0].profileView?.profileId).toBe('P4')
 released.get('vc')!.delete('cost');expect(savedSurveyNativeFeedback(snapshot.governedPackages,result,released)).toEqual([])
})
it('keeps missing context unavailable and records malformed score failure without invalidating FINAL facts',()=>{
 const {snapshot,result}=surveyNativeFixture();result.units[2].rawAnswers={}
 expect(computeSurveyNativeReports(snapshot,result)[0]).toMatchObject({status:'UNAVAILABLE',errorCode:'SURVEY_NATIVE_CONTEXT_MISSING',views:{student:null}})
 result.units[0].privateScoring=null;expect(computeSurveyNativeReports(snapshot,result)[0]).toMatchObject({status:'FAILED',errorCode:'SURVEY_NATIVE_ANALYSIS_FAILED',views:{student:null,researcher:null}})
 expect(result.units).toHaveLength(3)
})
it('does not promote a raw selection into a different R audience or expose a restricted individual score',()=>{
 const {snapshot,result,native}=surveyNativeFixture();native.reportAudiences.ase='researcher'
 expect(computeSurveyNativeReports(snapshot,result)[0].views.student).toMatchObject({state:'WITHHELD',profileId:null,explanation:null,actions:[]})
 const unit=snapshot.units[0];unit.nativeBundleReport={definitionHash:native.source.definitionHash,audience:'researcher',policy:native.policies.ase}
 expect(rawParticipantFeedback(unit,result.units[0],true)).toBeNull()
 native.reportAudiences.ase='student';native.policies.ase={...native.policies.ase,disposition:'UNKNOWN'}
 const hidden=computeSurveyNativeReports(snapshot,result)[0].views.student!
 expect(hidden).toMatchObject({state:'WITHHELD',profileId:null,explanation:null,methods:null})
 expect(hidden.constructs.some(c=>c.key==='math.academic_self_efficacy')).toBe(false)
 unit.nativeBundleReport={definitionHash:native.source.definitionHash,audience:'student',policy:native.policies.ase}
 expect(rawParticipantFeedback(unit,result.units[0],true)).toBeNull()
})
