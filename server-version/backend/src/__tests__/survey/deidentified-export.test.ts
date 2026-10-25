import {describe,it,expect} from 'vitest'
import {projectDeidentifiedSurveyPage} from '../../modules/survey/deidentified-export'
const source:any={projectId:'p1',raw:[{projectId:'p1',waveId:'wave',attemptId:'attempt',researchCode:'REIDENTIFIABLE',columnKey:'name',responseType:'SHORT_TEXT',value:'private'},
 {projectId:'p1',waveId:'wave',attemptId:'attempt',researchCode:'REIDENTIFIABLE',columnKey:'choice',responseType:'SINGLE',value:'PRIVATE_OPTION'},
 {projectId:'p1',waveId:'wave',attemptId:'attempt',researchCode:'REIDENTIFIABLE',columnKey:'date',responseType:'DATE',value:'2000-01-01'},
 {projectId:'foreign',waveId:'wave',attemptId:'attempt',columnKey:'choice',responseType:'SINGLE',value:'PRIVATE_OPTION'}],
 codebook:[{columnKey:'choice',waveId:'wave',options:[{code:'PRIVATE_OPTION',label:'PRIVATE_LABEL'}]}],scores:[]}
describe('positive export allowlist',()=>{
 it('removes identities, foreign products, free text, time and authored strings',()=>{
  const value=projectDeidentifiedSurveyPage(source,'private-salt');expect(value.raw).toHaveLength(1);expect(value.raw[0].value).toBe(1)
  for(const s of ['REIDENTIFIABLE','PRIVATE_OPTION','PRIVATE_LABEL','private','2000-01-01','foreign'])expect(JSON.stringify(value)).not.toContain(s)
 })
 it('keeps project-local linkage while preventing cross-project pseudonyms',()=>{
  const a=projectDeidentifiedSurveyPage(source,'private-salt'),b=projectDeidentifiedSurveyPage(source,'private-salt')
  expect(a.raw[0].subject).toBe(b.raw[0].subject)
  const other={...source,projectId:'p2',raw:source.raw.map((r:any)=>({...r,projectId:'p2'}))}
  expect(projectDeidentifiedSurveyPage(other,'private-salt').raw[0].subject).not.toBe(a.raw[0].subject)
 })
 it('fails closed for unrecognized response types or choice values',()=>{
  const other={...source,raw:[{...source.raw[1],value:'UNKNOWN'}]};expect(projectDeidentifiedSurveyPage(other,'salt').raw[0].value).toBeNull()
 })
})
