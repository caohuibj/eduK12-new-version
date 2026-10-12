import {visibleFormKeys} from '../survey/form-visibility'
import type {FormDraft} from '../survey/builder.types'
import type {ProfessionalAnswer} from '../survey/ProfessionalFormAnswer'

// Page indices remain ORIGINAL Form positions after conditional hiding.
// Counting visible pages produces premature FINAL for a hidden middle page.
export const lastVisibleHuiteacherFormPageIndex=(
  pages:FormDraft['pages'],answers:Record<string,ProfessionalAnswer>,
):number=>{
  const shown=visibleFormKeys(pages.flatMap(p=>p.questions),answers)
  return Math.max(0,pages.reduce((index,p,pageIndex)=>
    p.questions.some(q=>shown.has(q.itemKey))?pageIndex:index,-1))
}
