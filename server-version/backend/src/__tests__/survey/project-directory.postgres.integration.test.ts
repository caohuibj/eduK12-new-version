import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {projectDirectoryQuery,readProjectDirectory} from '../../modules/survey/project-directory.service'
const url=integrationDatabaseUrl('SURVEY_DIRECTORY_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('Survey directory queries on isolated PostgreSQL',()=>{
 let db:PrismaClient,owner:string,other:string
 const ids:string[]=[]
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  db=new PrismaClient({datasources:{db:{url:url!}}})
  for(const index of [0,1]){
   const u=await db.user.create({data:{username:'directory-'+randomUUID(),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})
   const login='directory_'+randomUUID().replaceAll('-','').slice(0,16);await db.surveyAccount.create({data:{userId:u.id,loginName:login,normalizedLogin:login}})
   if(index)other=u.id;else owner=u.id
  }
  for(let i=0;i<31;i++){
   const id=randomUUID();ids.push(id)
   await db.surveyProject.create({data:{id,ownerUserId:owner,title:i===30?'跨页 中文 Needle':'研究 '+i,
    description:i===29?'说明匹配 needle':'',collectionMode:'SINGLE_UNLINKED',status:i%2?'ACTIVE':'DRAFT',
    createdAt:new Date(Date.UTC(2026,0,1,0,0,Math.floor(i/2))),updatedAt:new Date(Date.UTC(2026,0,1,0,0,31-i))}})
  }
  await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:other,title:'跨页 中文 Needle',description:'说明匹配 needle',collectionMode:'SINGLE_UNLINKED'}})
 })
 afterAll(async()=>{
  if(db){await db.surveyProject.deleteMany({where:{ownerUserId:{in:[owner,other].filter(Boolean)}}});await db.surveyAccount.deleteMany({where:{userId:{in:[owner,other].filter(Boolean)}}});await db.user.deleteMany({where:{id:{in:[owner,other].filter(Boolean)}}});await db.$disconnect()}
 })
 const read=(input:Record<string,unknown>={},uid?:string)=>db.$transaction(tx=>readProjectDirectory(tx,uid??owner,projectDirectoryQuery.parse(input)))
 it('defaults to 25, counts only owned projects and has no duplicate/missing items across pages',async()=>{
  const a=await read(),b=await read({page:2})
  expect(a).toMatchObject({page:1,pageSize:25,total:31,hasNext:true});expect(b).toMatchObject({page:2,total:31,hasNext:false})
  expect(a.list).toHaveLength(25);expect(b.list).toHaveLength(6)
  expect(new Set([...a.list,...b.list].map(p=>p.id))).toEqual(new Set(ids))
 })
 it('reverses creation time and ID ties deterministically, independent of update time',async()=>{
  const desc=await read({pageSize:100}),asc=await read({pageSize:100,sort:'created_asc'})
  expect(asc.list.map(p=>p.id)).toEqual(desc.list.map(p=>p.id).reverse())
  expect(asc.list[0].createdAt.getTime()).toBeLessThan(asc.list.at(-1)!.createdAt.getTime())
 })
 it('filters all pages before paging and applies status and Unicode/case-insensitive search together',async()=>{
  const all=await read({q:'NEEDLE',pageSize:10}),draft=await read({q:' 中文 ',status:'DRAFT'})
  expect(all.total).toBe(2);expect(new Set(all.list.map(p=>p.id))).toEqual(new Set(ids.slice(29)))
  expect(draft.total).toBe(1);expect(draft.list[0].id).toBe(ids[30])
  const active=await read({status:'ACTIVE',pageSize:10,page:2});expect(active.total).toBe(15);expect(active.list).toHaveLength(5)
  expect(active.list.every(p=>p.status==='ACTIVE')).toBe(true)
 })
 it('clamps stale page numbers after filtering and handles empty results without a next page',async()=>{
  const last=await read({page:1000,pageSize:10});expect(last.page).toBe(4);expect(last.list).toHaveLength(1)
  expect(await read({page:9,q:'不存在的研究'})).toMatchObject({page:1,total:0,hasNext:false,list:[]})
 })
 it('never includes another researcher through keywords, counts or status',async()=>{
  const result=await read({q:'needle'},other);expect(result.total).toBe(1)
  expect(result.list.every(p=>p.ownerUserId===other)).toBe(true)
  expect(result.list.some(p=>ids.includes(p.id))).toBe(false)
 })
 it('rejects unbounded, malformed and repeated query parameters',()=>{
  for(const input of [{page:0},{page:1.5},{page:1001},{pageSize:1000},{pageSize:['10','25']},{status:'COMPLETED'},{sort:'updated_sql'},{q:'x'.repeat(201)},{q:['a','b']}])expect(projectDirectoryQuery.safeParse(input).success).toBe(false)
 })
})
