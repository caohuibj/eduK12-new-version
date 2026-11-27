import { standardAssignmentSearch, type StandardAssignmentTarget } from '../../admin/standardAssignmentTarget'
import { productOrigins, SURVEY_ADMIN_PATH } from '../../products/origins'

export default function StandardEntryAssignmentLinks(target: StandardAssignmentTarget) {
  const origins = productOrigins()
  if (!origins) return null
  const search = standardAssignmentSearch(target)
  return <div className="system-actions" aria-label="入口固定版本分配">
    <a href={origins.admin+'/admin/training/resources'+search} target="_blank" rel="noreferrer">Training 固定版本分配</a>
    <a href={origins.admin+SURVEY_ADMIN_PATH+search} target="_blank" rel="noreferrer">Survey 固定版本分配</a>
  </div>
}
