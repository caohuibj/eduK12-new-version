import {beforeEach,expect,it,vi} from 'vitest'
import {ownAssignmentSummary} from '../../modules/tool-licensing/assignment-summary'

const query=vi.hoisted(()=>vi.fn())
vi.mock('../../config/database',()=>({prisma:{$queryRaw:query}}))
beforeEach(()=>query.mockReset())

it('keeps useful choices when a different pinned use has lost its authority',async()=>{
  const now=new Date()
  query.mockResolvedValue([
    {key:'SCALE:rebound',available:true,useId:'old-use',useCurrent:true,authorityCurrent:false,now},
    {key:'SCALE:rebound',available:true,useId:'successor-use',useCurrent:true,authorityCurrent:true,now},
    {key:'SCALE:lost',available:true,useId:'blocked',useCurrent:true,authorityCurrent:false,now},
    {key:'SCALE:stopped',available:false,useId:'old-use',useCurrent:true,authorityCurrent:true,now},
    {key:'FORM:unassigned',available:true,useId:null,useCurrent:false,authorityCurrent:false,now},
  ])
  const keys=['SCALE:rebound','SCALE:lost','SCALE:stopped','FORM:unassigned']
  const result=await ownAssignmentSummary('TEACHER','school','publisher',keys)
  expect(result.get('SCALE:rebound')).toEqual({state:'RECORDED',canAssignVersion:true,reselectIfPinned:true})
  expect(result.get('SCALE:lost')).toEqual({state:'AUTHORITY_LOST',canAssignVersion:true,reselectIfPinned:true})
  expect(result.get('SCALE:stopped')).toEqual({state:'VERSION_UNAVAILABLE',canAssignVersion:false,reselectIfPinned:true})
  expect(result.get('FORM:unassigned')).toEqual({state:'PENDING',canAssignVersion:false,reselectIfPinned:false})
  expect(query).toHaveBeenCalledOnce()
  expect(query.mock.calls[0][0].values).toContain('school')
  expect(query.mock.calls[0][0].values).toContain('publisher')
})

it('skips the projection for unrelated tool families',async()=>{
  await expect(ownAssignmentSummary('TRAINING','publisher','publisher',['COGNITIVE:demo'])).resolves.toHaveProperty('size',0)
  expect(query).not.toHaveBeenCalled()
})
