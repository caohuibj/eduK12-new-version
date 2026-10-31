import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import type {PrivateToolApi} from './privateToolClient'

it('saves explicit Teacher SELF group choices for original Scale and native Cognitive/SJT without adding individual or staff audiences',async()=>{
 const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,org=id(1),rootId=id(2),base=`/organizations/${org}/private-tools`
 const sources=[{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:id(3),contentHash:'a'.repeat(64)},
  {provider:'COGNITIVE_CONFIG',kind:'COGNITIVE',versionId:id(4),contentHash:'b'.repeat(64),profile:'research'},
  {provider:'SJT_RELEASE',kind:'SJT',versionId:id(5),contentHash:'c'.repeat(64)}]
 const blocks=sources.map((source,i)=>({blockId:id(10+i),instruction:'',source}))
 const references=sources.map((source,i)=>({id:source.versionId,toolId:source.versionId,title:['Original Scale','Native Cognitive','Native SJT'][i],sourceProvider:source.provider,kind:source.kind,contentHash:source.contentHash,sourceRevision:1,version:'1.0.0',
  groupChoice:{versionId:source.versionId,contentHash:source.contentHash,title:['Original Scale','Native Cognitive','Native SJT'][i],minimumRespondents:10,
   metrics:[{key:['total','rt','dimension'][i],label:['total','rt','dimension'][i]}],audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:[['total','rt','dimension'][i]]}}}))
 const root={id:rootId,kind:'COMPOSITION',title:'Teacher fixed mixture',revision:1,contentHash:'d'.repeat(64),definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',blocks},references}
 const api=vi.fn(async(path:string,method='GET',data?:any)=>{
  if(path===base+'?kind=COMPOSITION')return {list:[root],nextCursor:null}
  if(path===base)return {list:[],nextCursor:null}
  if(path===base+'/'+rootId+'/versions')return {list:[],nextCursor:null}
  if(path===base+'/'+rootId&&method==='GET')return root
  if(path===base+'/'+rootId&&method==='PUT')return {...root,...data,revision:2}
  throw Error('Unexpected '+path)
 })
 render(<EducationCompositionStudio entry="TEACHER" api={api as PrivateToolApi} organizationId={org} actorId={id(20)}/>)
 fireEvent.click(await screen.findByRole('button',{name:'编辑 Teacher fixed mixture'}))
 const enable=await screen.findByRole('checkbox',{name:'为新来源版本明确选择群体披露'})
 await waitFor(()=>expect(enable).toBeEnabled());fireEvent.click(enable)
 for(const metric of ['total','rt','dimension'])fireEvent.click(screen.getByRole('checkbox',{name:'学校管理者 · '+metric}))
 expect(screen.queryByRole('checkbox',{name:/心理专业人员 ·|教师 ·/})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}))
 await screen.findByText('问卷草稿已保存。')
 const saved=api.mock.calls.find(([,method])=>method==='PUT')![2].definition
 expect(saved.groupReporting).toMatchObject({schemaVersion:1,minimumRespondents:10})
 expect(saved.groupReporting.leaves.map((leaf:any)=>leaf.blockId)).toEqual(blocks.map(block=>block.blockId))
 expect(saved.groupReporting.leaves.every((leaf:any)=>!leaf.audiences.PROFESSIONAL.length&&!leaf.audiences.TEACHER.length)).toBe(true)
 expect(saved.blocks).toEqual(blocks)
})
