import {describe,it,expect} from 'vitest'
import {readToolPolicy,lockToolPolicyAdmission,lockToolPolicyMutation,assertToolEntryPolicy,approveToolEntryPolicies} from '../../modules/assessment-governance/tool-entry-policy'

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
const locks=(calls:Call[])=>calls.filter(c=>/pg_advisory/.test(c.sql))

describe('tool-policy lock modes',()=>{
 it('admission takes a SHARED lock then re-reads the policy row FOR SHARE',async()=>{
  const {tx,calls}=fakeTx()
  await assertToolEntryPolicy(tx,id('release:a'),'TRAINING')
  expect(calls).toHaveLength(2)
  expect(calls[0].sql).toContain('pg_advisory_xact_lock_shared')
  expect(calls[0].values).toEqual(['survey-tool:release:a'])
  expect(calls[1].sql).toMatch(/survey_tool_policies[\s\S]*FOR SHARE/)
 })
 it('takes each key at most once per transaction but never caches the policy row',async()=>{
  const {tx,calls}=fakeTx()
  for(let i=0;i<3;i++)await assertToolEntryPolicy(tx,id('release:a'),'TRAINING')
  expect(locks(calls)).toHaveLength(1)
  expect(calls.filter(c=>/survey_tool_policies/.test(c.sql))).toHaveLength(3)
 })
 it('rejects a paused or returned policy on every read, even after the lock is held',async()=>{
  const rows:any[]=[{decision:'APPROVED',paused:false,version:1,reason:'ok'}]
  const {tx}=fakeTx(rows)
  await assertToolEntryPolicy(tx,id('release:a'),'TRAINING')
  rows[0]={decision:'APPROVED',paused:true,version:2,reason:'paused'}
  await expect(assertToolEntryPolicy(tx,id('release:a'),'TRAINING')).rejects.toMatchObject({statusCode:409})
 })
 it('batches multiple keys in one statement, de-duplicated and sorted',async()=>{
  const {tx,calls}=fakeTx()
  await lockToolPolicyAdmission(tx,[id('c'),id('a'),id('b'),id('a')])
  expect(locks(calls)).toHaveLength(1)
  expect(calls[0].sql).toContain('pg_advisory_xact_lock_shared')
  expect(calls[0].sql).toContain('unnest')
  expect(calls[0].values).toEqual([['survey-tool:a','survey-tool:b','survey-tool:c']])
  await lockToolPolicyAdmission(tx,[id('b'),id('d')])
  expect(calls[1].values).toEqual(['survey-tool:d'])
  await lockToolPolicyAdmission(tx,[id('a'),id('d')])
  await lockToolPolicyAdmission(tx,[])
  expect(locks(calls)).toHaveLength(2)
 })
 it('never de-duplicates on the global client (each statement is its own transaction)',async()=>{
  const {tx,calls}=fakeTx(undefined,{$transaction:async()=>undefined})
  await assertToolEntryPolicy(tx,id('a'),'SURVEY')
  await assertToolEntryPolicy(tx,id('a'),'SURVEY')
  expect(locks(calls)).toHaveLength(2)
 })
 it('separate transactions never share held-lock state',async()=>{
  const a=fakeTx(),b=fakeTx()
  await assertToolEntryPolicy(a.tx,id('a'),'SURVEY')
  await assertToolEntryPolicy(b.tx,id('a'),'SURVEY')
  expect(locks(a.calls)).toHaveLength(1);expect(locks(b.calls)).toHaveLength(1)
 })
 it('mutation takes an EXCLUSIVE lock; writers lock before writing',async()=>{
  const {tx,calls}=fakeTx()
  await approveToolEntryPolicies(tx,id('release:a'),['SURVEY'],'actor','why')
  expect(calls[0].sql).toMatch(/pg_advisory_xact_lock\(/)
  expect(calls[0].sql).not.toContain('_shared')
  expect(calls[0].values).toEqual(['survey-tool:release:a'])
  expect(calls.slice(1).every(c=>!/pg_advisory/.test(c.sql))).toBe(true)
  expect(calls[1].sql).toContain('UPDATE survey_tool_policies')
 })
 it('POLICY_MUTATION read locks exclusive; exclusive satisfies later shared requests; shared does not satisfy exclusive',async()=>{
  const {tx,calls}=fakeTx()
  await readToolPolicy(tx,id('a'),'POLICY_MUTATION','SURVEY')
  await lockToolPolicyMutation(tx,[id('a')])
  await assertToolEntryPolicy(tx,id('a'),'SURVEY')
  expect(locks(calls)).toHaveLength(1)
  const other=fakeTx()
  await assertToolEntryPolicy(other.tx,id('b'),'SURVEY')
  await lockToolPolicyMutation(other.tx,[id('b')])
  expect(locks(other.calls).map(c=>c.sql.includes('_shared'))).toEqual([true,false])
 })
 it('mutation locks multiple keys in sorted order',async()=>{
  const {tx,calls}=fakeTx()
  await lockToolPolicyMutation(tx,[id('z'),id('m'),id('z')])
  expect(locks(calls).map(c=>c.values[0])).toEqual(['survey-tool:m','survey-tool:z'])
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
