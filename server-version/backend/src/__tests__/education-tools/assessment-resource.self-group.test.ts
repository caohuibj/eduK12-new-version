import {expect,it} from 'vitest'
import {draftEducationAssessmentEntry} from '../../modules/education-tools/assessment-resource.contract'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {isSelfGroupV2Entry,SELF_GROUP_POLICY_KEY} from '../../modules/assessment-policy/self-group-contract'
import {educationReportFixture} from '../reporting/education-assessment-report.fixture'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'

it('freezes explicit per-leaf GROUP ceilings without upgrading old sources or mixing same-named scores',async()=>{
 const f=await educationReportFixture('TEACHER',['COGNITIVE','SJT'],{sharedMetricKey:'score'})
 const oldHash=canonicalHash(f.source.entry),contract=testDisclosure(10)
 contract.policyKey=SELF_GROUP_POLICY_KEY
 contract.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:[]}
 contract.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:['score'],longitudinalMetricKeys:[]}
 const leaf={...contract,minimumRespondents:20}
 const origin={...f.origin,adapterVersion:'2.0.0',units:f.origin.units.map(unit=>({...unit,groupDisclosure:leaf})),
  feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2099-01-01T00:00:00.000Z'}}
 const entry=draftEducationAssessmentEntry({origin,title:'Explicit group',disclosure:contract})
 expect(isSelfGroupV2Entry(entry)).toBe(true)
 expect(entry.cohortAnalysisPolicy?.minimumRespondents).toBe(10)
 expect(entry.educationOrigin.units.map(unit=>(unit.groupDisclosure as typeof leaf).minimumRespondents)).toEqual([20,20])
 expect(entry.educationOrigin.feedbackPolicy).toEqual(origin.feedbackPolicy)
 expect(entry.resultDisclosure?.audiences.PROFESSIONAL.mode).toBe('NONE')
 expect(canonicalHash(f.source.entry)).toBe(oldHash)
 expect(()=>draftEducationAssessmentEntry({origin:{...origin,units:f.origin.units},title:'Missing leaf approval',disclosure:contract})).toThrow()
 expect(()=>draftEducationAssessmentEntry({origin:{...origin,adapterVersion:'1.0.0'},title:'Old version',disclosure:contract})).toThrow()
 const widened={...leaf,audiences:{...leaf.audiences,TEACHER:leaf.audiences.ORGANIZATION}}
 expect(()=>draftEducationAssessmentEntry({origin:{...origin,units:[{...origin.units[0],groupDisclosure:widened},origin.units[1]]},title:'Unapproved audience',disclosure:contract})).toThrow()
})
