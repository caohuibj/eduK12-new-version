import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
suite('course credential and entry grant overlap with controlled lock ordering',()=>{
  let db:typeof import('../../config/database')['prisma'],permission:typeof import('../../modules/admin-permissions/service'),reset:typeof import('../../services/courseStudentPasswordResetService')
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Disposable database required')
    db=(await import('../../config/database')).prisma;permission=await import('../../modules/admin-permissions/service');reset=await import('../../services/courseStudentPasswordResetService')
  })
  afterAll(()=>db?.$disconnect())
  async function fixture(){
    const owner=await db.user.create({data:{username:'reset-owner-'+randomUUID(),passwordHash:'unusable',role:'TEACHER'}})
    const student=await db.user.create({data:{username:'reset-learner-'+randomUUID(),passwordHash:'original-synthetic-hash',role:'STUDENT'}})
    const system=await db.user.create({data:{username:'reset-system-'+randomUUID(),passwordHash:'unusable',role:'STUDENT',platformRole:'SYSTEM_ADMIN'}})
    const course=await db.course.create({data:{title:'synthetic credential overlap',courseCode:randomUUID(),creatorId:owner.id}})
    await db.courseStudent.create({data:{courseId:course.id,studentId:student.id,status:'ACTIVE'}})
    const input={actorUserId:owner.id,courseId:course.id,studentId:student.id,passwordHash:'replacement-synthetic-hash'}
    const grant=()=>permission.changeEntryGrant({actorUserId:system.id,actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},targetUserId:student.id,entry:'SURVEY',active:true,expectedVersion:0,reason:'synthetic overlapping identity grant'})
    return {owner,student,system,course,input,grant}
  }
  async function blocked(count:number){for(let i=0;i<100;i++){
    const [row]=await db.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`
    if(row.count>=count)return;await new Promise(done=>setTimeout(done,10))
  }throw new Error('Expected actual row-lock wait did not appear')}
  it('early roster/preflight hints and the locked mutation protect an active STUDENT entry administrator',async()=>{
    const f=await fixture();await f.grant()
    expect((await reset.courseCredentialProtectedIds([f.student.id])).has(f.student.id)).toBe(true)
    await expect(reset.assertTeacherCourseResetPreflight(f.input)).rejects.toMatchObject({statusCode:403})
    await expect(reset.resetEnrolledStudentPassword(f.input)).rejects.toMatchObject({statusCode:403})
    expect(await db.user.findUniqueOrThrow({where:{id:f.student.id}})).toMatchObject({role:'STUDENT',passwordHash:'original-synthetic-hash',tokenVersion:1,mustChangePassword:false})
  })
  it('grant queued first: reset waits then refuses the newly protected credential',async()=>{
    const f=await fixture();let grant!:ReturnType<typeof f.grant>,recovery!:ReturnType<typeof reset.resetEnrolledStudentPassword>
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${f.student.id} FOR UPDATE`
      grant=f.grant();await blocked(1);recovery=reset.resetEnrolledStudentPassword(f.input);await blocked(2)
    })
    const result=await Promise.allSettled([grant,recovery])
    expect(result[0].status).toBe('fulfilled');expect(result[1].status).toBe('rejected')
    expect((result[1] as PromiseRejectedResult).reason).toMatchObject({statusCode:403})
    expect((await db.user.findUniqueOrThrow({where:{id:f.student.id}})).passwordHash).toBe('original-synthetic-hash')
  })
  it('reset queued first: the ordinary reset finishes before a later explicit grant; new admin must change password',async()=>{
    const f=await fixture();let grant!:ReturnType<typeof f.grant>,recovery!:ReturnType<typeof reset.resetEnrolledStudentPassword>
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${f.student.id} FOR UPDATE`
      recovery=reset.resetEnrolledStudentPassword(f.input);await blocked(1);grant=f.grant();await blocked(2)
    })
    expect((await Promise.allSettled([recovery,grant])).map(x=>x.status)).toEqual(['fulfilled','fulfilled'])
    expect(await db.user.findUniqueOrThrow({where:{id:f.student.id}})).toMatchObject({passwordHash:'replacement-synthetic-hash',tokenVersion:2,mustChangePassword:true})
    expect(await db.adminEntryGrant.count({where:{userId:f.student.id,entry:'SURVEY',revokedAt:null}})).toBe(1)
  })
})
