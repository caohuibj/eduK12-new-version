import {describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {componentCandidate} from '../../modules/scale/component-import/publication'
import {emptyReport,parseComponentDraft,type ComponentDraft} from '../../modules/scale/component-import/contract'
import {SCALE_BATCH_TEMPLATE} from '../../modules/scale/component-import/synthetic-template'
import type {ComponentDraftRow} from '../../modules/scale/component-import/service'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {sourceParts} from '../../modules/survey/standard-triplet.model'

const pending=[['ctas12_zh_cn','1.0.0'],['tas37_sarason_zh_cn','1.0.0'],
 ['apq42_parent_global_zh_cn_research','1.0.1'],['dbt_wccl59_zh_cn_research','1.0.2'],
 ['dbt_wccl59_zh_tw_official_research','1.0.1'],['psyflex6_zh_cn_research','1.0.1'],['spane12_zh_cn_research','1.0.1']] as const
function row(toolKey:string,changedParts:ComponentDraft['changedParts']):ComponentDraftRow{
 return {id:'10000000-0000-4000-8000-000000000001',tool_key:toolKey,configuration_name:'跨 PR 合成预览，不代表真实量表内容',
  base_combination_id:null,base_combination_hash:null,changed_parts:changedParts,revision:1,request_digest:'a'.repeat(64),published_release_id:null,
  created_by:'synthetic',updated_by:'synthetic',created_at:new Date('2026-10-31T00:00:00Z'),updated_at:new Date('2026-10-31T00:00:00Z')}
}
function readOnlyVersions(){
 const query=vi.fn(async()=>[])
 return {tx:{$queryRaw:query} as unknown as Prisma.TransactionClient,query}
}
function suppliedSyntheticContent(toolKey:string,version:string){
 // This independent engineering fixture is never installed or published as
 // CTAS. In particular, no executable definition is derived from its catalog.
 const s=structuredClone(SCALE_BATCH_TEMPLATE.sources[0]),definition=s.executable.definition
 return parseComponentDraft({toolKey,configurationName:'独立合成内容',baseCombination:null,changedParts:{
  CONTENT:{version,definition:{...definition,report:emptyReport(definition.scoring.scores)},
   metadata:{title:s.catalog.identity.canonicalName,instruction:s.instruction,applicability:s.applicability,disclosure:s.disclosure}},
  PARAMETERS:{version:'none-v1',payload:null},REPORT:{version:'none-v1',payload:null},
 }}).changedParts
}

describe('PR462 catalog-only identities meet PR457 draft preview',()=>{
 it('keeps all seven metadata-only sources out of executable parts and leaves incomplete drafts blocked',async()=>{
  const {tx,query}=readOnlyVersions()
  for(const [key,version] of pending){
   const source=getScaleInstrumentSource(key,version)!,before=canonicalHash(source)
   expect(source.candidatePreview?.status).toBe('CATALOG_ONLY')
   expect(source.executable).toBeUndefined();expect(sourceParts(key,version)).toEqual([])
   const result=await componentCandidate(tx,row(key,{REPORT:{version:'none-v1',payload:null}}))
   expect(result.triplet).toBeNull();expect(result.blockers).toContain('尚无 C，P/R 草稿已保留，需提供内容或选择明确基础组合')
   expect(canonicalHash(source)).toBe(before)
  }
  expect(query.mock.calls).toHaveLength(7)
 })
 it('reserves registered catalog versions while previewing independently supplied full C only under a new version',async()=>{
  const [key,version]=pending[0],source=getScaleInstrumentSource(key,version)!,before=canonicalHash(source),{tx}=readOnlyVersions()
  const occupied=await componentCandidate(tx,row(key,suppliedSyntheticContent(key,version)))
  expect(occupied.blockers).toContain('该 C 版本属于代码来源，请使用新的内容版本')
  const fresh=await componentCandidate(tx,row(key,suppliedSyntheticContent(key,'9.9.9')))
  expect(fresh.blockers).toEqual([]);expect(fresh.triplet?.instrumentVersion).toBe('9.9.9')
  expect(fresh.triplet?.parts.CONTENT.reference.metadata.databaseSource).toMatchObject({kind:'DB_IMPORTED',toolKey:key,instrumentVersion:'9.9.9'})
  expect(sourceParts(key,version)).toEqual([]);expect(canonicalHash(source)).toBe(before)
 })
})
