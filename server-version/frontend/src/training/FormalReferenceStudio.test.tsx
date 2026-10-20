import {beforeEach,describe,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
const mocks=vi.hoisted(()=>({grants:vi.fn(),read:vi.fn(),execute:vi.fn()}))
vi.mock('../api/formalReference',()=>({formalReferenceApi:mocks}))
import FormalReferenceStudio,{FormalReferenceSubmission} from './FormalReferenceStudio'
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const candidate=()=>({candidateId:id(1),candidateHash:'a'.repeat(64),analyzerId:id(2),sampleCount:10,sampleManifestHash:'b'.repeat(64),
  measurement:{releaseId:id(3),contentHash:'c'.repeat(64)},definition:{entries:[{scoreKey:'total',statistics:{mean:3,sd:1},limitations:['代表性仍需复核']}]},
  evidence:{method:'Actual source method'},submissionStatement:'Explicit aggregate submission',consentUseAssessment:'Owner consent assessment',
  targetPopulation:{kind:'SUPPORTED_MATCH' as const,match:{minAgeMonthsInclusive:120,maxAgeMonthsExclusive:144},basis:'Verified target boundary'},
  consentEvidence:[{version:'1',scopeHash:'d'.repeat(64),purpose:'Recorded accepted research purpose',dataCategories:['SCALE'],body:'Only for this course; external sharing is not permitted.',bodyHash:'e'.repeat(64)}],
  sampleManifest:[{factId:'PRIVATE_PERSON_DO_NOT_SHOW'}]})
const grant=()=>({grantId:id(4),measurementReleaseIds:[id(3)],capabilities:['reference.review','reference.publish']})
const field=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
async function read(){
  await screen.findByRole('heading',{name:'正式参考独立审核与发布'})
  field('正式候选 UUID',id(1));field('读取能力授权',id(4))
  fireEvent.click(screen.getByRole('button',{name:'读取正式聚合证据'}))
  await screen.findByRole('heading',{name:'正式候选聚合证据'})
}
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true)
  mocks.grants.mockResolvedValue([grant()]);mocks.read.mockResolvedValue(candidate())})
