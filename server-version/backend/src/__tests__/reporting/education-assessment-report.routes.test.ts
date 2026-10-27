import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({reader:vi.fn(),status:vi.fn()}))
vi.mock('../../middleware/auth',()=>{
 const auth=(realm:string,role:string)=>(req:any,res:any,next:any)=>{
  if(req.headers['x-fixture-realm']!==realm)return res.status(401).end()
  req.user={userId:'self',role:req.headers['x-fixture-role']??role};next()
 }
 return {authenticateSchool:auth('SCHOOL','STUDENT'),authenticateHuiteacher:auth('TEACHER','TEACHER')}
})
vi.mock('../../modules/campus/admission.service',()=>({readCampusStudentStatus:m.status}))
import { createEducationAssessmentReportRouter } from '../../modules/reporting/education-assessment-report.routes'
let server:Server,base:string
const execution='00000000-0000-4000-8000-000000000042'
beforeAll(async()=>{
 const app=express()
 app.use('/school',createEducationAssessmentReportRouter('SCHOOL',m.reader))
 app.use('/teacher',createEducationAssessmentReportRouter('TEACHER',m.reader))
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
 base='http://127.0.0.1:'+(server.address() as {port:number}).port
})
afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())))
beforeEach(()=>{vi.resetAllMocks();m.reader.mockResolvedValue({state:'READY',kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',reports:[]});m.status.mockResolvedValue({status:'APPROVED'})})
const url=(entry:string,id=execution)=>`${base}/${entry}/assessment-reports/executions/${id}`
describe('education multi-tool report route contract (mock authentication, real HTTP)',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('passes authenticated %s identity and execution only with no-store response',async product=>{
  const response=await fetch(url(product.toLowerCase()),{headers:{'x-fixture-realm':product}})
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store')
  expect(m.reader).toHaveBeenCalledWith({actorUserId:'self',executionId:execution,product})
 })
 it('refuses a Training realm fixture, missing authentication, and lookalike execution IDs',async()=>{
  expect((await fetch(url('teacher'),{headers:{'x-fixture-realm':'TRAINING'}})).status).toBe(401)
  expect((await fetch(url('school'))).status).toBe(401)
  expect((await fetch(url('school','arbitrary-session'),{headers:{'x-fixture-realm':'SCHOOL'}})).status).toBe(404)
  expect(m.reader).not.toHaveBeenCalled()
 })
 it('does not turn observer or unapproved student access into a self-report read',async()=>{
  expect((await fetch(url('school'),{headers:{'x-fixture-realm':'SCHOOL','x-fixture-role':'TEACHER'}})).status).toBe(404)
  m.status.mockResolvedValue({status:'PENDING'})
  expect((await fetch(url('school'),{headers:{'x-fixture-realm':'SCHOOL'}})).status).toBe(404)
  expect(m.reader).not.toHaveBeenCalled()
 })
 it('rejects client source/audience selectors and inaccessible executions',async()=>{
  expect((await fetch(url('teacher')+'?audience=researcher',{headers:{'x-fixture-realm':'TEACHER'}})).status).toBe(404)
  expect(m.reader).not.toHaveBeenCalled();m.reader.mockResolvedValue(null)
  expect((await fetch(url('teacher'),{headers:{'x-fixture-realm':'TEACHER'}})).status).toBe(404)
 })
})
