import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import SurveyPublicApp from './SurveyPublicApp'
import {SurveyParticipationSettings} from './SurveyParticipationSettings'
import {SurveyMemorableCodeRecovery} from './SurveyMemorableCode'
const pid='11111111-1111-4111-8111-111111111111',invite='a'.repeat(43)
const generatedCode='HS2-ABCDE-FGHJK-MNPQR-STVWX'
const proof={researchCode:'R-ABCDEFGH',accessCredential:'s'.repeat(43)}
const wave={id:'wave1',title:'第一次',ordinal:1,status:'OPEN',consentText:'首次参加知情同意',consentVersion:1,opensAt:null,closesAt:null,allowNewParticipants:true}
const next={...wave,id:'wave2',title:'第二次',ordinal:2,consentVersion:2,consentText:'第二次参加知情同意',allowNewParticipants:false}
const response=(data:unknown)=>Promise.resolve({ok:true,status:200,json:async()=>({code:0,data})} as Response)
function fixture(mode:'MEMORABLE_CODE'|'SELF_CODE'){
 const api=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);expect(init?.credentials).toBe('omit');expect(window.location.hash).toBe('')
  if(url.endsWith('/info'))return response({project:{name:'编码体验',description:'',status:'ACTIVE',collectionMode:'LINKED_WAVES',participantIdentityMode:mode,participantCodeLabel:'报名序号'},waves:[wave,next]})
  if(url.endsWith('/join-random-code'))return response({...proof,fullCode:generatedCode})
  if(url.endsWith('/join-code'))return response(proof)
  if(url.endsWith('/enter-code'))return response({...proof,waves:[{...wave,status:'CLOSED',attempt:{id:'old',status:'COMPLETED'}},next]})
  if(url.endsWith('/start'))return response({attemptId:'new'})
  if(url.endsWith('/task'))return response({attemptId:'new',waveId:wave.id,status:'STARTED',definitionDigest:'d'.repeat(64),reportMode:'GENERAL_ONLY',units:[{kind:'FORM',instrumentKey:'f',title:'体验',pages:[{pageKey:'p',title:'感受',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'此刻感受',required:false,options:[]}]}]}]})
  throw Error('Unexpected '+url)
 });vi.stubGlobal('fetch',api);return api
}
beforeEach(()=>{sessionStorage.clear();localStorage.clear();window.history.replaceState(null,'','/r/'+pid+'#entry='+invite)})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('three participant entry modes',()=>{
 it('requires consent before showing assigned-code fields, then remembers the complete code and uses only server proof for tasks',async()=>{
  const api=fixture('MEMORABLE_CODE');render(<SurveyPublicApp/>);
  fireEvent.click((await screen.findAllByRole('button',{name:'查看参与说明'}))[0])
  expect(screen.getByRole('button',{name:'首次参加 · 设置研究编码'})).toBeDisabled();expect(screen.queryByLabelText('报名序号')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox',{name:/我已阅读并同意/}));fireEvent.click(screen.getByRole('button',{name:'首次参加 · 设置研究编码'}))
  fireEvent.change(screen.getByLabelText('报名序号'),{target:{value:'001'}});fireEvent.change(screen.getByLabelText('自己设置的后缀'),{target:{value:'sky7'}})
  fireEvent.change(screen.getByLabelText('再次确认后缀'),{target:{value:'moon8'}});fireEvent.click(screen.getByRole('button',{name:'确认研究编码'}))
  expect(screen.getByRole('alert')).toHaveTextContent('两次后缀不一致');expect(api.mock.calls.some(([u])=>String(u).endsWith('/join-code'))).toBe(false)
  fireEvent.change(screen.getByLabelText('再次确认后缀'),{target:{value:'SKY7'}});fireEvent.click(screen.getByRole('button',{name:'确认研究编码'}))
  await screen.findByText('001-SKY7');expect(screen.queryByRole('button',{name:'开始填写问卷'})).toBeNull()
  expect(api.mock.calls.some(([u])=>String(u).endsWith('/start'))).toBe(false)
  expect(screen.queryByRole('button',{name:'显示专属二维码'})).toBeNull();expect(screen.queryByText('使用旧编号和恢复凭证')).toBeNull()
  const call=api.mock.calls.find(([u])=>String(u).endsWith('/join-code'))!;expect(JSON.parse(String(call[1]?.body))).toEqual({prefix:'001',suffix:'SKY7',entryToken:invite,consent:true,consentVersion:1})
  fireEvent.click(screen.getByRole('button',{name:'我已保存，进入答题'}));await screen.findByText('此刻感受')
  const start=api.mock.calls.find(([u])=>String(u).endsWith('/start'))!;expect(JSON.parse(String(start[1]?.body))).toEqual({...proof,consent:true,consentVersion:1})
  expect([...Object.values(sessionStorage),...Object.values(localStorage)].join('')).not.toMatch(/SKY7|ssssssss/)
 })
 it.each(['SELF_CODE','MEMORABLE_CODE'] as const)('uses a clear returning entrance without an invitation in %s mode',async mode=>{
  window.history.replaceState(null,'','/r/'+pid)
  const api=fixture(mode);render(<SurveyPublicApp/>)
  await screen.findByRole('heading',{name:'使用原编码继续参加'})
  expect(screen.getByText('首次参加？').parentElement).toHaveTextContent('请打开研究者发来的完整邀请链接')
  expect(screen.queryByRole('button',{name:/首次参加/})).toBeNull()
  expect(screen.queryByRole('button',{name:'开始填写问卷'})).toBeNull()
  expect(screen.queryByRole('button',{name:'查看参与说明'})).toBeNull()
  expect(screen.queryByRole('list',{name:'研究参与步骤'})).toBeNull()
  fireEvent.change(screen.getByLabelText('完整研究编码'),{target:{value:mode==='SELF_CODE'?generatedCode:'001-SKY7'}})
  fireEvent.click(screen.getByRole('button',{name:'继续参加'}))
  await screen.findByText('第 2 轮 · 第二次')
  expect(api.mock.calls.filter(([url])=>/\/(join-code|join-random-code|start)$/.test(String(url)))).toHaveLength(0)
  expect(api.mock.calls.filter(([url])=>String(url).endsWith('/enter-code'))).toHaveLength(1)
  expect(screen.getByRole('checkbox',{name:/我已阅读并同意/})).not.toBeChecked()
 })
 it('opens consent directly without enrolling anyone or adding a reveal/claim click',async()=>{
  const api=fixture('SELF_CODE');render(<SurveyPublicApp/>)
  await screen.findByRole('button',{name:'我已阅读并同意，参加问卷'})
  expect(screen.getByRole('region',{name:'知情同意书'})).toHaveTextContent(wave.consentText)
  expect(screen.queryByRole('button',{name:'查看参与说明'})).toBeNull()
  expect(screen.queryByRole('button',{name:'首次参加 · 领取研究编码'})).toBeNull()
  expect(screen.queryByRole('checkbox',{name:/我已阅读并同意/})).toBeNull()
  expect(screen.getByText('已参加过？使用研究编码继续').closest('details')).not.toHaveAttribute('open')
  expect(api.mock.calls.filter(([url])=>/\/(join-code|join-self-code|join-random-code|start)$/.test(String(url)))).toHaveLength(0)
 })
 it('uses exactly consent, copy and start actions, replacing the previous stage at each step',async()=>{
  const copy=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText:copy}})
  const api=fixture('SELF_CODE');render(<SurveyPublicApp/>);
  // First click: explicit consent atomically requests a server-generated code.
  fireEvent.click(await screen.findByRole('button',{name:'我已阅读并同意，参加问卷'}))
  await screen.findByText(generatedCode)
  expect(screen.getByText(/无法重新生成原答卷的编码/)).toBeVisible()
  expect(screen.queryByText(wave.consentText)).toBeNull()
  expect(screen.queryByRole('button',{name:'我已阅读并同意，参加问卷'})).toBeNull()
  expect(screen.queryByRole('button',{name:'我已保存，进入答题'})).toBeNull()
  const call=api.mock.calls.find(([u])=>String(u).endsWith('/join-random-code'))!
  expect(JSON.parse(String(call[1]?.body))).toEqual({entryToken:invite,consent:true,consentVersion:1})
  expect(api.mock.calls.some(([u])=>String(u).endsWith('/join-self-code'))).toBe(false)
  // Second click: only successful clipboard writing unlocks the final action.
  fireEvent.click(screen.getByRole('button',{name:'复制研究编码'}))
  await screen.findByRole('button',{name:'我已保存，进入答题'})
  expect(copy).toHaveBeenCalledWith(generatedCode)
  expect(screen.getByRole('region',{name:'准备答题'})).toHaveTextContent('请确认已保存编码')
  expect(screen.getByRole('region',{name:'准备答题'})).toHaveTextContent('无法重新生成原答卷的编码')
  expect(screen.queryByRole('button',{name:'复制研究编码'})).toBeNull()
  expect(screen.getByText(generatedCode)).not.toBeVisible()
  expect([...Object.values(sessionStorage),...Object.values(localStorage)].join('')).not.toMatch(/HS2|ssssssss/)
  expect(api.mock.calls.some(([u])=>String(u).endsWith('/start'))).toBe(false)
  // Third click: the existing consent-bound start protocol loads the questionnaire.
  fireEvent.click(screen.getByRole('button',{name:'我已保存，进入答题'}));await screen.findByText('此刻感受')
  expect(screen.queryByRole('region',{name:'准备答题'})).toBeNull()
  expect(screen.queryByText(generatedCode)).toBeNull()
  const start=api.mock.calls.find(([u])=>String(u).endsWith('/start'))!
  expect(JSON.parse(String(start[1]?.body))).toEqual({...proof,consent:true,consentVersion:1})
  expect(api.mock.calls.filter(([u])=>String(u).endsWith('/join-random-code'))).toHaveLength(1)
 })
 it('keeps the code visible if copying fails and requires explicit manual-save confirmation',async()=>{
  vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn().mockRejectedValue(new Error('blocked'))}})
  const api=fixture('SELF_CODE');render(<SurveyPublicApp/>);
  fireEvent.click(await screen.findByRole('button',{name:'我已阅读并同意，参加问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'复制研究编码'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('请手动复制')
  expect(screen.getByText(generatedCode)).toBeVisible()
  expect(screen.queryByRole('button',{name:'我已保存，进入答题'})).toBeNull()
  expect(api.mock.calls.some(([u])=>String(u).endsWith('/start'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'我已手动保存'}))
  fireEvent.click(await screen.findByRole('button',{name:'我已保存，进入答题'}));await screen.findByText('此刻感受')
 })
 it('does not unlock start while a clipboard write is still pending',async()=>{
  let finish!:()=>void;vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))}})
  fixture('SELF_CODE');render(<SurveyPublicApp/>);
  fireEvent.click(await screen.findByRole('button',{name:'我已阅读并同意，参加问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'复制研究编码'}))
  expect(screen.getByRole('button',{name:'正在复制…'})).toBeDisabled()
  expect(screen.queryByRole('button',{name:'我已保存，进入答题'})).toBeNull()
  finish();await screen.findByRole('button',{name:'我已保存，进入答题'})
 })
 it('leaves consent visible after a rejected enrollment and prevents duplicate in-flight claims',async()=>{
  const original=fixture('SELF_CODE');let reject!:()=>void
  const api=vi.fn((input:RequestInfo|URL,init?:RequestInit)=>String(input).endsWith('/join-random-code')
   ?new Promise<Response>(resolve=>{reject=()=>resolve({ok:false,status:403,json:async()=>({code:-1,message:'研究说明已经更新，请重新确认'})} as Response)})
   :original(input,init));vi.stubGlobal('fetch',api)
  render(<SurveyPublicApp/>);const agree=await screen.findByRole('button',{name:'我已阅读并同意，参加问卷'})
  fireEvent.click(agree);fireEvent.click(agree)
  expect(api.mock.calls.filter(([u])=>String(u).endsWith('/join-random-code'))).toHaveLength(1)
  expect(agree).toBeDisabled();reject()
  expect(await screen.findByRole('alert')).toHaveTextContent('研究说明已经更新')
  expect(screen.getByRole('region',{name:'知情同意书'})).toHaveTextContent(wave.consentText)
  expect(screen.queryByRole('button',{name:'复制研究编码'})).toBeNull()
  expect(api.mock.calls.some(([u])=>String(u).endsWith('/start'))).toBe(false)
 })
 it('lets a returning participant switch from the invitation to code recovery without creating an identity',async()=>{
  const api=fixture('SELF_CODE');render(<SurveyPublicApp/>);
  fireEvent.click(await screen.findByText('已参加过？使用研究编码继续'))
  fireEvent.change(screen.getByLabelText('完整研究编码'),{target:{value:generatedCode}})
  fireEvent.click(screen.getByRole('button',{name:'继续参加'}))
  await screen.findByText(next.consentText)
  expect(screen.getByRole('checkbox',{name:/我已阅读并同意/})).not.toBeChecked()
  expect(api.mock.calls.some(([u])=>String(u).endsWith('/join-random-code'))).toBe(false)
 })
 it('returning with one private code opens the next consent unchecked without creating a new identity',async()=>{
  window.history.replaceState(null,'','/r/'+pid);const api=fixture('SELF_CODE');render(<SurveyPublicApp/>);
  fireEvent.change(await screen.findByLabelText('完整研究编码'),{target:{value:generatedCode}});fireEvent.click(screen.getByRole('button',{name:'继续参加'}))
  await screen.findByText(next.consentText);expect(screen.getByRole('checkbox',{name:/我已阅读并同意/})).not.toBeChecked();expect(screen.getByRole('button',{name:'开始填写问卷'})).toBeDisabled()
  expect(screen.queryByRole('button',{name:'查看回执'})).toBeNull()
  const history=screen.getByText('已完成问卷').closest('details')!
  expect(history).not.toHaveAttribute('open')
  expect(history.parentElement?.lastElementChild).toBe(history)
  fireEvent.click(screen.getByText('已完成问卷'))
  await screen.findByRole('button',{name:'查看回执'})
  expect(screen.getByText(next.consentText)).toBeVisible()
  expect(api.mock.calls.filter(([u])=>/\/(join-code|join-self-code|join-random-code|start)$/.test(String(u)))).toHaveLength(0)
 })
 it('reset UI sends the one-use ticket plus a confirmed new suffix, never a replacement assigned number',()=>{
  const onReset=vi.fn();render(<SurveyMemorableCodeRecovery busy={false} onEnter={()=>{}} onReset={onReset}/>);fireEvent.click(screen.getByText('研究者已为我重置编码'))
  fireEvent.change(screen.getByLabelText('一次性重置码'),{target:{value:'001-ABCDEF1234'}});fireEvent.change(screen.getByLabelText('新的私人后缀'),{target:{value:'MOON8'}});fireEvent.change(screen.getByLabelText('确认新的后缀'),{target:{value:'MOON8'}})
  fireEvent.click(screen.getByRole('button',{name:'设置新后缀'}));expect(onReset).toHaveBeenCalledWith('001-ABCDEF1234','MOON8');expect(screen.queryByLabelText('报名序号')).toBeNull()
 })
})
const settings={projectId:pid,revision:2,mode:'PERSONAL_LINK',label:'报名序号',instructions:'请输入报名序号',locked:false,shortCodes:[],page:1,hasNext:false,participants:[]}
describe('researcher entry selection',()=>{
 it('offers exactly three exclusive modes and preserves leading-zero short numbers in explicit saves',async()=>{
  const request=vi.fn().mockResolvedValue(settings);const revised=vi.fn();render(<SurveyParticipationSettings projectId={pid} revision={2} request={request} onRevision={revised}/>);
  expect(await screen.findAllByRole('radio')).toHaveLength(3);fireEvent.click(screen.getByRole('radio',{name:/可记忆研究编码/}));fireEvent.change(screen.getByLabelText(/可用短编号/),{target:{value:'001\n二班07'}})
  request.mockResolvedValueOnce({...settings,revision:3,mode:'MEMORABLE_CODE',shortCodes:['001','二班07']});fireEvent.click(screen.getByRole('button',{name:'保存参与方式'}))
  await waitFor(()=>expect(revised).toHaveBeenCalledWith(3));expect(request).toHaveBeenLastCalledWith('/projects/'+pid+'/participation','PATCH',expect.objectContaining({revision:2,mode:'MEMORABLE_CODE',shortCodes:['001','二班07']}))
 })
 it('locks frozen choices and shows reset only for researcher-assigned mode',async()=>{
  const request=vi.fn().mockResolvedValue({...settings,locked:true,mode:'MEMORABLE_CODE',participants:[{prefix:'001',participantId:'x',participant:{researchCode:'R-123',status:'ACTIVE'},resetExpiresAt:null}]});render(<SurveyParticipationSettings projectId={pid} revision={2} request={request} onRevision={()=>{}}/>);
  for(const radio of await screen.findAllByRole('radio'))expect(radio).toBeDisabled();expect(screen.queryByRole('button',{name:'保存参与方式'})).toBeNull()
  fireEvent.click(screen.getByText('管理短编号与重置'));expect(screen.getByRole('button',{name:'签发一次性重置码'})).toBeDisabled();expect(screen.getByText('001')).toBeInTheDocument()
 })
 it('does not expose researcher reset or identifiers for random code studies',async()=>{
  const request=vi.fn().mockResolvedValue({...settings,locked:true,mode:'SELF_CODE'});render(<SurveyParticipationSettings projectId={pid} revision={2} request={request} onRevision={()=>{}}/>);
  const region=await screen.findByRole('region',{name:'多波次参与方式'});await waitFor(()=>expect(within(region).getByRole('radio',{name:/随机研究编码/})).toBeChecked())
  expect(screen.queryByText('管理短编号与重置')).toBeNull();expect(region).toHaveTextContent('丢失后无法找回')
 })
})
