import {beforeEach,expect,it,vi} from 'vitest'
import {originalEducationPackageScopeReason} from '../../modules/education-tools/package-reference.selection'
const m=vi.hoisted(()=>({batch:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentReleaseBatch:m.batch}))
beforeEach(()=>vi.clearAllMocks())
it('rejects original private P and R without pretending they belong to a new runtime',async()=>{
 for(const unit of [{referencePolicy:{choices:[{releaseId:'p'}]}},{report:{releaseId:'p'}}]){
  expect(await originalEducationPackageScopeReason({} as never,{units:[unit]} as never,new Map([['p',{scope:{kind:'PRIVATE',product:'SCHOOL',ownerId:'same-author',resourceId:'original-source'}}]]) as never)).toBe('ORIGINAL_CONTENT_SCOPE_UNSUPPORTED')
 }
 expect(m.batch).not.toHaveBeenCalled()
})
it('keeps platform and no-original-report sources usable and batches only missing scope facts',async()=>{
 expect(await originalEducationPackageScopeReason({} as never,{units:[{}]} as never,new Map())).toBeNull()
 expect(m.batch).not.toHaveBeenCalled()
 m.batch.mockResolvedValue(new Map([['r',{scope:{kind:'PLATFORM'}}]]))
 expect(await originalEducationPackageScopeReason({} as never,{units:[{referencePolicy:{choices:[{releaseId:'p'}]},report:{releaseId:'r'}}]} as never,new Map([['p',{scope:{kind:'PLATFORM'}}]]) as never)).toBeNull()
 expect(m.batch).toHaveBeenCalledExactlyOnceWith({},['r'],true)
})
