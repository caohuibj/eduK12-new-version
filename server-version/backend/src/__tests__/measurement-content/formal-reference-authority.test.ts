import {beforeEach,describe,expect,it,vi} from 'vitest'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
const mocks=vi.hoisted(()=>({authority:vi.fn()}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
import {assertFormalReferenceAuthority,listFormalReferenceAuthorities} from '../../modules/measurement-content/formal-reference-authority'
const input={actorId:'reviewer',grantId:'explicit-grant',measurementReleaseId:'exact-measurement',capability:'reference.review' as const}
const user=()=>({role:'TEACHER',teacher_approved:true,account_domain:'TRAINING',is_active:true,is_frozen:false,must_change_password:false,expires_at:null as Date|null})
const db=(value=user())=>({$queryRaw:vi.fn().mockResolvedValueOnce([value]).mockResolvedValueOnce([{now:new Date('2026-10-20T00:00:00Z')}])}) as any
beforeEach(()=>{vi.resetAllMocks();mocks.authority.mockResolvedValue({grantId:'explicit-grant',version:1})})
describe('explicit platform scientific authority',()=>{
  it('requires exact TRAINING PLATFORM reference-governance scope and measurement identity',async()=>{
    const tx=db();await assertFormalReferenceAuthority(tx,input)
    expect(mocks.authority).toHaveBeenCalledWith(tx,{actorId:'reviewer',grantId:'explicit-grant',capability:'reference.review',
      scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'reference-governance',resourceKind:'reference',resourceKeys:['exact-measurement']}})
  })
  it.each([{role:'ADMIN'},{teacher_approved:false},{account_domain:'SURVEY'},{is_active:false},{is_frozen:true},{must_change_password:true}])('denies unqualified current principal %o',async change=>{
    await expect(assertFormalReferenceAuthority(db({...user(),...change}),input)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
    expect(mocks.authority).not.toHaveBeenCalled()
  })
  it('does not derive review rights from approved teacher status',async()=>{
    mocks.authority.mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'))
    await expect(assertFormalReferenceAuthority(db(),input)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  })
  it('evaluates expiry after waiting for scientific grant locks',async()=>{
    await expect(assertFormalReferenceAuthority(db({...user(),expires_at:new Date('2026-10-19')}),input)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  })
  it('hides expired/withdrawn qualification and exposes no platform candidates in grant discovery',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'explicit-grant',resource_keys:['exact-measurement'],capabilities:['reference.review']}])
      .mockResolvedValueOnce([{...user(),teacher_approved:false}])} as any
    expect(await listFormalReferenceAuthorities(tx,'reviewer')).toEqual([])
  })
})
