import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../modules/reporting/respondentSummary',()=>({readRespondentRunSummary:m.read}))
import {publishedCampusStudentNarratives,readCampusStudentFeedback} from '../../modules/campus/student-feedback'

describe('Huischool student narrative permission is stricter than raw canonical metrics',()=>{
  beforeEach(()=>vi.clearAllMocks())
  it('suppresses unreviewed metric numbers, while keeping completed status and supportive language',async()=>{
    m.read.mockResolvedValue({schemaVersion:1,mode:'INDIVIDUAL_SUMMARY',state:'READY',
      metrics:{'private-depression-score':32,'anxiety-cutoff':21}})
    const x=await readCampusStudentFeedback('student-1','execution-1')
    expect(m.read).toHaveBeenCalledWith('student-1','execution-1')
    expect(x).toMatchObject({mode:'COMPLETION_ONLY',state:'COMPLETED'})
    expect(x.message).toMatch(/尚未.*科学.*适龄/)
    expect(JSON.stringify(x)).not.toMatch(/32|21|private-depression-score|anxiety-cutoff|metrics/)
    expect(publishedCampusStudentNarratives).toHaveLength(0)
  })
  it('preserves both withheld and completion-only decisions without widening authorization',async()=>{
    m.read.mockResolvedValueOnce({schemaVersion:1,mode:'NONE',state:'WITHHELD'})
      .mockResolvedValueOnce({schemaVersion:1,mode:'COMPLETION_ONLY',state:'COMPLETED'})
    await expect(readCampusStudentFeedback('s','a')).resolves.toMatchObject({
      state:'WITHHELD',mode:'NONE',
    })
    await expect(readCampusStudentFeedback('s','a')).resolves.toMatchObject({
      state:'COMPLETED',mode:'COMPLETION_ONLY',
    })
  })
  it('never converts a canonical access denial into a feedback result',async()=>{
    m.read.mockRejectedValue({code:'REPORT_NOT_FOUND',statusCode:404})
    await expect(readCampusStudentFeedback('s','a')).rejects.toMatchObject({statusCode:404})
  })
})
