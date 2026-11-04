import {describe,it,expect} from 'vitest'
import {readToolPolicy,lockToolPolicyAdmission,lockToolPolicyMutation,assertToolEntryPolicy,approveToolEntryPolicies,prefetchToolPolicyAdmission} from '../../modules/assessment-governance/tool-entry-policy'

type Call={sql:string;values:unknown[]}
function fakeTx(rows:unknown[]=[{decision:'APPROVED',paused:false,version:3,reason:'ok'}],extra:Record<string,unknown>={}){
 const calls:Call[]=[]
 const record=(q:any,...values:unknown[])=>{
  const sql=Array.isArray(q)?q.join('?'):String(q?.sql??q?.strings?.join('?')??q)
  calls.push({sql,values:Array.isArray(q)?values:(q?.values??[])})
 }
 const tx:any={...extra,
  $executeRaw:async(q:any,...v:unknown[])=>{record(q,...v);return 1},
  $queryRaw:async(q:any,...v:unknown[])=>{record(q,...v);return rows}}
 return {tx,calls}
}
const id=(k:string)=>({resourceKey:k,fingerprint:'f'.repeat(64)})
const F='f'.repeat(64),K=(p:string,k:string)=>'survey-tool:'+p+':'+k+':'+F
const rowReads=(calls:Call[])=>calls.filter(c=>/survey_tool_policies/.test(c.sql))
const locks=(calls:Call[])=>calls.filter(c=>/pg_advisory/.test(c.sql))

