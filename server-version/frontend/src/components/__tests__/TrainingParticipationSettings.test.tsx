import {beforeEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {ParticipationSettings} from '../participation/ParticipationSettings'
import {TrainingParticipationSettings} from '../TrainingParticipationSettings'
import {SurveyParticipationSettings} from '../../survey/SurveyParticipationSettings'
const api=vi.hoisted(()=>({participation:vi.fn(),configureParticipation:vi.fn(),resetParticipationCode:vi.fn()}))
vi.mock('../../api/anonymousStudy',()=>({anonymousStudyApi:api}))
const settings={studyId:'study',revision:2,mode:'PERSONAL_LINK',label:'报名序号',instructions:'按活动编号填写',locked:false,shortCodes:['001'],page:1,hasNext:false,participants:[]}
beforeEach(()=>{vi.resetAllMocks();api.participation.mockResolvedValue(settings)})
it('saves the shared three-mode editor through only the Training revision-checked adapter',async()=>{
 api.configureParticipation.mockResolvedValue({...settings,revision:3,mode:'MEMORABLE_CODE'})
 render(<TrainingParticipationSettings studyId="study"/>);
 fireEvent.click(await screen.findByRole('radio',{name:/可记忆研究编码/}))
 fireEvent.change(screen.getByLabelText(/可用短编号（每行一个）/),{target:{value:'001\n002'}})
 fireEvent.click(screen.getByRole('button',{name:'保存参与方式'}))
 await waitFor(()=>expect(api.configureParticipation).toHaveBeenCalledWith('study',{revision:2,mode:'MEMORABLE_CODE',label:'报名序号',instructions:'按活动编号填写',shortCodes:['001','002']}))
 expect(await screen.findByText(/首次建立波次或领取身份后固定/)).toBeInTheDocument()
 expect(api.resetParticipationCode).not.toHaveBeenCalled()
})
it('locks published roster and issues Training reset only after explicit confirmation',async()=>{
 api.participation.mockResolvedValue({...settings,locked:true,mode:'MEMORABLE_CODE',participants:[{prefix:'001',participantId:'p',participant:{researchCode:'P-123',status:'ACTIVE'},resetExpiresAt:null}]})
 const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
 api.resetParticipationCode.mockResolvedValue({resetCode:'001-RESET',expiresAt:'2026-10-24T08:30:00Z'})
 render(<TrainingParticipationSettings studyId="study"/>);
 expect(await screen.findByRole('radio',{name:/可记忆研究编码/})).toBeDisabled()
 expect(screen.queryByRole('button',{name:'保存参与方式'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('管理短编号与重置'))
 fireEvent.change(screen.getByLabelText('要重置的短编号'),{target:{value:'001'}})
 fireEvent.click(screen.getByRole('button',{name:'签发一次性重置码'}))
 expect(api.resetParticipationCode).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'签发一次性重置码'}))
 expect(await screen.findByText('001-RESET')).toBeInTheDocument()
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining('旧编码和旧页面凭据会立即失效'))
 expect(api.resetParticipationCode).toHaveBeenCalledWith('study','001')
 confirm.mockRestore()
 expect(screen.queryByRole('link',{name:'先完成动态验证码验证'})).not.toBeInTheDocument()
 expect(screen.queryByRole('textbox',{name:/私人后缀/})).not.toBeInTheDocument()
})
it('does not offer reset or expose registry for random-code mode',async()=>{
 api.participation.mockResolvedValue({...settings,locked:true,mode:'SELF_CODE'})
 render(<TrainingParticipationSettings studyId="study"/>);
 expect(await screen.findByRole('radio',{name:/随机研究编码/})).toBeDisabled()
 expect(screen.queryByText('管理短编号与重置')).not.toBeInTheDocument()
 expect(screen.getByText(/不提供研究者重置/)).toBeInTheDocument()
 expect(screen.getByText(/研究同意另行确认/)).toBeInTheDocument()
})
it('discards a pending private reset response when the owner changes study',async()=>{
 api.participation.mockResolvedValue({...settings,locked:true,mode:'MEMORABLE_CODE'})
 let finish!:(value:unknown)=>void
 api.resetParticipationCode.mockReturnValue(new Promise(resolve=>{finish=resolve}))
 const load=api.participation,save=api.configureParticipation,reset=api.resetParticipationCode
 const view=render(<ParticipationSettings scopeId="study" revision={2} load={load} saveSettings={save} resetCode={reset}/>);
 await screen.findByText('管理短编号与重置');fireEvent.click(screen.getByText('管理短编号与重置'))
 fireEvent.change(screen.getByLabelText('要重置的短编号'),{target:{value:'001'}})
 fireEvent.click(screen.getByRole('button',{name:'签发一次性重置码'}))
 view.rerender(<ParticipationSettings scopeId="other" revision={2} load={load} saveSettings={save} resetCode={reset}/>)
 finish({resetCode:'OLD-PRIVATE-RESET',expiresAt:'2026-10-24T08:30:00Z'})
 await waitFor(()=>expect(api.participation).toHaveBeenCalledTimes(2))
 expect(screen.queryByText('OLD-PRIVATE-RESET')).not.toBeInTheDocument()
})
it('keeps Survey transport, optimistic revision and MFA instructions in its thin adapter',async()=>{
 const request=vi.fn().mockResolvedValue({...settings,projectId:'project',locked:true,mode:'MEMORABLE_CODE'})
 render(<SurveyParticipationSettings projectId="project" revision={2} request={request} onRevision={()=>{}}/>);
 await screen.findByText('管理短编号与重置');fireEvent.click(screen.getByText('管理短编号与重置'))
 expect(request).toHaveBeenCalledWith('/projects/project/participation')
 expect(screen.getByRole('link',{name:'先完成动态验证码验证'})).toHaveAttribute('href','/workspace?project=project&section=data#survey-data-export')
 expect(api.participation).not.toHaveBeenCalled()
})

it('binds a reset result to its captured prefix and clears the old secret when the number changes',async()=>{
 const load=vi.fn().mockResolvedValue({...settings,locked:true,mode:'MEMORABLE_CODE'})
 let finish!:(value:{resetCode:string;expiresAt:string})=>void
 const reset=vi.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 render(<ParticipationSettings scopeId="study" revision={2} load={load} saveSettings={vi.fn()} resetCode={reset}/>);
 fireEvent.click(await screen.findByText('管理短编号与重置'))
 const prefix=screen.getByLabelText('要重置的短编号')
 fireEvent.change(prefix,{target:{value:'001'}})
 fireEvent.click(screen.getByRole('button',{name:'签发一次性重置码'}))
 expect(prefix).toBeDisabled()
 finish({resetCode:'001-PRIVATE',expiresAt:'2026-10-24T08:30:00Z'})
 expect(await screen.findByText('001-PRIVATE')).toBeInTheDocument()
 expect(screen.getByText(/仅交给短编号 001 对应的被试/)).toBeInTheDocument()
 fireEvent.change(prefix,{target:{value:'002'}})
 expect(screen.queryByText('001-PRIVATE')).not.toBeInTheDocument()
 expect(reset).toHaveBeenCalledTimes(1)
})
