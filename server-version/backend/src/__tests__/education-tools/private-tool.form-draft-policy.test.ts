import {describe,it,expect} from 'vitest'
import {privateFormDraftResourcePolicy} from '../../modules/education-tools/private-tool.form-draft-policy'
import {privateFormResourceEntry} from '../../modules/education-tools/private-tool.form-runtime-source'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,kind:'AUTHOR_PRIVATE_FORM' as const,entry:'SCHOOL' as const,
 organizationId:id(1),ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:'a'.repeat(64),variantKey:'STUDENT:SELF' as const}
function source(){return {origin,compositeId:id(5),resourceEntry:privateFormResourceEntry(origin,'Synthetic',id(5)),identityOnly:true as const,canPublish:false as const}}
describe('Private FORM DRAFT policy is not published resource authority',()=>{
 it('projects an exact verified draft identity without changing its lifecycle or generic published gate',()=>{
  const s=source(),before=structuredClone(s),policy=privateFormDraftResourcePolicy(s)
  expect(policy.family).toBe('FORM');expect(policy.runtimeLaunchTarget).toEqual({kind:'COMPOSITE',ref:id(5)})
  expect(policy.resultDisclosure?.audiences.RESPONDENT.mode).toBe('NONE')
  expect(s).toEqual(before)
  expect(()=>relationalEntryToRunPolicy(s.resourceEntry)).toThrow('resource version is not published')
 })
 it('can reuse a natively published fixed source for a later draft without granting publication rights',()=>{
  const s=source();s.resourceEntry=privateFormResourceEntry(origin,'Synthetic',s.compositeId,'PUBLISHED')
  expect(privateFormDraftResourcePolicy(s)).toEqual(relationalEntryToRunPolicy(s.resourceEntry))
  expect(s.identityOnly).toBe(true);expect(s.canPublish).toBe(false)
 })
 it('rejects mismatched parent, exact version identity, source hash, namespace and origin',()=>{
  const mutations=[(s:ReturnType<typeof source>)=>{s.compositeId=id(6)},
   (s:ReturnType<typeof source>)=>{s.origin={...s.origin,contentHash:'b'.repeat(64)}},
   (s:ReturnType<typeof source>)=>{s.origin={...s.origin,versionId:id(6)}},
   (s:ReturnType<typeof source>)=>{s.resourceEntry.applicability.resourceKey='teacher-form:'+id(6)},
   (s:ReturnType<typeof source>)=>{s.resourceEntry.privateFormOrigin={...s.origin,organizationId:id(6)}}]
  for(const mutate of mutations){const s=source();mutate(s);expect(()=>privateFormDraftResourcePolicy(s)).toThrow('PRIVATE_FORM_DRAFT_IDENTITY_INVALID')}
 })
 it('does not drop launch, initiation, target, or disclosure constraints',()=>{
  const mutations=[(s:ReturnType<typeof source>)=>{s.resourceEntry.launchTarget=null},
   (s:ReturnType<typeof source>)=>{s.resourceEntry.initiationModes=[]},
   (s:ReturnType<typeof source>)=>{s.resourceEntry.allowedTargetModes=['ALL_CLASS_TEACHERS']},
   (s:ReturnType<typeof source>)=>{s.resourceEntry.resultDisclosure!.audiences.RESPONDENT.mode='INDIVIDUAL_SUMMARY'}]
  for(const mutate of mutations){const s=source();mutate(s);expect(()=>privateFormDraftResourcePolicy(s)).toThrow('PRIVATE_FORM_DRAFT_IDENTITY_INVALID')}
 })
})
