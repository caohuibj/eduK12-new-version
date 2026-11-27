import type { Product } from './toolLicenseFocus'
import { internalReturnTo } from '../components/app-shell/access'
import { entryPaths } from './authority'

export type StandardAssignmentTarget = { toolKey: string; releaseId?: string; subjectId?:string }
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

export function readStandardAssignmentTarget(search:string):StandardAssignmentTarget|null {
  const values = new URLSearchParams(search)
  const toolKey = values.get('standardTool')?.trim()
  const releaseId = values.get('standardRelease')
  const subjectId = values.get('subjectId')
  if (!toolKey || toolKey.length>300 || [...toolKey].some(char=>char.charCodeAt(0)<=32||char.charCodeAt(0)===127) || (releaseId!==null && !uuid.test(releaseId))
    || (subjectId!==null && !uuid.test(subjectId)) || (!releaseId && !subjectId)) return null
  return {toolKey,...(releaseId?{releaseId}:{}),...(subjectId?{subjectId}:{})}
}

export function standardAssignmentSearch(target:StandardAssignmentTarget):string {
  return '?' + new URLSearchParams({standardTool:target.toolKey,...(target.releaseId?{standardRelease:target.releaseId}:{}),
    ...(target.subjectId?{subjectId:target.subjectId}:{})})
}

const assignmentPaths:Record<Product,string> = {
  TRAINING:'/admin/training/resources',
  SURVEY:entryPaths.SURVEY,
  SCHOOL:entryPaths.HUISCHOOL,
  TEACHER:entryPaths.HUITEACHER,
}

export function licenseAssignmentPath(product:Product,subjectId:string,key:string) {
  return assignmentPaths[product]+standardAssignmentSearch({toolKey:key.slice('SCALE:'.length),subjectId})
}

/** Canonical assignment destinations survive an administrator sign-in. */
export function standardAssignmentReturnTo(raw:string|null):string|null {
  const url=internalReturnTo(raw)
  if(!url)return null
  const [path,search]=url.split(/[?#]/)
  if(!Object.values(assignmentPaths).includes(path)||!search)return null
  const target=readStandardAssignmentTarget(search)
  return target?path+standardAssignmentSearch(target):null
}
