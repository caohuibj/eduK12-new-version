import {visibleFormKeys} from '../survey/form-visibility'
import type {FormDraft} from '../survey/builder.types'
import type {ProfessionalAnswer} from '../survey/ProfessionalFormAnswer'

// TaskForm filters conditional pages before rendering and calls onPageChange
// with the VISIBLE page index. Keep the submit gate in the SAME index space.
// Original page indices differ whenever a conditional middle page is hidden.
export const lastVisibleHuiteacherFormPageIndex=(
  pages:FormDraft['pages'],answers:Record<string,ProfessionalAnswer>,
):number=>{
  const shown=visibleFormKeys(pages.flatMap(p=>p.questions),answers)
  const count=pages.filter(p=>p.questions.some(q=>shown.has(q.itemKey))).length
  return Math.max(0,count-1)
}
