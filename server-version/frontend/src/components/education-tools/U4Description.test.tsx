import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {FormDescription} from './FormDescription'
import {U4CandidateChooser} from './U4CandidateChooser'
import {HuiteacherStudentFeedbackView,type StudentFeedbackReport} from '../../huiteacher/HuiteacherStudentFeedbackView'
import type {PrivateToolApi} from './privateToolClient'
afterEach(cleanup)
it('shows zero and nonresponse without a fake score, optional incomplete mean remains uncomputed',()=>{
 render(<FormDescription report={{version:'ordinal-description-v1',items:[{itemKey:'a',prompt:'实践',label:'从未',code:0,state:'VALID'},
 {itemKey:'b',prompt:'机会',label:'未遇到',code:null,state:'NONRESPONSE_OPTION'}],exploratoryMeans:[{key:'t',label:'专题',completeItems:1,expectedItems:2,value:null}],note:'不是能力分'}}/>)
 expect(screen.getByText('实践：从未（类别 0）')).toBeInTheDocument()
 expect(screen.getByText('机会：未遇到')).toBeInTheDocument()
 expect(screen.getByText(/未计算（完整 1\/2 题）/)).toBeInTheDocument()
})
it('labels submitted and valid denominators separately and never renders withheld values',()=>{
 const report={teacherName:'教师',formTitle:'反馈',releasedAt:'2026-11-02',definitionDigest:'abc',minimumRespondents:5,independentRespondents:30,frozenPopulation:40,participationRate:.75,
  distributions:[{itemKey:'q',prompt:'支持',type:'SINGLE',status:'READY',cells:[{key:'na',label:'未遇到',count:5}],descriptive:{version:'ordinal-description-v1',validN:10,submittedN:30,frequencies:[{key:'f0',label:'从未',percentage:50}]}},
  {itemKey:'x',prompt:'抑制项',type:'SINGLE',status:'WITHHELD',reason:'SMALL_CELL',cells:[{key:'secret',label:'不应显示',count:1}]}],note:'描述性报告'} as StudentFeedbackReport
 render(<HuiteacherStudentFeedbackView report={report}/>)
 expect(screen.getByText(/提交 30 人；本题有效类别回答 10 人/)).toBeInTheDocument()
 expect(screen.getByText('从未：50%')).toBeInTheDocument()
 expect(screen.getByText(/以提交人数为分母/)).toBeInTheDocument()
 expect(screen.queryByText(/不应显示/)).not.toBeInTheDocument()
})
it('loads on request and creates only the explicitly selected independent candidate once',async()=>{
 const created=vi.fn(),onBusy=vi.fn(),api=vi.fn(async(_path:string,method?:string)=>method==='POST'?{id:'draft'}:{list:[
 {key:'u4-tr36',title:'全模块',responseMode:'SELF',questions:36,scope:'模块'},
 {key:'u4-tr36--tr-t01',title:'专题一',responseMode:'SELF',questions:3,scope:'内容专题'}]})
 render(<U4CandidateChooser api={api as PrivateToolApi} organizationId="org" disabled={false} onCreated={created} onBusy={onBusy}/>)
 expect(api).not.toHaveBeenCalled()
 fireEvent.click(screen.getByText('加载教学评价候选'))
 fireEvent.change(await screen.findByLabelText('教学评价候选'),{target:{value:'u4-tr36--tr-t01'}})
 fireEvent.click(screen.getByText('创建所选候选草稿'));fireEvent.click(screen.getByText('创建所选候选草稿'))
 await waitFor(()=>expect(created).toHaveBeenCalledTimes(1))
 expect(api).toHaveBeenLastCalledWith('/organizations/org/private-tools/u4-candidates','POST',{key:'u4-tr36--tr-t01'})
 expect(onBusy).toHaveBeenLastCalledWith(false)
})
