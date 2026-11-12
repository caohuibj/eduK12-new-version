import {beforeEach,describe,expect,it,vi} from 'vitest'
const query=vi.hoisted(()=>vi.fn())
vi.mock('../../config/database',()=>({prisma:{$queryRaw:query}}))
import teacherScaleRouter,{listOwnTeacherScaleTasks} from '../../modules/huiteacher/scaleRuntime.routes'
import {encodeRunTaskCursor} from '../../modules/assessment-run/productRead'

const actor='11111111-1111-4111-8111-111111111111'
type SqlCall={sql:string;values:unknown[]}
type Row={
  createdAtMicros:string;executionId:string;eventId:string;eventTitle:string;runId:string
  organizationId:string;status:string;runtimeBindingRef:string|null;resourceKey:string;title:string;runStatus:string
}
const row=(index:number):Row=>({
  createdAtMicros:`2026-11-06T12:00:00.${String(999999-index).padStart(6,'0')}Z`,
  executionId:`33333333-3333-4333-8333-${String(index).padStart(12,'0')}`,
  eventId:'44444444-4444-4444-8444-444444444444',eventTitle:'个人发展',
  runId:'55555555-5555-4555-8555-555555555555',organizationId:'66666666-6666-4666-8666-666666666666',
  status:'ASSIGNED',runtimeBindingRef:null,resourceKey:'teacher-scale:one:INDIVIDUAL',
  title:'量表 '+index,runStatus:'PUBLISHED',
})
const rows=Array.from({length:101},(_,index)=>row(index))
const sqlAt=(index:number)=>query.mock.calls[index][0] as SqlCall

type RouteLayer={route?:{path:string;methods:Record<string,boolean>;stack:Array<{handle:(req:unknown,res:unknown,next:(error?:unknown)=>void)=>void}>}}
function listHandler(){
  const layer=(teacherScaleRouter as unknown as {stack:RouteLayer[]}).stack.find(entry=>entry.route?.path==='/my-scale-tasks'&&entry.route.methods.get)
  const handle=layer?.route?.stack.at(-1)?.handle
  if(!handle)throw new Error('GET /my-scale-tasks handler is not registered')
  return handle
}
async function getScaleTasks(queryString:Record<string,unknown>){
  let statusCode=200,body:unknown,forwarded:unknown
  const req={query:queryString,user:{userId:actor},params:{},headers:{},get(){return undefined}}
  const res={
    status(code:number){statusCode=code;return this},
    setHeader(){return this},
    json(payload:unknown){body=payload;return this},
  }
  listHandler()(req,res,error=>{forwarded=error??new Error('next')})
  await new Promise(resolve=>setImmediate(resolve))
  return {statusCode,body:body as {message?:string;data?:{list:Row[];truncated:boolean;nextCursor:unknown}}|undefined,forwarded}
}

beforeEach(()=>query.mockReset())

describe('Teacher personal Scale task keyset',()=>{
  it('returns a microsecond cursor after a full page and omits it from the task DTO',async()=>{
    query.mockResolvedValueOnce(rows)
    const first=await listOwnTeacherScaleTasks(actor)
    expect(first.list).toHaveLength(100)
    expect(first.truncated).toBe(true)
    expect(first.nextCursor).toEqual({createdAt:rows[99].createdAtMicros,id:rows[99].executionId})
    expect(first.nextCursor?.createdAt).toMatch(/\.\d{6}Z$/)
    expect(first.list[99].executionId).toBe(rows[99].executionId)
    expect(first.list[0]).not.toHaveProperty('createdAtMicros')
    const firstSql=sqlAt(0)
    expect(firstSql.sql).toContain(`to_char(e."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
    expect(firstSql.sql).toMatch(/LIMIT\s+(?:\$\d+|\?)/)
    expect(firstSql.values).toContain(101)
    expect(firstSql.sql).not.toContain('(e."created_at", e."id") <')
    expect(firstSql.values).not.toContain(rows[99].createdAtMicros)
    expect(firstSql.values.every(value=>!(value instanceof Date))).toBe(true)
    expect(firstSql.sql).toContain('organization_access_denies')

    query.mockResolvedValueOnce([rows[100]])
    const second=await listOwnTeacherScaleTasks(actor,first.nextCursor!)
    expect(second.list.map(item=>item.executionId)).toEqual([rows[100].executionId])
    expect(second.truncated).toBe(false)
    expect(second.nextCursor).toBeNull()
    const secondSql=sqlAt(1)
    expect(secondSql.sql).toContain('(e."created_at", e."id") <')
    expect(secondSql.sql).toContain('::timestamptz')
    expect(secondSql.values).toContain(first.nextCursor!.createdAt)
    expect(secondSql.values).toContain(first.nextCursor!.id)
    expect(secondSql.values).toContain(101)
    expect(secondSql.values.every(value=>!(value instanceof Date))).toBe(true)
  })

  it('stops when the first page has 100 or fewer rows',async()=>{
    query.mockResolvedValueOnce(rows.slice(0,100))
    const exact=await listOwnTeacherScaleTasks(actor)
    expect(exact.list).toHaveLength(100)
    expect(exact.truncated).toBe(false)
    expect(exact.nextCursor).toBeNull()
    expect(exact.list[0]).not.toHaveProperty('createdAtMicros')
    query.mockResolvedValueOnce(rows.slice(0,2))
    const short=await listOwnTeacherScaleTasks(actor)
    expect(short.list).toHaveLength(2)
    expect(short.truncated).toBe(false)
    expect(short.nextCursor).toBeNull()
  })

  it('rejects a malformed cursor on the route with 400 and does not query',async()=>{
    const forged=Buffer.from(JSON.stringify({createdAt:'2026-02-31T12:00:00.123456Z',id:'exec-forged'})).toString('base64url')
    for(const cursor of ['!!!not-a-cursor',forged,'x'.repeat(501),['not','a-string']]){
      query.mockClear()
      const response=await getScaleTasks({cursor})
      expect(response.statusCode).toBe(400)
      expect(response.body?.message).toBe('任务游标无效')
      expect(response.forwarded).toBeUndefined()
      expect(query).not.toHaveBeenCalled()
    }
  })

  it('puts only the opaque base64url cursor on the wire',async()=>{
    query.mockResolvedValueOnce(rows)
    const response=await getScaleTasks({})
    expect(response.statusCode).toBe(200)
    expect(response.forwarded).toBeUndefined()
    expect(response.body?.data?.list).toHaveLength(100)
    expect(response.body?.data?.truncated).toBe(true)
    expect(response.body?.data?.nextCursor).toBe(encodeRunTaskCursor({createdAt:rows[99].createdAtMicros,id:rows[99].executionId}))
    expect(response.body?.data?.nextCursor).not.toEqual(expect.objectContaining({createdAt:rows[99].createdAtMicros}))
    expect(response.body?.data?.list[0]).not.toHaveProperty('createdAtMicros')
    const listed=sqlAt(0)
    expect(listed.values).toContain(101)
    expect(listed.sql).not.toContain('(e."created_at", e."id") <')
  })
})
