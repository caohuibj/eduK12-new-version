import {describe,it,expect,vi} from 'vitest'
import {exactToolEntryProducts,exactStandardCombinationEntryProducts,approveToolEntryPolicies,approveStandardCombinationEntryPolicies} from '../../modules/assessment-governance/tool-entry-policy'
const identity={resourceKey:'standard-release:6f6f8e85-0000-4000-8000-000000000001',fingerprint:'a'.repeat(64)}
describe('source-scoped education entry approval',()=>{
 it('normalizes explicit standard scopes without granting unsupported generic-tool entry approval',()=>{
  expect(exactStandardCombinationEntryProducts(['TEACHER','TRAINING','SCHOOL','SURVEY'])).toEqual(['SCHOOL','SURVEY','TEACHER','TRAINING'])
  expect(exactToolEntryProducts(['SURVEY','TRAINING'])).toEqual(['SURVEY','TRAINING'])
  for(const value of [[],['SCHOOL','SCHOOL'],['TEACHER','OTHER'],['HUISCHOOL'],undefined])expect(()=>exactStandardCombinationEntryProducts(value)).toThrow()
  for(const value of [['SCHOOL'],['TEACHER'],['TRAINING','SURVEY','SCHOOL']])expect(()=>exactToolEntryProducts(value)).toThrow()
 })
 it('rejects unknown identities and generic education requests before policy mutation',async()=>{
  const tx={$executeRaw:vi.fn().mockResolvedValue(1)} as any
  for(const resourceKey of ['release:6f6f8e85-0000-4000-8000-000000000001','standard-release:latest','standard-release:*'])
   await expect(approveStandardCombinationEntryPolicies(tx,{...identity,resourceKey},['SCHOOL'],'actor','reason')).rejects.toThrow('精确标准组合')
  await expect(approveStandardCombinationEntryPolicies(tx,{...identity,fingerprint:'latest'},['TEACHER'],'actor','reason')).rejects.toThrow('精确标准组合')
  await expect(approveToolEntryPolicies(tx,identity,['SCHOOL'],'actor','reason')).rejects.toThrow()
  expect(tx.$executeRaw).not.toHaveBeenCalled()
 })
})
