import {expect,it} from 'vitest'
import {assessmentContextHref} from './assessmentContextHref'
it('preserves index filters while repeated list/editor trips keep a bounded return path',()=>{
 const initial='/questionnaires?page=2&kind=SCALE';let list=initial
 for(let index=0;index<12;index++){
  const source=new URL(list,'https://training.invalid')
  const editor=assessmentContextHref('/questionnaire-products/draft',source.pathname,source.search)
  expect(new URL(editor,'https://training.invalid').searchParams.get('returnTo')).toBe(initial)
  const opened=new URL(editor,'https://training.invalid')
  list=assessmentContextHref('/questionnaires',opened.pathname,opened.search)
  expect(list).toBe(initial)
 }
})
it('returns direct editor entries to the index without a back-link to the editor',()=>{
 expect(assessmentContextHref('/questionnaires','/questionnaire-products/draft','')).toBe('/questionnaires')
 expect(assessmentContextHref('/questionnaires','/questionnaire-products/draft','?returnTo=https%3A%2F%2Funtrusted.invalid')).toBe('/questionnaires')
})
it('retains a course-bound origin and course id across editor and index links',()=>{
 const source='?courseId=course-1&returnTo='+encodeURIComponent('/courses/course-1/detail?section=assessments')
 const target=new URL(assessmentContextHref('/questionnaires','/questionnaire-products/draft',source),'https://training.invalid')
 expect(target.searchParams.get('courseId')).toBe('course-1')
 expect(target.searchParams.get('returnTo')).toBe('/courses/course-1/detail?section=assessments')
})
