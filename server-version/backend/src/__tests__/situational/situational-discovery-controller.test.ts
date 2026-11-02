import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({packages:vi.fn(),full:vi.fn(),summary:vi.fn(),history:vi.fn(),historySummary:vi.fn(),statuses:vi.fn()}))
vi.mock('../../modules/situational/authoring/service',()=>({availableSjtPackages:mocks.packages,projectSjtReleaseStatus:vi.fn(),projectSjtReleaseStatuses:mocks.statuses}))
vi.mock('../../modules/situational/situational-runtime.service',()=>({listSituationalInstruments:mocks.full,listSituationalInstrumentSummaries:mocks.summary,listSituationalHistory:mocks.history,listSituationalHistorySummaries:mocks.historySummary}))
import { situationalController } from '../../controllers/situationalController'
const response=()=>{const res:any={json:vi.fn(),status:vi.fn(),setHeader:vi.fn()};res.status.mockReturnValue(res);return res}
beforeEach(()=>{vi.clearAllMocks();mocks.packages.mockResolvedValue([{key:'teacher',definition:{respondentType:'teacher_self_report'}},{key:'student',definition:{respondentType:'student_self_report'}}]);mocks.full.mockReturnValue([]);mocks.summary.mockReturnValue([])})
it('summary opt-in preserves teacher versus student catalog filtering',async()=>{
 await situationalController.listInstruments({baseUrl:'/api/teacher/situational',query:{view:'summary'}} as any,response())
 expect(mocks.summary).toHaveBeenLastCalledWith([{key:'teacher',definition:{respondentType:'teacher_self_report'}}])
 await situationalController.listInstruments({baseUrl:'/api/situational',query:{view:'summary'}} as any,response())
 expect(mocks.summary).toHaveBeenLastCalledWith([{key:'student',definition:{respondentType:'student_self_report'}}])
 expect(mocks.full).not.toHaveBeenCalled()
})
it('legacy catalog and history remain full by default, with owned summary history opt-in',async()=>{
 await situationalController.listInstruments({baseUrl:'/api/situational',query:{}} as any,response())
 expect(mocks.full).toHaveBeenCalledTimes(1)
 const full=[{attemptId:'full'}],summary=[{attemptId:'summary'}]
 mocks.history.mockResolvedValue({list:full,total:1});mocks.historySummary.mockResolvedValue({list:summary,total:1});mocks.statuses.mockImplementation(async rows=>rows)
 await situationalController.history({user:{userId:'owner'},query:{}} as any,response())
 expect(mocks.history).toHaveBeenCalledWith('owner');expect(mocks.statuses).toHaveBeenLastCalledWith(full)
 await situationalController.history({user:{userId:'owner'},query:{view:'summary'}} as any,response())
 expect(mocks.historySummary).toHaveBeenCalledWith('owner');expect(mocks.statuses).toHaveBeenLastCalledWith(summary)
})
