import {it,expect} from 'vitest'
import {teacherJdrPackage,teacherJdrInput,runTeacherJdr} from './teacher-jdr.fixture'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {dependencyBlockers} from '../../modules/assessment-bundle/onboarding/dependencies'
import {projectProfileView,isAdultSelfBundleReport} from '../../modules/assessment-bundle/profile/report'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import type {DisclosureCapabilitiesV1} from '../../modules/scale/policy/types'

it.each([['J1',4,4],['J2',2,4],['J3',4,2],['J4',2,2]] as const)('matches approved theory reference %s with reflected demands and distinct resources',(id,demands,r)=>{
  expect(runTeacherJdr(teacherJdrInput({demands,control:r,manager:r,peer:r}))).toMatchObject({state:'MATCHED',profileId:id,margin:25})
})
it('binds exact source identities and matches the independent weighted hand calculation',()=>{
  const pack=teacherJdrPackage();expect(dependencyBlockers(pack)).toEqual([])
  const result=runTeacherJdr(teacherJdrInput({demands:1,control:4,manager:4,peer:4}))
  // D=(5-1)/4=1; distance=3*.25/6=.125, resources sit at their .75 centers.
  expect(result).toMatchObject({state:'MATCHED',profileId:'J2',margin:25})
  expect(result.candidates[0]).toMatchObject({distance:.125,matchingScore:87.5,contributions:{'workplace.demands':.125,'workplace.control':0,'workplace.managerial_support':0,'workplace.peer_support':0}})
  expect(result.uncertainty).toMatchObject({empiricalClassValidation:'NOT_ESTABLISHED',probabilityAvailable:false})
  expect(pack.profile.modifierRuleIds).toEqual([])
  expect(pack.evidence.some(e=>e.slotKey==='burnout')).toBe(false)
})
it('distinguishes null, out-of-range raw zero, legitimate mapped zero, near neighbors and absolute mismatch',()=>{
  expect(runTeacherJdr(teacherJdrInput({demands:null,control:4,manager:4,peer:4})).state).toBe('INSUFFICIENT')
  expect(runTeacherJdr(teacherJdrInput({demands:0,control:4,manager:4,peer:4})).state).toBe('INVALID')
  const zero=runTeacherJdr(teacherJdrInput({demands:1,control:1,manager:1,peer:1}))
  expect(zero).toMatchObject({state:'MATCHED',profileId:'J4'});expect(zero.constructs.find(c=>c.key==='workplace.control')!.coordinate).toBe(0)
  expect(runTeacherJdr(teacherJdrInput({demands:3,control:4,manager:4,peer:4}))).toMatchObject({state:'MIXED',profileId:null,margin:0})
  expect(runTeacherJdr(teacherJdrInput({demands:2.000004,control:4,manager:4,peer:4})).state).toBe('BOUNDARY')
  expect(runTeacherJdr(teacherJdrInput({demands:2,control:1,manager:5,peer:5}))).toMatchObject({state:'UNCLASSIFIED',reasons:['THEORY_PATTERN_NOT_COVERED']})
  expect(runTeacherJdr(teacherJdrInput({demands:3,control:1.4,manager:4.6,peer:3}))).toMatchObject({state:'UNCLASSIFIED',profileId:null,reasons:['ABSOLUTE_MATCH_TOO_LOW']})
})
it('ignores independent CBI quality and order while missing core cannot be rescued',()=>{
  const input=teacherJdrInput(),expected=runTeacherJdr(input),cbi=input.scaleSources!.find(s=>s.slotKey==='burnout')!
  cbi.qualityState='invalid';cbi.scores[0].value=null;cbi.scores[0].status='not_calculable'
  input.scaleSources!.reverse();input.evidence.reverse()
  expect(runTeacherJdr(input)).toEqual(expected)
  input.evidence.find(e=>e.evidenceKey==='control')!.value={state:'missing'}
  expect(runTeacherJdr(input).state).toBe('INSUFFICIENT')
})
it('shows approved Bundle-owned text only to self without changing original HSE label rights',()=>{
  const pack=teacherJdrPackage(),result=runTeacherJdr(),policies=new Map<string,DisclosureCapabilitiesV1|null>(pack.profile.bindings.map(b=>[b.evidenceKey,structuredClone(getScaleInstrumentSource(b.source.instrumentKey,b.source.instrumentVersion)!.disclosure.audiences.subject!)]))
  const before=JSON.stringify([...policies]),self=projectProfileView(result,pack,policies,false,'student')
  expect(self).toMatchObject({state:'MATCHED',profileId:'J2',candidates:[]})
  expect(self.actions).toHaveLength(2);expect(self.constructs.find(c=>c.key==='workplace.demands')).toMatchObject({raw:2,referenceCenter:2})
  expect(JSON.stringify([...policies])).toBe(before);expect([...policies.values()].every(p=>p!.scoreDerivedLabels===false&&p!.educationalContent===false)).toBe(true)
  for(const audience of ['teacher','parent','admin'] as const)expect(projectProfileView(result,pack,policies,true,audience)).toMatchObject({state:'WITHHELD',profileId:null,explanation:null,actions:[],candidates:[]})
  expect(projectProfileView(result,pack,policies,false).state).toBe('WITHHELD')
  policies.get('control')!.numericScores=false
  expect(projectProfileView(result,pack,policies,false,'student')).toMatchObject({state:'WITHHELD',explanation:null,actions:[]})
  expect(isAdultSelfBundleReport(pack,{audience:'teacher',respondent:'ADULT_SELF'},'student')).toBe(true)
  expect(isAdultSelfBundleReport(pack,{audience:'teacher',respondent:'YOUTH_SELF'},'student')).toBe(false)
  expect(isAdultSelfBundleReport(pack,{audience:'teacher',respondent:'ADULT_SELF'},'teacher')).toBe(false)
})
it('freezes self-only disclosure and report text as versioned package content',()=>{
  const original=teacherJdrPackage(),p=structuredClone(original),hash=hashDeclarativePackage(original)
  delete p.report.profileInterpretationContent;expect(hashDeclarativePackage(p)).not.toBe(hash)
  const policies=new Map(p.profile.bindings.map(b=>[b.evidenceKey,getScaleInstrumentSource(b.source.instrumentKey,b.source.instrumentVersion)!.disclosure.audiences.subject!]))
  expect(projectProfileView(runTeacherJdr(),p,policies,false,'student').state).toBe('WITHHELD')
  p.profile.profiles[1].summary='future text';expect(hashDeclarativePackage(p)).not.toBe(hash)
  expect(projectProfileView(runTeacherJdr(),original,policies,false,'student').explanation).not.toBe('future text')
})
