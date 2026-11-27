import type { Product } from './toolLicenseFocus'
import { entryPaths } from './authority'

export type StandardAssignmentTarget = { toolKey: string; releaseId?: string; subjectId?:string }
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

export function readStandardAssignmentTarget(search:string):StandardAssignmentTarget|null {
  const values = new URLSearchParams(search)
  const toolKey = values.get('standardTool')?.trim()
  const releaseId = values.get('standardRelease')
  const subjectId = values.get('subjectId')
  if (!toolKey || toolKey.length>300 || (releaseId!==null && !uuid.test(releaseId))
    || (subjectId!==null && !uuid.test(subjectId)) || (!releaseId && !subjectId)) return null
  return {toolKey,...(releaseId?{releaseId}:{}),...(subjectId?{subjectId}:{})}
}

export function standardAssignmentSearch(target:StandardAssignmentTarget):string {
  return '?' + new URLSearchParams({standardTool:target.toolKey,...(target.releaseId?{standardRelease:target.releaseId}:{}),
    ...(target.subjectId?{subjectId:target.subjectId}:{})})
}

export function licenseAssignmentPath(product:Product,subjectId:string,key:string) {
  const path=product==='TRAINING'?'/admin/training/resources':entryPaths[product==='SCHOOL'?'HUISCHOOL':product==='TEACHER'?'HUITEACHER':'SURVEY']
  return path+standardAssignmentSearch({toolKey:key.slice('SCALE:'.length),subjectId})
}
