import {expect,it,vi} from 'vitest'
const list=vi.hoisted(()=>vi.fn(async()=>({tasks:[],artifacts:[],nextTaskId:null})))
vi.mock('../../modules/training-analysis/group-report.service',()=>({listTrainingGroupReports:list,generateTrainingGroupReport:vi.fn(),trainingGroupHistory:vi.fn(),readTrainingGroupReport:vi.fn(),trainingGroupTools:vi.fn()}))
import {trainingAnalysisController} from '../../controllers/trainingAnalysisController'
it('accepts a typed standalone cursor at the actual HTTP controller boundary',async()=>{
 const cursor='cognitive-assignment:10000000-0000-4000-8000-000000000001'
 const req={user:{userId:'teacher',role:'TEACHER'},params:{id:'course'},query:{beforeTaskId:cursor}}
 const res={status:vi.fn().mockReturnThis(),json:vi.fn()}
 await trainingAnalysisController.groupIndex(req as any,res as any)
 expect(res.status).not.toHaveBeenCalled()
 expect(list).toHaveBeenCalledWith({actor:{userId:'teacher',role:'TEACHER'},courseId:'course',beforeTaskId:cursor})
})
