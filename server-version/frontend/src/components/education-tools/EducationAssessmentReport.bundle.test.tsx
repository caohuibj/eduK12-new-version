import {it,expect} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {afterEach} from 'vitest'
import {EducationAssessmentReport} from './EducationAssessmentReport'
import type {EducationFeedbackData} from './EducationTaskFeedback'
import {derivedViewFixture} from '../../modules/reporting/BundleDerivedReport.fixture'
afterEach(cleanup)
it('passes the same server-projected numerical DTO to the shared renderer and clears it outside personal disclosure',()=>{
 const data={schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'READY',mode:'INDIVIDUAL_SUMMARY',reports:[],nativeBundle:{schemaVersion:1,kind:'NATIVE_BUNDLE_FEEDBACK',status:'READY',title:'成人探索',profileView:null,derivedView:derivedViewFixture()}} as unknown as EducationFeedbackData
 const {rerender}=render(<EducationAssessmentReport data={data}/>)
 expect(screen.getByRole('img',{name:'认知需求，范围 10 到 50，本次结果 38'})).toBeInTheDocument()
 rerender(<EducationAssessmentReport data={{...data,mode:'COMPLETION_ONLY'}}/>)
 expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
it('reads the optional server-projected native report and removes it when personal disclosure is withheld',()=>{
 const data={schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'READY',mode:'INDIVIDUAL_SUMMARY',reports:[],nativeBundle:{schemaVersion:1,kind:'NATIVE_BUNDLE_FEEDBACK',status:'READY',title:'数学学习动机理论试验',profileView:{schemaVersion:'bundle-profile-view-v1',state:'MATCHED',title:'本次暂定画像',explanation:'结合当前获准单项指标。',profileId:'P4',constructs:[],candidates:[],alternatives:[],actions:[],methods:null,limitation:'理论试验；不是诊断或常模。'}}} as unknown as EducationFeedbackData
 const {rerender}=render(<EducationAssessmentReport data={data}/>)
 expect(screen.getByRole('heading',{name:'数学学习动机理论试验'})).toBeInTheDocument()
 expect(screen.getByText('本次暂定画像')).toBeInTheDocument()
 rerender(<EducationAssessmentReport data={{...data,state:'WITHHELD'}}/>)
 expect(screen.queryByText('本次暂定画像')).not.toBeInTheDocument()
})
it('renders only the server-projected saved joint text and removes it outside personal disclosure',()=>{
 const data={schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'READY',mode:'INDIVIDUAL_SUMMARY',reports:[],nativeBundle:{schemaVersion:1,kind:'NATIVE_BUNDLE_FEEDBACK',status:'READY',title:'原包综合报告',profileView:null,jointSummary:{state:null,blocks:[{id:'original',title:'原包结论',texts:['本次获准解释']}]} }} as unknown as EducationFeedbackData
 const {rerender}=render(<EducationAssessmentReport data={data}/>)
 expect(screen.getByText('本次获准解释')).toBeInTheDocument()
 rerender(<EducationAssessmentReport data={{...data,mode:'COMPLETION_ONLY'}}/>)
 expect(screen.queryByText('本次获准解释')).not.toBeInTheDocument()
})

it('shows the built-in comic only when the returned educational report includes it and disclosure is open',()=>{
 const projected={generatorVersion:'DECLARATIVE_REPORT_V1',title:'语文报告',blocks:[],limitations:[],disclaimer:null}
 const unit={itemId:'chinese',status:'READY',rendered:{...projected,illustrationKey:'chinese-self-concept-door-v1'}}
 const data={schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'READY',mode:'INDIVIDUAL_SUMMARY',reports:[unit]}
 const view=(dto:unknown)=><EducationAssessmentReport data={dto as EducationFeedbackData}/>
 const {rerender}=render(view(data))
 expect(screen.getByRole('img',{name:/小禾.*她在怕什么/})).toBeInTheDocument()
 rerender(view({...data,reports:[{...unit,rendered:projected}]}))
 expect(screen.queryByRole('img')).toBeNull()
 rerender(view({...data,mode:'COMPLETION_ONLY'}))
 expect(screen.queryByRole('img')).toBeNull()
 rerender(view({...data,reports:[{...unit,status:'REVOKED'}]}))
 expect(screen.queryByRole('img')).toBeNull()
})

it('uses only the disclosed band for school action art and removes illustrations when access is withheld',()=>{
 const report={generatorVersion:'DECLARATIVE_REPORT_V1',title:'语文报告',illustrationKey:'chinese-self-concept-door-with-actions-v2',
   blocks:[{type:'REFERENCE_BAND',metricKey:'academic_self_concept',bandKey:'low',text:'一次读书经历'}],limitations:[],disclaimer:null}
 const dto=(result:typeof report,status='READY')=>({schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'READY',
   mode:'INDIVIDUAL_SUMMARY',reports:[{itemId:'chinese',status,rendered:result}]} as unknown as EducationFeedbackData)
 const {rerender}=render(<EducationAssessmentReport data={dto(report)}/>)
 expect(screen.getByRole('img',{name:/橙色书签/})).toBeInTheDocument()
 const scoreReport={...report,illustrationKey:'chinese-self-concept-door-with-score-actions-v3',
   blocks:report.blocks.map(block=>({...block,type:'SCORE_FEEDBACK'}))}
 rerender(<EducationAssessmentReport data={dto(scoreReport)}/>)
 expect(screen.getByRole('img',{name:/橙色书签/})).toBeInTheDocument()
 rerender(<EducationAssessmentReport data={dto(scoreReport,'WITHHELD')}/>)
 expect(screen.queryByRole('img')).toBeNull()
 rerender(<EducationAssessmentReport data={dto({...report,blocks:[]})}/>)
 expect(screen.getAllByRole('img')).toHaveLength(1)
 expect(screen.queryByRole('img',{name:/橙色书签/})).toBeNull()
 rerender(<EducationAssessmentReport data={dto(report,'WITHHELD')}/>)
 expect(screen.queryByRole('img')).toBeNull()
})