describe('tool-policy lock modes',()=>{
 it('admission takes a SHARED lock then re-reads the policy row FOR SHARE',async()=>{
  const {tx,calls}=fakeTx()
  await assertToolEntryPolicy(tx,id('release:a'),'TRAINING')
  expect(calls).toHaveLength(2)
  expect(calls[0].sql).toContain('pg_advisory_xact_lock_shared')
  expect(calls[0].values).toEqual([K('TRAINING','release:a')])
  expect(calls[1].sql).toMatch(/survey_tool_policies[\s\S]*FOR SHARE/)
 })
 it('takes each key and reads each locked policy row at most once per transaction',async()=>{
  const {tx,calls}=fakeTx()
  for(let i=0;i<3;i++)await assertToolEntryPolicy(tx,id('release:a'),'TRAINING')
  expect(locks(calls)).toHaveLength(1)
  expect(rowReads(calls)).toHaveLength(1)
 })
 it('keys are per product and fingerprint: Survey and Training never share a key',async()=>{
  const {tx,calls}=fakeTx()
  await assertToolEntryPolicy(tx,id('release:a'),'TRAINING')
  await assertToolEntryPolicy(tx,id('release:a'),'SURVEY')
  await assertToolEntryPolicy(tx,{resourceKey:'release:a',fingerprint:'e'.repeat(64)},'TRAINING')
  expect(locks(calls).map(c=>c.values[0])).toEqual([K('TRAINING','release:a'),K('SURVEY','release:a'),'survey-tool:TRAINING:release:a:'+'e'.repeat(64)])
  expect(rowReads(calls)).toHaveLength(3)
 })
 it('a paused or returned row is rejected on every read; the cache never admits it',async()=>{
  const {tx}=fakeTx([{decision:'APPROVED',paused:true,version:2,reason:'paused'}])
  for(let i=0;i<2;i++)await expect(assertToolEntryPolicy(tx,id('release:a'),'TRAINING')).rejects.toMatchObject({statusCode:409})
  const r=fakeTx([{decision:'RETURNED',paused:false,version:2,reason:'r'}])
  await expect(assertToolEntryPolicy(r.tx,id('release:a'),'TRAINING')).rejects.toMatchObject({statusCode:409})
 })
 it('a mutation lock in the same transaction drops the row cache',async()=>{
  const rows:any[]=[{decision:'APPROVED',paused:false,version:1,reason:'ok'}]
  const {tx,calls}=fakeTx(rows)
  await assertToolEntryPolicy(tx,id('release:a'),'TRAINING')
  await lockToolPolicyMutation(tx,[id('release:a')],['TRAINING'])
  rows[0]={decision:'APPROVED',paused:true,version:2,reason:'paused'}
  await expect(assertToolEntryPolicy(tx,id('release:a'),'TRAINING')).rejects.toMatchObject({statusCode:409})
  expect(rowReads(calls)).toHaveLength(2)
 })
 it('prefetch takes all shared keys in one statement and reads all rows in one FOR SHARE query',async()=>{
  const rows=['a','b','c'].map(k=>({resource_key:k,fingerprint:F,decision:'APPROVED',paused:false,version:1,reason:'ok'}))
  const {tx,calls}=fakeTx(rows)
  await prefetchToolPolicyAdmission(tx,[id('c'),id('a'),id('b'),id('a')],'TRAINING')
  for(const k of ['a','b','c'])await assertToolEntryPolicy(tx,id(k),'TRAINING')
  expect(calls).toHaveLength(2)
  expect(calls[0].values).toEqual([[K('TRAINING','a'),K('TRAINING','b'),K('TRAINING','c')]])
  expect(calls[1].sql).toMatch(/IN[\s\S]*FOR SHARE/)
 })
 it('batches multiple keys in one statement, de-duplicated and sorted',async()=>{
  const {tx,calls}=fakeTx()
  await lockToolPolicyAdmission(tx,[id('c'),id('a'),id('b'),id('a')],'SURVEY')
  expect(locks(calls)).toHaveLength(1)
  expect(calls[0].sql).toContain('pg_advisory_xact_lock_shared')
  expect(calls[0].sql).toContain('unnest')
  expect(calls[0].values).toEqual([[K('SURVEY','a'),K('SURVEY','b'),K('SURVEY','c')]])
  await lockToolPolicyAdmission(tx,[id('b'),id('d')],'SURVEY')
  expect(calls[1].values).toEqual([K('SURVEY','d')])
  await lockToolPolicyAdmission(tx,[id('a'),id('d')],'SURVEY')
  await lockToolPolicyAdmission(tx,[],'SURVEY')
  expect(locks(calls)).toHaveLength(2)
 })
 it('never de-duplicates on the global client (each statement is its own transaction)',async()=>{
  const {tx,calls}=fakeTx(undefined,{$transaction:async()=>undefined})
  await assertToolEntryPolicy(tx,id('a'),'SURVEY')
  await assertToolEntryPolicy(tx,id('a'),'SURVEY')
  expect(locks(calls)).toHaveLength(2)
  expect(rowReads(calls)).toHaveLength(2)
 })
 it('separate transactions never share held-lock state',async()=>{
  const a=fakeTx(),b=fakeTx()
  await assertToolEntryPolicy(a.tx,id('a'),'SURVEY')
  await assertToolEntryPolicy(b.tx,id('a'),'SURVEY')
  expect(locks(a.calls)).toHaveLength(1);expect(locks(b.calls)).toHaveLength(1)
 })
 it('entry-scope writer locks EXCLUSIVE every product key it may change, before writing',async()=>{
  const {tx,calls}=fakeTx()
  await approveToolEntryPolicies(tx,id('release:a'),['SURVEY'],'actor','why')
  const l=calls.slice(0,4)
  expect(l.every(c=>/pg_advisory_xact_lock\(/.test(c.sql)&&!c.sql.includes('_shared'))).toBe(true)
  expect(l.map(c=>c.values[0])).toEqual(['SCHOOL','SURVEY','TEACHER','TRAINING'].map(p=>K(p,'release:a')))
  expect(calls.slice(4).every(c=>!/pg_advisory/.test(c.sql))).toBe(true)
  expect(calls[4].sql).toContain('UPDATE survey_tool_policies')
 })
 it('POLICY_MUTATION read locks exclusive; exclusive satisfies later shared requests; shared does not satisfy exclusive',async()=>{
  const {tx,calls}=fakeTx()
  await readToolPolicy(tx,id('a'),'POLICY_MUTATION','SURVEY')
  await lockToolPolicyMutation(tx,[id('a')],['SURVEY'])
  await assertToolEntryPolicy(tx,id('a'),'SURVEY')
  expect(locks(calls)).toHaveLength(1)
  const other=fakeTx()
  await assertToolEntryPolicy(other.tx,id('b'),'SURVEY')
  await lockToolPolicyMutation(other.tx,[id('b')],['SURVEY'])
  expect(locks(other.calls).map(c=>c.sql.includes('_shared'))).toEqual([true,false])
 })
 it('mutation locks multiple keys in sorted order',async()=>{
  const {tx,calls}=fakeTx()
  await lockToolPolicyMutation(tx,[id('z'),id('m'),id('z')],['SURVEY'])
  expect(locks(calls).map(c=>c.values[0])).toEqual([K('SURVEY','m'),K('SURVEY','z')])
 })
 it('unlocked hint reads take no lock and no row lock',async()=>{
  const {tx,calls}=fakeTx()
  await readToolPolicy(tx,id('a'))
  expect(calls).toHaveLength(1);expect(calls[0].sql).not.toContain('FOR SHARE')
 })
 it('a failed lock statement is not recorded as held',async()=>{
  const {tx,calls}=fakeTx()
  let fail=true
  const exec=tx.$executeRaw
  tx.$executeRaw=async(q:any,...v:unknown[])=>{if(fail){fail=false;throw new Error('lock timeout')}return exec(q,...v)}
  await expect(assertToolEntryPolicy(tx,id('a'),'SURVEY')).rejects.toThrow('lock timeout')
  await assertToolEntryPolicy(tx,id('a'),'SURVEY')
  expect(locks(calls)).toHaveLength(1)
 })
})
