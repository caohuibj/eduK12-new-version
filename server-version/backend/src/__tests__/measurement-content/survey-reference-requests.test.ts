import {describe,it,expect,vi} from 'vitest'
import {assertReferenceRequestIdentity,referenceRequestHash,lockReferenceRequest,findReferenceRequest,storeReferenceRequest,type ReferenceRequest} from '../../modules/survey/reference-requests.repository'
const requestId='77777777-7777-4777-8777-777777777777'
const row:ReferenceRequest={request_id:requestId,actor_id:'actor',project_id:'project',wave_id:'wave',operation:'CREATE',
  input_hash:'a'.repeat(64),candidate_id:'candidate',review_id:null,exclusion_counts:{missingValue:2}}
describe('reference request pointer repository',()=>{
 it('canonicalizes object ordering but binds actor, operation and every input field',()=>{
  const first=referenceRequestHash('a','REVIEW',{decision:'APPROVED',candidateHash:'one',statement:'s'})
  expect(first).toBe(referenceRequestHash('a','REVIEW',{statement:'s',candidateHash:'one',decision:'APPROVED'}))
  expect(first).not.toBe(referenceRequestHash('b','REVIEW',{decision:'APPROVED',candidateHash:'one',statement:'s'}))
  expect(first).not.toBe(referenceRequestHash('a','CREATE',{decision:'APPROVED',candidateHash:'one',statement:'s'}))
  expect(first).not.toBe(referenceRequestHash('a','REVIEW',{decision:'REJECTED',candidateHash:'one',statement:'s'}))
 })
 it('uses exact UUID lookup, bounded transaction lock and pointer-only insert without overwrite',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([row]),$executeRaw:vi.fn().mockResolvedValue(1)}
  await lockReferenceRequest(tx as never,requestId)
  expect(tx.$executeRaw.mock.calls[0][0].strings.join('')).toContain('pg_advisory_xact_lock')
  expect(await findReferenceRequest(tx as never,requestId)).toEqual(row)
  expect(tx.$queryRaw.mock.calls[0][0].strings.join('')).toContain('request_id=::uuid')
  await storeReferenceRequest(tx as never,row)
  const query=tx.$executeRaw.mock.calls[1][0]
  expect(query.strings.join('')).not.toContain('ON CONFLICT')
  expect(query.strings.join('')).not.toMatch(/payload|sample_manifest|definition/)
  expect(query.values).toContain('candidate');expect(query.values).toContain('{"missingValue":2}')
  tx.$executeRaw.mockRejectedValueOnce(new Error('unique violation'))
  await expect(storeReferenceRequest(tx as never,row)).rejects.toThrow('unique violation')
 })
 it('rejects operation/hash and actor/project/wave substitution',()=>{
  expect(()=>assertReferenceRequestIdentity(row,'actor',{projectId:'project',waveId:'wave'},{operation:'CREATE',inputHash:row.input_hash})).not.toThrow()
  for(const input of [{projectId:'other',waveId:'wave'},{projectId:'project',waveId:'other'}])
    expect(()=>assertReferenceRequestIdentity(row,'actor',input)).toThrow('REFERENCE_REQUEST_SCOPE_MISMATCH')
  expect(()=>assertReferenceRequestIdentity(row,'other',{projectId:'project',waveId:'wave'})).toThrow('REFERENCE_REQUEST_SCOPE_MISMATCH')
  expect(()=>assertReferenceRequestIdentity(row,'actor',{projectId:'project',waveId:'wave'},{operation:'REVIEW',inputHash:row.input_hash})).toThrow('REFERENCE_REQUEST_INPUT_MISMATCH')
 })
})
