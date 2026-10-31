import {expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({use:vi.fn()}))
vi.mock('../../modules/scale-library-governance/usage',()=>({assertLibraryUseGrantCurrent:mocks.use}))
import {canStartLibraryCourseScale} from '../../modules/scale/scale-access'
import {ScaleLibraryError} from '../../modules/scale-library-governance/contracts'

it('uses only the requested course owner grant for a new course-bound standalone start',async()=>{
 const tx={courseStudent:{findMany:vi.fn(async(args:any)=>args.where.courseId==='course-b'?[{course:{creatorId:'owner-b'}}]:[{course:{creatorId:'owner-a'}}])}}
 mocks.use.mockImplementation(async(_db,request)=>{if(request.userId!=='owner-a')throw new ScaleLibraryError(403,'revoked')})
 const scale={id:'scale',status:'PUBLISHED',visibility:'COURSE',libraryEntryId:'library'}
 expect(await canStartLibraryCourseScale(scale,'student',tx as never,'course-b')).toBe(false)
 expect(mocks.use).toHaveBeenCalledExactlyOnceWith(tx,{entryId:'library',userId:'owner-b',product:'TRAINING'})
})
