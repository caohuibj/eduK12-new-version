import { readRespondentRunSummary } from '../reporting/respondentSummary'

/** Content-qualified STUDENT narrative templates. Real metric interpretations
 * must be approved per exact resource key/version, age band and frozen policy.
 * None have a verified independent science+rights sign-off for SCHOOL yet.
 * An empty registry is deliberate, not permission to fall back to raw scores.
 */
export const publishedCampusStudentNarratives: ReadonlyArray<never> = Object.freeze([])

/** This campus-only projection never widens the content-owned audience contract.
 * Completed metrics may be scientifically eligible in the shared runtime but
 * cannot be framed as developmental advice to a minor without a reviewed
 * exact-instrument narrative. TRAINING reporting remains unchanged.
 */
export async function readCampusStudentFeedback(userId:string,executionId:string){
  const allowed=await readRespondentRunSummary(userId,executionId)
  if(allowed.state==='READY'){
    return {
      schemaVersion:1 as const,mode:'COMPLETION_ONLY' as const,
      state:'COMPLETED' as const,
      message:'你已完成这次测评。我们尚未对这份工具的学生版解释完成独立科学与适龄审核，因此暂不展示分数或推断。需要支持时，可以与你信任的成年人或学校心理老师交流。',
    }
  }
  if(allowed.state==='COMPLETED'){
    return {...allowed,
      message:'你的作答已完成。当前工具只获准提供完成状态；它不能用来判断你的心理健康是否“好”或“坏”。'}
  }
  return {
    schemaVersion:1 as const,mode:'NONE' as const,state:'WITHHELD' as const,
    message:'这份结果暂不适合对外展示；如需帮助，可联系学校心理老师。'
  }
}