describe('formal reference platform panel',()=>{
  it('does not render scientific controls without an actual explicit platform grant',async()=>{
    mocks.grants.mockResolvedValue([]);render(<FormalReferenceStudio actorId={id(9)}/>)
    await waitFor(()=>expect(mocks.grants).toHaveBeenCalledOnce())
    expect(screen.queryByText('正式参考独立审核与发布')).not.toBeInTheDocument()
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('reads exact aggregate evidence using current capability and never renders supplied personal membership',async()=>{
    render(<FormalReferenceStudio actorId={id(9)}/>);await read()
    expect(mocks.read).toHaveBeenCalledWith(id(1),id(4),'REVIEW')
    expect(screen.getByText('Recorded accepted research purpose')).toBeInTheDocument()
    expect(screen.getByText('已接受同意正文：Only for this course; external sharing is not permitted.')).toBeInTheDocument()
    expect(screen.queryByText(/PRIVATE_PERSON/)).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'保存正式审核决定'})).toBeDisabled()
  })
  it('prevents analyzer self-review in the UI without blocking independently authorized publishing',async()=>{
    render(<FormalReferenceStudio actorId={id(2)}/>);await read()
    expect(screen.queryByRole('button',{name:'保存正式审核决定'})).not.toBeInTheDocument()
    expect(screen.getByText(/你是该候选计算者/)).toBeInTheDocument()
  })
  it('lets a publisher-only operator inspect evidence without granting review',async()=>{
    mocks.grants.mockResolvedValue([{...grant(),capabilities:['reference.publish']}])
    render(<FormalReferenceStudio actorId={id(9)}/>);await read()
    expect(mocks.read).toHaveBeenCalledWith(id(1),id(4),'PUBLISH')
    expect(screen.queryByRole('button',{name:'保存正式审核决定'})).not.toBeInTheDocument()
  })
  it('retains exact review UUID/body after lost response and later refusal; recovery is not externally deadlocked',async()=>{
    mocks.execute.mockRejectedValueOnce(new Error('response lost')).mockRejectedValueOnce(Object.assign(new Error('grant revoked'),{status:403}))
    const mounted=render(<FormalReferenceStudio actorId={id(9)}/>);await read()
    field('正式审核依据','Independent assessment')
    fireEvent.click(screen.getByLabelText(/已核对实际同意范围/))
    fireEvent.click(screen.getByRole('button',{name:'保存正式审核决定'}))
    await screen.findByText(/response lost/)
    const original=mocks.execute.mock.calls[0][0]
    expect(original.body).toMatchObject({candidateId:id(1),candidateHash:'a'.repeat(64),grantId:id(4),consentReviewed:true})
    mounted.rerender(<FormalReferenceStudio actorId={id(9)} disabled/>)
    expect(screen.getByRole('button',{name:'原样重试并核对'})).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'原样重试并核对'}));await screen.findByText(/grant revoked/)
    expect(mocks.execute.mock.calls[1][0]).toEqual(original)
    expect(screen.getByLabelText('正式审核依据')).toBeDisabled()
  })
  it('uses a fresh read hash and exact approved review ID for publication',async()=>{
    mocks.execute.mockResolvedValue({releaseId:id(8),contentHash:'e'.repeat(64),version:'v1',status:'PUBLISHED'})
    render(<FormalReferenceStudio actorId={id(9)}/>);await read()
    field('正式发布授权',id(4));field('正式审核 UUID',id(5));field('正式发布 key','observed-norm');field('正式发布版本','v1')
    fireEvent.click(screen.getByRole('button',{name:'发布精确正式参考'}));await screen.findByText(/正式发布已确认/)
    expect(mocks.execute).toHaveBeenCalledWith({operation:'PUBLISH',body:{candidateId:id(1),candidateHash:'a'.repeat(64),
      grantId:id(4),reviewId:id(5),localKey:'observed-norm',version:'v1'}},'TRAINING',undefined)
  })
})
describe('formal source submission',()=>{
  const mount=()=>render(<FormalReferenceSubmission actorId={id(2)} product="TRAINING" candidateId={id(1)}
    candidateHash={'a'.repeat(64)} analyzeGrantId={id(4)}/>)
  function fill(){
    for(const label of ['正式提交说明','目标人群说明','正式适用性依据','正式样本充分性判断','正式不确定性说明','已记录同意允许本用途的依据'])field(label,'Documented evidence')
    field('目标范围与代表性依据','Target applicability basis')
  }
  it('does not assume general applicability from text; submits known source identities and structured range only',async()=>{
    mocks.execute.mockResolvedValue(candidate());mount();fill()
    fireEvent.click(screen.getByRole('button',{name:'提交给独立正式审核'}));await screen.findByText(/明确选择目标适用范围/)
    expect(mocks.execute).not.toHaveBeenCalled()
    field('目标人群选择','SUPPORTED_MATCH');field('年龄下界（月，含）','120');field('年龄上界（月，不含）','144')
    fireEvent.click(screen.getByRole('button',{name:'提交给独立正式审核'}));await screen.findByText(/正式候选已提交/)
    const body=mocks.execute.mock.calls[0][0].body
    expect(body).toMatchObject({sourceCandidateId:id(1),sourceCandidateHash:'a'.repeat(64),analyzeGrantId:id(4),
      targetPopulation:{kind:'SUPPORTED_MATCH',match:{minAgeMonthsInclusive:120,maxAgeMonthsExclusive:144}}})
    expect(body).not.toHaveProperty('statistics');expect(body).not.toHaveProperty('sampleManifest')
    expect(screen.queryByText(/PRIVATE_PERSON/)).not.toBeInTheDocument()
  })
  it('keeps original aggregate submission after unknown outcome without inventing another candidate request',async()=>{
    mocks.execute.mockRejectedValueOnce(new Error('unknown')).mockResolvedValueOnce(candidate())
    mount();fill();field('目标人群选择','GENERAL_POPULATION')
    fireEvent.click(screen.getByRole('button',{name:'提交给独立正式审核'}));await screen.findByText(/unknown/)
    const original=mocks.execute.mock.calls[0][0]
    expect(screen.getByLabelText('目标人群选择')).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'原样重试并核对'}));await screen.findByText(/正式候选已提交/)
    expect(mocks.execute.mock.calls[1][0]).toEqual(original)
  })
})
