import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {SurveyWaveStudio} from './SurveyWaveStudio'
import {createInstrumentLibrary} from './instrument-library'
import SurveyApp from './SurveyApp'
vi.mock('./SurveyReportStudio',()=>({SurveyReportStudio:()=>null}))
vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=>null}))
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:({selectedIds}:{selectedIds:string[]})=><output aria-label="合成顺序">{selectedIds.join(',')}</output>}))
vi.mock('./SurveyStudyPreview',()=>({SurveyStudyPreview:()=>null}))
const project={id:'p',title:'合成研究',description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:0}
const draft=(id:string,title:string)=>({id,title,kind:'FORM',status:'DRAFT',revision:1,projectId:'p',instrumentKey:id,definition:{schemaVersion:1,pages:[{pageKey:'p1',title:'内容',questions:[{itemKey:'q1',type:'SHORT_TEXT',prompt:title,required:false,options:[],rows:[]}]}]}})
const reply=(data:unknown)=>Promise.resolve({ok:true,json:async()=>({code:0,data})} as Response)
let added=false,savedBody:any
beforeEach(()=>{added=false;savedBody=null;window.history.replaceState(null,'','/workspace');vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
 if(url.endsWith('/auth/me'))return reply({id:'r',username:'合成研究者',mustChangePassword:false})
 if(url.endsWith('/auth/capabilities'))return reply({analytics:false,publication:true})
 if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
 if(url.includes('/projects?page='))return reply({list:[project]})
 if(url.endsWith('/projects/p'))return reply(project)
 if(url.includes('/instruments?page='))return reply({list:added?[draft('copyA','第二份表单'),draft('copyB','第一份表单')]:[]})
 if(url.endsWith('/instruments/copyA'))return reply(draft('copyA','第二份表单'))
 if(url.endsWith('/instruments/copyB'))return reply(draft('copyB','第一份表单'))
 if(url.includes('/waves?page='))return reply({list:[]})
 if(url.endsWith('/waves')&&init?.method==='POST'){savedBody=JSON.parse(String(init.body));return reply({...savedBody,id:'w',projectId:'p',ordinal:1,revision:0,status:'DRAFT',publicationId:null})}
 if(url.includes('/tool-library?'))return reply({list:[{id:'composition',kind:'COMPOSITION',title:'普通组合问卷',revision:2,status:'DRAFT'}],total:1})
 if(url.includes('/tool-library/select/')){added=true;return reply({instrumentIds:['copyB','copyA']})}
 throw new Error('Unexpected '+url)
}))})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
it('adds normal questionnaire content in stored order, supports reordering and saves the actual wave selection',async()=>{
 const risk=vi.fn();render(<SurveyWaveStudio projectId="p" instrumentLibrary={createInstrumentLibrary('p')} onLeaveRiskChange={risk}/>)
 expect(await screen.findByRole('heading',{name:'问卷内容与顺序'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'从工具集添加'}));fireEvent.click(await screen.findByRole('button',{name:'加入当前问卷'}))
 await waitFor(()=>expect(screen.getByLabelText('合成顺序')).toHaveTextContent('copyB,copyA'))
 expect(document.querySelector('.survey-selected-tools')?.textContent).toMatch(/第一份表单.*第二份表单/)
 expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false})
 fireEvent.click(screen.getByRole('button',{name:'下移 第一份表单'}));expect(screen.getByLabelText('合成顺序')).toHaveTextContent('copyA,copyB')
 vi.spyOn(window,'confirm').mockReturnValue(false);fireEvent.click(screen.getByRole('button',{name:'新建波次'}))
 expect(screen.getByLabelText('合成顺序')).toHaveTextContent('copyA,copyB')
 fireEvent.change(screen.getByLabelText('波次标题'),{target:{value:'普通组合问卷采集'}})
 fireEvent.change(screen.getByLabelText('参与说明与知情同意'),{target:{value:'这是独立合成测试使用的完整知情同意文字，仅用于验证问卷顺序。'}})
 const button=screen.getByRole('button',{name:/^创建波次$|保存波次草稿/});fireEvent.click(button)
 await waitFor(()=>expect(savedBody?.instrumentIds).toEqual(['copyA','copyB']))
 await waitFor(()=>expect(risk).toHaveBeenLastCalledWith({dirty:false,busy:false}))
})
it('exposes four study tabs and restores legacy tools links inside publication',async()=>{
 window.history.replaceState(null,'','/workspace?project=p&section=tools#survey-tool-create')
 render(<SurveyApp/>);expect(await screen.findByRole('heading',{name:'合成研究'})).toBeVisible()
 const tabs=within(screen.getByRole('tablist',{name:'研究工作分区'}))
 expect(tabs.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['研究设置','私有报告','发布与采集','研究数据'])
 expect(tabs.getByRole('tab',{name:'发布与采集'})).toHaveAttribute('aria-selected','true')
 expect(new URLSearchParams(window.location.search).get('section')).toBe('publish')
 expect(window.location.hash).toBe('#survey-wave-content')
 expect(screen.queryByRole('tab',{name:'研究工具'})).not.toBeInTheDocument()
})
