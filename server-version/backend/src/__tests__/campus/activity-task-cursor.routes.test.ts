import express from 'express'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const calls=vi.hoisted(()=>({student:vi.fn(),teacher:vi.fn(),parent:vi.fn()}))
vi.mock('../../middleware/auth',()=>({
  authenticateSchool:(req:any,_res:any,next:any)=>{
    req.user={userId:'synthetic-campus-user',role:'STUDENT',accountDomain:'SCHOOL'}
    next()
  },
}))
vi.mock('../../modules/campus/activity.tasks',()=>({
  addCampusActivityTask:vi.fn(),
  listCampusStudentTasks:calls.student,
  listCampusParentRunTasks:calls.parent,
}))
vi.mock('../../modules/campus/teacher-tasks',()=>({listCampusTeacherRunTasks:calls.teacher}))

import router from '../../modules/campus/activity.routes'
import { decodeRunTaskCursor, encodeRunTaskCursor } from '../../modules/assessment-run/productRead'

let server:Server, origin:string
const organizationId=randomUUID()

describe('campus task cursor HTTP boundaries',()=>{
  beforeAll(async()=>{
    const app=express()
    app.use('/api/campus',router)
    server=app.listen(0,'127.0.0.1')
    await new Promise<void>(resolve=>server.once('listening',resolve))
    const address=server.address()
    if(!address||typeof address==='string')throw new Error('Missing HTTP listener')
    origin=`http://127.0.0.1:${address.port}`
  })
  afterAll(async()=>{
    server.closeAllConnections()
    await new Promise<void>(resolve=>server.close(()=>resolve()))
  })
  beforeEach(()=>{
    vi.clearAllMocks()
    calls.teacher.mockResolvedValue({list:[],truncated:false,nextCursor:null})
    calls.parent.mockResolvedValue({list:[],truncated:false,nextCursor:null})
    calls.student.mockResolvedValue({list:[],total:0,page:1,hasMore:false,truncated:false,nextRunCursor:null})
  })
  const routes=[
    (cursor:string)=>`/api/campus/my/teacher-run-tasks?organizationId=${organizationId}&cursor=${encodeURIComponent(cursor)}`,
    (cursor:string)=>`/api/campus/my/parent-run-tasks?cursor=${encodeURIComponent(cursor)}`,
    (cursor:string)=>`/api/campus/my/activity-tasks?runCursor=${encodeURIComponent(cursor)}`,
  ]
  it.each(routes)('rejects malformed cursor with HTTP 400 and the campus error code',async makePath=>{
    const bad=Buffer.from(JSON.stringify({createdAt:'2026-02-31T00:00:00.000000Z',id:'x'})).toString('base64url')
    const response=await fetch(origin+makePath(bad))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({code:'CAMPUS_TASK_CURSOR_INVALID',data:null})
    expect(calls.teacher).not.toHaveBeenCalled()
    expect(calls.parent).not.toHaveBeenCalled()
    expect(calls.student).not.toHaveBeenCalled()
  })
  it('encodes and decodes the exact microsecond cursor on all three routes',async()=>{
    const next={createdAt:'2026-11-07T12:30:40.123456Z',id:randomUUID()}
    calls.teacher.mockResolvedValueOnce({list:[],truncated:true,nextCursor:next})
    calls.parent.mockResolvedValueOnce({list:[],truncated:true,nextCursor:next})
    calls.student.mockResolvedValueOnce({list:[],total:0,page:1,hasMore:false,truncated:true,nextRunCursor:next})
    for(const [i,path] of [
      `/api/campus/my/teacher-run-tasks?organizationId=${organizationId}`,
      '/api/campus/my/parent-run-tasks',
      '/api/campus/my/activity-tasks',
    ].entries()){
      const response=await fetch(origin+path)
      expect(response.status).toBe(200)
      const body=await response.json() as {data:Record<string,string>}
      const wire=i===2?body.data.nextRunCursor:body.data.nextCursor
      expect(decodeRunTaskCursor(wire)).toEqual(next)
      expect(encodeRunTaskCursor(next)).toBe(wire)
    }
  })
})
