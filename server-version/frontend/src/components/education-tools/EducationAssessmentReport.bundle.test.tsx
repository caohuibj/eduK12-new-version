import {it,expect} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {afterEach} from 'vitest'
import {EducationAssessmentReport} from './EducationAssessmentReport'
import type {EducationFeedbackData} from './EducationTaskFeedback'
afterEach(cleanup)
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
