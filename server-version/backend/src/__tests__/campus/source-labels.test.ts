import {describe,it,expect,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {readCampusSourceLabels,campusSourceLabelKey} from '../../modules/campus/source-labels'
const id='00000000-0000-4000-8000-000000000001'
describe('School immutable source display labels',()=>{
 it.each(['private-scale:SCHOOL:'+id+':STUDENT:SELF','education-private-scale:'+id])('uses the exact frozen title for %s, scoped to the same school',async key=>{
  const source={organizationId:'school',key,family:'SCALE'}
  const query=vi.fn(async()=>[{id,organizationId:'foreign',kind:'SCALE',title:'不得跨校显示',revision:9},
   {id,organizationId:'school',kind:'SCALE',title:'已固定量表',revision:2,scores:[{key:'total_1',label:'总分'}]}])
  const db={$queryRaw:query} as unknown as Pick<Prisma.TransactionClient,'$queryRaw'>
  const labels=await readCampusSourceLabels(db,[source])
  expect(labels.get(campusSourceLabelKey(source))).toEqual({title:'已固定量表',versionLabel:'修订 2',metricLabels:{total_1:'总分'}})
 })
 it('matches form and composition IDs and never uses a foreign version as a fallback',async()=>{
  const db={$queryRaw:vi.fn(async()=>[{id,organizationId:'foreign',kind:'COMPOSITION',title:'外校私有工具',revision:3}])} as unknown as Pick<Prisma.TransactionClient,'$queryRaw'>
  const refs=['private-form:SCHOOL:'+id+':STUDENT:SELF','education-composition:SCHOOL:'+id+':STUDENT:SELF:1.0.0']
   .map((key,index)=>({organizationId:'school',key,family:index?'BUNDLE':'FORM'}))
  const labels=await readCampusSourceLabels(db,refs)
  expect([...labels.values()].map(x=>x.title)).toEqual(['表单','组合测评'])
  expect(JSON.stringify([...labels])).not.toContain('外校私有工具')
 })
})
