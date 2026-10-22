import {beforeEach,describe,expect,it,vi} from 'vitest'
import {UserRole} from '@prisma/client'
const mocks=vi.hoisted(()=>({scale:vi.fn(),assessments:vi.fn(),read:vi.fn(),enqueue:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{scale:{findUnique:mocks.scale},assessment:{findMany:mocks.assessments}}}))
vi.mock('../../modules/scale-library-governance/readers',()=>({canReadLibraryScale:mocks.read,libraryReadableScaleIds:vi.fn().mockResolvedValue([])}))
vi.mock('../../services/exportJobService',()=>({enqueueExportJob:mocks.enqueue}))
import {scaleController} from '../../controllers/scaleController'
import {authorizeExportDownload} from '../../services/exportArtifactService'
const response=()=>{const r:any={};r.status=vi.fn(()=>r);r.json=vi.fn(()=>r);return r}
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue(false);mocks.scale.mockResolvedValue({id:'wrapper',creatorId:'historical-author',libraryEntryId:'approved-entry',definition:{},_count:{assessments:12}})})
describe('shared wrapper authorship never grants participant-data authority',()=>{
 for(const role of [UserRole.TEACHER,UserRole.ADMIN]){
  it.each(['listScaleAssessments','exportScaleData','getExportPreview'] as const)(`${role} cannot use legacy %s for cross-task results`,async method=>{
   const res=response()
   await scaleController[method]({user:{userId:'historical-author',role},params:{scaleId:'wrapper'},body:{}} as any,res)
   expect(res.status).toHaveBeenCalledWith(403)
   expect(mocks.assessments).not.toHaveBeenCalled();expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it(`${role} cannot preview scoring merely because of provenance or legacy role`,async()=>{
   const res=response()
   await scaleController.previewDefinition({user:{userId:'historical-author',role},params:{id:'wrapper'},body:{answers:[]}} as any,res)
   expect(mocks.read).toHaveBeenCalledWith('historical-author','approved-entry')
   expect(res.status).toHaveBeenCalledWith(403)
  })
  it(`${role} cannot download a previously generated wrapper-wide artifact`,async()=>{
   expect(await authorizeExportDownload({userId:'historical-author',role},{createdBy:'historical-author',anonymized:true,expiresAt:new Date(Date.now()+60000),resourceType:'SCALE',resourceId:'wrapper',storageKey:'irrelevant'},{creatorId:'historical-author',libraryEntryId:'approved-entry'})).toBe(false)
  })
 }
})
