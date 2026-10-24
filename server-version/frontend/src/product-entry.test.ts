import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProductApp } from './product-entry'

const evaluated = vi.fn()

describe('product entry only imports the selected application', () => {
  beforeEach(() => {
    vi.resetModules()
    evaluated.mockClear()
    for (const [path, name] of [
      ['./App', 'platform'], ['./school/SchoolApp', 'school'],
      ['./huiteacher/HuiteacherApp', 'teacher'], ['./survey/SurveyApp', 'survey'],
      ['./survey/SurveyPublicApp', 'participant'],
    ]) vi.doMock(path, () => { evaluated(name); return { default: name } })
  })
  it.each([['school.eduk12.top','school'],['teacher.eduk12.top','teacher']])('keeps %s entry selection after the synchronous shared brand bootstrap',async(hostname,expected)=>{
    const html=readFileSync('index.html','utf8'),script=readFileSync('public/entry-brand.js','utf8')
    expect(html.indexOf('src="/entry-brand.js"')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('src="/entry-brand.js"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'))
    expect(html).toContain('<script src="/entry-brand.js" data-development="%DEV%"></script>')
    const icon={setAttribute:vi.fn()},doc={title:'',currentScript:{dataset:{development:'false'}},head:{querySelector:()=>icon}}
    runInNewContext(script,{window:{location:{hostname,pathname:'/',search:''}},document:doc,URLSearchParams})
    expect(doc.title).toBe('慧育空间') // pre-React fallback, not the final product title.
    expect(icon.setAttribute).toHaveBeenCalledWith('href','/vite.svg')
    const result=await loadProductApp(hostname,'/')
    expect(result.default).toBe(expected);expect(evaluated.mock.calls).toEqual([[expected]])
  })
  it.each([
    ['eduk12.top', '/', 'platform'],
    ['training.eduk12.top', '/learner/courses/example', 'platform'],
    ['school.eduk12.top', '/workspace/reports', 'school'],
    ['SCHOOL.EDUK12.TOP.', '/', 'school'],
    ['teacher.eduk12.top', '/participate', 'teacher'],
    ['survey.eduk12.top', '/', 'survey'],
    ['survey.eduk12.top', '/r/example', 'participant'],
    ['survey.eduk12.top', '/r', 'survey'],
    ['survey.eduk12.top.evil.example', '/r/example', 'platform'],
  ])('%s%s loads %s only', async (hostname, pathname, expected) => {
    const result = await loadProductApp(hostname, pathname)
    expect(result.default).toBe(expected)
    expect(evaluated.mock.calls).toEqual([[expected]])
  })
})


describe('Training synchronous startup identity and colors',()=>{
 function bootstrap(pathname:string,mode:string|null='dark',hostname='localhost',search='',storageBlocked=false,development='true',hour=8){
  const icon={setAttribute:vi.fn()},dataset:Record<string,string>={}
  const doc={title:'',currentScript:{dataset:{development}},head:{querySelector:()=>icon},documentElement:{dataset}}
  class LocalClock extends Date{getHours(){return hour}}
  runInNewContext(readFileSync('public/entry-brand.js','utf8'),{window:{location:{hostname,pathname,search}},document:doc,URLSearchParams,Date:LocalClock,localStorage:{getItem:()=>{if(storageBlocked)throw Error('blocked');return mode}}})
  return {doc,icon,dataset}
 }

 it.each(['/dashboard','/toolkit','/student','/student/courses/example','/login','/student/composite/attempts/example/report'])('primes ordinary Training first paint on %s',path=>{
  const {doc,dataset}=bootstrap(path,'dark','training.localhost')
  expect(doc.title).toBe('Training');expect(dataset).toEqual({trainingEntry:'true',trainingTheme:'dark'})
 })
 it.each([[6,'dark'],[7,'light'],[18,'light'],[19,'dark']] as const)('resolves cached auto at %i before React as %s',(hour,expected)=>{
  expect(bootstrap('/dashboard','auto','training.localhost','',false,'true',hour).dataset.trainingTheme).toBe(expected)
 })
 it('honors an explicit light mode at night and uses the clock when local storage is blocked',()=>{
  expect(bootstrap('/toolkit','light','training.localhost','',false,'true',20).dataset.trainingTheme).toBe('light')
  expect(bootstrap('/student',null,'training.localhost','',true,'true',20).dataset.trainingTheme).toBe('dark')
 })
 it('keeps development aliases out of production and rejects lookalike hosts',()=>{
  expect(bootstrap('/dashboard','dark','training.localhost','',false,'false').dataset).toEqual({})
  expect(bootstrap('/dashboard','dark','training.eduk12.top.evil.example').dataset).toEqual({})
  expect(bootstrap('/dashboard','dark','training.eduk12.top','',false,'false').dataset.trainingTheme).toBe('dark')
 })
 it.each(['survey.localhost','survey.eduk12.top','school.eduk12.top','teacher.eduk12.top','localhost'])('does not prime a regular workspace on %s',host=>{
  expect(bootstrap('/dashboard','dark',host).dataset).toEqual({})
 })
 it('keeps an explicit Survey login return outside Training startup colors even on the Training host',()=>{
  const {doc,dataset}=bootstrap('/admin/login','dark','training.localhost','?returnTo=%2Fadmin%2Fsurvey-researchers')
  expect(doc.title).toBe('Research');expect(dataset).toEqual({})
 })
 it.each(['/admin/training','/admin/training/accounts','/admin/training/courses','/admin/training/resources','/admin/training/profile/'])('uses Training before React loads on %s',path=>{
  const {doc,icon,dataset}=bootstrap(path)
  expect(doc.title).toBe('Training');expect(dataset).toEqual({trainingEntry:'true',trainingTheme:'dark'})
  expect(icon.setAttribute).toHaveBeenCalledWith('href','/training/favicon.svg?v=20261023-compact')
 })
 it.each(['light','auto'])('uses the saved %s mode before paint',mode=>{
  expect(bootstrap('/admin/training/resources',mode).dataset.trainingTheme).toBe('light')
 })
 it('falls back to the local clock when storage is unavailable',()=>{
  expect(bootstrap('/admin/training/accounts',null,'localhost','',true).dataset.trainingTheme).toBe('light')
 })
 it('keeps Training titles through nested-page login returns',()=>{
  expect(bootstrap('/admin/login',null,'localhost','?returnTo=%2Fadmin%2Ftraining%2Fresources').doc.title).toBe('Training')
 })
 it.each(['/admin/training-other','/admin/training/resources/unknown','/admin/survey-researchers'])('does not apply Training startup colors to %s',path=>{
  const {doc,dataset}=bootstrap(path);expect(doc.title).toBe('慧育空间');expect(dataset).toEqual({})
 })
 it('preserves Survey startup branding and colors',()=>{
  const {doc,dataset}=bootstrap('/admin/training','dark','survey.localhost');expect(doc.title).toBe('Research');expect(dataset).toEqual({})
 })
})
